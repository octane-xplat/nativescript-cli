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

For numeric diagnostics only, the exact retained corrected debug probe can also
receive the new JavaScript tracer without another native compilation:

```sh
node tools/qualification/vite-config/restage-mason-geometry.cjs \
  /absolute/original-build.json /absolute/new-cache-directory \
  /absolute/new-diagnostic-receipt.json
```

This Darwin-only tool requires the known original bundle hash, unsigned debug
simulator artifact, verified executable/modules and absent output paths. It uses
`clonefile` without a deep-copy fallback and checks a bounded allocation budget
plus128MiB reserve. Only the trace module in `app/bundle.mjs` changes; native
files and the original app must remain byte-identical. Helper-local bindings
stay private and the old bundle source map is no longer advertised. The receipt
explicitly records `nativeBuildPerformed:false`, source/build hashes and both
full file inventories. It is an artifact descriptor for the retained runtime
runner, not a newly completed public Build result. Run it under a native-build
reservation, then use the receipt with the existing runtime runner under its
separate device reservation. The runner's system-volume boot guard still applies.

This path can measure UIKit behavior with new diagnostics on retained native
code. It cannot qualify changed native inputs, a fresh build, an unimplemented
repair or a gate. Original staged source inputs remain unchanged; the receipt
identifies the diagnostic helper source independently from the old build source.

An explicit `--frame-adoption-candidate` flag additionally replaces only the
known Mason foreign-child branch in the cloned vendor module. Its separately
hashed helper derives an untransformed logical rectangle from bounds and layer
position/anchor. Normal Core layout owns the cache, layout events and background;
the exact already-positioned frame bypasses the second native write. Other
requests delegate to Core, and the prior own/inherited method descriptor is
restored in `finally`. No safe-area property value or installed source changes.
The receipt labels this a diagnostic candidate, with two changed JS files and
unchanged native code. It is not a shipped dependency repair. Both old bundle
and vendor source-map references are removed for these diagnostic bytes.

The captured-method replay also checks the candidate's cache/events, repeated
layout, exception restoration, transformed bounding-box fixture and subsequent
ordinary Core safe-area behavior. Its explicit TypeScript argument can point
to either a consumer with TypeScript5.9.3 or that exact package directory.
UIKit/measurement are fixtures in this replay; native geometry, lifecycle and
transform controls remain independent requirements.

`--frame-adoption-controls` implies the candidate and adds actual UIKit controls
after the four normal Mason lifecycle snapshots. It checks unchanged/repeated
layout, scale1.25x0.75 plus23-degree rotation, bounds origin3,7 and anchor0.25,0.75,
native geometry preservation, logical cache and layoutChanged counts. It restores
Mason geometry, then replaces only the owned probe Page's content with a plain
Core Label and checks natural positive safe-area clipping outside Mason. The
result is retained in the health trace; a failed control sets the health failure
field so the unchanged runtime consumer rejects it. This is an explicit
qualification profile, not the normal application flow.

Independently inspect the completed controls and cleanup:

```sh
node tools/qualification/vite-config/inspect-mason-adoption-controls.cjs \
  /absolute/diagnostic-receipt.json /absolute/runtime.json \
  /absolute/ownership.json /absolute/new-report.json
```

This verifier checks current candidate/control source hashes, original and
diagnostic file hashes, actual before/after/repeated geometry and events,
trigonometric transform components, logical cache, positive non-Mason insets,
four lifecycle snapshots and owned cleanup/PID absence. Assertions are specific
to the exact retained iPhone probe, including density3. Production source
integration, other native views and the full original application remain separate.

Prepare a reviewable maintained-source repair from the package-specific tag
`core-v1.0.0-beta.5`, not a generic cache directory labeled beta.5. Supply a
receipt whose source file SHA-256 and Git blob identities were checked against
the upstream tagged tree:

```sh
python3 tools/qualification/vite-config/prepare-mason-source-repair.py \
  /absolute/verified-source-inputs.json /absolute/project/.cache/new-copy \
  /absolute/new-review.patch
node tools/qualification/vite-config/verify-mason-source-repair.cjs \
  /absolute/project/.cache/new-copy /absolute/typescript-5.9.3-package \
  /absolute/retained-native-build.json /absolute/new-verification.json
```

The preparer checks the five reviewed source/packaging identities, produces a
two-file patch and verifies application only to new project-cache copies. It
never edits the source checkout. The patch selects the candidate only for iOS;
the original Apple non-iOS branch and non-Apple early return remain. The verifier
checks helper identity, executes the actual upstream helper-source projection,
compares the tagged/native method after explicit alias/define normalization and
exercises platform dispatch with fixtures. This is source/producer correspondence,
not a full package build or authorization to change another repository.

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
