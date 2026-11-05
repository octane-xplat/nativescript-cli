# Declared local Swift-package compilation

With the qualified Darwin arm64 SDK/toolchain and offline Bun cache, build the
public consumer and run a new task-owned fixture under a build reservation:

```sh
go build -o .cache/local-spm-consumer ./tools/qualification/vite-config/consumer
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"declared local SPM compilation"}' -- python3 tools/qualification/local-spm/qualify.py .cache/local-spm-NEW .cache/local-spm-consumer /absolute/evidence/prefix
python3 tools/qualification/local-spm/inspect.py /absolute/evidence/prefix
```

The qualifier stages exact runtime/engine/compiler prerequisites, adds two owned
native fixture packages offline with scripts disabled and invokes the public Go
Build consumer three times. It checks first-plugin selection, app override and
dependency/bridge removal through resolution, Xcode references and actual C/ObjC
symbols. The separate read-only inspector hashes the retained arm64 executables
and disassembles the fixture C function to verify111/222, then absence on removal.

This is unsigned simulator compilation. It does not run a guest, qualify the
original V8 shims, prove ABI equivalence, test HMR, or qualify OTA/release/signing.
