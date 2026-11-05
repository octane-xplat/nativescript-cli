# Generated Swift native compilation

Build this public-library consumer and run it under a `native_builds:1` broker
reservation with an independently installed canonical0.19/iOS9.1 fixture. It
builds an unsigned arm64 simulator debug app with a direct extension's Swift
source, checks its actual Objective-C class definition in Mach-O and matching
canonical bundle stamp, then builds without the extension and requires removal.

```sh
go build -o .cache/swift-consumer ./tools/extensions/swift
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"generated Swift native compilation/removal"}' -- .cache/swift-consumer /absolute/fresh-app /absolute/new-evidence.json
```

Use a new evidence path; retained Mach-O, complete fingerprint record and stamp
files are created exclusively beside it. The app must have Vite and valid native
resources. Source apps can be installed offline using
`tools/qualification/ota/stage-consumer.py` and exact cached tarballs.

This does not boot a guest, install/launch an app, change signing/trust, or exercise
an OTA installer. Direct registration is the scope here; transport parity and
Android three-form compilation have separate qualification. Cancellation and
runtime native binding behavior are not certified by a successful compilation.
