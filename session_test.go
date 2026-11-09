package nativescript

import (
	"context"
	"errors"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
)

func TestSessionPreservesPublicCleanupIdentity(t *testing.T) {
	s := &Session{owned: workflow.StartSession(context.Background(), func(context.Context) error {
		return errors.Join(context.Canceled, process.ErrCleanup)
	})}
	for _, err := range []error{s.Wait(), s.Close(context.Background())} {
		if !errors.Is(err, context.Canceled) || !errors.Is(err, ErrCleanup) {
			t.Fatal("private cleanup failure lost at session boundary", err)
		}
	}
	already := &OperationError{Operation: "run", Kind: ErrBuild, Cause: errors.New("failed"), Advice: "bounded advice"}
	if sessionError(already) != already {
		t.Fatal("development error was translated twice")
	}
}
