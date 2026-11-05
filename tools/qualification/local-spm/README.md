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

Inspect declared-local-package canonical coverage without native tools:

```sh
node tools/qualification/local-spm/canonical-coverage.cjs \
  /absolute/installed-canonical-consumer /absolute/new-private-host-cache \
  /absolute/new-report.json
```

The probe verifies the reviewed fingerprint0.19.0 payload digests and preserves
its installed consumer manifest/lock. It uses owned local Swift-package sources,
the real public canonical API and a labeled synthetic toolchain. Both app-local
and workspace-relative declarations are checked against source/manifest edits;
an explicit in-project directory is a positive hashing control. It performs no
install, native compilation, ABI/startup check or stamp publication. Reports
contain paths/hashes rather than source contents. A coverage gap exits nonzero,
including the currently uncovered declared local package inputs. A positive
control is not acceptance of those missing inputs or permission to remove the
Go OTA guard.
