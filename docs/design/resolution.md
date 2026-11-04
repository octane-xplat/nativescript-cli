# Installed project resolution

`Client.Resolve` uses the embedded J1 helper directly. It reads an explicit app
path and executes its config in a fresh owned Node process, using the client's
environment overrides. Completion includes helper tree retirement. It returns
normalized config, installed packages, dependency edges, native contribution
paths and SHA-256 source identities. Revision hashes cover the normalized result,
read manifests/configs and native contents. This is a resolution identity, not a
Git revision or a JavaScript application bundle digest.

The resolver does not install dependencies or write the app. Executable config
is trusted project code, not sandboxed code; its own imports and side effects
remain the project's responsibility. The helper cache lives under the OS user
cache directory. Config exceptions and arbitrary dependency diagnostics are
redacted; resolver-authored remediation appears in `OperationError.Advice`.

## Supported inputs

Exactly one `nativescript.config.{ts,js,cjs,mjs,json}` selects app config. JavaScript
follows Node's normal module rules. Objects, default exports and async functions
are accepted; functions receive a copy of the helper environment. TypeScript
requires Node's built-in type stripping and supports erasable types. Older Node
returns an actionable unavailable error. Config runtime imports must already be
installed. No TypeScript compiler or upstream CLI is invoked.

The supported config fields are `id`, `appPath`, `appResourcesPath`, empty `ios`,
and `android.v8Flags`/`android.markingMode`. The application identifier must be a
dotted identifier. Paths become canonical absolute existing directories, defaulting
to `app` and `App_Resources`. Other settings fail explicitly rather than disappearing.

Installed dependencies, optional dependencies and peers are traversed from each
package's own Node lookup locations. Missing required packages fail; absent optional
packages/optional peers are skipped. Development dependencies are not app native
contributors. Workspace dependencies must already have links installed. No workspace
or lockfile spec is interpreted as an instruction to install. Global NODE_PATH is
excluded. Package exports need not expose package.json. Real package directories
break graph cycles and deduplicate links; distinct installations remain distinct,
even when names or versions match. Edges retain lookup and canonical paths.

Packages marked with `package.json.nativescript` contribute native inputs.
Supported metadata is `platforms.ios`/`platforms.android` version requirements.
These and package versions are retained without claiming toolchain compatibility.
A native package may have its own executable config with platform settings;
app-only fields in package config fail. Package Android settings remain on the
installed package result. Native files under `platforms/ios` and
`platforms/android`, plus app resources under `iOS` and `Android`, become typed contributions owned by the canonical package.

Supported categories include iOS source, frameworks, Podfile/podspec, Package.swift,
configuration and resources; Android source, AAR/JAR, Gradle/manifest and resources.
Unrecognized files, unsupported metadata/settings, legacy hooks and symlinks within
native trees fail with remediation. Linked package roots are supported. Resolution
describes Pods/SPM/native files without executing or validating their native tools.
Platform preparation owns the next stage and may reject inputs it cannot consume.

## Evidence boundary

Public Resolve tests execute the real extracted helper against local installed
package fixtures, including nested versions, scoped links, executable plugin
config, environment config, TypeScript, peer/optional lookup, source changes,
plugin removal, failure redaction and cancellation. Native library files in tests
are component fixtures. These tests do not qualify native preparation, compilation,
Pods/SPM execution, device behavior, or external build extensions.

## Pinned core compatibility migration

The published `@nativescript/core` 9.1.3 package has one explicitly migrated hook:
`nativescript-core` / `before-checkForChanges` / injected
`cli-hooks/before-checkForChanges.mjs`. The exact descriptor and reviewed script
SHA-256 must match. The hook is read/fingerprinted but never executed: it only
checks upstream CLI/Angular-webpack versions, while this backend owns its exact
runtime matrix and Vite contract. Other core versions, altered scripts/descriptors
and arbitrary package hooks remain unavailable. This is not legacy-hook execution
support or Angular/webpack interoperability.

For this pinned core package, native API-use inventories and iOS declaration
files are hashed inputs rather than runtime resources. Metadata generation remains
complete; inventory-driven pruning is not implemented. The core module map is a
configuration input passed to Clang and Swift by iOS preparation. Native source,
framework and Android AAR/resource ownership otherwise uses the normal contracts.
Resolution and bundle evidence do not by themselves qualify native compilation or
the public SDK installer on devices.
