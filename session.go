package nativescript

import (
	"context"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
)

// Session is an owned development lifetime. Wait reports completion after cleanup.
// Close is concurrent-safe and idempotently cancels; cancellation is reported by
// Wait/Close as context.Canceled if work returns it. A Close deadline only bounds
// that caller's wait; cleanup continues. Installation is retained. Only owned
// processes/forwarding are stopped, never caller servers or shared device services.
// Apple sessions terminate their launched app and shut down only their owned boot.
// Do not Wait/Close from a callback on the same session. The zero value is complete.
type Session struct{ owned *workflow.Session }

func (s *Session) Wait() error {
	if s == nil {
		return nil
	}
	return s.owned.Wait()
}
func (s *Session) Close(ctx context.Context) error {
	if s == nil {
		return nil
	}
	return s.owned.Close(ctx)
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
	for _, v := range s.owned.LogBuffer.Logs() {
		out = append(out, SessionLog(v))
	}
	return out
}
