# Declared remote Swift packages

This native qualification uses a fresh task-owned iOS9.1/canonical0.19 app and an
explicit original haptics bridge source/license. It compiles the bridge body with
app `ios.SPMPackages` selecting Pulsar1.4.0, then with an installed native plugin
selecting the same concrete commit using `#revision`, then removes both package
declaration and source membership. The class declaration is renamed/given an ObjC
name only so the maintained Mach-O inspector can identify it; method bodies stay
unchanged. The actual native plugin here is a direct dependency. Transitive
configuration discovery has separate public Resolve tests.

Build `tools/extensions/swift` into an explicit consumer binary, then run:

```sh
goddard-agent resource run --json '{"resources":{"native_builds":1},"purpose":"declared remote Swift package compilation/removal"}' -- python3 tools/qualification/remote-spm/qualify.py NEW_WORKSPACE CONSUMER UPDATES_TARBALL FINGERPRINT_TARBALL BRIDGE_SWIFT BRIDGE_LICENSE NEW_EVIDENCE_PREFIX
```

All paths are explicit. The workspace must be new; the library and inspector do
not edit authored inputs. The orchestrator owns only its newly created fixture.
It retains public typed results, native executable/stamp/full canonical record,
actual Package.resolved pins and project metadata for each phase. Exact and
revision phases must resolve to the same concrete commit; removal must retire
the remote reference, pin and native class. Source/config hashes bind the fixture.

There is no upstream CLI, guest boot, physical action, runtime haptics, signing,
trust change, OTA installer, release or publication step. Local graph fixtures,
foreign compilation and actual package/native compilation remain distinct scopes.
