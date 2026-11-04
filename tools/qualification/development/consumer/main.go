// Real iOS simulator HMR qualification through the public library. The observer
// hands host reservations between compilation and device phases; no native
// platform or private workflow packages are imported.
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

type reservation struct {
	id                string
	device            string
	phases            []map[string]string
	booted            bool
	installationOwned bool
}

func (r *reservation) release() error {
	if r.id == "" {
		return nil
	}
	if r.booted {
		if out, err := exec.Command("xcrun", "simctl", "shutdown", r.device).CombinedOutput(); err != nil {
			return fmt.Errorf("owned simulator shutdown failed: %w: %s", err, out)
		}
		r.booted = false
		r.phases = append(r.phases, map[string]string{"action": "shutdown", "device": r.device})
	}
	out, err := exec.Command("goddard-agent", "resource", "release", r.id, "--output", "json").CombinedOutput()
	if err != nil {
		return fmt.Errorf("resource release failed: %w: %s", err, out)
	}
	r.phases = append(r.phases, map[string]string{"action": "release", "id": r.id})
	r.id = ""
	return nil
}
func (r *reservation) acquire(ctx context.Context, device bool) error {
	if err := r.release(); err != nil {
		return err
	}
	resources := map[string]any{"native_builds": 1}
	purpose := "public native development compilation"
	if device {
		resources = map[string]any{"exclusive": []string{"ios:" + r.device}, "resident_devices": 1}
		purpose = "public native development simulator HMR"
	}
	data, _ := json.Marshal(map[string]any{"resources": resources, "purpose": purpose})
	out, err := exec.CommandContext(ctx, "goddard-agent", "resource", "acquire", "--json", string(data), "--output", "json").CombinedOutput()
	if err != nil {
		return fmt.Errorf("resource acquisition failed: %w: %s", err, out)
	}
	var result struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(out, &result) != nil || result.ID == "" {
		return fmt.Errorf("invalid resource result: %s", out)
	}
	r.id = result.ID
	r.phases = append(r.phases, map[string]string{"action": "acquire", "id": r.id, "purpose": purpose})
	if device {
		if out, err := exec.CommandContext(ctx, "xcrun", "simctl", "boot", r.device).CombinedOutput(); err != nil {
			return fmt.Errorf("owned boot failed: %w: %s", err, out)
		}
		r.booted = true
		if out, err := exec.CommandContext(ctx, "xcrun", "simctl", "bootstatus", r.device, "-b").CombinedOutput(); err != nil {
			return fmt.Errorf("owned boot readiness failed: %w: %s", err, out)
		}
		if !r.installationOwned {
			if _, err := exec.Command("xcrun", "simctl", "get_app_container", r.device, "org.example.godevelopment", "app").Output(); err == nil {
				return errors.New("refusing an existing fixture app installation")
			}
			r.installationOwned = true
		}
	}
	return nil
}

func (r *reservation) cleanup() error {
	var err error
	if r.installationOwned && !r.booted {
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		err = r.acquire(ctx, true)
		cancel()
		if err != nil {
			return errors.Join(err, r.release())
		}
	}
	if r.booted && r.installationOwned {
		if _, present := exec.Command("xcrun", "simctl", "get_app_container", r.device, "org.example.godevelopment", "app").Output(); present == nil {
			out, uninstall := exec.Command("xcrun", "simctl", "uninstall", r.device, "org.example.godevelopment").CombinedOutput()
			if uninstall != nil {
				err = fmt.Errorf("owned app uninstall failed: %w: %s", uninstall, out)
			} else {
				r.phases = append(r.phases, map[string]string{"action": "uninstall", "app": "org.example.godevelopment"})
			}
		}
	}
	return errors.Join(err, r.release())
}

