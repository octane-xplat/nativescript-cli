package device

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
)

func TestUnexpectedAppExitPreservesFailureAfterReaderShutdown(t *testing.T) {
	expectedStop := errors.Join(context.Canceled, &process.Error{Kind: process.ErrExit})
	unknown := errors.New("diagnostic reader failure")
	for _, retained := range []error{nil, process.ErrOutput, unknown} {
		t.Run(errors.Join(retained, process.ErrExit).Error(), func(t *testing.T) {
			f := &fakeExecutor{booted: true, readerCloseErr: errors.Join(expectedStop, retained)}
			a := Adapter{Executor: f}
			d := project.Device{ID: "exact", Platform: "ios", Kind: "simulator", Architecture: "arm64"}
			s, err := a.Launch(context.Background(), fixtureArtifact(t), d)
			if err != nil {
				t.Fatal(err)
			}
			done := make(chan error, 1)
			go func() { done <- s.Wait() }()
			select {
			case err = <-done:
			case <-time.After(3 * time.Second):
				t.Fatal("unexpected app exit did not finish session")
			}
			if !errors.Is(err, process.ErrExit) || errors.Is(err, context.Canceled) {
				t.Fatalf("app exit classification changed: %v", err)
			}
			if retained != nil && !errors.Is(err, retained) {
				t.Fatalf("reader shutdown lost %v: %v", retained, err)
			}
		})
	}
}

func TestReaderCleanupRetainsNaturalReaderFailures(t *testing.T) {
	err := &process.Error{Kind: process.ErrExit}
	if readerCleanupError(err) != err {
		t.Fatal("natural reader exit was suppressed")
	}
	err = &process.Error{Kind: process.ErrCleanup, Cause: context.Canceled}
	if !errors.Is(readerCleanupError(err), process.ErrCleanup) {
		t.Fatal("cleanup failure was suppressed")
	}
}
