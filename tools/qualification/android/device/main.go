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
	"reflect"
	"strconv"
	"strings"
	"time"
)

func main() {
	cwd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	env := os.Environ()
	defer func() {
		now, err := os.Getwd()
		if err != nil || cwd != now || !reflect.DeepEqual(env, os.Environ()) {
			panic("global cwd/environment changed")
		}
	}()

	if err := run(); err != nil {
		for e := err; e != nil; e = errors.Unwrap(e) {
			fmt.Fprintf(os.Stderr, "%T: %v\n", e, e)
		}
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) != 3 && len(os.Args) != 4 {
		return fmt.Errorf("usage: device BUILD_RESULT_JSON EXACT_OWNED_SERIAL [NONCE]")
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
	firstTick, lastTick := 0, 0
	health := false
	binding := false
	for i := 0; i < 100; i++ {
		for _, l := range s.Logs() {

			health = health || strings.Contains(l.Text, "B2 fresh bundled application: b2-native-health")
			binding = binding || strings.Contains(l.Text, "B2 generated binding")
			if len(os.Args) == 4 {
				marker := "G3 health " + os.Args[3] + " tick="
				if _, tail, ok := strings.Cut(l.Text, marker); ok {
					fields := strings.Fields(tail)
					if len(fields) > 0 && strings.Contains(tail, "native=b2-native-health") {
						tick, _ := strconv.Atoi(fields[0])
						if firstTick == 0 {
							firstTick = tick
						}
						if tick > lastTick {
							lastTick = tick
						}
					}
				}
			}
		}
		if health && binding && (len(os.Args) == 3 || lastTick >= firstTick+8) {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !health || !binding || (len(os.Args) == 4 && (firstTick == 0 || lastTick < firstTick+8)) {
		return fmt.Errorf("runtime health missing: native=%v binding=%v ticks=%d..%d logs=%+v", health, binding, firstTick, lastTick, s.Logs())
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
	// A competing real public session must wait for ownership and cancel without touching this app.
	competing, end := context.WithTimeout(context.Background(), 250*time.Millisecond)
	other, conflict := c.Run(competing, r)
	end()
	if other != nil {
		other.Close(context.Background())
		return fmt.Errorf("competing session acquired owned serial")
	}
	if !errors.Is(conflict, context.DeadlineExceeded) {
		return fmt.Errorf("contention cancellation: %v", conflict)
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
	if e = s.Wait(); !errors.Is(e, context.Canceled) {
		return fmt.Errorf("Wait cleanup: %w", e)
	}
	mapping, e = adb("reverse", "--list")
	if e != nil || strings.Contains(mapping, "tcp:5173") {
		return fmt.Errorf("reverse cleanup failed: %s %v", mapping, e)
	}
	if pid, _ := adb("shell", "pidof", art.ApplicationID); strings.TrimSpace(pid) != "" {
		return fmt.Errorf("owned app remains: %s", pid)
	}
	fmt.Printf("G3 nonce health ticks=%d..%d; app PID absent; reverse absent; repeated Close canceled\n", firstTick, lastTick)
	fmt.Println("D2: actual install/launch/native health/binding/logs/cancellation completed")
	return nil
}
