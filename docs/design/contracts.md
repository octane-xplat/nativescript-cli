# C0 library contracts

The root package now defines construction, resolve/prepare/build/device/run
requests and results, typed errors, events and owned sessions. Native
operations remain `ErrUnavailable` until producers land; invalid inputs and cancelled contexts
are distinguished. No native tools or helper are launched by construction.
This baseline is component evidence, not a native build or runtime qualification.
The existing `extension` package remains reserved for H1, which must establish
its semantic contract with real JS/Go examples and the selected gRPC framework.

The facade owns public types and translates private project identities at its
boundary. Private packages never import the facade. `tools/consumer` shows an
ordinary caller with no CLI, internal or transport dependency. W1 replaces the private build fixture callback with stage composition;
internal fakes exercise that composition without exposing a public backend API.

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

## W1 orchestration and adapter integration

The facade now converts all five public workflows into `internal/workflow`
operations. `New` installs no native producers yet: valid Resolve, Prepare, Build,
Devices and Run requests return `ErrUnavailable` until the owning tracks supply
adapters. Invalid inputs return `ErrInvalidInput`; cancellation takes precedence.
`InspectXcode` uses the real embedded J1 host through the workflow layer.

Production composition belongs in the root constructor's private `workflow.Engine`.
Its factory receives a fresh environment map per operation and returns the stage
adapters. This is an internal integration seam, not a public backend API. Each
adapter must accept explicit paths/context and avoid process-global changes.
Build orders resolve, prepare, bundle, compile. Prepare stops after preparation.
Run discovers and validates the exact destination first, builds, then launches
one compatible artifact. It never substitutes another device. Missing, stale or
incompatible producer output fails without returning a partial result.

Preparation, bundling and compilation share one F2 project lease. Bundlers and
compilers now receive that lease explicitly as well as prepared inputs. Real
adapters must use `workspace.Ownership.Run` for mutating tools (and F2 Begin/Commit
state paths for generated output) and return only after children retire. F2's
cleanup failure keeps ownership held. Do not use a process output callback to
invoke application sinks while holding the lease.

Events expose paired `resolve`, `native`, `devices`, `launch` or `helper` stages.
The `native` stage covers the entire prepare/bundle/compile transaction: its
started event precedes acquisition and its completed event follows release.
There are no callbacks between those mutating stages. This retains uninterrupted
writer ownership and permits synchronous callback reentry. A stage failure emits
no completed event; a completed-event sink failure can fail the call after its
side effects. If launch has already acquired a session, cancellation or sink
failure closes it and waits for owned cleanup before returning the error.

Component tests use internal stage fakes with actual F2 locks; they do not prove
native preparation, compilation, installation or launch. Real helper tests use
independent concurrent clients, a shared extraction cache and actual Node parser
execution. Session cleanup/idempotence tests remain component lifetime evidence.
