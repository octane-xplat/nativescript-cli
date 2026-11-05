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
