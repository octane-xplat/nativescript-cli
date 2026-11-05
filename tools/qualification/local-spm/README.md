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
including automatically uncovered declared local package inputs. A positive
control does not qualify missing selected-source coverage or justify an OTA stamp.

Qualify private OTA snapshot/producer integration with an already installed,
reviewed canonical consumer (no dependency install is performed):

```sh
mkdir -p /absolute/new-project-cache /absolute/new-report-directory
OTA_CONSUMER_DIR=/absolute/installed-canonical-consumer \
OTA_LOCAL_SPM_REPORT_DIR=/absolute/new-report-directory \
OTA_LOCAL_SPM_RETAIN_DIR=/absolute/new-project-cache \
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"local Swift canonical snapshot qualification"}' -- \
  env TMPDIR=/absolute/new-project-cache \
  go test -race ./internal/extensions -run 'TestCanonical|TestDeclaredLocalSPM' -count=1 -v
python3 tools/qualification/local-spm/inspect-snapshot.py /absolute/new-report-directory
```

The local-package scenario deliberately invokes the private extracted helper;
the public Go adapter independently validates preparation receipts. Actual Swift manifest evaluation feeds
app-local, workspace-relative and installed-link snapshot cases. Canonical
preparation captures the installed toolchain, checks source changes/idempotence,
extension-source coexistence/removal, stale/missing receipts, collisions, selected
package removal, boot text and JSON stamps. Runtime projects/boot inputs and
extension-native digests are labeled fixtures. The existing nonlocal public
adapter scenario also checks directory publication and cancellation/lease reuse.

The independent inspector reconstructs descriptors from retained request facts,
checks copied file hashes/membership and canonical extra-source hashes, and
checks the retained boot/stamp outputs. `OTA_LOCAL_SPM_RETAIN_DIR` preserves only
these owned fixtures for inspection; omit it for ordinary test cleanup. Report
files must not already exist. This is not native library compilation, original
V8 ABI, compiled-stamp, public local-SPM OTA publication or HTTPS installer proof.

Qualify actual compiled canonical stamps through public `Client.Build`:

```sh
go build -o .cache/local-spm-ota-consumer ./tools/qualification/vite-config/consumer
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"local Swift release canonical stamps"}' -- \
  python3 tools/qualification/local-spm/qualify-ota.py \
  .cache/local-spm-ota-NEW .cache/local-spm-ota-consumer \
  /absolute/new-evidence-prefix .cache/canonical-packages
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"inspect retained native code and stamps"}' -- \
  python3 tools/qualification/local-spm/inspect-ota.py /absolute/new-evidence-prefix
```

This fixture installs existing pinned archives offline, then requests three
unsigned release simulator builds: local C111, C222 and package/Swift bridge
removal. The consumer retains Mach-O, canonical records, boot/stamp files, graph
and an independent manifest evaluation, and checks the canonical hash is compiled
into the executable. Only the new compiler scratch directory for each successful
case is retired after retaining evidence; all older caches remain untouched.
Staging requires 2 GiB free and each fresh build requires 1.25 GiB headroom.

If space interrupts an unfinished run, append `--resume` to the same brokered
qualifier command. It validates retained source identities and completed phase
artifacts, skips those builds and continues without restaging. Complete report
prefixes cannot be overwritten. `inspect-ota.py --partial` can inspect retained
completed cases, but reports `coverageComplete: false` until all three exist.
Compilation/stamp evidence does not qualify guest startup, HTTPS installation,
physical signing or original V8 ABI.
