//go:build darwin || linux

package process

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

func node(t *testing.T) string {
	t.Helper()
	p, e := exec.LookPath("node")
	if e != nil {
		t.Fatal("Node is required for real process qualification:", e)
	}
	return p
}
func command(t *testing.T, script string) Command {
	t.Helper()
	return Command{Executable: node(t), Args: []string{"-e", script}, Dir: t.TempDir()}
}
func await(t *testing.T, h Handle) (Exit, error) {
	t.Helper()
	type result struct {
		x Exit
		e error
	}
	c := make(chan result, 1)
	go func() { x, e := h.Wait(); c <- result{x, e} }()
	select {
	case r := <-c:
		return r.x, r.e
	case <-time.After(8 * time.Second):
		t.Fatal("process completion timed out")
		return Exit{}, nil
	}
}
func start(t *testing.T, ctx context.Context, c Command) Handle {
	t.Helper()
	h, e := (Runner{}).Start(ctx, c)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		h.Close(ctx)
	})
	return h
}

func TestRealArgvCwdEnvironmentAndStreams(t *testing.T) {
	beforeDir, _ := os.Getwd()
	beforeEnv := os.Environ()
	c := command(t, `console.log(JSON.stringify({args:process.argv.slice(1),dir:process.cwd(),env:process.env.F1_VALUE,inherited:process.env.PATH}));process.stderr.write('diagnostic')`)
	c.Dir = filepath.Join(c.Dir, "app with spaces")
	if e := os.Mkdir(c.Dir, 0700); e != nil {
		t.Fatal(e)
	}
	c.Args = append(c.Args, "a b", "$(false)", "'quoted'", "")
	c.Environment = map[string]string{"F1_VALUE": "value with spaces"}
	var out, errout strings.Builder
	c.Output = func(_ context.Context, s Stream, b []byte) error {
		if s == Stdout {
			out.Write(b)
		} else if s == Stderr {
			errout.Write(b)
		} else {
			t.Error(s)
		}
		return nil
	}
	h := start(t, context.Background(), c)
	x, e := await(t, h)
	if e != nil || x.Code != 0 {
		t.Fatalf("%+v %v", x, e)
	}
	var got struct {
		Args                []string
		Dir, Env, Inherited string
	}
	if e = json.Unmarshal([]byte(out.String()), &got); e != nil {
		t.Fatal(e)
	}
	expectedDir, _ := filepath.EvalSymlinks(c.Dir)
	if !reflect.DeepEqual(got.Args, c.Args[2:]) || got.Dir != expectedDir || got.Env != "value with spaces" || got.Inherited == "" || errout.String() != "diagnostic" {
		t.Fatalf("unexpected output: %+v stderr=%q", got, errout.String())
	}
	afterDir, _ := os.Getwd()
	if beforeDir != afterDir || !reflect.DeepEqual(beforeEnv, os.Environ()) {
		t.Fatal("global state changed")
	}
	x2, e2 := h.Wait()
	if x2 != x || e2 != e {
		t.Fatal("Wait not repeatable")
	}
}

func TestRealPrelaunchAndFailureIdentity(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if h, e := (Runner{}).Start(ctx, Command{}); h != nil || !errors.Is(e, context.Canceled) {
		t.Fatal(h, e)
	}
	if _, e := (Runner{}).Start(context.Background(), Command{Executable: "node", Dir: "relative"}); !errors.Is(e, ErrInvalid) {
		t.Fatal(e)
	}
	c := command(t, "")
	c.Executable = filepath.Join(c.Dir, "missing")
	if _, e := (Runner{}).Start(context.Background(), c); !errors.Is(e, ErrStart) || !errors.Is(e, os.ErrNotExist) {
		t.Fatal(e)
	}
	c = command(t, "process.exit(23)")
	h := start(t, context.Background(), c)
	x, e := await(t, h)
	var exit *exec.ExitError
	var typed *Error
	if x.Code != 23 || !errors.Is(e, ErrExit) || !errors.As(e, &exit) || !errors.As(e, &typed) || exit.ExitCode() != 23 {
		t.Fatal(x, e)
	}
}

func TestRealLargeOutputAndBackpressure(t *testing.T) {
	c := command(t, `process.stdout.write(Buffer.alloc(2*1024*1024,97));process.stderr.write(Buffer.alloc(1024*1024,98))`)
	entered, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	sizes := map[Stream]int{}
	var retained [][]byte
	c.Output = func(_ context.Context, s Stream, b []byte) error {
		once.Do(func() { close(entered); <-release })
		sizes[s] += len(b)
		retained = append(retained, b)
		return nil
	}
	h := start(t, context.Background(), c)
	<-entered
	completed := make(chan struct{})
	go func() { h.Wait(); close(completed) }()
	select {
	case <-completed:
		t.Fatal("completed while sink blocked")
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	if _, e := await(t, h); e != nil {
		t.Fatal(e)
	}
	if sizes[Stdout] != 2*1024*1024 || sizes[Stderr] != 1024*1024 {
		t.Fatal(sizes)
	}
	for _, b := range retained {
		for _, v := range b {
			if v != b[0] {
				t.Fatal("callback bytes reused")
			}
		}
	}
}

func TestRealSinkFailure(t *testing.T) {
	cause := errors.New("rejected output")
	c := command(t, `setInterval(()=>console.log('output'),1)`)
	calls := 0
	c.Output = func(context.Context, Stream, []byte) error { calls++; return cause }
	h := start(t, context.Background(), c)
	_, e := await(t, h)
	if !errors.Is(e, cause) || !errors.Is(e, ErrOutput) || calls != 1 {
		t.Fatal(e, calls)
	}
}

func TestRealCloseDeadlineAndConcurrentWait(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	c := command(t, `console.log('ready');setInterval(()=>{},1000)`)
	c.Output = func(ctx context.Context, _ Stream, _ []byte) error {
		close(entered)
		<-ctx.Done()
		<-release
		return ctx.Err()
	}
	h := start(t, context.Background(), c)
	<-entered
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if e := h.Close(ctx); !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal(e)
	}
	close(release)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if e := h.Close(context.Background()); !errors.Is(e, context.Canceled) {
				t.Error(e)
			}
		}()
	}
	wg.Wait()
	if _, e := await(t, h); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
}