type health struct {
	Nonce, Boot, Token                                                             string
	Ticks, PID, HotUpdates                                                         int
	HotAvailable, BootComplete, FullSocketReady, FallbackSocketReady, HasWebSocket bool
	AcceptAdapterReady                                                             bool
	DependencyAcceptors                                                            int
	NativeResourceRevision                                                         int
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() (result error) {
	if len(os.Args) > 1 && os.Args[1] == "android" {
		return runAndroid(os.Args[2:])
	}
	if len(os.Args) != 4 {
		return errors.New("usage: development-consumer APP EXACT_SHUTDOWN_SIMULATOR EVIDENCE_JSON")
	}
	app, id, saved := os.Args[1], os.Args[2], os.Args[3]
	signalContext, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()
	ctx, cancel := context.WithTimeout(signalContext, 15*time.Minute)
	defer cancel()
	cwd, _ := os.Getwd()
	env := os.Environ()
	writer, flags, prefix := log.Writer(), log.Flags(), log.Prefix()
	reservation := &reservation{device: id}
	var healthLocation atomic.Value
	evidence := map[string]any{"boundary": "real public-library iOS development startup/HMR; no OTA/release/physical claim"}
	defer func() {
		result = errors.Join(result, reservation.cleanup())
		now, _ := os.Getwd()
		evidence["embeddingGlobalsPreserved"] = now == cwd && reflect.DeepEqual(env, os.Environ()) && log.Writer() == writer && log.Flags() == flags && log.Prefix() == prefix
		evidence["reservations"] = reservation.phases
		evidence["ownedBootRetired"] = !reservation.booted
		evidence["passed"] = result == nil
		if result != nil {
			evidence["failure"] = result.Error()
		}
		data, _ := json.MarshalIndent(evidence, "", "  ")
		result = errors.Join(result, os.WriteFile(saved, append(data, '\n'), 0600))
	}()
	client, err := ns.New(ns.Options{Sink: func(ctx context.Context, event ns.Event) error {
		fmt.Printf("EVENT %s %s\n", event.Stage, event.Kind)
		if event.Stage == "launch" && event.Kind == ns.StageCompleted {
			container, err := exec.CommandContext(ctx, "xcrun", "simctl", "get_app_container", id, "org.example.godevelopment", "data").Output()
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
		closed := session.Close(context.Background())
		if closed != nil && !errors.Is(closed, context.Canceled) {
			result = errors.Join(result, closed)
		}
		evidence["logs"] = session.Logs()
	}()
	done := make(chan error, 1)
	go func() { done <- session.Wait() }()
	evidence["endpoint"] = session.DevelopmentEndpoint()
	nonce, err := os.ReadFile(filepath.Join(app, "nonce"))
	if err != nil {
		return err
	}
	observe := func(timeout time.Duration, predicate func(health) bool) (health, error) {
		deadline := time.NewTimer(timeout)
		defer deadline.Stop()
		tick := time.NewTicker(100 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case err := <-done:
				return health{}, fmt.Errorf("app/session exited: %v; logs=%+v", err, session.Logs())
			case <-deadline.C:
				return health{}, fmt.Errorf("health observation expired; logs=%+v", session.Logs())
			case <-ctx.Done():
				return health{}, ctx.Err()
			case <-tick.C:
				var h health
				path, _ := healthLocation.Load().(string)
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
	first, err := observe(60*time.Second, func(h health) bool { return h.Token == "G5_INITIAL" && h.Ticks >= 2 })
	if err != nil {
		return err
	}
	evidence["initial"] = first
	fmt.Printf("HEALTH initial pid=%d ticks=%d hot=%t bootComplete=%t fullSocket=%t\n", first.PID, first.Ticks, first.HotAvailable, first.BootComplete, first.FullSocketReady)
	process, err := os.FindProcess(first.PID)
	if err != nil {
		return err
	}
	if err := process.Signal(syscall.Signal(0)); err != nil {
		return err
	}
	last, err := observe(60*time.Second, func(h health) bool { return h.Ticks >= first.Ticks+8 && h.PID == first.PID && h.Boot == first.Boot })
	if err != nil {
		return err
	}
	evidence["progression"] = last
	fmt.Printf("HEALTH progression pid=%d ticks=%d\n", last.PID, last.Ticks)
	if err := os.WriteFile(filepath.Join(app, "app/value.ts"), []byte("export const token = 'G5_HOT';\n"), 0600); err != nil {
		return err
	}
	hot, err := observe(60*time.Second, func(h health) bool { return h.Token == "G5_HOT" && h.HotUpdates >= 1 })
	if err != nil {
		return err
	}
	if hot.PID != first.PID || hot.Boot != first.Boot || hot.Ticks <= last.Ticks {
		return errors.New("hot update replaced process/boot or lost heartbeat continuity")
	}
	evidence["hotUpdate"] = hot
	fmt.Printf("HEALTH hot update pid=%d ticks=%d updates=%d\n", hot.PID, hot.Ticks, hot.HotUpdates)
	firstEndpoint := session.DevelopmentEndpoint()
	if err := os.WriteFile(filepath.Join(app, "App_Resources/iOS/qualification.json"), []byte(`{"revision":2}`), 0600); err != nil {
		return err
	}
	rebuilt, err := observe(4*time.Minute, func(h health) bool {
		return h.PID != first.PID && h.NativeResourceRevision == 2 && h.Token == "G5_HOT" && h.Ticks >= 2
	})
	if err != nil {
		return err
	}
	if rebuilt.Boot == first.Boot || session.DevelopmentEndpoint().URL == firstEndpoint.URL {
		return errors.New("native resource edit did not replace the dev generation")
	}
	if process.Signal(syscall.Signal(0)) == nil {
		return errors.New("old app PID survived native rebuild")
	}
	evidence["nativeRebuild"] = rebuilt
	fmt.Printf("HEALTH native rebuild pid=%d ticks=%d resource=%d\n", rebuilt.PID, rebuilt.Ticks, rebuilt.NativeResourceRevision)
	for range 2 {
		err := session.Close(context.Background())
		if !errors.Is(err, context.Canceled) {
			return fmt.Errorf("unexpected Close result: %v", err)
		}
	}
	rebuiltProcess, err := os.FindProcess(rebuilt.PID)
	if err != nil {
		return err
	}
	if rebuiltProcess.Signal(syscall.Signal(0)) == nil {
		return errors.New("owned app PID survived close")
	}
	evidence["ownedPIDRetired"] = true
	devices, err = client.Devices(context.Background(), ns.DeviceQuery{Platform: ns.IOS})
	if err != nil {
		return err
	}
	for _, device := range devices {
		if device.ID == id {
			evidence["stateBeforeHarnessCleanup"] = device.State
		}
	}
	fmt.Println("PASS real public iOS development startup, same-process HMR and owned cancellation")
	return nil
}
