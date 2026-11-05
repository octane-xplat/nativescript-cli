# GestureHandler native usage qualification

With the existing Android SDK, API35 Google APIs arm64 image, JDK21, Bun package
cache and caller-owned debug keystore configured, run from the repository root:

```sh
python3 tools/qualification/android/native-usage/qualify.py .cache/native-usage-NEW --port 5582
```

The output directory must be new. The harness stages the locked selected-Vite
fixture, installs GestureHandler2.1.0 offline with scripts disabled, and uses the
public Go Build/Devices/Run APIs. Build and device reservations do not overlap.
The existing identity-checked emulator harness reuses only the caller-owned
`elegant-fir-probe` AVD — it never creates, registers, rewrites or deletes a
device and boots at most one emulator; the device consumer asserts the actual native class, nonce, stable app
PID/boot and advancing JSON heartbeat. It checks repeated Close/Wait, unchanged
embedding globals, PID retirement and uninstall. The harness then retires the
emulator boot; the AVD is retained. It does not create a signing key.

`build.json`, `build.json.runtime.json`, `evidence.json`, the APK, generated tree,
installed lock and process logs remain in the cache. Foreign builds, the original
workspace graph, gestures/layout, HMR, release, physical devices and OTA need
separate evidence. Package installation is offline; Gradle uses the caller's
normal dependency-resolution configuration.
