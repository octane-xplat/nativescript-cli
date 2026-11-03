package process

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

var (
	ErrInvalid     = errors.New("invalid process command")
	ErrStart       = errors.New("process start failed")
	ErrExit        = errors.New("process exited unsuccessfully")
	ErrOutput      = errors.New("process output failed")
	ErrCleanup     = errors.New("process cleanup failed")
	ErrUnavailable = errors.New("owned process execution unavailable on this host")
)

// Error retains the category and underlying OS, context or callback error.
// It deliberately excludes argv and environment, which may contain credentials.
type Error struct {
	Kind  error
	Cause error
}

func (e *Error) Error() string   { return e.Kind.Error() }
func (e *Error) Unwrap() []error { return []error{e.Kind, e.Cause} }

// Runner is stateless and safe for concurrent use. The zero value is ready.
// Unix ownership is a fresh process group: tools must not detach descendants
// into other groups/sessions. This is lifecycle ownership, not a sandbox.
type Runner struct{}

var _ Executor = Runner{}

func (Runner) Start(parent context.Context, c Command) (Handle, error) {
	if err := parent.Err(); err != nil {
		return nil, err
	}
	if c.Executable == "" || !filepath.IsAbs(c.Dir) {
		return nil, &Error{Kind: ErrInvalid}
	}
	for key, value := range c.Environment {
		if key == "" || strings.ContainsAny(key, "=\x00") || strings.ContainsRune(value, 0) {
			return nil, &Error{Kind: ErrInvalid}
		}
	}
	cmd := exec.Command(c.Executable, append([]string(nil), c.Args...)...)
	cmd.Dir = c.Dir
	// Environ includes the child's PWD without modifying the embedding process.
	env := cmd.Environ()
	keys := make([]string, 0, len(c.Environment))
	for k := range c.Environment {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		env = append(env, k+"="+c.Environment[k])
	}
	cmd.Env = env
	if err := configureTree(cmd); err != nil {
		return nil, err
	}
	outR, outW, err := os.Pipe()
	if err != nil {
		return nil, &Error{Kind: ErrStart, Cause: err}
	}
	errR, errW, err := os.Pipe()
	if err != nil {
		outR.Close()
		outW.Close()
		return nil, &Error{Kind: ErrStart, Cause: err}
	}
	cmd.Stdout, cmd.Stderr = outW, errW
	if err = parent.Err(); err == nil {
		err = cmd.Start()
	}
	outW.Close()
	errW.Close()
	if err != nil {
		outR.Close()
		errR.Close()
		return nil, &Error{Kind: ErrStart, Cause: err}
	}
	ctx, cancel := context.WithCancelCause(parent)
	h := &handle{done: make(chan struct{}), cancel: cancel}
	go h.run(ctx, cmd, c.Output, outR, errR)
	return h, nil
}

type handle struct {
	done   chan struct{}
	cancel context.CancelCauseFunc
	exit   Exit
	err    error
}

func (h *handle) Wait() (Exit, error) { <-h.done; return h.exit, h.err }
func (h *handle) Close(ctx context.Context) error {
	select {
	case <-h.done:
		return h.err
	default:
	}
	h.cancel(context.Canceled)
	select {
	case <-h.done:
		return h.err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (h *handle) run(ctx context.Context, cmd *exec.Cmd, output func(context.Context, Stream, []byte) error, stdout, stderr *os.File) {
	defer close(h.done)
	defer h.cancel(nil)
	var mu sync.Mutex
	var outputErr error
	var readers sync.WaitGroup
	read := func(stream Stream, f *os.File) {
		defer readers.Done()
		defer f.Close()
		buf := make([]byte, 32*1024)
		for {
			n, err := f.Read(buf)
			if n > 0 {
				mu.Lock()
				if outputErr == nil && output != nil {
					// Each callback owns its bytes; retaining them is safe.
					if e := output(ctx, stream, append([]byte(nil), buf[:n]...)); e != nil {
						outputErr = &Error{Kind: ErrOutput, Cause: e}
						h.cancel(outputErr)
					}
				}
				mu.Unlock()
			}
			if err != nil {
				if !errors.Is(err, io.EOF) && !errors.Is(err, os.ErrClosed) {
					mu.Lock()
					if outputErr == nil {
						outputErr = &Error{Kind: ErrOutput, Cause: err}
						h.cancel(outputErr)
					}
					mu.Unlock()
				}
				return
			}
		}
	}
	readers.Add(2)
	go read(Stdout, stdout)
	go read(Stderr, stderr)
	waited := make(chan error, 1)
	go func() { waited <- cmd.Wait() }()
	var waitErr error
	reaped := false
	select {
	case waitErr = <-waited:
		reaped = true
	case <-ctx.Done():
	}
	// Also retire descendants left behind by an otherwise successful parent.
	cleanupErr := stopTree(cmd)
	if !reaped {
		waitErr = <-waited
	}
	h.exit.Code = cmd.ProcessState.ExitCode()
	// Detached/inherited pipes cannot hold completion forever. A cooperative
	// callback must observe ctx; arbitrary user code cannot be interrupted safely.
	drained := make(chan struct{})
	go func() { readers.Wait(); close(drained) }()
	timer := time.NewTimer(time.Second)
	select {
	case <-drained:
		if !timer.Stop() {
			<-timer.C
		}
	case <-timer.C:
		stdout.Close()
		stderr.Close()
		cleanupErr = errors.Join(cleanupErr, fmt.Errorf("output drain deadline"))
		h.cancel(&Error{Kind: ErrCleanup, Cause: cleanupErr})
		<-drained
	}
	if waitErr != nil {
		h.err = &Error{Kind: ErrExit, Cause: waitErr}
	}
	h.err = errors.Join(context.Cause(ctx), h.err, outputErr)
	if cleanupErr != nil {
		h.err = errors.Join(h.err, &Error{Kind: ErrCleanup, Cause: cleanupErr})
	}
}
