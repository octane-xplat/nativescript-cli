# Bundling and development lifecycle

V1 implements the private W1 bundler adapter and an owned development watcher.
The root client wires the bundler; Build still requires preparation and compiler
producers. No public native workflow is claimed by this component alone.

The embedded helper resolves Vite from the selected project. Vite 7 is the
supported major; the independent fixture qualifies 7.3.1. Node and installed
project dependencies are checked lazily. No installation or upstream CLI is
performed. Vite is a development dependency here solely for qualification.
The module-distributed payload does not embed Vite: consumers supply their app's
Vite installation. API reference: https://vite.dev/guide/api-javascript.

The supported bootstrap is appPath/package.json main, falling back to app.js.
V1 uses an explicit Vite library build producing an IIFE bundle.js and emitted
assets without browser HTML or HMR injection. It disables Vite config discovery;
arbitrary project Vite configuration and NativeScript-specific runtime transforms
are not supported yet. Unsupported Vite majors fail unavailable. Native runtime
execution must be qualified by G2/G3; this JavaScript fixture does not establish it.

Adapter.Bundle receives the real resolved project, prepared destination and F2
lease. It reports identity, entry and emitted files only after disk output and
helper retirement. Native compilation belongs to the next stage. A failed build
returns no bundle; callers must not consume older files after failure.

Adapter.Watch returns a W1 session and a channel of typed events. Callers retain
the supplied F2 lease until Wait completes. RunHelper tracks active helper work,
so Release waits through F1 descendant cleanup. Private frame parsing writes only
to a bounded queue and never invokes application callbacks under the lease.
Events close on completion; overflow fails and cancels the owned helper. Callers
inspect Wait for terminal errors. Close is idempotent; cancellation returns the
context error after cleanup. This internal API is intended for device owners;
it does not add a second public root development-session API.

The emitted event follows each successful watched disk write. The ready event
follows initial output and server listening and includes that manifest and HTTP
and WebSocket endpoints. The server binds loopback and uses strict port selection;
zero chooses an available port. HMRHost/HMRPort configure the advertised endpoint
for later forwarding, which V1 does not create. Source/bootstrap edits rebuild;
configuration/package edits terminate with ErrRestart for caller re-resolution.
Build and server failures terminate the session. Actual NativeScript HMR module
application, device forwarding and native-input change handling remain G5 gates.

CallerEndpoint is an explicit borrowed HTTP/HMR pair. V1 starts only its build
watcher in that mode and returns the supplied endpoint unchanged. It never probes,
shuts down, or configures the caller's server. Endpoint health and compatibility
remain the caller's responsibility. Without CallerEndpoint the helper owns both
Vite resources, and F1 retires their process tree on completion or cancellation.

The integration test uses real R1 resolution, extracted J1 payload, F1 processes,
F2 leases and W1 orchestration in an independent temporary JavaScript app. Its
preparer/compiler are explicitly component fixtures, with no native build or
reused platform tree. Tests execute the emitted JavaScript in Node, request the
real HMR client, check source/bootstrap rebuilds, cold readiness, port contention,
server crash, config restart, cancellation and preservation of a borrowed server.
