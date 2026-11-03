# iOS preparation

Public `Client.Prepare` now resolves the installed project and prepares the
unmodified published `@nativescript/ios` **8.9.0** runtime template. Other runtime
versions return unavailable until qualified. Plugin iOS minimums accept plain
one-to-three-part numeric versions; newer or unrecognized requirements fail. The runtime is an explicit installed
app dependency or devDependency; nothing downloads or invokes an upstream CLI.
The template's XCFramework archive is expanded using `/usr/bin/unzip` lazily.

Preparation owns one F2 project lease through J1 editing and every dependency
child's retirement. Go consumers need no npm CLI or helper generation step.
Android preparation remains unavailable. The iOS compiler is described in [iOS compilation](ios-build.md).

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

A local `Package.swift` describes library products through `swift package
dump-package`. Its implementation subtree is package-owned, not also compiled by
the application. Podspec directories have the same ownership rule. Tool caches
`.build` and `.swiftpm` are excluded from resolution fingerprints. Podfile fragments
are evaluated inside the generated application target; full upstream Podfiles
requiring their own target or service injection need migration. Podspec filename
must match pod name. CocoaPods runs `pod install`; local SPM runs
`xcodebuild -resolvePackageDependencies`. Missing/failed tools fail Prepare.
Tool output is not forwarded to application callbacks under the lease.

`.p1.json` records graph ownership. Stable IDs permit byte-identical repetition
and deterministic removal, while unrelated graph objects and resolution pins
survive. Once a workspace has used Pods/SPM, subsequent preparation also invokes those
tools, including removal and retries, to retire integrations and retain pins.
P1 owns its generated settings and files; callers should contribute through their
app resources instead of editing those files. Arbitrary multi-target workspaces,
remote SPM declarations, runtime upgrades, localized variant-group merging and
binary plist merging are unavailable. Preparation is not a rollback transaction:
a failed operation can leave incomplete generated files, but returns no success;
retry uses retained ownership state. Source packages must remain immutable during
a call. Native compilation, signing, metadata correctness on a device and G2–G6
remain separate qualification gates.
