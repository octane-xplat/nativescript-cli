package process_test

import (
	"context"
	"errors"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"reflect"
	"testing"
)

// A fake executor models an owned descendant. Real OS tree termination is F1.
type fakeExecutor struct {
	got            process.Command
	started        bool
	descendantDone chan struct{}
}
type fakeHandle struct {
	session *workflow.Session
	exit    process.Exit
}

func (h *fakeHandle) Wait() (process.Exit, error)     { return h.exit, h.session.Wait() }
func (h *fakeHandle) Close(ctx context.Context) error { return h.session.Close(ctx) }
func (f *fakeExecutor) Start(ctx context.Context, c process.Command) (process.Handle, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	f.got = c
	f.started = true
	return &fakeHandle{session: workflow.StartSession(ctx, func(ctx context.Context) error {
		defer close(f.descendantDone)
		if c.Output != nil {
			if err := c.Output(ctx, process.Stdout, []byte("fixture stdout")); err != nil {
				return err
			}
			if err := c.Output(ctx, process.Stderr, []byte("fixture stderr")); err != nil {
				return err
			}
		}
		<-ctx.Done()
		return ctx.Err()
	}), exit: process.Exit{Code: 0}}, nil
}

var _ process.Executor = (*fakeExecutor)(nil)

func TestFakeToolContract(t *testing.T) {
	f := &fakeExecutor{descendantDone: make(chan struct{})}
	var streams []process.Stream
	output := make(chan struct{})
	command := process.Command{Executable: "/fixture tools/tool", Args: []string{"--destination", "fixture sim 001", "/fixture apps/My App"}, Dir: "/fixture apps/My App", Environment: map[string]string{"ONLY_FIXTURE": "value with spaces"}, Output: func(_ context.Context, s process.Stream, b []byte) error {
		streams = append(streams, s)
		if s == process.Stderr {
			close(output)
		}
		return nil
	}}
	ctx, cancel := context.WithCancel(context.Background())
	h, err := f.Start(ctx, command)
	if err != nil {
		t.Fatal(err)
	}
	<-output
	cancel()
	_, err = h.Wait()
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	select {
	case <-f.descendantDone:
	default:
		t.Fatal("descendant not retired")
	}
	if !reflect.DeepEqual(f.got.Args, command.Args) || f.got.Dir != command.Dir || !reflect.DeepEqual(streams, []process.Stream{process.Stdout, process.Stderr}) {
		t.Fatal("command/output changed")
	}
	f = &fakeExecutor{}
	if _, err = f.Start(ctx, command); !errors.Is(err, context.Canceled) || f.started {
		t.Fatal("launched cancelled request")
	}
}
func TestFakeOutputFailure(t *testing.T) {
	cause := errors.New("output rejected")
	f := &fakeExecutor{descendantDone: make(chan struct{})}
	h, err := f.Start(context.Background(), process.Command{Output: func(context.Context, process.Stream, []byte) error { return cause }})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.Wait(); !errors.Is(err, cause) {
		t.Fatal(err)
	}
	select {
	case <-f.descendantDone:
	default:
		t.Fatal("leaked fake descendant")
	}
}
