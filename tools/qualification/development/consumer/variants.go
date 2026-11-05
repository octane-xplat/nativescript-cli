// One live iOS development session driven across config, entry and plugin
// native rebuilds. Each edit must retire only the current server/app and
// re-resolve inside the same public Run session.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
)

func runVariants(args []string) (result error) {
	if len(args) != 3 {
		return errors.New("usage: development-consumer variants-ios APP EXACT_SHUTDOWN_SIMULATOR EVIDENCE_JSON")
	}
	app, id, saved := args[0], args[1], args[2]
	if id != qualificationIOSUDID {
		return fmt.Errorf("qualification requires existing simulator %s; no substitution or creation", qualificationIOSUDID)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()
	cwd, _ := os.Getwd()
	env := os.Environ()
	writer, flags, prefix := log.Writer(), log.Flags(), log.Prefix()
	reservation := &reservation{device: id}
	var healthLocation atomic.Value
	var launches atomic.Int64
	evidence := map[string]any{"boundary": "real public-library iOS simulator development session across config, entry, plugin add/edit/remove native rebuilds; debug only; no Android/OTA/release/physical claim"}
	defer func() {
		result = errors.Join(result, reservation.cleanup())
		now, _ := os.Getwd()
		evidence["embeddingGlobalsPreserved"] = now == cwd && reflect.DeepEqual(env, os.Environ()) && log.Writer() == writer && log.Flags() == flags && log.Prefix() == prefix
		evidence["reservations"] = reservation.phases
		evidence["ownedBootRetired"] = !reservation.booted
		evidence["ownedInstallationRetired"] = !reservation.installationOwned
		evidence["passed"] = result == nil
		if result != nil {
			evidence["failure"] = result.Error()
		}
		data, _ := json.MarshalIndent(evidence, "", "  ")
		result = errors.Join(result, os.WriteFile(saved, append(data, '\n'), 0600))
		if result == nil {
			fmt.Println("PASS iOS development config, entry and plugin add/edit/remove rebuilds in one session")
		}
	}()
	client, err := ns.New(ns.Options{Sink: func(ctx context.Context, event ns.Event) error {
		fmt.Printf("EVENT %s %s\n", event.Stage, event.Kind)
		if event.Stage == "launch" && event.Kind == ns.StageCompleted {
			launches.Add(1)
			container, err := exec.CommandContext(ctx, "xcrun", "simctl", "get_app_container", id, developmentAppID, "data").Output()
			if err != nil {
				return err
			}
			path := strings.TrimSpace(string(container))
			if !filepath.IsAbs(path) {
				return errors.New("invalid owned app container")
			}
			healthLocation.Store(filepath.Join(path, "Documents/go-dev-health.json"))
		}
		if event.Stage == "native" {
			if event.Kind == ns.StageStarted {
				return reservation.acquire(ctx, false)
			}
			if event.Kind == ns.StageCompleted {
				return reservation.acquire(ctx, true)
			}
		}
		return nil
	}})
	if err != nil {
		return err
	}
	devices, err := client.Devices(ctx, ns.DeviceQuery{Platform: ns.IOS})
	if err != nil {
		return err
	}
	shutdown := false
	for _, device := range devices {
		if device.ID == id && device.State == "Shutdown" {
			shutdown = true
		}
	}
	if !shutdown {
		return errors.New("exact simulator must initially be shutdown")
	}
	request := ns.RunRequest{Development: &ns.DevelopmentOptions{}, DeviceID: id, Build: ns.BuildRequest{
		ProjectDir: app, OutputDir: filepath.Join(app, "state"), Target: ns.Target{Platform: ns.IOS, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: id, Architecture: "arm64"}}, IOS: ns.IOSBuildOptions{SigningMode: "disabled"}}}
	session, err := client.Run(ctx, request)
	if err != nil {
		var operation *ns.OperationError
		if errors.As(err, &operation) {
			return fmt.Errorf("public development Run: %w; cause=%v", err, operation.Cause)
		}
		return err
	}
	defer func() {
		if closed := session.Close(context.Background()); closed != nil && !errors.Is(closed, context.Canceled) {
			result = errors.Join(result, closed)
		}
		evidence["logs"] = session.Logs()
	}()
	done := make(chan error, 1)
	go func() { done <- session.Wait() }()
	nonce, err := os.ReadFile(filepath.Join(app, "nonce"))
	if err != nil {
		return err
	}
	observe := func(timeout time.Duration, predicate func(health) bool) (health, error) {
		deadline := time.NewTimer(timeout)
		defer deadline.Stop()
		tick := time.NewTicker(250 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case err := <-done:
				return health{}, fmt.Errorf("session exited: %v; logs=%+v", err, session.Logs())
			case <-deadline.C:
				return health{}, fmt.Errorf("health observation expired; logs=%+v", session.Logs())
			case <-ctx.Done():
				return health{}, ctx.Err()
			case <-tick.C:
				path, _ := healthLocation.Load().(string)
				var h health
				data, err := os.ReadFile(path)
				if err == nil && json.Unmarshal(data, &h) == nil && h.Nonce == string(nonce) && h.PID > 0 {
					evidence["lastObserved"] = h
					if predicate(h) {
						return h, nil
					}
				}
			}
		}
	}
	type generation struct {
		health   health
		endpoint string
		launches int64
	}
	var pids []int
	var steps []map[string]any
	// await waits for a new live generation (new PID and boot) matching the
	// step's predicate, then proves the previous generation retired.
	await := func(name string, prev *generation, predicate func(health) bool) (generation, error) {
		h, err := observe(4*time.Minute, func(h health) bool {
			return (prev == nil || (h.PID != prev.health.PID && h.Boot != prev.health.Boot)) && h.Ticks >= 2 && predicate(h)
		})
		if err != nil {
			return generation{}, fmt.Errorf("%s: %w", name, err)
		}
		pids = append(pids, h.PID)
		if prev != nil {
			if process, err := os.FindProcess(prev.health.PID); err == nil && process.Signal(syscall.Signal(0)) == nil {
				return generation{}, fmt.Errorf("%s: previous generation PID %d survived", name, prev.health.PID)
			}
		}
		endpoint := session.DevelopmentEndpoint().URL
		if endpoint == "" || prev != nil && endpoint == prev.endpoint {
			return generation{}, fmt.Errorf("%s: development endpoint did not advance", name)
		}
		count := launches.Load()
		if prev != nil && count <= prev.launches {
			return generation{}, fmt.Errorf("%s: launch-completed events did not increase", name)
		}
		current := generation{h, endpoint, count}
		steps = append(steps, map[string]any{"name": name, "health": h, "endpoint": endpoint, "launches": count})
		fmt.Printf("HEALTH %s pid=%d ticks=%d entry=%s probe=%v launches=%d\n", name, h.PID, h.Ticks, h.Entry, h.NativeProbe, count)
		return current, nil
	}
	probeIs := func(want *int) func(health) bool {
		return func(h health) bool {
			return (h.NativeProbe == nil) == (want == nil) && (want == nil || *h.NativeProbe == *want)
		}
	}
	// 0. Initial generation.
	current, err := await("initial", nil, func(h health) bool { return h.Token == "G5_INITIAL" && h.Entry == "app" && h.NativeProbe == nil })
	if err != nil {
		return err
	}
	// 1. Configuration edit.
	configPath := filepath.Join(app, "nativescript.config.ts")
	config, err := os.ReadFile(configPath)
	if err != nil {
		return err
	}
	if !strings.HasSuffix(strings.TrimSpace(string(config)), "};") {
		return errors.New("unexpected nativescript.config.ts shape")
	}
	if err := os.WriteFile(configPath, []byte(strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(string(config)), "};"))+"\n  ios: {},\n};\n"), 0600); err != nil {
		return err
	}
	current, err = await("config", &current, func(h health) bool { return h.Entry == "app" && h.NativeProbe == nil })
	if err != nil {
		return err
	}
	// 2. Entry module edit: same nonce, different entry name, package main moves.
	entrySource, err := os.ReadFile(filepath.Join(app, "app/app.ts"))
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(app, "app/entry2.ts"), []byte(strings.Replace(string(entrySource), "const entryName = 'app';", "const entryName = 'entry2';", 1)), 0600); err != nil {
		return err
	}
	manifestPath := filepath.Join(app, "package.json")
	var manifest map[string]any
	data, err := os.ReadFile(manifestPath)
	if err != nil || json.Unmarshal(data, &manifest) != nil || manifest["main"] != "app/app.ts" {
		return errors.New("unexpected package.json main")
	}
	manifest["main"] = "app/entry2.ts"
	encoded, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(manifestPath, append(encoded, '\n'), 0600); err != nil {
		return err
	}
	current, err = await("entry", &current, func(h health) bool { return h.Entry == "entry2" && h.NativeProbe == nil })
	if err != nil {
		return err
	}
	// 3. Plugin add.
	plugin := filepath.Join(app, "fixture-native", "devprobe")
	if err := os.MkdirAll(filepath.Join(plugin, "src"), 0700); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(plugin, "package.json"), []byte(`{"name":"dev-native-probe","version":"1.0.0","main":"index.js","nativescript":{"platforms":{"ios":"9.1.0"}}}`+"\n"), 0600); err != nil {
		return err
	}
	// The engine's vendor pass imports every dependency: owned JS entry required.
	if err := os.WriteFile(filepath.Join(plugin, "index.js"), []byte("// dev-native-probe owned fixture entry\nmodule.exports = {};\n"), 0600); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(plugin, "nativescript.config.cjs"), []byte(`module.exports={"ios":{"NativeSource":[{"name":"Bridge","path":"src/*.swift"}]}};`+"\n"), 0600); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(plugin, "src", "Bridge.swift"), []byte("import Foundation\n@objc(DevNativeProbe) public final class DevNativeProbe: NSObject { @objc public static func answer() -> Int32 { 333 } }\n"), 0600); err != nil {
		return err
	}
	add := exec.Command("bun", "add", "--offline", "--ignore-scripts", "./fixture-native/devprobe")
	add.Dir = app
	if out, err := add.CombinedOutput(); err != nil {
		return fmt.Errorf("bun add fixture plugin: %w: %s", err, out)
	}
	want333 := 333
	current, err = await("plugin-add", &current, func(h health) bool { return h.Entry == "entry2" && probeIs(&want333)(h) })
	if err != nil {
		return err
	}
	// 4. Installed plugin native edit, never outside APP.
	owner := filepath.Join(app, "node_modules", "dev-native-probe")
	resolved, err := filepath.EvalSymlinks(owner)
	if err != nil {
		return fmt.Errorf("installed fixture plugin missing: %w", err)
	}
	if !strings.HasPrefix(resolved+string(filepath.Separator), filepath.Clean(app)+string(filepath.Separator)) {
		return fmt.Errorf("installed fixture plugin resolves outside APP: %s", resolved)
	}
	linked, err := filepath.EvalSymlinks(filepath.Join(owner, "src", "Bridge.swift"))
	if err != nil || !strings.HasPrefix(linked+string(filepath.Separator), resolved+string(filepath.Separator)) {
		return fmt.Errorf("fixture plugin source does not resolve inside the package: %v %s", err, linked)
	}
	evidence["installedPluginResolved"] = map[string]string{"owner": owner, "resolved": resolved, "installKind": map[bool]string{true: "symlink", false: "copy"}[resolved != filepath.Clean(owner)]}
	bridge := []byte("import Foundation\n@objc(DevNativeProbe) public final class DevNativeProbe: NSObject { @objc public static func answer() -> Int32 { 444 } }\n")
	scratch := linked + ".variant-tmp"
	if err := os.WriteFile(scratch, bridge, 0600); err != nil {
		return err
	}
	if err := os.Rename(scratch, linked); err != nil {
		return err
	}
	want444 := 444
	current, err = await("plugin-edit", &current, func(h health) bool { return h.Entry == "entry2" && probeIs(&want444)(h) })
	if err != nil {
		return err
	}
	// 5. Plugin remove.
	remove := exec.Command("bun", "remove", "dev-native-probe")
	remove.Dir = app
	if out, err := remove.CombinedOutput(); err != nil {
		return fmt.Errorf("bun remove fixture plugin: %w: %s", err, out)
	}
	current, err = await("plugin-remove", &current, func(h health) bool { return h.Entry == "entry2" && h.NativeProbe == nil })
	if err != nil {
		return err
	}
	evidence["steps"] = steps
	// 6. Close retires every generation.
	for range 2 {
		if err := session.Close(context.Background()); !errors.Is(err, context.Canceled) {
			return fmt.Errorf("unexpected Close result: %v", err)
		}
	}
	for _, pid := range pids {
		if process, err := os.FindProcess(pid); err == nil && process.Signal(syscall.Signal(0)) == nil {
			return fmt.Errorf("owned app PID %d survived close", pid)
		}
	}
	if err := assertNoSimulatorLogReaders(pids...); err != nil {
		return err
	}
	evidence["ownedLogReadersRetired"] = true
	evidence["ownedPIDRetired"] = true
	return nil
}
