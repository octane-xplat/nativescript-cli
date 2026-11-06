> Note: the results recorded below exercised the removed Vite 7 fallback bundler on runtime 9.0.0. Under current Build (official @nativescript/vite engine, ESM bundle.mjs, runtime >= 9.1 required) this fixture is not runnable until migrated to a 9.1+ runtime and the installed engine.

# Fresh Android public-library qualification

`qualify.py` installs a clean standalone app, builds two external Go consumers
from a local module distribution archive, and invokes the public library with
no upstream CLI or previously generated native tree. Node, npm, Go 1.26+, JDK21,
an installed Android SDK35 and API35 google_apis arm64 image are prerequisites,
plus the existing caller-owned `elegant-fir-probe` AVD (Pixel 6, API35,
google_apis, arm64). No SDK image is downloaded and no device is ever created,
registered, rewritten or deleted; at most one emulator runs at a time. Invoke
the runner without an enclosing build-only
reservation so it can end the build lease before acquiring the device lease. Run on an arm64 Android emulator host:

```sh
JAVA_HOME=/absolute/jdk21 ANDROID_HOME=/absolute/android-sdk \
python3 tools/qualification/android/qualify.py --evidence-dir /absolute/new-evidence
```

The runner reserves native build capacity, then separately reserves the
existing `elegant-fir-probe` AVD exclusively. It boots only that AVD on unused
even port 5582 (override with `--port`), refuses to run when the fixture app is
already installed, installs the public Build APK, and requires JS startup, a contributed
Java method accessed through runtime metadata, a generated Runnable binding,
and eight advancing nonce-specific health ticks. The two Runnable bindings use
explicit Java class names to keep their runtime identities distinct. An independent public Run
must time out on serial ownership. Context cancellation, Wait, repeated Close,
app PID retirement and reverse-forward removal are checked. The fixture
installation it created is uninstalled and verified absent; the owned emulator
boot exits before the device reservation ends and the AVD is retained.
The fixture uses the actual NativeScript runtime and a minimal contributed
Android Activity; it does not claim framework UI or HMR qualification.

Evidence includes the APK, build result, SHA256, input revision, exact target,
nonce, runtime/tool versions and emulator log. Capture stdout/stderr separately
for the health/cancellation transcript. Generated source paths in BuildResult
are provenance, not persistent paths; the copied APK is `app.apk`.
Runtime PATH excludes npm and both CLIs. Helper assets come from the module.
The archive uses `git ls-files`, so stage intended new source before running.

For build-only component work, copy `app/`, install its locked dependencies and
invoke `go run ./tools/qualification/android/consumer APP FRESH_STATE` under a
native build reservation. The device consumer accepts `BUILD_JSON EXACT_SERIAL
[NONCE]`; its caller must reserve and boot that exact owned device.

This qualifies bundled debug emulator behavior only. Signed release APK/AAB,
physical devices, offline release startup, other ABIs/hosts, full HMR and G4–G6
remain separate gates. The runner creates no signing inputs or public releases.
