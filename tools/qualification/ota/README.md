# NativeScript 9.1 runtime guard qualification

These opt-in checks distinguish native runtime behavior from full OTA SDK
acceptance. They use independently installed canonical updates/fingerprint
0.19.0 packages and fresh platform preparation through the public Go library.
No upstream CLI or generated platform tree is imported.

| Check | Evidence boundary |
| --- | --- |
| iOS release simulator | Real canonical native guard; compatible next-launch activation, confirmation and rollback via canonical client state methods with native file storage; failed-boot recovery; changed-native rejection before payload JS; server-free embedded restoration |
| Android debug emulator | Real canonical native debug mode, SDK-independent canonical client rejection of debug installation, generated binding/native contribution, advancing heartbeat, app cleanup, owned boot/installation cleanup; no release lifecycle claim |

The iOS fixture stages its test archives from the host. Its storage adapter uses
actual Foundation files; it deliberately has no network/installer transport.
The Android fixture uses real Java state/health files. Neither fixture qualifies
the public `createUpdates`/`native.mobile` adapter. The resolver now migrates only the exact reviewed core 9.1.3 compatibility hook,
and bundling selects native/platform modules. A normal core-backed SDK baseline
can be staged with `stage-consumer.py --sdk`; actual native SDK execution and its
network installer still need separate qualification. Do not bypass those responses
or edit installed packages to manufacture full SDK acceptance.

For the public SDK baseline, stage each platform with `--sdk`, compile with the
same public consumer below, then run the corresponding device command with
`--sdk-baseline`. iOS checks release support, embedded status, native storage and
a live application heartbeat. Android checks public SDK rejection of a genuine
debug binary and an advancing native heartbeat with guest network radios disabled.
These checks do not qualify `check()`/`install()` or a release update lifecycle.
The strict installer requires a reachable trusted HTTPS origin serving manifests
and matching bundle archives; the baseline's `not-running.invalid` origin cannot
provide that evidence. Android release compilation additionally requires an
explicit approved signing choice. Never weaken HTTPS validation or create signing
credentials merely to make these baseline checks pass.

## Preparation and compilation

Build the canonical tarballs using `tools/ota/stage.py`, or supply previously
verified private tarballs. With runtime/tool dependencies already cached:

```sh
python3 tools/qualification/ota/stage-consumer.py ios /absolute/updates.tgz /absolute/fingerprint.tgz /new/ios-app
python3 tools/qualification/ota/stage-consumer.py android /absolute/updates.tgz /absolute/fingerprint.tgz /new/android-app
go build -o /absolute/consumer ./tools/ota/runtime
```

Run compilation under a `native_builds:1` reservation, without device work:

```sh
go run ./tools/ota/runtime build /absolute/ios-app /absolute/ios-artifact.json generic
go run ./tools/ota/runtime build-android-debug /absolute/android-app /absolute/android-artifact.json generic
```

Use the resource broker around those commands. When the enclosing task's
admission changes, use its current reservation as the explicit `parent` rather
than reusing a stale inherited reservation. End compilation before starting a
device phase. iOS uses an unsigned release simulator app. Android uses ordinary
debug signing; release signing is outside these checks. The release iOS fixture
explicitly exports/retains its C entry functions so the release linker can expose
them to JavaScript; inspect binary exports rather than assuming metadata is enough.

## Device phases

Use one explicitly authorized device at a time, with its exact exclusive key and
one resident device. Run the corresponding command under that device reservation:

```sh
python3 tools/qualification/ota/ios/native_guard.py /absolute/ios-app /absolute/ios-artifact.json /absolute/consumer EXACT_SHUTDOWN_UDID /absolute/ios-evidence
python3 tools/qualification/ota/android/debug_guard.py /absolute/android-app /absolute/android-artifact.json /absolute/consumer /absolute/android-evidence
```

The iOS check refuses an unowned existing installation, preserves other apps and
always shuts down its owned boot. It checks server-free release startup; it does
not disable the simulator's host network. The Android check reuses only the
existing caller-owned `elegant-fir-probe` AVD (installed API35 google_apis arm64
image; never created, registered, rewritten or deleted; at most one emulator),
refuses a used serial or a preexisting fixture installation, captures then
disables network radios on the guest, and restores the radios and retires only
its owned emulator boot and installation before reservation release.
No screenshots, new system images, host network changes or release credentials
are used. Evidence JSON and logs belong outside Git. A passing component result
must not promote H1 or the remaining G4–G6 acceptance gates.

## Authorized HTTPS origin preflight

Once an existing origin and bounded upload scope are approved, the read-only
preflight checks its canonical 0.19.0 available-release envelope and archive:

```sh
python3 tools/qualification/ota/preflight.py https://APPROVED_HOST ios NATIVE_HASH
```

It uses system HTTPS trust and refuses redirects. It verifies the exact
same-origin `/bundles/<sha256>` URL, download size/hash, safe ZIP paths, expanded
size, release fingerprint stamp and declared entry point without extracting or
uploading files. The `/manifest` response must include `updateAvailable: true`,
matching `platform` and `channel`, plus `version`, `nativeFingerprint`, `sha256`,
`size` and `url`. A bare release descriptor is insufficient. A no-update response
fails this fixture preflight because it cannot qualify the archive to be installed.

Passing is host evidence only. Guest TLS/network, public SDK `check()`/`install()`,
activation, confirmation, recovery and offline startup still require their own
device evidence. No origin is provisioned or authorized by this tool. Offline
contract checks run with:

```sh
python3 -B -m unittest discover -s tools/qualification/ota -p '*_test.py'
```

An already running, trusted Portless HTTPS proxy can front the maintained local
fixture backend. Confirm that proxy with `portless doctor` first; configuring a
new proxy, CA, system hosts entries or guest trust is a separate explicit action.
With a caller-owned root containing `manifest.json` and immutable
`bundles/<sha256>` files:

```sh
PORTLESS_SYNC_HOSTS=0 portless ns-ota-qualification python3 -B tools/qualification/ota/serve.py /absolute/fixture-root
```

The backend binds loopback only, takes the HTTPS origin and assigned port from
Portless, exposes no upload API and performs no trust/proxy configuration. It
serves canonical available, up-to-date and native-incompatible responses; manifests
use `no-store`, while archives use immutable caching and fail if bytes disagree
with their hash path. Replace the manifest atomically when advancing a scenario.
The port is part of the HTTPS origin when the proxy uses a nonstandard port.

Host CA trust and host name resolution do not establish guest trust/reachability.
Probe those separately before a native installer run; never bypass certificate
validation or treat an internal loopback backend as the external OTA origin.
