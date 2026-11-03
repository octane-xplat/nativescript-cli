package nativescript_test

import (
	"context"
	"encoding/json"
	"errors"
	ns "github.com/octane-xplat/nativescript-cli"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

// Requires an exact task-owned simulator reservation. No compilation occurs here.
func TestOwnedAppleSimulatorSession(t *testing.T) {
	id, path := os.Getenv("D1_SIMULATOR_ID"), os.Getenv("D1_APP_PATH")
	if id == "" || path == "" {
		t.Skip("requires owned simulator reservation and real B1 application")
	}
	root := t.TempDir()
	target := ns.Target{Platform: ns.IOS, Configuration: ns.Debug, Destination: ns.Destination{ID: id, Kind: ns.Simulator, Architecture: "arm64"}}
	var artifact ns.Artifact
	data, err := os.ReadFile(filepath.Join(filepath.Dir(path), "artifact.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &artifact); err != nil {
		t.Fatal(err)
	}
	if artifact.Path != path {
		t.Fatal("artifact path differs")
	}
	target.Configuration = artifact.Identity.Target.Configuration
	client, _ := ns.New(ns.Options{})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	session, err := client.Run(ctx, ns.RunRequest{Build: ns.BuildRequest{ProjectDir: root, OutputDir: filepath.Join(root, "state"), Target: target}, DeviceID: id, Artifact: &artifact, AllowBoot: true})
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close(context.Background())
	deadline := time.Now().Add(40 * time.Second)
	found := false
	for time.Now().Before(deadline) {
		for _, log := range session.Logs() {
			if strings.Contains(log.Text, "B1 bundled startup") {
				found = true
			}
		}
		if found {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !found {
		t.Fatalf("runtime startup absent: %+v", session.Logs())
	}
	// Startup marker must be followed by a live console, not an immediate crash.
	done := make(chan error, 1)
	go func() { done <- session.Wait() }()
	select {
	case err := <-done:
		t.Fatalf("app exited: %v logs %+v", err, session.Logs())
	case <-time.After(2 * time.Second):
	}
	pid := 0
	for _, log := range session.Logs() {
		for _, line := range strings.Split(log.Text, "\n") {
			if strings.HasPrefix(line, artifact.ApplicationID+": ") {
				pid, _ = strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, artifact.ApplicationID+": ")))
			}
		}
	}
	if pid <= 0 {
		t.Fatal("missing owned application PID")
	}
	application, err := os.FindProcess(pid)
	if err != nil {
		t.Fatal(err)
	}
	if err = application.Signal(syscall.Signal(0)); err != nil {
		t.Fatalf("owned simulator app PID %d not alive: %v; console: %+v", pid, err, session.Logs())
	}
	if err = session.Close(context.Background()); err != nil && !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if err = session.Close(context.Background()); err != nil && !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	devices, err := client.Devices(context.Background(), ns.DeviceQuery{Platform: ns.IOS})
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range devices {
		if d.ID == id && d.State != "Shutdown" {
			t.Fatalf("owned simulator not shut down: %s", d.State)
		}
	}
	t.Log("actual B1 app installed; JS startup logged; session alive; repeated Close retired app/log files and owned boot")
}
