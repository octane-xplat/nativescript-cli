package nativescript

import (
	"context"
	"errors"
	"syscall"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/process"
)

func TestPublicCleanupFailurePreservesInitiatingCategory(t *testing.T) {
	for _, test := range []struct {
		name       string
		initiating error
		public     error
	}{
		{"observer", &OperationError{Operation: "run", Kind: ErrSink, Cause: errors.New("observer rejected")}, ErrSink},
		{"cancellation", context.Canceled, context.Canceled},
	} {
		t.Run(test.name, func(t *testing.T) {
			cleanup := &process.Error{Kind: process.ErrCleanup, Cause: syscall.EPERM}
			err := operationError("run", errors.Join(test.initiating, cleanup))
			if !errors.Is(err, test.public) || !errors.Is(err, ErrCleanup) || !errors.Is(err, syscall.EPERM) {
				t.Fatalf("lost initiating/cleanup identity: %v", err)
			}
			var operation *OperationError
			if !errors.As(err, &operation) || operation.Operation != "run" {
				t.Fatalf("lost operation context: %v", err)
			}
		})
	}
}

func TestPublicCleanCancellationDoesNotReportCleanupFailure(t *testing.T) {
	err := operationError("run", context.Canceled)
	if !errors.Is(err, context.Canceled) || errors.Is(err, ErrCleanup) {
		t.Fatalf("clean cancellation misclassified: %v", err)
	}
}
