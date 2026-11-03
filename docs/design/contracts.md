# C0 library contracts

The root package now defines construction, resolve/prepare/build/device/run
requests and results, typed errors, events and owned sessions. Production
operations return `ErrUnavailable`; invalid build inputs and cancelled contexts
are distinguished. No native tools or helper are launched by construction.
This baseline is component evidence, not a native build or runtime qualification.
The existing `extension` package remains reserved for H1, which must establish
its semantic contract with real JS/Go examples and the selected gRPC framework.

The facade owns public types and translates private project identities at its
boundary. Private packages never import the facade. `tools/consumer` shows an
ordinary caller with no CLI, internal or transport dependency. The private build
fixture seam is deliberately unavailable to production callers; W1 owns actual
workflow composition and must replace it with real stages.

## Events and concurrency

A client is safe for independent concurrent calls. Environment options are copied
on construction and again before passing to a backend. Callers must keep request
values immutable during each call. Events have per-operation sequences beginning
at one. There is no total ordering between operations. A shared sink must support
concurrent independent calls.

Delivery is synchronous and applies backpressure. A callback must observe its
context; cancellation cannot interrupt an arbitrary blocking callback. The first
sink error aborts delivery and returns both `ErrSink` and the underlying cause via
`errors.Is`. A completed-stage sink error still fails the call, even if an artifact
was written. Panics propagate. Callbacks may reenter the client with bounded
recursion. Callbacks must execute outside project/device ownership locks and
must not wait on their own operation/session. Future workflow composition must
schedule delivery around lease acquisition rather than invoke sinks under leases.

## Stage ownership

`internal/project` owns schema/revision/project/platform/destination/configuration
identities and normalized stage values. Prepared projects, bundles and artifacts
must match exactly; fixtures include spaces in paths and explicit device IDs.
`internal/workflow` defines resolver, preparer, bundler, compiler, discovery and
launch handoffs. Preparation owns native generation; compilation consumes prepared
state and a bundle. Device adapters consume artifacts without preparing/building.

`internal/workspace` defines destination-isolated output and bundle staging paths.
A project-wide lease serializes shared generated mutations across destinations.
The coordinator holds it until all mutating children finish, including cancelled
children. Release is idempotent and preserves Pods/SPM resolution lock files
across regeneration. Filesystem locking and atomic staging are F2 work.

`internal/process` defines exact argv, absolute cwd, inherited environment with
explicit overrides, separate output streams and synchronous output backpressure.
A process handle completes only after output and owned descendants retire.
Cancellation never authorizes killing shared services. F1 must implement and
qualify actual host process trees; the fake and Node descendant fixture do not
prove OS cleanup.

## Sessions and helper

A session's work function observes its parent context and owns cleanup. Wait is
repeatable and completes after cleanup. Close cancels once and waits; its context
bounds that wait while cleanup continues. Repeated/concurrent Close is safe.
Cancellation errors remain observable. Installation is retained; only owned
processes and forwarding are stopped, never caller-owned servers or device
services. The public zero session is already complete. Production Run returns
no session until a real implementation exists.

The private helper envelope has a protocol version, correlation ID, feature and
operation. Feature owners dispatch resolve/xcode/vite handlers. Ordered event
frames precede one terminal result/error; failures carry a code and message.
Cancel retires request-owned work before completion. Version mismatch is rejected
before dispatch. J1 owns actual framing/transport, validation of received frames,
payload version agreement, embedded distribution and cancellation integration.
This protocol is separate from H1's extension API and go-plugin/gRPC protocol.
