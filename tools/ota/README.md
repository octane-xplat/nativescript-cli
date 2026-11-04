# Canonical platform preparation qualification

`platform/main.go` is an opt-in public-library consumer. Supply an absolute app
path and `ios` or `android`; an optional `build` argument runs actual native
compilation instead. Run either mode under a `native_builds:1` reservation. It
never boots or accesses a device.

The app must independently install the exact canonical updates/fingerprint
0.19.0 tarballs built with `stage.py`, their dependencies, and iOS 9.1.0 and/or
Android 9.1.1. Bun can install from a prepopulated offline cache. No source-tree
link or upstream CLI is needed. Author a package version, NativeScript config,
app entry and required platform resources. Native builds also need app-installed
Vite, an SDK-compatible iOS deployment target, and Android icon/manifest resources.

```sh
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"canonical platform preparation"}' -- go run ./tools/ota/platform /absolute/installed/app ios
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"canonical platform preparation"}' -- go run ./tools/ota/platform /absolute/installed/app android
```

Prepare verifies that the real pin file, native startup hash, bundle stamp and
canonical fingerprint record agree. iOS resolves its exact runtime SwiftPM
package. Android resolves the selected variant graph and external artifacts
using cached Gradle dependencies. Missing prerequisites fail. Build returns a
real compiler artifact but does not imply installation or runtime health.

The canonical adapter's pin-change, relocation, debug/release, tampering and
cancellation checks remain in `bridge/extensions/` and `internal/extensions/`.
Package distribution checks are `tools/helper/external-consumer.py` and
`tools/packaging/qualify.py`. Actual OTA activation, confirmation/recovery,
incompatible-native rejection and offline release startup need separately
admitted devices and qualification; none is inferred from Prepare or compilation.
