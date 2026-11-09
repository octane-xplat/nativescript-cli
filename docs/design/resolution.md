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

One `nativescript.config.{ts,js,cjs,mjs,json}` selects app or plugin config. The
published TS/JS producer pair is also accepted: TypeScript takes precedence,
matching NativeScript9.1.1. Both file identities are retained, but only TS is
evaluated; a TS failure never falls back to JS. Removing TS selects the remaining
JS config. Other multiple-config combinations reject explicitly. JavaScript
follows Node's normal module rules. Objects, default exports and async functions
are accepted; functions receive a copy of the helper environment. TypeScript uses
an already installed `typescript-classic` or `typescript` compiler when available
from the config package or app. CommonJS transpilation preserves relative runtime
imports and removes imports used only as types, including the original app's
regular `NativeScriptConfig` import. Without an installed compiler, Node's built-in
type stripping still supports erasable types and explicit `import type`; older
Node returns an actionable unavailable error. Node versions that refuse ESM type
stripping inside `node_modules`
return an explicit unavailable error requesting the project-installed compiler.
Config runtime imports must already
be installed. No compiler is installed, no global compiler is selected, and no
upstream CLI is invoked.

The supported config fields are `id`, `appPath`, `appResourcesPath`, `buildPath`,
app/plugin `ios.NativeSource`, app/plugin `ios.SPMPackages`, app `cli.packageManager`,
`bundler`/`bundlerConfigPath`, declaration-only `visionos`/`tvos`, and
`android.v8Flags`/`android.markingMode`. The application identifier must be a
dotted identifier. Paths become canonical absolute existing directories, defaulting
to `app` and `App_Resources`. Other settings fail explicitly rather than disappearing.

App and plugin `ios.SPMPackages` also accept `{name,path,libs}` local declarations.
Paths resolve from the application root first, including plugin declarations,
matching the producer contract. When a declared `node_modules/<package>/…` tail
is absent at the application root — the isolated-install layout where transitive
packages are not linked there — the packaged path re-resolves through Node
lookup from the application root, then from the declaring package's own install
location, and rejoins the remaining suffix. Validation still precedes same-name
dedup: a losing declaration whose path is absent from every lookup rejects
rather than disappearing. A local declaration cannot also specify a remote URL or
version. Its ordinary `Package.swift` and package tree are hashed, excluding
SwiftPM caches; internal symlinks reject. Linked package roots remain supported.
The returned `spm` contribution identifies the canonical manifest and retains
the declared path/products in `SPM`. App declarations take precedence by name;
otherwise the first plugin declaration encountered by the deterministic
dependency traversal wins. Losing trees retain source identities, but do not
add package references or direct application source membership. Declarations
for one physical manifest merge requested products; conflicting products across
different selected roots or local/remote name collisions reject. This selects
inputs and does not establish ABI equivalence between same-name packages.

Inactive `visionos`/`tvos` local declarations retain path metadata without resolving
the path or applying it to iOS. Active local package roots are watched recursively
for membership/content changes; `.build` and `.swiftpm` remain tool caches.

`ProjectConfig.TVOS` and each installed package's `TVOS` preserve the optional
boolean exception setting and validated SPM declarations independently from
`VisionOS`. Neither declaration enables another backend, changes active iOS
products/versions or resolves inactive package paths.

`cli.packageManager` records `bun`, `npm`, `pnpm` or `yarn` as public project
metadata. It does not authorize installation: every operation still requires
already installed dependencies. Bundler/CLI fields in plugin configs reject.
Only `bundler:'vite'` is supported. An explicit `bundlerConfigPath` must identify
an existing JavaScript/TypeScript file; Resolve records its canonical absolute
path and SHA-256 without executing it. With `bundler:'vite'` and no explicit path,
exactly one conventional `vite.config.{ts,js,mjs,cjs,mts,cts}` is selected when
present; multiple matches require an explicit choice. Without a selected file,
the existing built-in bundlers retain their behavior. Vite config imports are
loaded by the build/development adapter, not discovered as native contributions
by Resolve. See [bundling](bundling.md) for the installed-engine contract.

