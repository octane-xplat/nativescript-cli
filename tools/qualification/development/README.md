# Native development qualification

`development-consumer reject-ios APP 91D40099-A056-497D-A572-ADDDFD6A8F23 EVIDENCE_JSON` qualifies
the native-completed observer-rejection boundary. It performs a real debug build,
hands the reservation to an owned simulator boot, then rejects before app install
or launch. It requires ErrSink plus the observer cause, no ErrCleanup, a retired
server port and no app installation; the harness retires its boot and grants.
Reuse only existing iPhone18Pro simulator `91D40099-A056-497D-A572-ADDDFD6A8F23`. Never create, clone, erase or delete a simulator.
This is native build/failure cleanup evidence, not application startup evidence.

The root dependency fixture supplies core9.1.3, NativeScript Vite8.0.21,
Vite8.3.0 and the native WebSocket dependency for host tests. Its Go test native
compiler/device adapters are fixtures; see docs/design/bundling.md for the host
test commands.

`app/` is a separate locked iOS9.1.0 / Android9.1.1 app. `stage-native.py` installs only from an
already populated Bun cache, refuses an existing destination and replaces its
health nonce. It never imports an upstream platform tree or NativeScript CLI.

On macOS with the platform tools, runtime dependencies and Goddard broker already
available, require that exact simulator to be shutdown and use a new app directory:

```sh
python3 -B tools/qualification/development/stage-native.py "$PWD/.cache/native-dev-ios"
go build -o .cache/development-consumer ./tools/qualification/development/consumer
.cache/development-consumer "$PWD/.cache/native-dev-ios" 91D40099-A056-497D-A572-ADDDFD6A8F23 "$HOME/dev/reports/nativescript-cli/ios-development.json"
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

The module callback waits 1.5 seconds. The caller saves again while that callback
is unresolved, requires both values in order with no overlap or duplicates, then
rejects one callback and requires recovery on the next edit. Quiet heartbeat
intervals check that counts settle at three successes and one rejection. The
native resource rebuild must retain the final recovered source value. Failure
must appear in public session logs. iOS includes a PID-scoped unified log reader;
the caller checks its retirement before releasing the simulator boot. This
attachment begins after launch acknowledgement, so earlier unified startup logs
are not replayed. Standard stdout/stderr capture remains separate.

For Android, supply an installed SDK, JDK21 and an unused even emulator port.
Existing AVD `elegant-fir-probe` must be registered in `~/.android/avd`, with its Pixel6/API35/google_apis/arm64 image already installed. No registration, creation, clone, image download or replacement is allowed. If it is missing or incompatible, stop that native case. Stage a separate
fresh app so the source edits from the iOS run do not become Android inputs:

```sh
python3 -B tools/qualification/development/stage-native.py "$PWD/.cache/native-dev-android"
JAVA_HOME=/absolute/jdk21 ANDROID_HOME=/absolute/android-sdk \
  .cache/development-consumer android "$PWD/.cache/native-dev-android" 5584 "$HOME/dev/reports/nativescript-cli/android-development.json"
```

The Android caller reuses only `elegant-fir-probe` and preserves its registry, config and persistent device. Before each owned boot it checks ADB and emulator processes, rejecting an already running or starting emulator instead of launching another. It verifies the exact serial/AVD identity. An unavailable/busy device requires coordination or waiting, never substitution. The caller does not resize the data partition or delete the AVD.
It boots once for discovery, shuts down before compilation, and reboots under
separate device reservations for each launch. It checks the same nonce-specific
health and hot callback, reads a newly packaged Android string resource after a
native rebuild, and checks both automatic ADB reverse ownership and retirement.
Heartbeat files are read using the debug app's `run-as`; no guest root is used. An existing fixture application is rejected before ownership is claimed. On failure as well as success, only an installation proven absent before the run may be uninstalled; its absence is verified before ownership retires. Boots and broker grants retire separately. The child emulator receives the prescribed AVD home without changing the embedding process environment.
The fixture's Android cleartext permission is for Vite's ordinary debug
transport. It supplies no OTA HTTPS trust evidence.

Successful native runs qualify their stated debug simulator/emulator sequences
only. Other native contributions, framework-specific behavior, simultaneous
targets, release, physical devices and the complete G5 matrix need separate
qualification. The fixture does not run an OTA installer or change certificate
trust/signing inputs. Keep run results and failures with their exact source
revision, tool/runtime versions and native artifact identity outside Git.
