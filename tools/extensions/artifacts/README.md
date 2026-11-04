# Three-form post-build artifact inspection

This opt-in public-library consumer builds the maintained
`tools/qualification/android/app` fixture and registers direct Go, executable Go
and Node inspectors in one operation. Each requires `build_artifacts`, reads the
completed APK and emits its descriptor/hash under its own extension namespace.
The caller independently hashes the returned artifact and checks all reports.

Use an already installed JDK21/Android SDK, populated npm/Gradle caches and the
existing caller-owned standard Android debug keystore. No release signing or new
key is part of this qualification. Copy the Android fixture into a **new**
task-owned cache directory, install its lockfile with
`npm ci --offline --ignore-scripts --no-audit --no-fund`, then:

```sh
go build -o .cache/artifact-consumer ./tools/extensions/artifacts
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"post-build artifact inspection"}' -- env JAVA_HOME=/existing/jdk21 ANDROID_HOME=/existing/sdk .cache/artifact-consumer /absolute/new-app "$PWD/tools/extensions/artifacts/inspect.cjs" /absolute/evidence.json
```

The consumer's `plugin` mode is its executable Go inspector; it uses go-plugin
gRPC, as does the embedded Node runner. No upstream CLI is invoked. Operation
failures remain failures in evidence. Reports, logs, APKs and consumer binaries
belong outside tracked source. Cleanup closes both external inspectors before
the native-build reservation ends.

This qualifies read-only inspection of a real debug APK, not arbitrary artifact
mutation, iOS bundle inspection, native source contributions, runtime startup,
release signing, OTA or the full extension build/development lifecycle. OS signal
cancellation is not qualified by this consumer. Foreign
host execution and clean module installation need their separate checks.
