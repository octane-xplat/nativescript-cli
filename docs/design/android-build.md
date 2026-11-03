# Android compilation and artifacts

Public Build composes resolution, P2 preparation, Vite bundling and the runtime
Gradle wrapper under one F2 lease. F1 owns wrapper descendants and cancellation.
Compilation does not install dependencies or use an upstream NativeScript CLI.

AndroidBuildOptions selects apk (default) or release aab. Targets select debug
or release; custom flavors are unsupported. Release requires an absolute
caller-owned keystore, alias and two password environment variable names.
Passwords use child-only Gradle project-property environment overrides, never
arguments or generated files. Release diagnostics are discarded. No signing
credentials are created or inferred.

The compiler removes its generated app/build/outputs before invocation. APK
discovery reads AGP output-metadata.json. AAB uses an init task to record the
signReleaseBundle task output after bundleRelease. It checks application
identity, variant, archive structure and requested runtime ABI. Zero or multiple
compatible outputs fail with actionable artifact errors. No fixed artifact
filename is assumed. Split APK installation and custom variants are unsupported.

Windows execution remains unavailable. Synthetic archives and fake Gradle are
component evidence. Real debug compilation, release signing, device startup and
runtime health require separate qualification.
