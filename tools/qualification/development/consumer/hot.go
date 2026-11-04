package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
)

func hasAcceptFailureLog(logs []ns.SessionLog) bool {
	for _, entry := range logs {
		if strings.Contains(entry.Text, "[xplat-hmr] Native accept callback failed; update was not completed") {
			return true
		}
	}
	return false
}

func assertNoSimulatorLogReaders(pids ...int) error {
	deadline := time.Now().Add(5 * time.Second)
	for {
		output, err := exec.Command("ps", "-axo", "command=").Output()
		if err != nil {
			return err
		}
		found := false
		for _, line := range strings.Split(string(output), "\n") {
			for _, pid := range pids {
				found = found || (strings.Contains(line, "log stream") && strings.Contains(line, "processIdentifier == "+strconv.Itoa(pid)))
			}
		}
		if !found {
			return nil
		}
		if time.Now().After(deadline) {
			return errors.New("owned simulator unified log reader survived session Close")
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// Queue a second save while the first async accept is unresolved, then reject
// one callback and recover. Every success, failure and quiet interval must keep
// the original process/boot and deterministic callback counts.
func verifyHotLifecycle(app string, first, previous health, observe func(time.Duration, func(health) bool) (health, error)) (map[string]health, error) {
	results := map[string]health{}
	write := func(token string) error {
		return os.WriteFile(filepath.Join(app, "app/value.ts"), []byte(fmt.Sprintf("export const token = '%s';\n", token)), 0600)
	}
	wait := func(predicate func(health) bool) (health, error) {
		h, err := observe(time.Minute, predicate)
		if err == nil && (h.PID != first.PID || h.Boot != first.Boot || h.Ticks <= previous.Ticks) {
			err = errors.New("hot callback lost process/boot or heartbeat continuity")
		}
		return h, err
	}
	if err := write("G5_HOT"); err != nil {
		return results, err
	}
	if _, err := wait(func(h health) bool { return h.HotPending == 1 }); err != nil {
		return results, err
	}
	if err := write("G5_QUEUED"); err != nil {
		return results, err
	}
	hot, err := wait(func(h health) bool { return h.Token == "G5_HOT" && h.HotUpdates == 1 })
	if err != nil {
		return results, err
	}
	results["hotUpdate"] = hot
	queued, err := wait(func(h health) bool { return h.Token == "G5_QUEUED" && h.HotUpdates >= 2 && h.HotPending == 0 })
	if err != nil {
		return results, err
	}
	quiet, err := wait(func(h health) bool { return h.Ticks >= queued.Ticks+8 })
	if err != nil {
		return results, err
	}
	if quiet.HotUpdates != 2 || quiet.MaxHotPending != 1 || quiet.HotFailures != 0 || !reflect.DeepEqual(quiet.HotTokens, []string{"G5_HOT", "G5_QUEUED"}) {
		return results, fmt.Errorf("native hot callbacks duplicated or overlapped: %+v", quiet)
	}
	results["queuedHotUpdate"] = quiet
	if err := write("G5_REJECT"); err != nil {
		return results, err
	}
	rejected, err := wait(func(h health) bool { return h.HotFailures == 1 && h.HotPending == 0 })
	if err != nil {
		return results, err
	}
	if rejected.Token != "G5_QUEUED" || rejected.HotUpdates != 2 {
		return results, errors.New("rejected hot callback was reported as a successful application")
	}
	results["rejectedHotUpdate"] = rejected
	if err := write("G5_RECOVERED"); err != nil {
		return results, err
	}
	recovered, err := wait(func(h health) bool { return h.Token == "G5_RECOVERED" && h.HotUpdates >= 3 && h.HotPending == 0 })
	if err != nil {
		return results, err
	}
	quiet, err = wait(func(h health) bool { return h.Ticks >= recovered.Ticks+8 })
	if err != nil {
		return results, err
	}
	if quiet.HotUpdates != 3 || quiet.MaxHotPending != 1 || quiet.HotFailures != 1 || !reflect.DeepEqual(quiet.HotTokens, []string{"G5_HOT", "G5_QUEUED", "G5_RECOVERED"}) {
		return results, fmt.Errorf("hot callback recovery did not settle deterministically: %+v", quiet)
	}
	results["recoveredHotUpdate"] = quiet
	fmt.Printf("HEALTH async hot callbacks pid=%d ticks=%d updates=%d failures=%d maxConcurrent=%d\n", quiet.PID, quiet.Ticks, quiet.HotUpdates, quiet.HotFailures, quiet.MaxHotPending)
	return results, nil
}
