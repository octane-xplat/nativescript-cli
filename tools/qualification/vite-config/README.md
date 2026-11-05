# Selected Vite config native builds

The maintained consumer imports only the public library and requires an existing
selected project config. It performs an actual unsigned arm64 iOS simulator Build
and inspects the resulting executable, compiled app runtime manifest, project
plugin proof and emitted define. Debug and release are separate invocations.
There is no guest launch, physical signing, release distribution, OTA installer
or original Xplat Octane/Bamboo preset claim.

Stage under the project cache using already cached locked dependencies:

```sh
python3 tools/qualification/vite-config/stage.py .cache/selected-vite-app

go build -o .cache/selected-vite-consumer ./tools/qualification/vite-config/consumer

goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"selected Vite config native build"}' -- "$PWD/.cache/selected-vite-consumer" "$PWD/.cache/selected-vite-app" "$HOME/dev/reports/nativescript-cli/selected-vite-debug" debug
```

Run the same consumer with `release` and a new evidence prefix to qualify the
production branch. Reusing the app does not reuse the other target's generated
platform tree: configuration participates in workspace identity. Existing runtime
template caches are allowed. Never overwrite a prior evidence prefix. The helper
owns DEBUG changes; the consumer checks embedding globals after completion.
Native invocations must retain the project's broker reservation.

## Published Xplat preset host fixture

This separate fixture runs the published `@octane-xplat/cli`0.19 preset with the
Octane compiler, real installed native-package resolution and the owned helper
server. It does not qualify the pinned consumer checkout's newer source preset,
Bamboo, native compilation, guest startup or native Octane HMR application.

Fetch the exact published CLI tarball into project cache (never publish anything),
then stage already cached locked dependencies with scripts disabled:

```sh
npm pack @octane-xplat/cli@0.19.0 --ignore-scripts --pack-destination .cache/canonical-packages
python3 tools/qualification/vite-config/stage-xplat.py .cache/canonical-packages/octane-xplat-cli-0.19.0.tgz .cache/selected-xplat-preset
NS_XPLAT_VITE_DIR="$PWD/.cache/selected-xplat-preset" go test -race ./internal/bundle -run TestInstalledXplatProjectConfiguration -count=1 -v
```

The stager validates the tarball SHA-256 and rejects upstream CLI packages or a
preexisting native tree. Offline installation requires cached dependencies. The
lock includes optional compiler peer `@tsrx/oxc`0.20.0 and the established native
HMR WebSocket prerequisite, `@valor/nativescript-websockets`2.0.3. A missing cache
entry fails instead of fetching/installing through a library operation.

`NS_XPLAT_VITE_EVIDENCE_FILE` optionally names a new absolute JSON report file.
It contains emitted module/bootstrap hashes and structural assertions, never raw
transformed source or dev-tool authentication defines. Internal session Close
reports expected cancellation/process-exit signals; the test rejects additional
failures and verifies output/server retirement and repeated Close.

## Pinned source and original Bamboo config

`project-pinned.py SOURCE WORKSPACE` consumes a read-only b585679 source snapshot
and an already staged task-owned `WORKSPACE/apps/mobile`. Install the exact
published Bamboo prerequisites there with scripts disabled first:

```sh
bun add --cwd .cache/pinned-workspace/apps/mobile --dev --offline --ignore-scripts @octane-xplat/bamboo@0.19.0 @bamboocss/dev@1.60.1
python3 tools/qualification/vite-config/project-pinned.py /path/to/pinned-source .cache/pinned-workspace
NS_XPLAT_VITE_PROFILE=pinned NS_XPLAT_VITE_DIR="$PWD/.cache/pinned-workspace/apps/mobile" go test -race ./internal/bundle -run TestInstalledXplatProjectConfiguration -count=1 -v
```

The projector copies CLI/Bamboo sources and bundles local preset entries with
Bun while leaving package dependencies external. It preserves the published
packages as backup directories and resolves their installed dependencies. This
is an explicit source projection, not the consumer's release packaging procedure.
The original mobile Vite config and shared Bamboo config remain byte-identical;
`source-projection.json` records source and generated-entry hashes. The CLI entry
source must match the pinned SHA. The workspace must be new to this projector.

