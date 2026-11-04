# Native development qualification

The root dependency fixture supplies core9.1.3, NativeScript Vite8.0.21,
Vite8.3.0 and the native WebSocket dependency for host tests. Its Go test native
compiler/device adapters are fixtures; see docs/design/bundling.md for the host
test commands.

`app/` is a separate locked iOS9.1.0 app. `stage-native.py` installs only from an
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

This fixture is iOS debug simulator evidence only. Android development, other
native contributions, framework-specific behavior, simultaneous targets, release,
physical devices and the complete G5 matrix need separate qualification. It does
not run an OTA installer or change certificate trust/signing inputs.
