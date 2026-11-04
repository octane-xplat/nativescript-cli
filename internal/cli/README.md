# Command interface

`xplat-ns` calls the public Go library directly. Commands are `resolve`, `prepare`,
`build`, `devices`, `run` and `inspect-xcode`. Each accepts `--help`. Help and
validation do not construct a client or discover tools. The library and extension
SDK do not import Cobra or this package.

The embedded Node Xcode parser can be invoked independently:

```sh
go run ./cmd/xplat-ns inspect-xcode --project /absolute/app \
  --file /absolute/app/project.pbxproj --cache /absolute/writable/cache --json
```

Relative paths resolve against the invocation directory. No operation changes
process cwd or environment. Native operations use installed project dependencies
and platform tools through the public library. A complete target looks like:

```sh
xplat-ns build --project ./app --output ./generated --platform ios \
  --destination simulator --device EXACT-ID --arch arm64 --configuration debug
```

`run` requires the same target and retains the library session until completion.
SIGINT and SIGTERM cancel its context and close only that session, waiting for
owned cleanup. Signal registration and process exit live exclusively in `main`.
No device is automatically selected or booted by the adapter.

`run --hmr` selects the installed NativeScript Vite development engine for debug
simulators/emulators. `--hmr-port PORT` selects a strict server port; zero selects
an available port. The library owns the server, app and Android reverse forwarding,
and rebuilds/relaunches after native input/config changes. See
[development support and evidence](../../docs/design/bundling.md).

## Output contract

Human mode prints operation results to stdout and errors/progress to stderr.
`--json` emits exactly one terminal JSON object on stdout, followed by a newline:

```json
{"version":1,"operation":"resolve","error":{"code":"unavailable","message":"operation unavailable; required producer is not implemented"}}
```

Success uses `result` instead of `error`. Result objects currently use the public
Go result field names (`Text`, `Artifacts`, etc.); successful `run` returns
`{"completed":true}` after the session ends. Progress stays on stderr in both
modes. No terminal success response is emitted before completion. Help remains
text even with `--json`; it is not an operation response. Errors suppress raw
underlying tool output and causes. Requested result paths/text remain visible.
Consumers should branch on the error code, not message text.

| Exit | Meaning |
| --- | --- |
| 0 | Completed operation or help |
| 1 | Operation, diagnostic sink or output failure |
| 2 | Command syntax or invalid input |
| 3 | Unavailable operation, unsupported host or missing toolchain |
| 4 | Workspace contention |
| 124 | Deadline exceeded |
| 130 | Context cancellation, including SIGINT/SIGTERM |

Tests distinguish public-call fakes from the real public library parser path.
Unix executable-entry tests signal a real Node helper blocked on an input FIFO,
verify its retirement and preserve an unrelated Node process. They do not qualify
native builds, devices or Windows runtime behavior.
