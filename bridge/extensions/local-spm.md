# Selected local Swift package descriptor

`local-spm.cjs` is a component for canonical fingerprint extra-source contents.
It is not connected to OTA preparation; the declared-local-SPM OTA guard remains
required until snapshot, publication and compiled-stamp integration are qualified.

`collect({projectDir, packages, sourceFiles, manifests})` is synchronous and
read-only. It does not invoke Swift, resolve dependencies or create snapshots.

- `projectDir` is an absolute selected application directory.
- `packages` contains the already selected R1 contributions, each normalized to
  `{name, path, manifest, products}`. `path` is relative to the application;
  `manifest` is the real absolute `Package.swift` path. Selection precedence
  belongs to R1 and must not be repeated here.
- `sourceFiles` maps real absolute paths to the leased R1 SHA-256 identities.
- `manifests` maps each real manifest path to
  `{sourceSHA256, manifest}`, where `manifest` is its evaluated Swift
  `dump-package` JSON. The supplying preparation operation owns evaluation and
  must bind it to the same source lease, toolchain and execution context.

The result is `{id, contents, sha256, inputs}`. `contents` is stable JSON with
format `xplat-ns/local-spm/v1`, selected package names, sorted products, evaluated
manifest hashes and sorted package-relative file hashes. Package-local absolute
metadata paths become typed `{packageRelativePath: "..."}` values before hashing;
machine roots are excluded. `inputs` retains absolute paths for internal freshness
checks and must not be serialized into the canonical contents. The canonical
fingerprint API, rather than this component, computes the final fingerprint from
this data-only extra source and the other native inputs.

The collector inventories every selected root, checks exact file membership and
hashes against the lease, and excludes `.build` and `.swiftpm` directories as R1
does. Duplicate roots, names or product ownership are rejected. Added, removed or
changed files and stale manifest evaluation fail with `invalid_input`.

The supported component scope is intentionally restricted to dependency-free
packages with regular/test targets and selected library products. Internal
symlinks, transitive dependencies, other target types, unsafe flags and evaluated
external/parent-traversing paths fail with `unavailable`. These cases need complete
input and pin ownership before support can expand. A descriptor match alone does
not prove source snapshot consistency, native compilation, ABI compatibility,
compiled fingerprint stamping, OTA publication or installer behavior.

Run the component checks with `node --test bridge/extensions/local-spm.test.cjs`.