The host check preserves the workspace-relative Bamboo root, transforms an
Octane component and checks an emitted probe CSS asset. Visual-capture and docs
demo branches are disabled explicitly. Native HMR deliberately leaves CSS as an
asset; the test does not infer actual native CSS application, component lifecycle
or full app behavior. The broader consumer patches and native/runtime acceptance
remain separate requirements.

`stage-pinned-native.py SOURCE CLI_TARBALL NEW_WORKSPACE` composes these stages,
adds cached iOS9.1.0 and copies the maintained scene/deployment resources. Run the
public consumer with its optional `pinned` argument under the native-build broker.
The profile checks the compiled app marker and Bamboo color/spacing tokens in
JavaScript, retains the executable/manifest and an `.inspection.json` report,
and preserves embedding globals. It does not invent a project-emitted proof asset
or certify native CSS application, component lifecycle or guest health. Debug and
release each need their own actual invocation and evidence prefix.

`patch-runtime.py SOURCE WORKSPACE` prepares private copies for the next runtime
checks. It requires the staged source-projection marker and exact package
versions, preserves original package directories/dependencies, and applies the
pinned core, Octane, renderer, engine, flavor and CSS patches. Bun hardlinks are
copied before modification. A patch failure stops the fixture; start a new
workspace instead of replaying into partial state.

The Vite8.0.21 diff has a malformed EOF annotation before a deleted source-map
footer. For that diff only, the tool removes EOF annotations and uses Git's
`--recount --inaccurate-eof` handling, with a mandatory check before applying.
All code hunks must still match. `runtime-patches.json` records original/applied
patch hashes, normalization and resulting package-file hashes.

Patch application and public Resolve do not establish runtime compatibility.
The same host qualifier can run against this patched workspace. It exercises
the renderer's original MasonKit imports through the preset aliases and the
helper's version-scoped vendor/dependency resolver bridge. It retains the
original renderer imports and preset aliases. Native startup, CSS application,
component lifecycle and HMR still require their own actual platform runs.

Set `NS_XPLAT_VITE_VENDOR_ALIAS_FAILURE=1` with the patched `pinned` profile to
also replace the alias in the disposable test app with an unsupported virtual
destination. The check requires startup failure and helper retirement before
the caller deadline. It never changes the installed fixture or original configs.

## Patched preset native runtime probe

After staging a new pinned native workspace and applying all six patches, add
the maintained probe with the same read-only pinned source:

```sh
python3 tools/qualification/vite-config/stage-runtime-probe.py /path/to/pinned-source .cache/new-patched-native-workspace
python3 tools/qualification/vite-config/qualify-runtime.py .cache/new-patched-native-workspace/apps/mobile "$HOME/dev/reports/nativescript-cli/new-preset-runtime"
```

The stager verifies patch-file identities, preserves the original Vite/Bamboo
configs and copies the byte-exact shared app package manifest. That manifest
declares Octane ownership for shared source outside the mobile app root. It
adds only a nonce, probe component and CSS variables to this task-owned fixture.
The original full app and its dependency graph are not staged by this probe.

The orchestrator compiles public-library consumers, reserves native compilation,
then creates a fresh shutdown iPhone17 Pro/iOS27 guest. It hands ownership to a
resident/exclusive broker reservation before boot/install/launch. This fixture
currently requires Darwin arm64 and that installed simulator runtime. It uses
unsigned simulator builds and never imports a CA, changes signing, or publishes.

The guest emits nonce/PID/boot-tagged text health. The runtime consumer checks a
live native view's Bamboo color/spacing through mount, prop update, unmount and
remount, then heartbeat progression in the same process and repeated session
close. It rejects cleanup failures even when joined with cancellation. The
orchestrator removes its installation, shuts down/deletes its created guest and
releases reservations on success or failure. Reports distinguish Build, runtime
and resource ownership results. Failed observations remain failures; the harness
does not establish HMR, Mason layout, full app behavior, OTA or release support.
