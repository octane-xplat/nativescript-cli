# Full consumer CLI edit-cycle qualification

`cli-cycle.py` runs the built darwin/arm64 `xplat` executable against the full
`apps/mobile` application in an explicitly selected isolated worktree. It uses
only the prescribed iOS simulator; it never creates/clones devices or captures
images. Initialize the pinned backend submodule, install frozen dependencies,
build the project Vite packages and build the Go CLI before running it.

Run from this repository under one reservation covering compilation and the
retained simulator: their lifetimes overlap during the active native edit cycle.
Use a new report directory for each attempt.

```sh
goddard-agent resource run --json '{"resources":{"native_builds":1,"exclusive":["ios:91D40099-A056-497D-A572-ADDDFD6A8F23"],"resident_devices":1},"purpose":"full consumer restart edit cycle"}' -- \
  python3 -B tools/qualification/restart/cli-cycle.py \
  --consumer /absolute/path/to/isolated/octane-xplat \
  --report /absolute/path/to/new-report --mode restart
```

`--mode hmr` tests in-process HMR instead. `--startup-timeout 600` permits a
longer cold entry load for the monorepo; live source-edit HMR remains bounded
at90 seconds. Deadlines do not waive heartbeat or ownership requirements.

The initial app, edited source and native-resource rebuild each need three
marker samples from the exact live process. Restart source edits must produce a
new PID without another native compile. HMR source edits must keep the PID and
compile count. The native edit must compile and launch a fresh process in either
mode. The driver records progress, counters, observed container paths, elapsed
times and the executable's source inventory. A sync/launch message alone cannot
pass runtime acceptance. `cli_output_test.py` checks actual target prefixes,
fragmented JSON and rejection of source-text/old-process marker evidence.

The driver refuses pre-existing edits and a pre-existing probe installation.
It restores only byte-matching owned edits, stops the CLI, verifies app-process
retirement, uninstalls its own app and shuts down its owned boot. In-session
installation absence is verified; it is not a promise about later simulator
registration caching. If a subsequent boot reports the known task app again,
inspect its exact recorded container before cleanup; never delete another app
or erase a device to bypass this guard.

These probes qualify CLI/library lifecycle behavior, not every UI assertion in
the application's parity harness, release signing or public OTA behavior.
An attempted HMR cycle that times out remains unqualified, even if launch and
native compilation completed. Raw logs and result files belong in the external
report directory, not Git.
