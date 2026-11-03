package workflow

import (
	"context"
	"sync"
)

// Session owns only resources acquired by its work function. Work must stop
// owned descendants, retire owned forwarding and release leases before return.
// It must leave installation and caller-owned servers/device services intact.
// Close cancels work once; its deadline bounds waiting, never resource cleanup.
// Work must observe cancellation. Completion is published only after cleanup.
type Session struct {
	LogBuffer *LogBuffer
	cancel    context.CancelFunc
	done      chan struct{}
	once      sync.Once
	err       error
}

func StartSession(ctx context.Context, work func(context.Context) error) *Session {
	ctx, cancel := context.WithCancel(ctx)
	s := &Session{cancel: cancel, done: make(chan struct{})}
	go func() { defer close(s.done); defer cancel(); s.err = work(ctx) }()
	return s
}
func (s *Session) Wait() error {
	if s == nil || s.done == nil {
		return nil
	}
	<-s.done
	return s.err
}
func (s *Session) Close(ctx context.Context) error {
	if s == nil || s.done == nil {
		return nil
	}
	s.once.Do(s.cancel)
	select {
	case <-s.done:
		return s.err
	default:
	}
	select {
	case <-s.done:
		return s.err
	case <-ctx.Done():
		return ctx.Err()
	}
}
