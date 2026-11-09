# Bundling and development lifecycle

Build and native development both run through the project's installed official
`@nativescript/vite` engine (8.0.20 or 8.0.21) with project-local Vite 8. There
is no internal fallback bundler: without a selected `bundlerConfigPath` the
engine's TypeScript/XML preset applies, and a missing engine or a runtime older
than 9.1 fails `unavailable`. Node and installed project dependencies are
checked lazily. No installation or upstream CLI is performed.

The engine emits an ESM `bundle.mjs` and a runtime `package.json` manifest
(`main:"bundle.mjs"`, application id and Android v8Flags/markingMode). ESM
arrived in 9.0 native runtimes; the floor is 9.1 to match the development
qualification and canonical OTA archives. The root package's `main` must
identify an entry inside appPath. Unsupported engine/Vite majors fail
unavailable. Native runtime execution must be qualified by G2/G3; the emitted
JavaScript fixture does not establish it.

Adapter.Bundle receives the real resolved project, prepared destination and F2
lease. It reports identity, entry and emitted files only after disk output and
helper retirement. Native compilation belongs to the next stage. A failed build
returns no bundle; callers must not consume older files after failure.

The integration coverage uses real R1 resolution, extracted J1 payload, F1
processes and F2 leases in independent temporary apps, with preparer/compiler
component fixtures. Without an installed engine the tests assert runtime floor,
entry validation, unavailable engine, cancellation and lease retention. With
`NS_NATIVE_VITE_DIR` they run the real engine's release bundle for iOS and
Android, checking platform export/module selection, the emitted ESM entry, the
runtime manifest and core's XHR polyfill presence.

Native requests carry the target platform, build configuration and authored app
path. The engine selects the `native`/platform export conditions, resolves
extensionless platform-specific `.ios`/`.android` modules before generic modules,
and defines NativeScript's platform/development flags. `~/` resolves within the
selected app path. `~/package.json` resolves to a virtual runtime entry manifest,
so importing core does not require an extra source manifest. The engine keeps
side effects for modules inside `@nativescript/core`, so the
XMLHttpRequest/FormData/Blob/File/FileReader globals survive tree-shaking.
No installed package files are edited or upstream CLI spawned. The existing
emitted `bundle.mjs` contract remains unchanged; downloaded canonical OTA
archives have their own entry/package contract.

## Public native development sessions

`RunRequest.Development = &DevelopmentOptions{Port: 0}` opts into the installed
`@nativescript/vite` 8.0.20 or 8.0.21 engine with project-local Vite 8. The native engine emits `bundle.mjs` and serves its
native `/ns/*` module graph and `/ns-hmr` WebSocket. The CLI exposes `run --hmr`
and `--hmr-port`. The root package's `main` must identify an entry inside appPath.
The caller installs core, engine, Vite and any runtime WebSocket dependencies;
the library never installs packages or invokes the upstream NativeScript CLI.
Installed native runtimes older than 9.1 reject. Physical HMR and borrowed native
servers are not implemented by this path and fail explicitly.

`DevelopmentOptions.Mode = Restart` (the `run --watch` CLI flag) runs no dev
server or HMR client. The session fingerprints the resolved source set and
native-input roots, and a confirmed change (two consecutive polls agreeing)
triggers an official-engine rebuild and cold relaunch. When the resolved native
identity is unchanged, the built-in simulator/emulator launcher syncs the new
bundle without compiling or reinstalling: iOS replaces the installed `.app/app`
tree; Android uses its debug runtime's `fullsync` staging area. Removed bundle
files are removed on both paths. Native-input changes, registered public
extensions, and OTA preparation use the full native build/install path. New
Java-backed classes introduced in JS need a fresh native build to regenerate
Android bindings; restart the development session for that build.

The new bundle or artifact builds while the last good app keeps running; a failed rebuild emits a
bounded `Diagnostic` event, leaves the current app up, and retries only when the
fingerprint changes again. `--watch` is mutually exclusive with `--hmr`, and a
port is invalid in restart mode. `RunRequest.Log` streams each captured app log
chunk in capture order during any session, replaying retained startup output
when attached. `Session.Logs()` keeps the bounded snapshot, including restart
history. `RunRequest.Launched` receives typed application/device/identity metadata
after each successful launch; an observer error closes and rejects that launch.
Embedders can record identity without parsing upstream CLI text.

The helper uses its own process environment/argv for the engine and owns a
private content directory under the NativeScript CLI cache. It binds loopback,
with a strict selected port. Only the completed initial output is copied into
the native workspace under its existing writer lease; the server does not hold
that lease while native compilation runs. Android's device session owns reverse
forwarding for the selected port. The embedding process keeps its cwd, environment
and global logging unchanged. Without a selected project config the adapter
selects the TypeScript/XML preset.

Automatic native input watching uses the same iOS/Android platform subtrees as
resolution. Inactive sibling platform trees do not become unrecognized additions
merely because a package also ships macOS or Windows inputs. Explicitly selected
source identities or native package directories inside those trees remain
watched, including new members under an explicitly selected directory. Active
iOS/Android additions and changes still require re-resolution.