App and installed native-plugin `ios.NativeSource` configs each contain an array
of unique `{name,path}` declarations. Relative paths resolve from the declaring
app or real package directory, including workspace paths outside it. File globs or
directories must select ordinary supported iOS source/header/modulemap files;
empty matches, unsupported files and symlinks inside selected trees fail. Each
selected file is read/fingerprinted. Repeated physical membership is compiled
once, preferring installed-package ownership over an explicit app selection.
Removal drops a selector's membership unless an installed contribution still owns
that file. Names are scoped to each config, so independent plugins can use the
same name. These declarations do not authorize source writes or installation.
For OTA, plugin selectors must be relative and have ordinary source ancestry;
their selected bytes use a verified portable canonical descriptor. See
[the descriptor contract](../../bridge/extensions/plugin-native-source.md).

App and installed native-package `ios.SPMPackages` declarations become typed
`spm-remote` contributions. Public `NativeContribution.SPM` contains the name,
HTTPS repository URL, version requirement and selected products; Path identifies
the declaring config. URLs with credentials, query strings or fragments reject.
Supported requirements are exact three-part versions, `^`/`~` versions, full
40-hex `#revision` and simple branch names. Other range/local-path config forms
remain unavailable; installed local Package.swift contributions are separate.

Same-repository declarations merge products deterministically. An explicit app
version overrides plugin defaults for that repository; conflicting plugin versions
without an app choice, contradictory app versions and repository/name/identity/
product collisions reject before native output. Resolve never fetches a Swift
package. Preparation owns Xcode resolution and concrete Package.resolved pins.

Installed dependencies, optional dependencies and peers are traversed from each
package's own Node lookup locations. Missing required packages fail; absent optional
packages/optional peers are skipped. Development dependencies are not app native
contributors. Workspace dependencies must already have links installed. No workspace
or lockfile spec is interpreted as an instruction to install. Global NODE_PATH is
excluded. Package exports need not expose package.json. Real package directories
break graph cycles and deduplicate links; distinct installations remain distinct,
even when names or versions match. Edges retain lookup and canonical paths.

Packages marked with `package.json.nativescript` contribute native inputs.
Supported metadata is `platforms.ios`/`platforms.android`/`platforms.windows`
version requirements. WindowsRequirement is retained as declaration metadata;
Windows preparation/build/device operations and Windows native-file collection
remain unavailable. A plugin declaring Windows as well as iOS/Android does not
require a Windows backend to resolve its iOS/Android inputs.
App/plugin `visionos.SPMPackages` and boolean `discardUncaughtJsExceptions` are
also validated and retained in public `VisionOSConfig` declaration metadata.
They never enter the iOS dependency graph, override iOS versions/products or
change iOS runtime settings. Other visionOS settings reject; no visionOS
preparation/build/device backend is enabled. For example, FontManager1.0.20's
iOS dependency stays1.0.20 even though its visionOS declaration requests1.0.12.
These and package versions are retained without claiming toolchain compatibility.
Precompiled iOS `.metallib` binaries resolve as hashed resources, including
separate simulator/device variants. Metal source compilation remains unavailable.
A native package may have its own executable config with platform settings;
app-only fields in package config fail. Package Android settings remain on the
installed package result. Native files under an installed package's `platforms/ios`
and `platforms/android`, plus app resources under `iOS` and `Android`, become
typed contributions owned by the canonical package. The application's own
top-level `platforms/` is generated preparation output (`ns clean` material),
never an authored input: it is not walked, contributes nothing and cannot
invalidate the revision.

Supported categories include iOS source, frameworks, Podfile/podspec, Package.swift,
configuration and resources; Android source, AAR/JAR, Gradle/manifest and resources.
Unrecognized files, unsupported metadata/settings and symlinks within native
trees fail with remediation. Registered project hooks have a separate
[bounded execution contract](hooks.md). Linked package roots are supported. Resolution
describes Pods/SPM/native files without executing or validating their native tools.
Platform preparation owns the next stage and may reject inputs it cannot consume.

