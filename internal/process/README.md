# Owned process execution

`Runner{}` implements C0's `Executor`. `Start(ctx, Command)` launches lazily;
`Wait` reports the exit code after cleanup and output delivery; `Close(ctx)`
requests cancellation and bounds the caller's wait while cleanup continues.
Independent handles and concurrent/repeated Wait/Close calls are supported.

Commands use exact arguments without shell parsing, an absolute working directory,
and a snapshot of inherited environment plus overrides. Executable lookup uses
Go's standard `os/exec` rules; use an explicit executable path when selecting a
tool from an overridden PATH. No global cwd, environment, logger or signal handler
changes occur. Output is binary chunks (not lines), serialized across stdout and
stderr with per-stream ordering and no cross-stream ordering guarantee. Callback
bytes may be retained. A nil callback discards output. No output is printed.

Callbacks apply backpressure and must observe their context; they cannot Wait or
Close their own handle. The first callback error stops further delivery and
cancels the tree. Ownership locks must be managed outside callbacks. The final
output drain has a one-second deadline, after which pipe reads close and the
callback context cancels with a cleanup error. Arbitrary non-cooperative callback
code cannot be interrupted; Close still honors its caller's deadline.

Errors support `errors.Is` for ErrInvalid, ErrStart, ErrExit, ErrOutput,
ErrCleanup, ErrUnavailable and context cancellation/deadline causes. `errors.As`
retains `*Error` and underlying `*exec.ExitError`/OS errors. A nonzero or signalled
exit is ErrExit (signal exit code is -1). Cancellation may coexist with ErrExit.
Error text deliberately omits arguments/environment; underlying OS errors remain
available for callers choosing to inspect them.

On macOS/Linux every launch receives its own process group. Cleanup sends TERM,
waits 150 milliseconds, then sends KILL to that group, including after the parent
exits successfully or unsuccessfully. A one-second group-retirement check follows
KILL; a still-present group (including unreaped orphan zombies) returns ErrCleanup,
so callers must not treat that result as successful ownership release. The
direct child is reaped; output drains
before completion. The OS must complete KILL/reaping, and the sink must cooperate.
Tools/extensions must keep owned descendants in that group. Detached sessions or
process groups are outside this lifecycle contract; this is not a security
sandbox. No process enumeration, shared-service termination or global signals
are used. Windows and other hosts reject launch with ErrUnavailable; Windows
requires a Job Object backend before process-tree execution can be supported.

Tests execute Node directly, including C0's descendant producer, a TERM-resistant
grandchild, parent success/failure, cancellation during output, an unrelated
process, streaming/backpressure and shutdown deadlines. These are actual host
subprocess tests, not native build/device or embedded-helper evidence. macOS and
Linux runtime qualification are separate; cross-compilation does not qualify
Windows or Linux runtime behavior. No external tool discovery occurs at import.
