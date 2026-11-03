// The caller reserves and boots its exact owned AVD before invoking this harness.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	ns "github.com/octane-xplat/nativescript-cli"
	"os"
	"os/exec"
	"strings"
	"time"
)

func main() {
	if err := run(); err != nil {
		for e := err; e != nil; e = errors.Unwrap(e) {
			fmt.Fprintf(os.Stderr, "%T: %v\n", e, e)
		}
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) != 3 {
		return fmt.Errorf("usage: device BUILD_RESULT_JSON EXACT_OWNED_SERIAL")
	}
	b, e := os.ReadFile(os.Args[1])
	if e != nil {
		return e
	}
	var built ns.BuildResult
	if e = json.Unmarshal(b, &built); e != nil {
		return e
	}
	if len(built.Artifacts) != 1 {
		return fmt.Errorf("expected one APK")
	}
	art := built.Artifacts[0]
	serial := os.Args[2]
	c, _ := ns.New(ns.Options{})
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	ds, e := c.Devices(ctx, ns.DeviceQuery{Platform: ns.Android})
	if e != nil {
		return e
	}
	var d ns.Device
	for _, v := range ds {
		if v.ID == serial {
			d = v
		}
	}
	if d.Kind != ns.Simulator || d.State != "device" {
		return fmt.Errorf("exact owned emulator unavailable: %s", serial)
	}
	target := art.Identity.Target
	target.Destination = ns.Destination{Kind: d.Kind, ID: d.ID, Architecture: d.Architecture}
	r := ns.RunRequest{Artifact: &art, DeviceID: serial, Build: ns.BuildRequest{ProjectDir: art.Identity.ProjectDir, OutputDir: os.TempDir(), Target: target}, AndroidReverse: []ns.AndroidReverse{{DevicePort: 5173, HostPort: 5173}}}
	s, e := c.Run(ctx, r)
	if e != nil {
		return e
	}
	defer s.Close(context.Background())
	health := false
	binding := false
	for i := 0; i < 100; i++ {
		for _, l := range s.Logs() {

			health = health || strings.Contains(l.Text, "B2 fresh bundled application: b2-native-health")
			binding = binding || strings.Contains(l.Text, "B2 generated binding")
		}
		if health && binding {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !health || !binding {
		return fmt.Errorf("runtime health missing: native=%v binding=%v", health, binding)
	}
	for _, l := range s.Logs() {
		fmt.Print(l.Text)
	}
	adb := func(args ...string) (string, error) {
		b, e := exec.CommandContext(context.Background(), "adb", append([]string{"-s", serial}, args...)...).CombinedOutput()
		return string(b), e
	}
	mapping, e := adb("reverse", "--list")
	if e != nil || !strings.Contains(mapping, "tcp:5173 tcp:5173") {
		return fmt.Errorf("owned reverse missing: %s %v", mapping, e)
	}
	time.Sleep(2 * time.Second)
	if _, e = adb("shell", "pidof", art.ApplicationID); e != nil {
		return fmt.Errorf("app died after health: %w", e)
	}
	cancel()
	if e = s.Close(context.Background()); !errors.Is(e, context.Canceled) {
		return fmt.Errorf("cancel cleanup: %w", e)
	}
	if e = s.Close(context.Background()); !errors.Is(e, context.Canceled) {
		return fmt.Errorf("repeat close: %w", e)
	}
	mapping, e = adb("reverse", "--list")
	if e != nil || strings.Contains(mapping, "tcp:5173") {
		return fmt.Errorf("reverse cleanup failed: %s %v", mapping, e)
	}
	if pid, _ := adb("shell", "pidof", art.ApplicationID); strings.TrimSpace(pid) != "" {
		return fmt.Errorf("owned app remains: %s", pid)
	}
	fmt.Println("D2: actual install/launch/native health/binding/logs/cancellation completed")
	return nil
}
