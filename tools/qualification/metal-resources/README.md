# Native effects and compiled Metal resources

From the repository root, using the existing Darwin arm64 native toolchain and
offline Bun cache:

```sh
go build -o .cache/metal-consumer ./tools/qualification/vite-config/consumer
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"native effects resources"}' -- python3 tools/qualification/metal-resources/qualify.py /absolute/effects/platforms/ios .cache/metal-NEW .cache/metal-consumer "$PWD/.cache/metal-evidence-NEW"
```

Both output paths must be new. The source contains the original two Swift files
and device/simulator `.metallib` binaries. They are copied without modification
into a native-only fixture package with the published SwiftUI4.0.2 dependency.
The original JavaScript workspace/peer closure is outside this projection.

Two public Build operations verify actual unsigned simulator compilation,
provider-class symbols, exact shader-resource bytes at the app bundle root, and
class/resource removal after dropping the fixture dependency. Original source
hashes are rechecked after qualification. Evidence and native artifacts remain
in the project cache; no guest is created. This does not qualify Metal source
compilation, shader loading/rendering, whole-app runtime, OTA, release or signing.
