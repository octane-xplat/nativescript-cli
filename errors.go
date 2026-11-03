package nativescript

import "errors"

var (
	ErrUnavailable     = errors.New("operation unavailable")
	ErrInvalidInput    = errors.New("invalid input")
	ErrUnsupportedHost = errors.New("unsupported host")
	ErrToolchain       = errors.New("toolchain unavailable")
	ErrContention      = errors.New("workspace contention")
	ErrBuild           = errors.New("build failed")
	ErrSink            = errors.New("event sink failed")
)

// OperationError preserves both category and underlying cause for Is/As.
// Paths, environment values and raw process output are never included automatically.
type OperationError struct {
	Operation string
	Kind      error
	Cause     error
}

func (e *OperationError) Error() string   { return e.Operation + ": " + e.Kind.Error() }
func (e *OperationError) Unwrap() []error { return []error{e.Kind, e.Cause} }
