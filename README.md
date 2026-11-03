# NativeScript CLI and Go library

A scaffold for NativeScript build and device tooling in Go, maintained by
Octane Xplat. The repository will provide an importable Go library, the
`xplat-ns` executable, and JavaScript/Go build-extension SDKs.

The public Go library and `xplat-ns` command interface are implemented. The
embedded Node Xcode parser is operational; native preparation, builds, device
operations, configuration loading and plugin execution remain unavailable.
See the [command interface](internal/cli/README.md) for usage, JSON output and
exit codes.

## Development

Use Go 1.26 or newer. Node is required by the embedded parser and future
operations that use JavaScript configuration, Vite or JavaScript extensions.
Cobra is confined to the CLI. The selected external extension framework is documented in
[the extension framework decision](docs/design/extensions.md).

```sh
go build ./...
go vet ./...
go test ./...
```

These checks cover contracts, workflows, process ownership, workspace state,
helper execution and command behavior; they do not qualify native builds/devices.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository boundaries

| Path | Purpose |
| --- | --- |
| Root Go package `nativescript` | Public library entry point; typed operations and owned sessions |
| `extension/` | Public Go build-extension SDK |
| `cmd/xplat-ns/` | Executable entry point |
| `internal/` | Private workflow, platform, process and workspace implementations |
| `bridge/` | JavaScript helper source, split by feature |
| `plugin/` | JavaScript authoring SDK source |
| `assets/` | Embedded helper payload and notices |
| `tools/` | Private generation and verification tooling |

The Go module is `github.com/octane-xplat/nativescript-cli`. The planned npm
package is `@octane-xplat/nativescript-cli`; its manifest is private until a
working launcher and publishable payload exist. There is no npm executable or
SDK export yet. Root `v0.x.y` tags will identify Go module releases.

The intended extension model supports JS modules under Node, external Go
executables, and direct Go registration by library consumers. These are CLI/build
extensions; runtime NativeScript plugins remain a separate integration concern.
External Go and Node/JavaScript extensions will use `hashicorp/go-plugin` with
gRPC. Direct Go registration remains available in the planned library design.

The CLI will use the public library directly. Public requests/results must stay
independent of command parsing, private helper messages and third-party parser
types. Native runtime templates, metadata generators, Vite and platform tools
remain the intended underlying engines.

## License

[MIT](LICENSE).
