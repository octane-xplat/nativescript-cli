# External extension framework

## Decision

Use [`hashicorp/go-plugin`](https://github.com/hashicorp/go-plugin) with gRPC
for external CLI/build extensions. The user selected this framework in the
design discussion. The repository is still a scaffold: no framework dependency,
protobuf service, SDK or plugin execution has been implemented.

## Execution forms

| Extension | Planned execution |
| --- | --- |
| External Go | A host-specific executable serves the extension gRPC API through go-plugin |
| JavaScript | A Node runner loads the JS module and serves the same gRPC API with go-plugin-compatible startup/lifecycle behavior |
| Go registered by a library consumer | An in-process implementation of the same semantic interface; no RPC required |

Node is an accepted prerequisite. Go plugin authors can distribute prebuilt
binaries so end users do not need a Go compiler. These extensions customize
build/development tooling; they are separate from NativeScript runtime plugins
included in an application.

## Responsibilities

Use the framework's process startup, handshake, RPC connection and protocol
versioning machinery. The core still owns workspace/device resources, phase
ordering, cancellation propagation, timeouts, diagnostics and cleanup of its
operations. Framework process cleanup does not replace those responsibilities.

Define the extension service in one protobuf schema and generate Go/Node
bindings from it. SDKs expose typed lifecycle inputs/results and contributions.
Keep framework and generated transport adapters separate from the public
extension domain types, allowing direct Go registration to share semantics.

The Node runner must implement the framework's startup handshake and required
gRPC services. Plugin authors should export JS handlers through the authoring
SDK without implementing those mechanics. The framework does not itself load
npm modules or supply the NativeScript-specific lifecycle API.

Keep the framework's core protocol version, our extension service/API version,
plugin package version and private built-in helper version distinct. The host
must report incompatible extension APIs explicitly. Keep handshake/protocol
output separate from plugin logs and allow library callers to control output.

Do not implement a second custom JSON protocol for external extensions or
fall back to Go's dynamic shared-library plugin mechanism. The private built-in
JavaScript helper remains an internal boundary with its own version contract;
this decision does not require migrating it to gRPC.

## Implementation and qualification

The extension workstream owns the protobuf contract, Go adapters and JS runner
SDK. Coordinate process ownership with the process workstream and shared helper
packaging with the helper workstream. Test equivalent external Go, external JS
and direct Go implementations, including version mismatch, handshake failure,
startup timeout, async errors, cancellation, cleanup and deterministic ordering.
Qualify supported hosts separately, including Windows.

Choose exact framework/Node runtime versions and code-generation tooling when
implementation begins. No transport interoperability or native behavior is
qualified by this design decision. Existing upstream hooks that depend on CLI
internal services still require explicit adapters.

Upstream references: [framework capabilities](https://github.com/hashicorp/go-plugin#features)
and [cross-language startup handshake](https://github.com/hashicorp/go-plugin/blob/main/docs/internals.md).
