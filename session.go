package nativescript

import (
	"context"
	"errors"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
)

// Session is an owned development lifetime. Wait reports completion after cleanup.
// Close is concurrent-safe and idempotently cancels; cancellation is reported by
// Wait/Close as context.Canceled if work returns it. A Close deadline only bounds
// that caller's wait; cleanup continues. Installation is retained. Only owned
// processes/forwarding are stopped, never caller servers or shared device services.
// Apple sessions terminate their launched app and shut down only their owned boot.
// Do not Wait/Close from a callback on the same session. The zero value is complete.
type Session struct {
	owned       *workflow.Session
	development *developmentState
}

// DevelopmentEndpoint is the currently running native HMR server. A native input
// rebuild can replace it; query again after the next launch-completed event.
type DevelopmentEndpoint struct{ URL, HMRURL string }

func (s *Session) DevelopmentEndpoint() DevelopmentEndpoint {
	if s == nil || s.development == nil {
		return DevelopmentEndpoint{}
	}
	return s.development.endpoint()
}

func (s *Session) Wait() error {
	if s == nil {
		return nil
	}
	return sessionError(s.owned.Wait())
}
func (s *Session) Close(ctx context.Context) error {
	if s == nil {
		return nil
	}
	return sessionError(s.owned.Close(ctx))
}

// Device adapters return private process errors. Translate them at the facade
// for ordinary sessions as well as development loops, without wrapping an
// already translated development error a second time.
func sessionError(err error) error {
	var operation *OperationError
	if errors.As(err, &operation) && operation.Operation == "run" {
		if errors.Is(err, process.ErrCleanup) && !errors.Is(err, ErrCleanup) {
			return errors.Join(err, ErrCleanup)
		}
		return err
	}
	return operationError("run", err)
}

// SessionLog is application console output. Logs returns a bounded snapshot.
type SessionLog struct {
	Stream string
	Text   string
}

func (s *Session) Logs() []SessionLog {
	if s == nil || s.owned == nil {
		return nil
	}
	var out []SessionLog
	logs := s.owned.LogBuffer.Logs()
	if s.development != nil {
		logs = s.development.logs()
	}
	for _, v := range logs {
		out = append(out, SessionLog(v))
	}
	return out
}
