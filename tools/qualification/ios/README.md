# Fresh iOS public-library qualification

This opt-in gate builds a new isolated app through the public Go library, then
installs and launches its returned artifact on an exact task-owned simulator.
It uses the published iOS runtime template, not an upstream-generated native tree.
The fixture installs only runtime 8.9.0, Vite 7.3.1 and its local native contributor.
No upstream CLI is installed or invoked.

On an Apple Silicon Mac with Xcode, Node 22.12+, npm and Go 1.26+, stage the
intended source files first (the local module-proxy archive uses `git ls-files`).
Create or obtain an explicitly task-owned **shutdown** arm64 iOS simulator and run:

```sh
python3 tools/qualification/ios/qualify.py --simulator-id EXACT_OWNED_UDID
```

Use `--build-only` for component evidence when simulator ownership is unavailable;
it does not qualify G2. The harness reserves build and device phases separately. If an enclosing task
reservation is supplied, it must include both a native build slot and that exact
simulator plus resident capacity. Nested reservations cannot expand the parent's
resource set; ask the assigning supervisor to correct the allocation.

The Go consumer is built in a separate module from a local distribution zip with
an isolated module cache. The running consumer uses a restricted tool PATH and
imports only the public root package. Build starts with no generated state and
composes R1/V1/P1/B1 through W1. Run consumes its exact saved artifact through D1.
Node helper payloads come from the distributed module, without npm generation.

A fresh nonce in bundled JavaScript passes through generated Objective-C metadata
into a UIKit scene. The external caller reads the app's data container and requires
the matching nonce, eight advancing timer ticks, a live app PID and JS/scene logs.
It then cancels the operation context, waits for cleanup, calls Close twice, and
requires both PID retirement and owned simulator shutdown. It checks that process
cwd/environment stay unchanged. Session cleanup retains the installation; temporary
app/build/module directories are removed when the harness exits.

This gate covers a minimal native application, not NativeScript framework imports,
HMR, rendered UI, x86_64 execution, physical devices/signing, archive/IPA or
production/offline release startup. Do not infer those gates from this result.
