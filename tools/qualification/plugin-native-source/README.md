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
