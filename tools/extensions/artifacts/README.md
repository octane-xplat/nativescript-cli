# Three-form native inputs and post-build artifact inspection

Set `OTA_STARTUP=1` to also run the installed exact canonical OTA producer. This
requires supported runtime9.1 and resolved native locks. The consumer checks the
compiled APK stamp against the canonical record, requires the generated native
source entry before removal, and verifies removal changes the compatibility hash.
This debug build check does not exercise an OTA installer or runtime activation.

This opt-in public-library consumer builds the maintained
`tools/qualification/android/app` fixture and registers direct Go, executable Go
and Node inspectors in one operation. Each requires `build_artifacts`, reads the
completed APK and emits its descriptor/hash under its own extension namespace.
Each inspector also collects a distinct generated Java class. The caller
independently hashes the returned artifact, checks all reports and requires all
three class descriptors in APK DEX files. It then builds without extensions and
requires the descriptors to be absent with a changed generation identity.

Use an already installed JDK21/Android SDK, populated npm/Gradle caches and the
existing caller-owned standard Android debug keystore. No release signing or new
key is part of this qualification. Copy the Android fixture into a **new**
task-owned cache directory, install its lockfile with
`npm ci --offline --ignore-scripts --no-audit --no-fund`, then:

```sh
go build -o .cache/artifact-consumer ./tools/extensions/artifacts
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"post-build artifact inspection"}' -- env JAVA_HOME=/existing/jdk21 ANDROID_HOME=/existing/sdk .cache/artifact-consumer /absolute/new-app "$PWD/tools/extensions/artifacts/inspect.cjs" /absolute/evidence.json
```

The evidence JSON has adjacent `.with-native.apk` and `.removed.apk` copies;
use a new evidence path so existing evidence cannot be overwritten. Original
BuildResult paths are generation provenance and may be replaced by regeneration.

The consumer's `plugin` mode is its executable Go inspector; it uses go-plugin
gRPC, as does the embedded Node runner. No upstream CLI is invoked. Operation
failures remain failures in evidence. Reports, logs, APKs and consumer binaries
belong outside tracked source. Cleanup closes both external inspectors before
the native-build reservation ends.

This qualifies generated Java compilation/DEX membership and removal plus
read-only inspection of real debug APKs, not arbitrary artifact
mutation, iOS bundle inspection, other native contribution types, runtime startup,
release signing, OTA or the full extension build/development lifecycle. OS signal
cancellation is not qualified by this consumer. Foreign
host execution and clean module installation need their separate checks.
