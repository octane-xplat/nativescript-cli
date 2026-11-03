// Package process owns subprocesses and their descendants, not global services.
package process

import "context"

type Stream string

const (
	Stdout Stream = "stdout"
	Stderr Stream = "stderr"
)

// Command is exact argv, with no shell parsing. Dir is absolute. Environment is
// an override of inherited env, copied at Start; nil means inherit unchanged.
// Output is serial per handle, preserves per-stream order, and applies synchronous
// backpressure. Its first error cancels the owned tree and becomes the Wait cause.
// Callbacks cannot Wait/Close their own handle. Application callbacks run outside
// workspace ownership. Trusted helper parsers may queue private frames under
// Ownership.RunHelper; they must never invoke application code.
type Command struct {
	Executable  string
	Args        []string
	Dir         string
	Environment map[string]string
	Output      func(context.Context, Stream, []byte) error
}
type Exit struct{ Code int }

// Start rejects pre-cancelled contexts without launching. Context cancellation
// and Close stop only the owned tree. Wait completes after descendants and output
// drain; it is repeatable. Close is idempotent, bounded by ctx, while cleanup
// continues even after its deadline. Nonzero exit is an error with Exit retained.
type Handle interface {
	Wait() (Exit, error)
	Close(context.Context) error
}
type Executor interface {
	Start(context.Context, Command) (Handle, error)
}
