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
	// Advice is safe, resolver-authored remediation; arbitrary dependency errors are excluded.
	Advice string
}

func (e *OperationError) Error() string {
	text := e.Operation + ": " + e.Kind.Error()
	if e.Advice != "" {
		text += ": " + e.Advice
	}
	return text
}
func (e *OperationError) Unwrap() []error { return []error{e.Kind, e.Cause} }
