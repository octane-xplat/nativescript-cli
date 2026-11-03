# Android preparation

Public `Client.Prepare` supports Android using the explicitly installed
`@nativescript/android` 9.0.0 runtime. It copies published runtime templates,
wrapper, AARs and binding/metadata tools; it does not use an upstream CLI or
existing generated platform tree. Node is needed by resolution. Java, the SDK
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

Native package inputs are snapshotted beneath `contributions/`. Library modules
provide Java/Kotlin, resources, assets, JNI inputs and manifests. Gradle owns
manifest and resource merging. Runtime scripts consume plugin AAR/JAR files and
`include.gradle`, `buildscript.gradle` and `rootbuildscript.gradle`. App resources
support both flat and `src/main` layouts, plus the runtime's app/settings/build
scripts and `gradle.properties`. Nested AAR directories get explicit repositories.
App manifest files replace the runtime template; no XML merge is performed here.

Android runtime settings use app values when present and otherwise consistent
plugin defaults. Conflicting defaults require explicit app configuration. Vite
emits the effective settings and application ID into the bundled package.json,
including during watch regeneration. `runtime-config.json` also retains the
settings outside the bundle tree.

Unrecognized Gradle/property contributions, native C/C++ sources without an
explicit supported build contract, and symlinks within native trees return
explicit unavailable errors. No dependency installation, signing, native
compilation, metadata execution or device qualification is implied by Prepare.
B2 owns compilation/artifact detection; D2 owns device operations. Real Android
build/runtime health, release artifacts and G3–G6 remain separate gates.
