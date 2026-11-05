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
