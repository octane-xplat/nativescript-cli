# Android artifact sessions

`Client.Devices(Android)` uses ADB only. It lists exact serials, including
unauthorized/offline devices, and queries ABI only for online devices. Android
architecture names are the build producer's ABI names (`arm64-v8a`,
`armeabi-v7a`, `x86`, `x86_64`). Discovery never boots an emulator. The caller
owns AVD creation, boot, shutdown and host reservations. ADB can start its shared
server; this library never kills that server.

`Client.Run` accepts an existing compatible APK or the public build pipeline's
artifact. Selection requires the exact serial, kind and ABI. AAB installation,
split APKs and automatic device selection are unsupported. Physical installation
requires `AllowPhysicalDevice`. Offline/unauthorized serials fail before mutation.
The adapter rechecks discovery and serial ownership, verifies package identity,
minimum SDK and native ABI using `aapt2 dump badging`, refuses an already running
application, installs, resolves its launcher activity, and starts it with `am
start -W`. APK signing trust is enforced by Android's installer.

Tools are lazy prerequisites: `adb` on PATH (or child override `ADB`), `aapt2`
on PATH, override `AAPT2`, or installed build-tools under `ANDROID_HOME` /
`ANDROID_SDK_ROOT`. No SDK installation or downloads occur. Library calls keep
cwd, environment, logger and signal state unchanged. The caller owns artifact
bytes and must keep them stable during installation.

`RunRequest.AndroidReverse` contains device/host TCP port pairs. The adapter
rejects duplicate/invalid ports, refuses occupied device ports, and uses
`reverse --no-rebind`. Close removes only successfully acquired mappings still
pointing to their original host port. It never uses `--remove-all`, clears
logcat, or stops a caller's server. A stable cross-process lease serializes all
library sessions for one ADB serial, independent of project/build identity.
Non-cooperating external ADB clients can still change device state.

Sessions retain bounded PID-scoped logcat output in `Logs`, poll application
liveness, and own the launched app. Cancellation/Close stops logcat and its
owned descendants, force-stops the application and retires reverse mappings
before releasing the serial lease. Installation remains. Cleanup failure
returns `process.ErrCleanup` internally and retains ownership; it must not be
reported as successful retirement. Close is repeatable and its deadline only
bounds waiting. PID liveness proves process existence, not runtime health.

Component tests use synthetic tools and are not native evidence. The public
qualification harness `tools/qualification/android/device` consumes a real build
result JSON and an explicitly owned serial. It requires JavaScript calling the
contributed Java class and generated Runnable binding, checks forwarding while
running, then verifies app/forward retirement after cancellation. The fixture
contributes a concrete HealthActivity; the runtime template's default activity
name alone does not supply an Android Activity implementation. Original B2
output reached JS but then crashed with ClassNotFoundException for
com.tns.NativeScriptActivity. Full G3/G4/G5/G6 qualification remains separate
from a single debug artifact/session run; physical/signing and Windows execution
need their own gates.
