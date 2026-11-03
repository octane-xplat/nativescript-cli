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

Use Bun for future JavaScript tooling. There are currently no JS dependencies,
installation steps or helper payload to generate.

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
