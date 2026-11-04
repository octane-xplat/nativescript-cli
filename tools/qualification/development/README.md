# Native development qualification

The root dependency fixture supplies core9.1.3, NativeScript Vite8.0.21,
Vite8.3.0 and the native WebSocket dependency for host tests. Its Go test native
compiler/device adapters are fixtures; see docs/design/bundling.md for the host
test commands.

`app/` is a separate locked iOS9.1.0 / Android9.1.1 app. `stage-native.py` installs only from an
already populated Bun cache, refuses an existing destination and replaces its
health nonce. It never imports an upstream platform tree or NativeScript CLI.

On macOS with the platform tools, runtime dependencies and Goddard broker already
available, select an exact shutdown arm64 simulator and a new app directory:

```sh
python3 -B tools/qualification/development/stage-native.py "$PWD/.cache/native-dev-ios"
go build -o .cache/development-consumer ./tools/qualification/development/consumer
.cache/development-consumer "$PWD/.cache/native-dev-ios" EXACT_SHUTDOWN_UDID "$HOME/dev/reports/nativescript-cli/ios-development.json"
```

The public-library consumer acquires its own broker reservations from stage
events. Do not wrap it in a build or device reservation: it releases compilation
capacity before acquiring the simulator, and shuts down its owned boot before
the next compilation phase. It refuses an existing app installation, retains
ownership across reinstallation, follows the current data container after each
launch, and uninstalls its app before final shutdown/release. Signals cancel its
owned session and still run cleanup.

Assertions cover a fresh native build, advancing application heartbeat, a real
accepted JavaScript module edit with the same PID/boot identity, then a native
resource addition followed by a rebuilt app with a new PID and the packaged
resource revision. Repeated Close must retire the replacement app and dev server.
Evidence includes health, phase reservations, cleanup and embedding globals;
failure remains failure in the result JSON. Logs and result files belong outside
Git. No screenshot or visual assertion is involved.

For Android, supply an installed SDK, JDK21 and an unused even emulator port.
The API35 google_apis arm64 image must already be installed. Stage a separate
fresh app so the source edits from the iOS run do not become Android inputs:

```sh
python3 -B tools/qualification/development/stage-native.py "$PWD/.cache/native-dev-android"
JAVA_HOME=/absolute/jdk21 ANDROID_HOME=/absolute/android-sdk \
  .cache/development-consumer android "$PWD/.cache/native-dev-android" 5584 "$HOME/dev/reports/nativescript-cli/android-development.json"
```

The Android caller creates a unique task-owned headless AVD with a bounded 2 GiB
data partition, verifies its exact serial/AVD identity, and deletes it at cleanup.
It boots once for discovery, shuts down before compilation, and reboots under
separate device reservations for each launch. It checks the same nonce-specific
health and hot callback, reads a newly packaged Android string resource after a
native rebuild, and checks both automatic ADB reverse ownership and retirement.
Heartbeat files are read using the debug app's `run-as`; no guest root is used.
The fixture's Android cleartext permission is for Vite's ordinary debug
transport. It supplies no OTA HTTPS trust evidence.

Successful native runs qualify their stated debug simulator/emulator sequences
only. Other native contributions, framework-specific behavior, simultaneous
targets, release, physical devices and the complete G5 matrix need separate
qualification. The fixture does not run an OTA installer or change certificate
trust/signing inputs. Keep run results and failures with their exact source
revision, tool/runtime versions and native artifact identity outside Git.