// The process table check accepts reaped processes only, not merely a sent signal.
func waitGone(t *testing.T, pid int) {
	t.Helper()
	deadline := time.Now().Add(4 * time.Second)
	for time.Now().Before(deadline) {
		if errors.Is(syscall.Kill(pid, 0), syscall.ESRCH) {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("owned descendant %d still present", pid)
}
func TestRealDescendantCancellationAndUnrelatedSurvival(t *testing.T) {
	unrelated := start(t, context.Background(), command(t, `setInterval(()=>{},1000)`))
	fixture, e := filepath.Abs("testdata/descendant.cjs")
	if e != nil {
		t.Fatal(e)
	}
	c := command(t, "")
	c.Args = []string{fixture}
	ready := make(chan int, 1)
	var data strings.Builder
	c.Output = func(_ context.Context, s Stream, b []byte) error {
		if s == Stdout {
			data.Write(b)
			if strings.Contains(data.String(), "\n") {
				var p struct{ Descendant int }
				if e := json.Unmarshal([]byte(data.String()), &p); e != nil {
					return e
				}
				ready <- p.Descendant
			}
		}
		return nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	h := start(t, ctx, c)
	var pid int
	select {
	case pid = <-ready:
	case <-time.After(5 * time.Second):
		t.Fatal("no descendant ready")
	}
	cancel()
	if _, e = await(t, h); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	waitGone(t, pid)
	u := unrelated.(*handle)
	select {
	case <-u.done:
		t.Fatal("unrelated process stopped")
	default:
	}
}

func TestRealParentFailureAndStubbornDescendant(t *testing.T) {
	// A grandchild ignores TERM. Its parent reports readiness, then exits nonzero.
	// Cleanup must escalate even after the original parent has already exited.
	c := command(t, `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],{stdio:['ignore','pipe','ignore']});child.stdout.once('data',()=>{console.log(child.pid);process.exit(17)})`)
	var data strings.Builder
	c.Output = func(_ context.Context, s Stream, b []byte) error {
		if s == Stdout {
			data.Write(b)
		}
		return nil
	}
	h := start(t, context.Background(), c)
	x, e := await(t, h)
	if x.Code != 17 || !errors.Is(e, ErrExit) {
		t.Fatal(x, e)
	}
	var pid int
	if _, e = fmt.Sscan(data.String(), &pid); e != nil || pid <= 0 {
		t.Fatal(data.String(), e)
	}
	waitGone(t, pid)
}

func TestRealCancellationDuringOutput(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c := command(t, `function write(){if(process.stdout.write(Buffer.alloc(65536,97)))setImmediate(write);else process.stdout.once('drain',write)}write()`)
	calls := 0
	c.Output = func(ctx context.Context, _ Stream, _ []byte) error {
		calls++
		if calls == 3 {
			cancel()
		}
		return nil
	}
	h := start(t, ctx, c)
	if _, e := await(t, h); !errors.Is(e, context.Canceled) || calls < 3 {
		t.Fatal(e, calls)
	}
}

func TestRealContextDeadline(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	h := start(t, ctx, command(t, `setInterval(()=>{},1000)`))
	if _, e := await(t, h); !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal(e)
	}
}

func TestRealSuccessfulParentRetiresDescendant(t *testing.T) {
	c := command(t, `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(child.pid);process.exit(0)`)
	var data strings.Builder
	c.Output = func(_ context.Context, s Stream, b []byte) error {
		if s == Stdout {
			data.Write(b)
		}
		return nil
	}
	h := start(t, context.Background(), c)
	x, e := await(t, h)
	if e != nil || x.Code != 0 {
		t.Fatal(x, e)
	}
	var pid int
	if _, e = fmt.Sscan(data.String(), &pid); e != nil || pid <= 0 {
		t.Fatal(data.String(), e)
	}
	waitGone(t, pid)
}

func TestRealDrainDeadlineCancelsCooperativeSink(t *testing.T) {
	c := command(t, `console.log('finished')`)
	c.Output = func(ctx context.Context, _ Stream, _ []byte) error { <-ctx.Done(); return ctx.Err() }
	h := start(t, context.Background(), c)
	if _, e := await(t, h); !errors.Is(e, ErrCleanup) {
		t.Fatal(e)
	}
}
