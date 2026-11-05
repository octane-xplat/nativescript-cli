# iOS preparation

Public `Client.Prepare` now resolves the installed project and prepares the
published `@nativescript/ios` **8.9.0** and **9.1.0** runtime templates.
The 9.1.0 template owns an exact NativeScript SwiftPM dependency; preparation
resolves it with Xcode, retains Package.resolved, and preserves its product link.
The 8.9.0 template retains its bundled XCFramework contract. Other runtime
versions return unavailable until qualified. Plugin iOS minimums accept plain
one-to-three-part numeric versions; newer or unrecognized requirements fail. The runtime is an explicit installed
app dependency or devDependency; nothing downloads or invokes an upstream CLI.
The template's XCFramework archive is expanded using `/usr/bin/unzip` lazily.

Preparation owns one F2 project lease through J1 editing and every dependency
child's retirement. Go consumers need no npm CLI or helper generation step.
Android preparation is described in [Android preparation](android-preparation.md). The iOS compiler is described in [iOS compilation](ios-build.md).

The generated native directory contains `NativeScriptApp.xcodeproj`, runtime
scripts/frameworks/tools, `app/` (the V1 bundle destination), generated Info.plist,
entitlements, bridging header, header module map, xcconfig includes, Podfile and
`metadata-inputs.json`. The runtime linker scripts own actual metadata generation
at build time; the JSON records inputs and does not claim generated metadata.

Native sources, headers, resources and libraries use absolute references to
resolved package files. Headers are excluded from Sources. Dynamic frameworks
have a code-sign-on-copy embed phase; static libraries/frameworks link only.
XCFrameworks must have XML Info.plist and consistent static/dynamic slices.
Unknown binary layouts fail explicitly. A single application target is supported.
Configuration accepts XML `Info.plist`, entitlements and xcconfig includes.
Other plists fail unavailable. Package files apply deterministically before app
files, so application plist values override package values. Plist merge is shallow.

App `ios.NativeSource` selectors feed these same source/header/modulemap inputs,
including workspace-relative files outside the app. With OTAStartup, the helper
creates a private snapshot preserving their relative workspace layout and checks
selected bytes against the resolver's digests before and after canonical
collection. The caller's files/config remain untouched. Current canonical
snapshot support requires ordinary canonical source paths outside node_modules;
absolute external selectors and symlink ancestry fail unavailable. Use explicit
workspace-relative paths for this supported form. Removing a declaration removes
its project membership unless an installed contribution still owns the file.
Source packages still must remain immutable
during the operation; this does not add arbitrary plugin config or remote SPM
support beyond the declarations described below.

A local `Package.swift` describes library products through `swift package
dump-package`. Its implementation subtree is package-owned, not also compiled by
the application. Podspec directories have the same ownership rule. Tool caches
`.build` and `.swiftpm` are excluded from resolution fingerprints. Podfile fragments
are evaluated inside the generated application target; full upstream Podfiles
requiring their own target or service injection need migration. Podspec filename
must match pod name. CocoaPods runs `pod install`; local SPM runs
`xcodebuild -resolvePackageDependencies`. Missing/failed tools fail Prepare.
Tool output is not forwarded to application callbacks under the lease.

An explicit local `ios.SPMPackages` declaration links only its requested `libs`
products after the real Swift manifest tool validates them. Missing products and
requested executable products reject; unrequested products are not linked.
Selected source-package references use their resolved local directories, like
automatically discovered local packages. Package implementations remain owned
by SwiftPM and do not also compile as application sources. App override and
dependency removal regenerate the owned product/reference membership.

Declared local-package canonical OTA coverage remains unfinished. OTA startup
returns explicit unavailable for this iOS combination before invoking its
canonical producer; ordinary non-OTA native preparation/build remains available.

`.p1.json` records graph ownership. Stable IDs permit byte-identical repetition
and deterministic removal, while unrelated graph objects and resolution pins
survive. Once a workspace has used Pods/SPM, subsequent preparation also invokes those
tools, including removal and retries, to retire integrations and retain pins.
P1 owns its generated settings and files; callers should contribute through their
app resources instead of editing those files. Arbitrary multi-target workspaces,
unqualified SPM requirement/transport forms, in-place runtime upgrades, localized variant-group merging and
binary plist merging are unavailable. Preparation is not a rollback transaction:
a failed operation can leave incomplete generated files, but returns no success;
retry uses retained ownership state. Source packages must remain immutable during
a call. Native compilation, signing, metadata correctness on a device and G2–G6
remain separate qualification gates.

An empty native dependency graph does not create a Podfile. Explicit Prepare
creates the runtime entry package.json when no bundle has supplied one. With
OTAStartup enabled, the canonical installed producer runs after real runtime
SwiftPM and contributed Pod/SPM resolution under the same project lease.
The numeric plugin minimum is compared with the installed supported runtime;
9.1 requirements remain unavailable on 8.9.0. Exact versions outside the matrix
remain unavailable. The app must set a deployment target supported by its Xcode
SDK (the current iOS27 host requires at least 15.0 via build.xcconfig).

Contributed module maps admitted by resolution feed Clang and Swift compiler
flags and are recorded in metadata inputs; regeneration/removal updates both
configuration files. XCFramework validation considers iOS device/simulator slices,
including consistent static/dynamic linkage. Unrelated Catalyst/visionOS/macOS
slices do not determine an iOS application's embedding policy. Missing or unknown
selected iOS binaries remain unavailable.

App and installed-plugin ios.SPMPackages are normalized by resolution and rendered
as owned XCRemoteSwiftPackageReference entries, selected product dependencies and
Frameworks phase links. Exact version, major/minor-compatible, full commit revision
and simple branch requirements remain distinct. Existing unowned references,
including the runtime's reviewed package, are retained; a competing declaration
for one fails instead of rewriting it. Product-name collisions with existing or
contributed products fail. Repetition is stable, removal retires owned references
and retains resolution-tool invocation/pins. Metadata inputs record the effective
remote declarations. This does not admit arbitrary multi-target SPM mutations.
