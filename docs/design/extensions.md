# Build extensions

The independent `extension` SDK defines manifests, three lifecycle phases
(`collect`, `prepared`, `post_build`), explicit native package pins, and declarative
generated files. `Options.Extensions` merges all explicitly registered execution
forms; duplicate IDs reject. There is no automatic executable/module discovery.
Implementations must honor cancellation, avoid project writes and support concurrent
operations. They are trusted code, not sandboxed.

The host validates exact API `1`, package identity, platform applicability,
required capabilities, missing dependencies and cycles before preparation.
`after` edges order dependencies first; unrelated IDs sort lexically. Only
`generated_files` is supported. Injection of upstream services and undeclared
lifecycle phases reject. Package version, extension API, go-plugin application
protocol `1`, framework core protocol `1` and private helper `0.1.0` are independent.

Files are relative paths owned by an extension ID under
`NativeDir/.nativescript-extensions/ID/`. These are ancillary generated files;
they do not automatically become Xcode/Gradle source members or mutate artifacts.
The coordinator retains the workspace lease through handlers and application.
A failed handler publishes no files from that phase. Prepared output replaces
only the reserved directory. Native preparation and compilation are not rolled
back if a later phase fails. Extension removal clears reserved files on the next
preparation, including preparation without registrations. Native input contributions outside this narrow
capability require a future explicit typed contract and currently reject.

Go consumers implement `extension.Extension` and register directly. External
Go executables call `transport.Serve(implementation)` from main. Hosts use
`transport.Open` or `transport.OpenNode`, retain the returned implementation for
registration, and call the idempotent close function. Both use
[hashicorp/go-plugin gRPC](https://github.com/hashicorp/go-plugin/blob/main/docs/internals.md).
No Go dynamic libraries or external JSON transport are used. The complete child
environment and absolute working directory are explicit. Logs are separate from
handshake stdout and go-plugin controls the RPC lifecycle. macOS/Linux children
own a process group; extensions must not detach children from it. Windows execution
is explicitly unavailable. Direct registration remains portable.

JavaScript authors import `defineExtension` from
`@octane-xplat/nativescript-cli/plugin`, export its result, and implement
`async invoke(input, {signal})`. The supplied signal tracks gRPC cancellation.
The Node runner includes generated protobuf bindings, framework control, broker
and stdio services, and a compatible handshake. Its self-contained committed
payload is embedded in the Go module; ordinary consumers need Node without npm
installation or generation. Modules and writable extraction caches are explicit.

`Options.OTAStartup` opts into the installed `@octane-xplat/updates` **0.14.0**
startup adapter for release preparations. Debug skips it. The private built-in
helper runs that package's startup preparation on a copy of generated native
output, returning only the known startup source for atomic publication. It
preserves the producer's template refusal and idempotent startup block. It never
loads the upstream CLI or depends on a monorepo checkout.

The available OTA producer explicitly lacks automatic compatibility fingerprinting.
This implementation does not redefine that hash or stamp unresolved native pins.
`ota_fingerprint` is an unsupported required capability and rejects before
preparation. Package pins in extension inputs are resolved package versions, not
proof of resolved CocoaPods/SPM pins. Release/offline OTA runtime behavior and
native compatibility remain unqualified.

Regenerate Go bindings with protoc plus `protoc-gen-go` 1.36.11 and
`protoc-gen-go-grpc` 1.6.1 using source-relative output in
`extension/transport/wire`. Node bindings use grpc-tools 1.13.1 with commonjs binary
and grpc_js output in `plugin/generated`. Framework schemas retain HashiCorp's
MPL notices. Run `node tools/extensions/generate.mjs` after runner/binding changes
and `--check` in CI. The embedded bundle includes dependency license notices.

Tests distinguish actual Go/Node host interoperability from fixture native inputs.
No new native/device qualification or foreign-host execution is implied.
