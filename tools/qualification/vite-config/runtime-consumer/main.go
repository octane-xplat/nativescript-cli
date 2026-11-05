// Command runtime-consumer launches an already-built preset probe on the exact
// reserved simulator. Its caller owns boot, installation cleanup and guest life.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
)

type sample struct {
	Phase, Text, ClassName string
	Loaded, NativeView     bool
	Color                  []int
	MarginTop, MarginLeft  any
}
type health struct {
	Nonce, Boot, Phase, Failure string
	PID, Ticks, PhaseTicks      int
	Sample                      sample
	Snapshots                   []sample
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() (result error) {
	if len(os.Args) != 5 {
		return errors.New("usage: runtime-consumer APP BUILD_EVIDENCE_JSON EXACT_RESERVED_GUEST NEW_EVIDENCE_JSON")
	}
	app, buildFile, id, saved := os.Args[1], os.Args[2], os.Args[3], os.Args[4]
	if !filepath.IsAbs(app) || !filepath.IsAbs(buildFile) || !filepath.IsAbs(saved) || id == "" {
		return errors.New("absolute paths and exact guest required")
	}
	var built struct{ Build ns.BuildResult }
	data, err := os.ReadFile(buildFile)
	if err != nil || json.Unmarshal(data, &built) != nil || len(built.Build.Artifacts) != 1 {
		return errors.New("invalid completed Build evidence")
	}
	artifact := built.Build.Artifacts[0]
	if artifact.Identity.ProjectDir != app || artifact.Identity.Target.Platform != ns.IOS || artifact.Identity.Target.Configuration != ns.Debug {
		return errors.New("artifact does not identify this iOS debug probe")
	}
	var probe struct{ Nonce string }
	data, err = os.ReadFile(filepath.Join(app, "runtime-probe.json"))
	if err != nil || json.Unmarshal(data, &probe) != nil || probe.Nonce == "" {
		return errors.New("probe nonce missing")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	client, err := ns.New(ns.Options{})
	if err != nil {
		return err
	}
	target := artifact.Identity.Target
	target.Destination.ID = id
	session, err := client.Run(ctx, ns.RunRequest{Artifact: &artifact, DeviceID: id, Build: ns.BuildRequest{ProjectDir: app, OutputDir: filepath.Join(app, "state"), Target: target}})
	if err != nil {
		return err
	}
	evidence := map[string]any{"scope": "actual patched preset iOS debug guest, native style and renderer mount/update/unmount/remount; no HMR/full app/OTA/release claim", "device": id, "artifact": artifact}
	defer func() {
		closed := session.Close(context.Background())
		if errors.Is(closed, ns.ErrCleanup) || closed != nil && !errors.Is(closed, context.Canceled) {
			result = errors.Join(result, closed)
		}
		evidence["passed"] = result == nil
		if result != nil {
			evidence["failure"] = result.Error()
		}
		data, encodeErr := json.MarshalIndent(evidence, "", "  ")
		if encodeErr != nil {
			result = errors.Join(result, encodeErr)
			return
		}
		f, saveErr := os.OpenFile(saved, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if saveErr == nil {
			_, saveErr = f.Write(append(data, '\n'))
			saveErr = errors.Join(saveErr, f.Close())
		}
		result = errors.Join(result, saveErr)
	}()
	done := make(chan error, 1)
	go func() { done <- session.Wait() }()
	container, err := exec.CommandContext(ctx, "xcrun", "simctl", "get_app_container", id, artifact.ApplicationID, "data").Output()
	if err != nil {
		return err
	}
	file := filepath.Join(strings.TrimSpace(string(container)), "Documents/go-preset-health.json")
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	var first health
	for {
		select {
		case <-ctx.Done():
			return errors.New("native preset lifecycle/style observation expired")
		case err := <-done:
			return fmt.Errorf("native preset session exited before health: %v", err)
		case <-ticker.C:
			var h health
			data, err := os.ReadFile(file)
			if err != nil || json.Unmarshal(data, &h) != nil || h.Nonce != probe.Nonce {
				continue
			}
			evidence["lastObserved"] = h
			if h.Failure != "" {
				return errors.New("probe reported native lifecycle failure")
			}
			if h.PID <= 0 || h.Boot == "" {
				return errors.New("probe process identity missing")
			}
			if first.PID == 0 {
				first = h
				evidence["firstObserved"] = first
			}
			if h.PID != first.PID || h.Boot != first.Boot {
				return errors.New("probe restarted during lifecycle")
			}
			if h.Phase != "complete" || h.PhaseTicks < 8 || h.Ticks < first.Ticks+4 {
				continue
			}
			if len(h.Snapshots) != 4 {
				return errors.New("four native lifecycle snapshots required")
			}
			for i, phase := range []string{"mount", "update", "unmount", "remount"} {
				s := h.Snapshots[i]
				if s.Phase != phase {
					return errors.New("native lifecycle order differs")
				}
				if phase == "unmount" {
					if s.Loaded || s.NativeView || s.Text != "" {
						return errors.New("native view survived unmount")
					}
				} else if !s.Loaded || !s.NativeView || len(s.Color) != 3 || s.Color[0] != 18 || s.Color[1] != 52 || s.Color[2] != 86 || s.MarginTop != float64(13) || s.MarginLeft != float64(13) {
					return errors.New("Bamboo styles differ on native view")
				}
			}
			for range 2 {
				if err := session.Close(context.Background()); errors.Is(err, ns.ErrCleanup) || err != nil && !errors.Is(err, context.Canceled) {
					return err
				}
			}
			process, err := os.FindProcess(h.PID)
			if err != nil || process.Signal(syscall.Signal(0)) == nil {
				return errors.New("owned native process survived close")
			}
			evidence["ownedPIDRetired"] = true
			fmt.Println("PASS patched preset native health, Bamboo styles, renderer mount/update/unmount/remount and process retirement")
			return nil
		}
	}
}
