# Apple device sessions

D1 consumes B1 application artifacts; it never prepares or compiles. On macOS,
`Client.Devices` uses simctl JSON for available iOS simulators and devicectl JSON
for physical-device inventory. Selection uses exact IDs, never names, `booted`, or
first-match defaults. Other hosts return an explicit unsupported-host error.
Discovery is lazy and does not extract the JavaScript helper or boot devices.

`RunRequest.Artifact` optionally supplies an existing `app` product and bypasses
building. The build request still identifies the project and exact selected
target. Without an artifact, the existing public build workflow produces it.
Generic simulator build artifacts may be consumed by an exact compatible device;
archives, IPAs, other destinations and architectures are rejected. Before install,
the adapter rechecks Info.plist identity/platform and executable Mach-O through
B1's validator. Compatibility does not prove signing or runtime health.

Simulator sessions hold a cross-process per-device lease until console retirement
and owned boot cleanup. Contending operations wait subject to their context.
`AllowBoot` explicitly permits booting the selected shutdown simulator; otherwise
it must already be booted. Bootstatus completes before installation. A session
refuses to replace or attach to an app already listed by launchctl. Installation
is retained. Simulator cancellation terminates the owned application; physical console cancellation
forwards signals to the app; the session shuts
down a simulator only when it booted it. It never deletes devices, resets device
data, stops caller servers, or boots another destination. Cooperative device
ownership cannot prevent unrelated tools from changing that device externally.

`Run` consumes the completed simctl launch PID response. Simulator stdout/stderr
use dedicated temporary files; sessions tail and remove those owned files. A file
exceeding 64 MiB fails the session; in-memory snapshots retain only 1 MiB. `Session.Wait` reports
owned app exit or physical console completion after cleanup; `Close` is idempotent and its context bounds
waiting while cleanup continues. `Session.Logs` returns a snapshot of the latest
1 MiB of stdout/stderr. Logs are never printed by default; simulator log files live only for the session. No application callback runs under device ownership. A launch PID or
console connection alone is not an application-health guarantee.

Physical installation, launch and logs require `AllowPhysicalDevice`, an exact
connected trusted device and a compatible signed app. Without permission or a
connected device, the operation returns unavailable. The adapter checks running
processes before installation, starts devicectl's console, confirms the app's
executable appears, and verifies retirement before releasing its lease. Unknown
process-result schemas fail closed. Commands and cancellation are fixture tested;
actual physical console retirement, trust/developer-mode permissions and signing
remain unqualified. No physical device was contacted for session operations.

## Qualification

Recorded JSON and process fixtures cover filtering, exact/missing/ambiguous
selection, malformed records, incompatible artifacts, boot/install failures,
contention, cancellation, logs and owned shutdown. They are component evidence.
`TestOwnedAppleSimulatorSession` requires D1_SIMULATOR_ID and D1_APP_PATH under an
exact owned-device reservation. The app must be a real fresh B1 build containing
its startup marker and UIKit application event loop. The test consumes the saved
B1 artifact identity and observes JavaScript startup, sustained console lifetime,
the exact app PID remaining alive, and owned shutdown after repeated Close. Build and device reservations
are separate. Physical runtime, x86_64 execution, HMR and G2–G6 remain separate
gates.

Real runtime integration found that the engine's emitted app needs a package.json
pointing to bundle.mjs. The Vite producer emits that asset with its output manifest. This selects the emitted entry; it does not qualify
NativeScript framework imports, runtime transforms or HMR.
