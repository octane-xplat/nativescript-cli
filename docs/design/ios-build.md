# iOS compilation and artifacts

`Client.Build` on macOS composes real resolution, P1 preparation, V1 bundling and
Xcode compilation under one F2 lease. No upstream CLI or existing native tree is
used. The compiler adapter only consumes prepared inputs; it never prepares or
boots a device. Other platforms still report unavailable until their producers
are implemented.

The target specifies debug/release, arm64 (device or simulator) or x86_64
(simulator), and an exact destination ID. ID `generic` requests Xcode's generic
platform destination and does not identify a booted device. Prepared state is
isolated by target. Each compiler invocation allocates fresh products, derived
data, archive and export directories; failed products cannot satisfy another
build. Generated products remain available to the caller after return.

`BuildRequest.IOS.Action` selects `build` (default), `archive`, or `export`.
Archive/export require a device target; export first creates an archive and then
exports it. Results contain respectively `app`, `xcarchive`, or `ipa` artifacts.
An archive or IPA is not a simulator installation product. `Identity` retains the
exact resolved input revision, destination, architecture and configuration.
Discovery checks Info.plist application identity, executable name and supported
platform, then the executable's Mach-O CPU/type and LC_BUILD_VERSION platform.
Export validates the contained app as well. These checks are compatibility
evidence, not runtime health or signing verification. The supported product is
the single P1 NativeScriptApp application target. Older Mach-O layouts without
LC_BUILD_VERSION are rejected.

`SigningMode` is `disabled`, `automatic`, or `manual`. Simulator builds default
to disabled. Device targets require an explicit mode. Automatic requires a team;
manual requires a team, identity and provisioning-profile specifier. Disabled
rejects signing inputs and cannot export. Export requires an absolute existing
caller-owned ExportOptionsPlist. Xcode uses existing local signing material;
there is no provisioning update flag, credential discovery or remote access.
Unsigned device/archive output is permitted only when explicitly requested and
is not evidence of installability or distribution readiness.

Invalid requests return ErrInvalidInput; incomplete signing selections return
ErrSigning. Missing tools return ErrToolchain and unsupported hosts return
ErrUnsupportedHost. Native stage failures expose BuildError (stage, exit status)
through OperationError; output and signing values are excluded from error text.
Tool rejection of otherwise complete signing inputs remains ErrBuild. Context
cancellation is preserved. All child processes retire before lease release;
application callbacks never run under the lease.

Runtime 8.9's linker wrapper needs an explicit clang path on Xcode 27, whose
TOOLCHAIN_DIR can point to an auxiliary Metal toolchain. The compiler resolves
clang with xcrun. P1 reuses the template's standard build phases and points its app
folder reference at NativeDir/app, matching V1's handoff. App contributors must
set a deployment target supported by their selected SDK; the Xcode 27 fixture
uses iOS 15 through App_Resources/iOS/build.xcconfig.

## Qualification

`TestFreshIOSSimulatorBuild` is opt-in. Under a native-build reservation, supply
B1_NATIVE_BUILD=1, P1_RUNTIME_DIR (an explicitly installed @nativescript/ios 9.1
package) and NS_NATIVE_VITE_DIR (an installed @nativescript/vite 8.0.20/8.0.21
consumer). It constructs a
fresh app and Swift contribution, resolves/prepares/bundles/compiles it through
the public client, and validates the resulting arm64 simulator app. Xcode 27 on
Darwin arm64 passed. This does not boot, install or launch an app. Runtime health,
HMR, physical-device signing/builds, actual archive/export, x86_64 native builds
and G2–G6 remain separate unqualified gates. Command, signing, failure, missing
artifact, incompatible platform, archive and IPA tests use synthetic fixtures.
