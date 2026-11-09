package device

import (
	"context"
	"errors"

	"github.com/octane-xplat/nativescript-cli/internal/process"
)

// Closing our diagnostic reader intentionally cancels its process. Those
// expected signals must not turn an application's exit into caller cancellation.
// Keep output, cleanup and unknown failures, including their original identity.
func readerCleanupError(err error) error {
	if !errors.Is(err, context.Canceled) {
		return err
	}
	var filter func(error) error
	filter = func(err error) error {
		if err == context.Canceled {
			return nil
		}
		if failure, ok := err.(*process.Error); ok {
			if failure.Kind == process.ErrExit {
				return nil
			}
			return err
		}
		if joined, ok := err.(interface{ Unwrap() []error }); ok {
			var retained []error
			for _, cause := range joined.Unwrap() {
				retained = append(retained, filter(cause))
			}
			return errors.Join(retained...)
		}
		return err
	}
	return filter(err)
}
