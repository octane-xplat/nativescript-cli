# Built-in helper

`Host.Call` uses one F1-owned Node process per request. The request is a mode-0600
JSON file removed after process retirement, so payloads never become argv.
Stdout is newline-delimited JSON with protocol version 1 and payload version
0.1.0, a request ID, ordered events, and exactly one result or structured error.
The frame buffer limit is 16 MiB. Invalid framing or sink failure cancels the
owned tree; completion waits for descendant retirement. Cancellation uses F1
process cancellation, rather than a cooperative cancel frame which synchronous
parsers cannot service. Stderr and dependency exception text are not forwarded.
A handler may instead opt in a bounded, sanitized `detail` summary on its error
frame (10 lines/2 KiB), which adapters surface through `OperationError.Advice`.
Sinks run synchronously and must return; never call application sinks under a
workspace lease. This is a private helper, never the external extension protocol.

The immutable host supports independent concurrent calls. Each selected project
is explicit. App dependencies use `createRequire` rooted in that project; the
helper's editor dependencies are bundled. Host construction/import and native-only
operations perform no extraction or Node discovery. No installs occur at runtime.

Extraction hashes the payload and notices, uses a cache-local F2 identity, and
publishes an atomic generation. Interrupted extraction can be quarantined safely:
extraction never starts children. Existing payload corruption fails closed;
operators may select a fresh cache. Cache generations are retained, with no GC.
Windows returns the existing F1/F2 unavailable errors. Callers own cache location,
project paths and native preparation write leases. The editor round-trip operation
returns text without modifying the input; native graph changes remain P1-owned.

Add feature handlers in their owning bridge directory and register them explicitly
in `bridge/host/main.cjs`; J1 owns that registry and payload generation. Keep wire
and helper release versions independent from the external extension API/version.
Regenerate after any handler or dependency change:

```
bun install --frozen-lockfile
node tools/helper/generate.mjs
node tools/helper/generate.mjs --check
python3 tools/helper/external-consumer.py
```

The generator makes simple-plist's UMD require parameter non-shadowing so esbuild
can resolve its dependency closure. The synchronous Xcode parser is bundled;
async `xcode.parse` uses a worker file and is intentionally not exposed. All
runtime dependencies and their notices are committed in assets. Go consumers do
not run the generator. The external harness builds through a local module proxy
zip and an isolated module cache, then runs with a PATH containing only Node.
