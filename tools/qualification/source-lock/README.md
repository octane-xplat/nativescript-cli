# Original source lock audit

`audit.cjs` compares an exported public `nativescript.Project` to an original
Bun JSONC lock and its workspace manifests. It follows each parent's nearest
nested lock locator, preserving scoped names and npm alias lookup names. It
compares only matching parents: a version mismatch leaves descendants
unverified rather than comparing two different versions' dependency metadata.

Use an explicitly supplied installed TypeScript compiler for its public JSONC
parser. This tool does not install dependencies or execute original sources.
All inputs are read-only. The output must be new and is created with mode 0600.

```sh
node --test tools/qualification/source-lock/audit.test.cjs
node tools/qualification/source-lock/audit.cjs \
  ORIGINAL_SOURCE INSTALLED_TYPESCRIPT_DIR PUBLIC_PROJECT_JSON NEW_OUTPUT_JSON
node tools/qualification/source-lock/qualify-layout.cjs \
  NEW_CACHE_DIR INSTALLED_TYPESCRIPT_DIR
node tools/qualification/source-lock/qualify-peers.cjs \
  ORIGINAL_SOURCE INSTALLED_TYPESCRIPT_DIR PUBLIC_PROJECT_JSON NEW_OUTPUT_JSON
node tools/qualification/source-lock/stage-frozen.cjs \
  ORIGINAL_SOURCE INSTALLED_TYPESCRIPT_DIR NEW_PROJECT_CACHE_DIR
node tools/qualification/source-lock/compiler-inputs.cjs \
  ORIGINAL_SOURCE INSTALLED_TYPESCRIPT_DIR STAGED_WORKSPACE NEW_OUTPUT_JSON \
  --isolated-view
```

The layout qualification installs a small private workspace using
`bun install --offline --ignore-scripts`. It checks actual Node lookups for a
scoped nested GestureHandler 2.0.45, the root 2.1.0 and an npm alias. An offline
cache miss fails; it does not fetch a replacement or silently change versions.
Keep generated fixtures and results outside Git.

The audit includes production, optional and peer edges, plus the app's native
runtime dev dependencies, matching the public resolver's scope. Compiler-only
root dev dependencies need a separate audit. Absent optional edges are reported
without failure. Missing required edges, identity drift, unexpected non-root
edges and unsupported targets/parents return exit status 1. Invalid inputs and
existing output paths fail without replacing an existing report.

Root staging injections, unreached actual packages and workspace-manifest byte
comparisons are reported separately. An exit status of 0 establishes only the
traversed identity/edge comparison; it is not acceptance of those other inputs.
This tool does not verify tarball integrity, patch identity, frozen-lock
installation, native compilation or device behavior. It never changes a native
acceptance gate.

Bun can bind peer dependencies from a caller's provisioning context rather than
lexical lock ancestry. The audit derives direct consumer dependency, self and
declared consumer-peer bindings from expected lock/workspace declarations.
Workspace peers retain their own explicit dev bindings. An npm alias provides
its lookup name, not its manifest name. Package-owned dependencies win over
consumer peer bindings. Distinct contexts remain separate comparisons even when
they reach the same physical package; cycles are deduplicated by context.

`qualify-peers.cjs` independently checks live Node lookups in the existing frozen
fixture for the original TSRX/Acorn sibling provider and Browserslist self
provider. It compares those live identities/edges with the public snapshot and
the explicit original lock records. It installs nothing and runs no package
code except the explicitly selected JSONC parser. This is qualification of those
two installed cases, not a new frozen install or a universal Bun layout proof.

The audit does not solve arbitrary ancestor provisioning or validate peer semver
compatibility. Unsupported peer contexts remain failed comparisons; independently
check actual installation before calling them confirmed dependency drift. Do not
change versions or waive a comparison solely to make the audit pass.

`stage-frozen.cjs` stages the pinned b585679 source snapshot in a new child of
this repository's `.cache`. It requires the exact original lock SHA, complete parent Git tree identity
(including executable modes, symlink targets and pinned gitlinks), and existing
Bun cache inputs. A cache directory named after a commit is not proof of its
contents. Gitlink directories must be absent or empty before staging; materialize
their independently verified source trees separately. A failed parent check
creates no destination and runs no installer. It copies the source tree, including original relative link
text, and selects the production/peer workspace closure plus the app's explicit
compiler and native-runtime prerequisites. It retains the full original
workspace metadata because pruning it can invalidate Bun's lock parser.

The two source transformations are explicit: remove the upstream `nativescript`
CLI dev dependency from the private app manifest and projected lock; correct the
lock's stale root display name to the unchanged root manifest's name. The stager
retains original package records, overrides, catalogs and patch declarations.
The install uses isolated linking, the projected frozen lock, offline cache,
disabled lifecycle scripts and disabled env-file loading. Darwin uses APFS
clonefile; other hosts have only a copyfile implementation, without host-runtime
qualification. Staging requires at least 3 GiB free before creating a destination or running
Bun; the pinned filtered install occupies about 2 GiB before temporary overhead.
This preflight is a lower bound, not a disk reservation. Complete offline cache
inputs remain required.

Host-only installation and JavaScript bundle qualification can use a caller-owned
private cache on another volume by appending `--host-cache-root PRIVATE_ROOT`.
The destination must be a new child of that explicit root, owned by the caller
and inaccessible to other users. Receipts label this fixture `hostOnly: true`;
all original-tree, lock, source, ownership and free-space checks still apply.
The default remains the repository project cache. Do not use the alternate host
fixture for native builds/devices: native work still requires the project cache
and shared broker reservations.

