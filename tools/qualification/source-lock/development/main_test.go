package main

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/process"
)

func TestExplicitCloseKeepsUnexpectedAndCleanupFailures(t *testing.T) {
	canceled := errors.Join(context.Canceled, &process.Error{Kind: process.ErrExit})
	if err := closeError(canceled); err != nil {
		t.Fatalf("expected owned cancellation: %v", err)
	}
	unexpected := errors.New("unexpected failure")
	for _, failure := range []error{unexpected, &process.Error{Kind: process.ErrCleanup, Cause: context.Canceled}, context.DeadlineExceeded} {
		err := closeError(errors.Join(canceled, fmt.Errorf("wrapped: %w", failure)))
		if !errors.Is(err, failure) {
			t.Fatalf("discarded consequential close failure: %v", failure)
		}
	}
	exit := &process.Error{Kind: process.ErrExit}
	if closeError(exit) == nil {
		t.Fatal("non-cancelled process failure was discarded")
	}
}
