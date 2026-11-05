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
