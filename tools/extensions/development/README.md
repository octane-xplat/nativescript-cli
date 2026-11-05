# Extension development lifecycle qualification

Use an existing installed native Vite consumer with the repository's supported
engine/core/runtime versions; no install or native compilation occurs here:

```sh
NS_NATIVE_VITE_DIR=/absolute/installed-native-vite-consumer \
  go test -race . -run TestPublicDevelopmentExtensionForms -count=1 -v
```

The test runs the real public development workflow, resolver, extracted helper,
Vite server/watcher, workspace leases, extension scheduling and transports. The
same Go hooks run directly and through an executable; the Node module independently
implements their semantic contract. Explicit control/trace files live outside the
app. Tests do not change the embedding process environment.

Each form checks collect/prepared/post-build context and ownership, generated
native input changes across a native-resource restart, completed artifact hashes,
stale generated output removal before compilation, repeated session close and
endpoint retirement. Every hook phase rejects and blocks for cancellation; no
failed attempt launches an app. The same caller-owned extension is reused after
cancellation. A failure during a running session's rebuild preserves its cause
and retires the old app/server. External Go/Node process IDs stay stable while
in use and are verified retired after explicit, repeated caller close.

Native preparation/compiler and device/app adapters are fixtures. The post-build
artifact is an actual Vite bootstrap, not an APK/app executable. This proves host
lifecycle/transport behavior, not native compilation, guest HMR, physical-device
behavior or full extension/native acceptance. The public OTA contract is described
in `docs/design/extensions.md`; its native/installer evidence is separate.
