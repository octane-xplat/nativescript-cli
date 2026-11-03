# Contributor guidance

This repository owns the NativeScript CLI and reusable Go library. Keep changes
within the requested scope and preserve unrelated work.

- Keep the root `nativescript` package and public `extension` SDK independent of
  CLI parsing and private wire protocols. Internal packages must not import the
  root facade; translate data at the boundary to avoid cycles.
- The CLI calls the public library. Keep process exit, signal handling, prompts
  and terminal rendering in the executable/CLI adapter.
- Library operations use explicit contexts, project paths and environment
  overrides. Do not change process-wide cwd, environment or logging settings.
- Keep platform preparation, builds and device operations separately owned.
  Coordinate shared contracts and manifests before changing them across tracks.
- Node is an accepted prerequisite. Reuse established runtime generators,
  bundlers and platform tools. Avoid new dependencies without a concrete benefit.
- JS and Go build extensions share one public semantic contract. Keep that
  contract version independent from the private helper protocol. Use external
  executable plugins or direct Go registration; do not depend on Go shared-object
  plugins for portability.
- Use `hashicorp/go-plugin` with gRPC for external Go and Node/JavaScript
  extensions. Keep transport adapters separate from public extension domain
  types. See [the extension framework decision](docs/design/extensions.md).
- Never expose secrets in logs, events, generated fixtures or commits.
- Do not capture or analyze screenshots/images without explicit task approval.
- Label evidence accurately: source, fixture, compilation, native build and
  actual device behavior are distinct. Use shared host/device reservations for
  native work and clean up owned resources.
- Keep plans in `~/dev/plans/octane-xplat/`, standalone findings in
  `~/dev/reports/octane-xplat/`, and operational state in this repository's Silo.
- Use focused Conventional Commits. Do not create branches unless requested.
  Stage only intended files and set `GIT_EDITOR=true` for commits.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for checks and
[internal/README.md](internal/README.md) for the package map. Operational features
and public API signatures require implementation work beyond the scaffold.