Each session's restart identity covers only its own platform. The other mobile
platform's `App_Resources` subtree and native packages' `platforms/<other>` roots
remain watched paths but are passed as `inactiveNativeRoots` and excluded from
the compared sources. An iOS-only resource edit therefore rebuilds a concurrent
iOS session without restarting an Android session from the same project.

## Project Vite configuration

An app's selected `bundlerConfigPath` opts both normal Build and native
development into installed `@nativescript/vite` 8.0.20 or 8.0.21 with Vite 8. The helper uses
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

Development verifies the selected config against R1's source digest before
loading it. Changes to that file, imported config dependencies reported by Vite,
or the selected mode's `.env` files terminate with ErrRestart, including new env
files. Vite restart requests also return control to the Go coordinator. Separate
config instances serve the live graph and initial disk build. Inputs must remain
stable while loading/building; arbitrary plugin file reads are not a filesystem
snapshot or a complete dependency-discovery contract. No dependencies or caller
configs are installed or rewritten.

The native engine also runs three esbuild vendor/dependency passes outside Vite.
The helper adapts those passes to the selected config's public Vite resolver, so
framework aliases such as MasonKit retain their project meaning. The adapter
loads the unchanged project-installed esbuild CJS SDK before the engine's ESM
imports snapshot its exports. This path is version-scoped to engine 8.0.21 and
esbuild 0.27; an already-loaded or unsupported SDK fails unavailable. Other
esbuild calls are unchanged. SDK core/engine imports keep their native realm;
aliases resolving into the selected core package, virtual or unresolved
destinations fail rather than bundle that core through an alternate name.

Vendor work can start in async plugin factories before Vite resolves the full
config. An alias-only resolver supplies that early work; the final config hook
rechecks its used imports against the effective resolver. A changed destination
rejects. Separate async contexts isolate serve/build instances, and the engine's
vendor hooks retain their context through RollDown callbacks. The helper disables
the engine's dependency disk cache because its key omits these aliases. This
trades cache reuse for correct config ownership; it does not change the engine's
core cache or installed sources. Helper retirement stops its owned SDK service.

The real installed-SDK test is opt-in:

```sh
NS_NATIVE_VITE_DIR=/absolute/path/to/installed/app node --test bridge/vite/native-aliases.test.cjs
```

It checks concurrent configs, alias/custom resolution, early factory work,
late config validation, vendor callback context and native-realm rejection.
The selected config's `resolve.preserveSymlinks` policy applies to ordinary Vite
resolution and the three adapted vendor passes, including file paths returned by
custom resolvers. With false, aliases and direct imports of one physical module
share its identity; with true, explicit symlink identities remain distinct.
Virtual namespaces, external imports, query suffixes and resolver result fields
are retained. The Vite hook captures its config's state because Rolldown invokes
hooks outside Node's originating async context. A policy change after vendor
work starts rejects rather than mixing two module identities.

The pinned-preset host qualifier exercises the recorded renderer/config and
installed-byte inputs. Historical cache labels and patch receipts do not certify
the complete original Git tree or canonical patch application; qualify those
at their actual source hashes. These are host/compiler checks, not native CSS
or app execution. The maintained numeric Mason probe and
`tools/qualification/vite-config/audit-mason-module-identity.cjs` can compare
byte-verified module definitions in retained native/host bundles, including
minified release output, without executing SDK modules in Node. One definition
does not itself prove startup, resize behavior or native ABI compatibility.

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

Configured app/plugin `ios.NativeSource` globs are watched at their canonical source
roots, including workspace directories outside the app. Their selected file set
and content identities are compared with resolution. Added/removed matching
files require re-resolution; unmatched siblings and generated output outside the
selector do not trigger rebuilds. Startup also rejects a selected set that changed
after resolution. Host checks use the real installed Vite engine with fixture
native compilation/devices; actual configured Swift compilation has a separate
opt-in consumer in `tools/extensions/swift/`.
Groups are expanded independently: equal names in separate plugin configs do
not create a duplicate-name error or force a rebuild while inputs are unchanged.

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

With an existing installed fixture, run the independent embedding-owner case:
`NS_NATIVE_VITE_DIR=/absolute/installed/app go test -race . -run '^TestTwoEmbeddedDevelopmentCallers$' -count=1`.
It keeps two real Vite/helper environments live, cancels one, rebuilds the other,
and checks owned endpoint retirement. Its native adapters remain fixtures.

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

For the registered Octane0.2.1 development strategy, adapt its separate handler
after project configuration registers it. A deferred module delta is emitted
only when that operation changes a module hash or dependency identity; explicit
removals still propagate. An identical entry save must not replay an earlier
transaction. This adapter is limited to the qualified0.2.1 provider and the
SDK versions above; other Octane development provider versions fail unavailable.
Installed provider files and client framework behavior remain unchanged. Host
protocol checks do not establish native callback execution or complete G5.
