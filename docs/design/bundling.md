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
assets without browser HTML or HMR injection. It disables Vite config discovery.
A selected project config uses the separate native-engine path below.
Unsupported Vite majors fail unavailable. Native runtime
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
public native development uses the separate ownership path described below.

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

Native requests carry the target platform, build configuration and authored app
path. Vite selects the `native`/platform export conditions, resolves extensionless
platform-specific `.ios`/`.android` modules before generic modules, and defines
NativeScript's platform/development flags. `~/` resolves within the selected app
path. `~/package.json` uses the authored app package when present and otherwise a
virtual runtime entry manifest, so importing core does not require an extra
source manifest. No installed package files are edited or upstream CLI spawned.
The existing emitted `bundle.js` contract remains unchanged; downloaded canonical
OTA archives have their own entry/package contract.

## Public native development sessions

`RunRequest.Development = &DevelopmentOptions{Port: 0}` opts into the installed
`@nativescript/vite` 8.0.21 engine with project-local Vite 8. This is distinct from
the Vite 7 IIFE bundler above: the native engine emits `bundle.mjs` and serves its
native `/ns/*` module graph and `/ns-hmr` WebSocket. The CLI exposes `run --hmr`
and `--hmr-port`. The root package's `main` must identify an entry inside appPath.
The caller installs core, engine, Vite and any runtime WebSocket dependencies;
the library never installs packages or invokes the upstream NativeScript CLI.
Installed native runtimes older than 9.1 reject. Physical HMR and borrowed native
servers are not implemented by this path and fail explicitly.

The helper uses its own process environment/argv for the engine and owns a
private content directory under the NativeScript CLI cache. It binds loopback,
with a strict selected port. Only the completed initial output is copied into
the native workspace under its existing writer lease; the server does not hold
that lease while native compilation runs. Android's device session owns reverse
forwarding for the selected port. The embedding process keeps its cwd, environment
and global logging unchanged. Without a selected project config the adapter
selects the TypeScript/XML preset.

## Project Vite configuration

An app's selected `bundlerConfigPath` opts both normal Build and native
development into installed `@nativescript/vite` 8.0.21 with Vite 8. The helper uses
Vite's public `loadConfigFromFile` API with explicit project/config paths and
`command:'build'` or `'serve'`. Debug selects development mode; release selects
production mode and clears the helper's inherited `DEBUG` override. Normal
Build disables HMR, while Development enables it. The root package's `main` must
remain inside appPath. A project config supplies its complete native framework
preset; the adapter does not add another TypeScript preset. Plain browser configs
without a native bootstrap fail rather than report a successful native bundle.

Project plugins, aliases, defines and framework transforms are retained. The
library replaces the engine's NativeScript-config-to-package plugin with its
resolved runtime manifest, and owns root, mode, cache, output directory, completed
disk writes and the loopback strict-port server settings. Conflicting output
file/directory overrides reject. Configs/plugins are trusted project code, not
sandboxed code. The framework's completed output must include `bundle.mjs`.
The internal Vite 7 Watch/borrowed-server adapter rejects selected project configs;
use the separately owned native Development path.

Development verifies the selected config against R1's source digest before
loading it. Changes to that file, imported config dependencies reported by Vite,
or the selected mode's `.env` files terminate with ErrRestart, including new env
files. Vite restart requests also return control to the Go coordinator. Separate
config instances serve the live graph and initial disk build. Inputs must remain
stable while loading/building; arbitrary plugin file reads are not a filesystem
snapshot or a complete dependency-discovery contract. No dependencies or caller
configs are installed or rewritten.

The opt-in `TestInstalledNativeProjectConfiguration` uses a real `.mts` config,
relative config import and installed TypeScript native preset. It proves build/
serve configuration, plugin execution, emitted/served defines, debug/release mode,
ownership settings, dependency/env restart, stale-file rejection and cleanup.
This is host/helper evidence. It does not establish the original Xplat Octane/
Bamboo preset, arbitrary framework HMR, native compilation or device behavior.

JavaScript updates use the engine's native HMR path. Native resources,
configuration, manifests and installed plugin platform inputs are watched
separately, including node_modules paths Vite normally ignores. A native edit
retires the current server/app before resolving, preparing, compiling and launching
again. Server failure cancels native work or the running app; cleanup failure
terminates the session instead of starting another owner. `Session.Close` cancels
the entire lifetime, including rebuilds. `Session.DevelopmentEndpoint()` snapshots
the current endpoint (empty while rebuilding/after completion), and `Logs()` keeps
a bounded history across app launches. Stage events retain their existing ordering
and callback ownership contract.

Configured app `ios.NativeSource` globs are watched at their canonical source
roots, including workspace directories outside the app. Their selected file set
and content identities are compared with resolution. Added/removed matching
files require re-resolution; unmatched siblings and generated output outside the
selector do not trigger rebuilds. Startup also rejects a selected set that changed
after resolution. Host checks use the real installed Vite engine with fixture
native compilation/devices; actual configured Swift compilation has a separate
opt-in consumer in `tools/extensions/swift/`.

To run the real-engine host checks:

```sh
bun install --cwd tools/qualification/development --frozen-lockfile --ignore-scripts
NS_NATIVE_VITE_DIR="$PWD/tools/qualification/development" go test . ./internal/bundle -run 'TestPublicNativeDevelopmentLifecycle|TestInstalledNativeDevelopmentServer' -count=1
```

The dependency fixture provides exact installed engine/core versions. The tests
create independent apps and run real resolution, extraction, engine startup,
native bootstrap emission and HTTP entry serving. Public lifecycle tests use
fixture native compiler/device adapters and check serialized rebuild/relaunch,
port rejection, retirement, repeated close and embedding globals. They do not
establish actual native HMR application, simulator startup or full G5 acceptance;
those require separate real platform runs. CI labels the same boundary explicitly.

The version-qualified native adapter compares filesystem notifications with R1's
content identities, ignoring metadata-only changes and Swift package cache paths
that R1 excludes. It uses the engine's exported transform-cache invalidator before
TypeScript hot updates so `/ns/m` serves the edited bytes. A small native-client
response adapter preserves explicit self/dependency accept callbacks (including
single-module and dependency-array shapes), snapshots them before eviction and
keeps the preset's XML refresh for unaccepted modules. The engine retains its
transport, module graph and eviction; installed package files are not edited.
These adaptations are scoped to the pinned engine version and have host contract
tests plus opt-in real iOS/Android qualifiers described in
[the native development fixture](../../tools/qualification/development/README.md).

The TypeScript strategy also emits an empty placeholder after its shared handler
has already published transformed source. The version-scoped adapter suppresses
that fallback only when the same invocation processed real source for that graph
ID. This retains the authoritative hash/dependencies and prevents a module fetch
from manufacturing another transaction. A real-engine WebSocket test checks one
loaded-module save through delivery and re-fetch. The engine retains graph and
version ownership; this is not a time-based client deduplication policy.

Accept callbacks are awaited before completing a batch, so later saves remain
queued while async acceptance is unresolved. A rejected callback logs a stable
failure message, clears the adapter's batch state and propagates to the engine's
update handler; it does not mark the batch complete. Later saves can recover.
The native fixture queues a second save during an async callback, rejects one
callback, then applies another; it checks ordered tokens, exact counts and no
overlap in the original PID/boot before rebuilding a native resource. This
qualifies that scenario only, not every callback/disposal or G5 failure mode.