The exact app resource path `Android/google-services.json` is an Android
configuration contribution with normal source hashing and ownership. Its values
stay opaque to resolution. A package cannot provide the app's Google Services
configuration, and this rule does not accept arbitrary Android JSON inputs.

Native module maps are configuration contributions, including plugin-owned maps.
Ordinary LICENSE/NOTICE files also accept conventional producer/license suffixes,
such as
`LICENSE-Aztec-MPL-2.0.txt`, `LICENSE-APACHE` and `NOTICE_Dependency.md`. Suffixed
text variants use `.txt`, `.md` or `.markdown`; license-like Swift/Java source
filenames retain source membership. Legal files and a packaged producer's
`Package.resolved` remain read-only source identities. They are not compiled/copied as runtime resources,
and producer Swift pins never replace this application's resolved pins or request
another dependency graph. Changes still invalidate resolution. Distribution of
required legal notices remains a separate release responsibility.

An installed native plugin's exact `platforms/ios/native-api-usage.json` or
`platforms/android/native-api-usage.json` is a hashed inventory. Its optional
`uses`/`blacklist` fields must be arrays of nonempty one-line patterns. The
NativeScript9.1.1 filtering producer activates these recommendations only with
an application filtering declaration. This backend retains default metadata
generation and does not activate pruning from plugin hints. Application-level
`native-api-usage.json` requests reject explicitly on both platforms, including
iOS where ordinary JSON would otherwise be a resource. Explicit Android `.mdg`
filters retain their separate existing contract.

The published GestureHandler2.1.0 `platforms/android/sync` producer marker is
read-only inventory only at its reviewed SHA-256. It is not executed, copied as
an app asset or interpreted as a development command. Other versions or changed
marker bytes retain strict rejection.

Conventional plugin platform-root `README` documentation and `UPSTREAM`
provenance records (bare, `.md`,
`.markdown`, `.txt` or `.rst`) is hashed source inventory. It does not become
native source or an app resource. This rule does not suppress documents inside
authored assets/bundles or accept unknown sibling file types. App resources
retain their separate resource contract.

Plugin `platforms/{ios,android}/typings/**/*.d.ts` files are likewise read-only
source inventories. They describe native APIs for TypeScript authors and are
not Objective-C/Java sources or NativeScript metadata filters. Core and other
plugins share this contract. Authored assets containing typing files retain
resource membership; other file types under a typings directory retain their
ordinary validation.

An installed plugin's exact `platforms/android/.gradle/` directory is producer
cache, excluded from source identity and native contributions. The development
watcher ignores its creation, mutation and deletion at the same boundary.
Symlinks remain unsupported. This does not exclude arbitrary `build` directories,
unrecognized sibling files or `.gradle` directories inside authored assets/res.

The published `@octane-xplat/nativescript-mason-core` 1.0.0-beta.5 adapter recognizes
its four platform-root manifest/provenance JSON files only when their SHA-256
values match its `artifact-inventory.json`. Inventory and records are hashed
inputs, rather than app resources or Android configuration instructions. Unknown
versions/layouts keep normal strict classification, and inconsistent inventories
fail before preparation. This recognizes producer provenance; it does not certify
the producer's binary build claims or establish Mason native/runtime qualification.

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
remain unavailable. Other packages may declare fingerprinted hook-installation
metadata; registered project scripts execute only at the supported lifecycle
points in the [hook contract](hooks.md). This adds no Angular/webpack interoperability.

For this pinned core package, native API-use inventories and iOS declaration
files are hashed inputs rather than runtime resources. Metadata generation remains
complete; inventory-driven pruning is not implemented. The core module map is a
configuration input passed to Clang and Swift by iOS preparation. Native source,
framework and Android AAR/resource ownership otherwise uses the normal contracts.
Resolution and bundle evidence do not by themselves qualify native compilation or
the public SDK installer on devices.
