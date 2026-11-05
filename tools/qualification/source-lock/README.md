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
