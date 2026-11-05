# Mason frame-path diagnostics

Replay the methods from a retained native probe's byte-verified vendor bundle:

```sh
node tools/qualification/vite-config/mason-frame-replay.cjs \
  /absolute/build.json /absolute/runtime.json \
  /absolute/installed-typescript-consumer /absolute/new-report.json
```

The build and runtime reports must describe the same preserved app. The tool
checks its executable and bundled module hashes, then uses TypeScript5.9.3's
parser from the explicit consumer to extract the Core/Mason methods. It does not
execute the full vendor bundle or import native SDK modules in Node.

UIKit frames, measurement and safe-area inputs are fixtures. The old trace gives
the measured density and before/after frames, but not cached frames or insets.
The replay therefore tests a sufficient mechanism with explicit assumptions:
native layout changes a child's frame while Core retains its earlier cached
frame, and the later Core frame write applies a positive safe-area top inset.
Zero-inset and refreshed-cache controls isolate that path. Skipping the frame
write preserves the native frame but leaves the old cache, so it is not an
accepted fix. `nativeCauseProven` remains false; no native gate follows from this
host model or its matching frame.

New staged probes include `runtime/layout-trace.ts`. It records numeric native,
cached and requested frames around frame setters and Core layout, with bounded
storage. Safe-area values are captured from natural `getSafeAreaInsets` returns;
diagnostics never add an inset query that might change lazy UIKit state. Original
arguments, return values and exceptions are preserved. Check this instrumentation:

```sh
node --test tools/qualification/vite-config/runtime/layout-trace.test.cjs
```

The new fields require a newly staged/built probe. Existing binaries do not gain
the instrumentation. Source provenance, actual patch application, native build,
guest reservations and cleanup still need their own checks. The staging copy
checks and runtime byte receipts do not certify an upstream Git tree or promote
legacy raw-engine evidence to patched-engine evidence. No dependency source or
production behavior is patched by these tools.

For the retained failing numeric probe, verify the actual cache/frame/inset
path directly without a mocked UIKit replay:

```sh
node tools/qualification/vite-config/inspect-mason-native-frame.cjs \
  /absolute/build.json /absolute/runtime.json /absolute/new-report.json
```

This checks exact native executable/module hashes, startup health and the
captured nested frame-write calls. Its assertions describe the known density3,
126-pixel-top-inset failure. A repaired layout will not match those failure
assertions. Observing the corruption path does not qualify a repair, full
lifecycle, transform behavior or ABI.

New geometry traces also snapshot native bounds, layer position/anchor,
CATransform3D numeric fields and Core layout/transformation flags around the same
calls. They do not derive a cache value from the visual bounding box. Core stores
the requested frame before resetting/restoring a transformed layer, so a generic
native-frame-to-cache copy is not a qualified adoption rule. The geometry fields
require a newly staged native probe; older retained traces do not contain them.

To stage a fresh numeric trace while preserving an old fixture:

```sh
python3 tools/qualification/vite-config/stage-mason-trace.py \
  /absolute/preserved-workspace /absolute/new-cache-workspace
```

On Darwin this clones regular source inputs with `clonefile`, records their
hashes, and references the old installed dependencies. It never falls back to
deep copying. Those dependency references are inputs: do not install packages
or patch them through the new workspace. The overlay records its changed probe
files separately from preserved inputs. Historical projection markers and patch
receipts retain their original limits; they do not certify an upstream tree or
prove every package was patched.

Build the new app under a native-build reservation with the public build
consumer. A retained app can then be tested without creating another simulator:

The build consumer accepts an optional fresh output directory after its profile:
`consumer APP NEW_EVIDENCE_PREFIX debug pinned NEW_OUTPUT_DIR`. It must be
absolute and absent before the call. Use this when rebuilding an existing probe
so the old app/state product and its recorded bytes remain preserved. Without
that argument, the consumer retains its original app/state behavior.

```sh
python3 tools/qualification/vite-config/qualify-retained-runtime.py \
  /absolute/app /absolute/build.json /absolute/runtime-consumer \
  EXACT_EXISTING_GUEST /absolute/unused-evidence-prefix
```

The runner verifies executable/bundle hashes and reserves that exact guest. It
requires the guest to be shutdown and the probe application to be absent, then
boots it and invokes the public runtime consumer. It uninstalls only its owned
application, retires its boot and reservation, and never deletes the guest.
It requires at least1.5GiB free on the system temporary-files volume before boot.
An optional `--prior-owned-run /absolute/ownership.json` permits reuse only when
an earlier receipt identifies the same task-owned installation and its installed
executable and bundle bytes still match. A stale registration with a missing
bundle fails this check; it does not authorize deleting caller device state.
Runtime success and cleanup are reported separately. Keep the supervisor log
outside the evidence prefix's `prefix.*` namespace so the unused-prefix check
can succeed. The runtime consumer retains bounded application logs on failure.