One recorded app-path symlink supplies audio-context's unchanged app-relative
local Swift package declaration from the existing sounds dependency lookup.
It does not add a dependency or select a different version. The proof checks
all copied source-file bytes and internal link text, unchanged original inputs,
absence of the upstream CLI and the projected lock's stability. It retains
install logs/results on failure, refuses existing destinations and never cleans
up a prior fixture. It does not compile source CLI/Bamboo entries or perform
the full edge/compiler/artifact-integrity/patch/bundle/native qualifications;
run those separately against the staged inputs. No publishing or cutover occurs.

`compiler-inputs.cjs` adds the stager's fourteen explicit compiler/runtime dev
roots to a private installed-package graph. It reads package JSON and Node
lookup locations without loading package entries or hooks. It verifies original
workspace-manifest hashes and the staged lock against the stager proof, then
compares the graph with original lock identities. This graph is a qualification
dataset; it is not a public-library Resolve result or compiler API execution.

An ancestor checkout's packages can satisfy otherwise absent optional peers.
Every lookup outside the selected fixture is recorded and fails qualification,
including optional lookups. `--isolated-view` copies the installed fixture into
an owned temporary host-only directory outside the checkout, preserves relative
links, and inspects that actual layout. It performs no install or native work.
The temporary copy is retired before writing its result; its graph paths are
historical evidence rather than live package paths. The original cached fixture
is read-only. Without the flag, ambient dependencies remain visible and cause a
failed result; they are never silently accepted or replaced.

Verify artifact bytes after the isolated compiler identity audit:

```sh
python3 -B -m unittest discover -s tools/qualification/source-lock \
  -p test_verify_artifacts.py
python3 tools/qualification/source-lock/verify-artifacts.py \
  ORIGINAL_SOURCE INSTALLED_TYPESCRIPT_DIR COMPILER_REPORT_JSON \
  PROJECT_ARTIFACT_CACHE NEW_OUTPUT_JSON --allow-fetch
```

The verifier binds the original lock, frozen stage receipt and qualified compiler
report, verifies package manifest freshness, and groups registry identities by
their original SHA512 integrity. It first reads verified project/npm cached
tarballs. Explicit `--allow-fetch` enables bounded HTTPS GETs only from the public
npm registry; it never installs packages or runs hooks. Cache ownership, byte
budgets, TLS verification and same-registry HTTPS redirects remain enforced.
Without the flag, missing tarballs fail. Existing cached corruption fails and
is never overwritten. No upload or hosting authority is involved.

Each payload is unpacked into a disposable directory with path/link checks and
byte limits. Uniform named roots used by `@types` archives are recorded.
Repeated normalized regular-file entries are accepted only when their contents
are identical, and are recorded; conflicting duplicates fail. Original patches
are replayed there with Git's context checks. The Vite8.0.20 diff needs one
precise EOF annotation repair: express a context closing brace as equal
delete/add lines so old/new EOF annotations apply to their respective sides.
No code or unrelated line break changes. The shared repair also supports the
legacy8.0.21 diff, whose old-side EOF annotation is missing; the old source footer
determines that annotation instead of trusting its absence in the diff. The
legacy command is independently qualified through `vite-config/qualify-patches.py`.
The raw/applied patch hashes and
diagnostics are retained. Broad `--inaccurate-eof` handling is not used here.

Every installed payload file/link is compared with that expected tree. Empty
root `.bun-tag-<hex>` patch sentinels are recorded separately; nonempty,
symlink, nested or payload-declared lookalikes are not suppressed. Installer
`node_modules` is excluded only when the tarball has no bundled module payload.
Package modes, compiler APIs, bundling and native behavior are separate gates.
Installed packages, original source and shared caches remain read-only.

`--patches-only` selects only patched artifacts. `--retry-failed PRIOR_REPORT`
selects exactly its failed identities after requiring identical compiler/lock
inputs; the result explicitly labels its subset and binds the prior report hash.
It never converts a subset pass into a full-scope claim. An empty selection or
existing output fails. Keep full and retry receipts when composing evidence.

Materialize the parent-pinned Lottie and SVG sources only after a successful
verified-parent stage:

```sh
python3 tools/qualification/source-lock/materialize-submodules.py \
  VERIFIED_STAGED_WORKSPACE EXACT_LOTTIE_SOURCE EXACT_SVG_SOURCE NEW_REPORT_JSON
```

The tool checks each complete vendor Git tree against the parent-pinned commit's
recorded tree identity, including file modes and links. Sources are explicit
inputs; it never fetches a branch or trusts a cache directory's label. Both
owned destination directories must be empty before either copy begins. Nested
Lottie demo/tool gitlinks must remain absent or empty; their commit identities
are included in the tree calculation and reported without fetching them. The
inactive parent macOS libwebp gitlink is not materialized. This checks vendor
source provenance only; it does not establish compiler, bundle or native
compatibility. Source archives and reports remain outside Git.

Run the production host resolver/bundler against an explicitly prepared source
fixture after generating its required local package exports:

```sh
go run ./tools/qualification/source-lock/bundle \
  ABSOLUTE_APP_DIR ABSOLUTE_REPOSITORY_DIR ABSOLUTE_NEW_CACHE ABSOLUTE_NEW_REPORT
```

This harness uses the actual embedded helper and selected project's installed
Vite configuration. It supplies a labeled prepared-project fixture; it does not
run native preparation, compilers or devices and is not a public Build check.
The source fixture's provenance and installed payloads require their separate
receipts. A successful bundle records emitted file hashes and preserved embedding
globals. Failures retain typed error text and a private request for diagnostics,
without logging environment values or emitted application code. Reports and
cache destinations must be new; existing fixtures are never removed.
