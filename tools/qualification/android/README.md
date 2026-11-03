# Fresh Android build qualification

Copy app/ to a fresh directory and run npm install --ignore-scripts there.
Select a supported JDK and installed SDK through JAVA_HOME and ANDROID_HOME.
Run from this repository:

```sh
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"fresh Android debug qualification"}' -- go run ./tools/qualification/android/consumer /absolute/app /absolute/fresh-state
```

The public consumer uses a fresh P2 generation, a Java contribution and a
JavaScript binding-generation input. It prints BuildResult with a metadata-derived
APK path, or a typed build error on failure. It calls no upstream
CLI and reuses no native tree. Compilation does not prove runtime health.

Release APK/AAB require caller-owned signing inputs in AndroidBuildOptions.
This fixture creates none. Signing and physical-device gates remain separate.
