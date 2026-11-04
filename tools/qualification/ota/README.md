# NativeScript 9.1 runtime guard qualification

These opt-in checks distinguish native runtime behavior from full OTA SDK
acceptance. They use independently installed canonical updates/fingerprint
0.19.0 packages and fresh platform preparation through the public Go library.
No upstream CLI or generated platform tree is imported.

| Check | Evidence boundary |
| --- | --- |
| iOS release simulator | Real canonical native guard; compatible next-launch activation, confirmation and rollback via canonical client state methods with native file storage; failed-boot recovery; changed-native rejection before payload JS; server-free embedded restoration |
| Android debug emulator | Real canonical native debug mode, SDK-independent canonical client rejection of debug installation, generated binding/native contribution, advancing heartbeat, app cleanup, owned AVD cleanup; no release lifecycle claim |

The iOS fixture stages its test archives from the host. Its storage adapter uses
actual Foundation files; it deliberately has no network/installer transport.
The Android fixture uses real Java state/health files. Neither fixture qualifies
the public `createUpdates`/`native.mobile` adapter. The resolver now migrates only the exact reviewed core 9.1.3 compatibility hook,
and bundling selects native/platform modules. A normal core-backed SDK baseline
can be staged with `stage-consumer.py --sdk`; actual native SDK execution and its
network installer still need separate qualification. Do not bypass those responses
or edit installed packages to manufacture full SDK acceptance.

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
not disable the simulator's host network. The Android check creates only
`nativescript-p91-ready-hoodoo` from the installed API35 google_apis arm64 image,
refuses a preexisting AVD or serial, disables network radios on its own guest,
and retires/deletes only its owned emulator/AVD before reservation release.
No screenshots, new system images, host network changes or release credentials
are used. Evidence JSON and logs belong outside Git. A passing component result
must not promote H1 or the remaining G4–G6 acceptance gates.
