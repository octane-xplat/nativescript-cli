# Android preparation

Public `Client.Prepare` supports Android using the explicitly installed
`@nativescript/android` 9.0.0 or 9.1.1 runtime. It copies published runtime templates,
wrapper, AARs and binding/metadata tools; it does not use an upstream CLI or
existing generated platform tree. Node is needed by resolution. For ordinary preparation, Java, the SDK
and Gradle dependency downloads are deferred to compilation.

Preparation holds the real F2 project lease, builds a fresh staging tree and
publishes its state only after success. Regeneration reproduces file contents;
each publication has its own generation path. Removal excludes old inputs from
the new generation. Previous generations are retained by F2. No caller files,
process cwd, environment, logger or signal handlers are changed.

The prepared native directory contains the wrapper, Gradle project and
`dependencies.json`. The bundle destination is `app/src/main/assets/app`.
`metadata-inputs.json` inventories resolved Android contributions; runtime Gradle
tasks generate static bindings and metadata from compiled dependencies and the
bundle. `whitelist.mdg` and `blacklist.mdg` are concatenated in source-path order.

Plugin `native-api-usage.json` recommendations do not create either filter file
without a supported application filtering producer. They are validated, hashed
source identities; changes invalidate preparation. App-driven JSON metadata
filtering remains explicitly unavailable rather than being copied as resources.

Native package inputs are snapshotted beneath `contributions/`. Library modules
provide Java/Kotlin, resources, assets, JNI inputs and manifests. Gradle owns
manifest and resource merging. A legacy library manifest's root `package`
becomes its generated Gradle namespace; only that attribute is removed from the
generated copy. Relative component names and other XML bytes are preserved.
`src/main/AndroidManifest.xml` takes precedence over the flat manifest when both
exist. A package-free library uses its deterministic generated namespace.
Caller manifests remain unchanged; malformed manifests/namespaces reject before
publishing a generation. Runtime scripts consume plugin AAR/JAR files and
`include.gradle`, `buildscript.gradle` and `rootbuildscript.gradle`. App resources
support both flat and `src/main` layouts, plus the runtime's app/settings/build
scripts and `gradle.properties`. Nested AAR directories get explicit repositories.
App manifest files replace the runtime template; no XML merge is performed here.

An app-owned `App_Resources/Android/google-services.json` is an opaque
configuration input. Preparation retains its exact bytes in the resources
snapshot and at `app/google-services.json`, the Google Services Gradle plugin's
module input. Changes invalidate the source revision; removal excludes both
copies from the next generation. Plugin-owned copies and arbitrary JSON outside
resource directories remain unsupported. Gradle plugin setup, native Firebase
compilation and authentication behavior need their own producers and evidence.

Android runtime settings use app values when present and otherwise consistent
plugin defaults. Conflicting defaults require explicit app configuration. Vite
emits the effective settings and application ID into the bundled package.json,
including during watch regeneration. `runtime-config.json` also retains the
settings outside the bundle tree.

Unrecognized Gradle/property contributions, native C/C++ sources without an
explicit supported build contract, and symlinks within native trees return
explicit unavailable errors. Ordinary Prepare performs no dependency installation, signing, native
compilation, metadata execution or device qualification is implied by Prepare.
B2 owns compilation/artifact detection; D2 owns device operations. Real Android
build/runtime health, release artifacts and G3–G6 remain separate gates.

OTAStartup preparation additionally runs the copied runtime wrapper offline,
under the F2 lease, before publishing the staged generation. It locks and
resolves the selected debug/release compile and runtime dependency graph and
external artifacts; project contribution artifacts remain compiler-owned. A
missing cached dependency fails preparation, retaining the previous generation.
The canonical producer then reads the real Gradle locks and publishes startup,
stamp and fingerprint outputs. No synthetic lockfile substitutes for resolution.

9.1.1 retains its published Gradle 8.14.3 wrapper, Android Gradle plugin 8.12.1,
SDK/build tools 35/35.0.0, Java17 bytecode and template Kotlin 2.4.10 settings.
Use the actual template settings, not the stale Kotlin 2.0.0 package version_info.
Plugin numeric minimums compare with the installed supported runtime; 9.1
requirements remain unavailable on 9.0.0. Other exact runtimes, including the
unqualified 9.1.0 Android package, remain unavailable. Native build success
and device/offline OTA acceptance require their own evidence.
