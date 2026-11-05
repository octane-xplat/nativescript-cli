# Installed plugin source native qualification

Build the public consumer from a clean checkout, then run this qualifier under
one `native_builds:1` broker grant. Inputs are a new project-cache workspace,
that consumer, an unused external evidence prefix and the existing reviewed
canonical0.19 archive directory:

```sh
go build -o .cache/plugin-source-consumer ./tools/qualification/vite-config/consumer
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"plugin NativeSource native compilation"}' -- \
  python3 tools/qualification/plugin-native-source/qualify.py \
  "$PWD/.cache/plugin-source-NEW" "$PWD/.cache/plugin-source-consumer" \
  /absolute/new-evidence-prefix "$PWD/.cache/canonical-packages"
```

Keep the supervisor log outside `PREFIX-*`, which belongs to generated evidence.
The fixture installs a JS parent whose native child declares a Swift selector
outside `platforms/ios`. It resolves the nested child from that parent's module
context and verifies the native package is transitive. Edits replace files only
inside this new fixture, breaking possible package-manager hardlinks first.

Three actual public unsigned release-simulator builds compile111, change to222,
then remove the selector while retaining the physical Swift source. The separate
inspector checks Swift/ObjC/C-export machine code and absence, resolved input
digests, an independently reconstructed plugin descriptor, full retained app
hashes and compiled/persisted/bundled canonical stamp agreement. It does not
execute the app or an installer. Full original/native plugin/runtime and release
gates remain independent.

Staging requires2GiB project-cache headroom, with1.25GiB before each build. Full
apps are retained with Darwin `clonefile` and no deep-copy fallback. Only this
run's new compiler scratch is removed, after code/record/stamp/app proof retention
and independent inspection. No older cache, device, signing input or caller
dependency is changed. `--resume-staged` can recover this owned fixture only
before any native state exists; it never reruns an ambiguous native attempt or
overwrites phase evidence. A terminal failed staging attempt must be inspected
before using that option.

## Runtime on the prescribed simulator

`qualify_runtime.py` runs the three retained apps through public `Run` on the
existing iOS guest `91D40099-A056-497D-A572-ADDDFD6A8F23` under one exclusive
broker reservation. It never creates, clones or erases a device. Use the
`tools/ota/runtime` consumer (`hold` mode), not the Vite configuration consumer.

The retained apps from the compile matrix predate the corrected `app_entry.ts`.
`--restage-bundle`, `--restage-report` and `--restage-dir` clone each retained
app with `clonefile` and replace only `app/bundle.mjs` with a production host
bundle whose digest must match a passed release iOS bundler report. The clone
must differ from the retained app in exactly that file, and the retained app
must stay unchanged. This is not a fresh public Build.

```sh
go build -o .cache/plugin-source-runtime-consumer ./tools/ota/runtime
python3 tools/qualification/plugin-native-source/qualify_runtime.py \
  /absolute/compile-evidence-prefix "$PWD/.cache/plugin-source-runtime-consumer" \
  /absolute/new-runtime-prefix --restage-bundle /absolute/bundle.mjs \
  --restage-report /absolute/host-bundle-report.json --restage-dir "$PWD/.cache/NEW"
```

Each case requires the app's own health file (nonce, boot identity, stable
PID, class presence and value), the launchd PID, the native startup fingerprint
and release mode. Public `Run` logs are a bounded buffer, so a missing launch
line is tolerated but a different PID fails. After uninstall and shutdown the
guest has been observed to re-list the fixture with no bundle bytes; the next
run retires only that byte-less fixture registration and records it.
