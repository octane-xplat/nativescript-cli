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

`Options.OTAStartup` opts into the canonical installed updates/fingerprint
**0.19.0** pair from source revision
`b58567933b22fc6ff076f366fba61926a090f8e4`. `tools/ota/stage.py REFERENCE NEW_OUTPUT`
builds private tarballs using the official prepack commands, resolves the original
catalog/workspace versions, and includes the root MIT license. It never fetches
Git objects or modifies the reference checkout. Install those tarballs explicitly
in the selected app; runtime needs their installed bytes, Node >=22.22.2 and the
platform toolchain, with no monorepo lookup or upstream CLI. The adapter checks
version and reviewed producer/collector payload digests (`canonical.json`).

The resolver retains the complete evaluated config. The canonical evaluator must
agree with it; incompatible config formats or values fail rather than hashing a
truncated config. A private project snapshot reconciles original buildPath pin
locations with generated output. Absolute buildPath outside the project and
symlinked authored inputs are currently unsupported. Authored inputs are checked
for changes before publication. Installed dependency and native pin changes are
checked by repeating the canonical collector after preparation.

Both debug and release stamp the canonical identity and patch the boot guard;
debug stamps remain release=false. Native flags carry destination and architecture
through the owned helper argv. Compiler/SDK identity is captured by the canonical
producer. Podfile requires Podfile.lock; Android requires a Gradle dependency lock.
These checks refuse unresolved inputs but do not certify dependency resolution.
The producer retains its Swift package resolution and unsupported-template guards.
For Build, OTA runs after bundling and before compilation; explicit Prepare requires
an emitted app/package.json and otherwise fails closed.

Startup source, app/xplat-native.json and the complete private record under
NativeDir/.xplat/fingerprints/ are published together by atomic directory exchange
under the project lease, after the helper and descendants retire. Linux requires
filesystem support for rename exchange. Unsupported hosts/filesystems fail without
publication. A cleanup failure retains staging and ownership for diagnosis.
Repeated preparation is idempotent. No project-root .xplat record is written.

`ota_fingerprint` remains unsupported as an arbitrary external contribution;
the built-in adapter alone owns this semantic contract. Fixture pin tests and
actual package/SDK checks are distinct from real dependency-manager pins, native
compilation and OTA runtime qualification. G4–G6 remain unqualified. The canonical packages declare iOS/Android 9.1.0,
while current preparation supports iOS 8.9.0 and Android 9.0.0. Public preparation
correctly rejects that mismatch; this adapter does not override runtime validation.

`tools/ota/qualify-pins.py INSTALLED_CONSUMER GRADLE_EXECUTABLE` runs under a
`native_builds:1` reservation. It resolves a local Pod, a local source-control
Swift package and an offline local Maven dependency, then checks that canonical
records include their actual lock records and that the independent fingerprint
CLI reports an empty diff. This is real dependency-manager/producer component
evidence with boot templates, not an application build or runtime qualification.
`OTA_CONSUMER_DIR` enables owned-helper and adapter tests; `ANDROID_HOME` also
enables actual Android SDK identity capture in the Node adapter test.

Regenerate Go bindings with protoc plus `protoc-gen-go` 1.36.11 and
`protoc-gen-go-grpc` 1.6.1 using source-relative output in
`extension/transport/wire`. Node bindings use grpc-tools 1.13.1 with commonjs binary
and grpc_js output in `plugin/generated`. Framework schemas retain HashiCorp's
MPL notices. Run `node tools/extensions/generate.mjs` after runner/binding changes
and `--check` in CI. The embedded bundle includes dependency license notices.

Tests distinguish actual Go/Node host interoperability from fixture native inputs.
No new native/device qualification or foreign-host execution is implied.
