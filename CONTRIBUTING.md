# Contributing

The repository currently contains scaffolding. Keep the public API and plugin
contracts small until a representative library-to-platform workflow is proven.

## Local checks

Use Go 1.26 or newer. Format Go source and check the module before committing:

```sh
gofmt -w .
go build ./...
go vet ./...
go test ./...
```

Use Bun for helper tooling. Go builds use the committed payload without an npm
installation or generation step. After changing helper sources or dependencies,
run `bun install --frozen-lockfile`, `node tools/helper/generate.mjs` and
`node tools/helper/generate.mjs --check`. Run
`python3 tools/helper/external-consumer.py` to qualify the module distribution
with a clean external consumer. See `internal/jsbridge/README.md`. Node is needed
for helper runtime tests; Windows helper execution remains explicitly unavailable.

## Ownership and integration

Separate preparation, compilation and device operations on each platform.
Feature-specific JavaScript handlers belong in their matching `bridge/`
subdirectory. See [the internal package map](internal/README.md).

Coordinate changes to shared public types, the extension protocol, module
manifests and executable composition. Independently developed components should
have realistic fixtures for their inputs and outputs. Integrate real producers
and consumers early; passing fake tools does not qualify native builds or devices.

Keep library behavior usable inside another Go process: explicit contexts and
paths, typed results/errors, caller-controlled diagnostics, and owned-resource
cleanup. The executable owns terminal presentation, OS signal handling and exit
codes.

Do not commit operational logs, captures or qualification snapshots. Keep plans
and reports in their designated external project directories and operational
progress in Silo. Record reusable constraints and rationale in repository guidance.

## Local consumer and packaging qualification

Run `python3 tools/packaging/qualify.py` on macOS/Linux with Node and npm. It
builds the actual host CLI, packs private npm tarballs, installs them offline in
an isolated consumer and runs the embedded helper. Foreign-platform payloads are
explicit packaging fixtures, not executable or native qualification. Nothing is
published. The launcher requires its matching optional platform package and
never downloads a fallback binary. Node/npm are test prerequisites; ordinary Go
consumers need only Node when invoking helper operations.

`node tools/packaging/stage.mjs binaries.json EMPTY_OUTPUT` stages private
packages from an explicit JSON map of target to absolute binary path, for example
`{"darwin-arm64":"/tmp/xplat-ns"}`. Supported package targets are darwin/linux/
win32 with arm64/x64. This describes packaging selection, not qualified runtime
support: Windows process/helper execution remains unavailable. Release automation
must supply and qualify real binaries for every advertised target. Staging keeps
Go/npm package versions aligned and copies embedded-helper notices. Private
helper/API versions remain independent. Publishing, signing, native runtime and
extension interoperability remain separate gates.
