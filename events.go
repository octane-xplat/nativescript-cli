package nativescript

import "context"

type EventKind string

const (
	StageStarted   EventKind = "stage-started"
	StageCompleted EventKind = "stage-completed"
	Diagnostic     EventKind = "diagnostic"
)

// Sequence starts at one for each operation; there is no cross-operation ordering.
type Event struct {
	Operation string
	Sequence  uint64
	Kind      EventKind
	Stage     string
	Message   string
}

// EventSink runs synchronously, outside workspace/device locks. Delivery applies
// backpressure: the operation cannot advance until the callback returns. The first
// failure aborts the operation, wraps ErrSink and the sink cause, and stops delivery.
// Callbacks may reenter Client; recursive calls must bound their own recursion.
// Callbacks must honor ctx. Panics propagate; they are not converted to errors.
type EventSink func(context.Context, Event) error

type emitter struct {
	sink      EventSink
	operation string
	sequence  uint64
	failed    error
}

func (e *emitter) emit(ctx context.Context, kind EventKind, stage string) error {
	if e.failed != nil {
		return e.failed
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	e.sequence++
	if e.sink != nil {
		if err := e.sink(ctx, Event{Operation: e.operation, Sequence: e.sequence, Kind: kind, Stage: stage}); err != nil {
			e.failed = &OperationError{Operation: e.operation, Kind: ErrSink, Cause: err}
			return e.failed
		}
	}
	return ctx.Err()
}
