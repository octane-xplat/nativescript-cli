// An external consumer: only the public library is imported.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	ns "github.com/octane-xplat/nativescript-cli"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"time"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func main() {
	if len(os.Args) != 5 {
		panic("usage: consumer build|run APP_ROOT ARTIFACT_JSON generic|SIMULATOR_ID")
	}
	mode, root, saved, id := os.Args[1], os.Args[2], os.Args[3], os.Args[4]
	cwd, err := os.Getwd()
	must(err)
	env := os.Environ()
	defer func() {
		now, e := os.Getwd()
		must(e)
		if now != cwd || !reflect.DeepEqual(env, os.Environ()) {
			panic("global cwd/environment changed")
		}
	}()
	client, err := ns.New(ns.Options{})
	must(err)
	target := ns.Target{Platform: ns.IOS, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: id, Architecture: "arm64"}}
	req := ns.BuildRequest{ProjectDir: root, OutputDir: filepath.Join(root, "state"), Target: target}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()
	if mode == "build" {
		_, err := os.Stat(filepath.Join(root, "state"))
		if !errors.Is(err, os.ErrNotExist) {
			panic("generated state already exists")
		}
		result, err := client.Build(ctx, req)
		must(err)
		if len(result.Artifacts) != 1 {
			panic("expected one app")
		}
		a := result.Artifacts[0]
		if a.Kind != "app" || a.ApplicationID != "org.example.g2qualification" || a.Identity.Revision == "" {
			panic("bad artifact identity")
		}
		b, err := json.Marshal(a)
		must(err)
		must(os.WriteFile(saved, b, 0600))
		fmt.Printf("G2 public Build passed: %+v\n", a)
		return
	}
	if mode != "run" {
		panic("invalid mode")
	}
	var a ns.Artifact
	b, err := os.ReadFile(saved)
	must(err)
	must(json.Unmarshal(b, &a))
	devicesBefore, err := client.Devices(ctx, ns.DeviceQuery{Platform: ns.IOS})
	must(err)
	shutdown := false
	for _, d := range devicesBefore {
		if d.ID == id && d.State == "Shutdown" {
			shutdown = true
		}
	}
	if !shutdown {
		panic("qualification requires exact task-owned shutdown simulator")
	}
	runctx, stop := context.WithCancel(ctx)
	defer stop()
	session, err := client.Run(runctx, ns.RunRequest{Build: req, DeviceID: id, Artifact: &a, AllowBoot: true})
	must(err)
	defer session.Close(context.Background())
	done := make(chan error, 1)
	go func() { done <- session.Wait() }()
	nonce, err := os.ReadFile(filepath.Join(root, "nonce"))
	must(err)
	container, err := exec.Command("xcrun", "simctl", "get_app_container", id, a.ApplicationID, "data").Output()
	must(err)
	healthPath := filepath.Join(strings.TrimSpace(string(container)), "Documents/g2-health.json")
	type health struct {
		Nonce string
		Ticks int
		PID   int
	}
	var first, last health
	deadline := time.Now().Add(40 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case err := <-done:
			panic(fmt.Sprintf("app exited: %v logs=%+v", err, session.Logs()))
		default:
		}
		data, e := os.ReadFile(healthPath)
		var h health
		if e == nil && json.Unmarshal(data, &h) == nil && h.Nonce == string(nonce) && h.PID > 0 {
			if first.Ticks == 0 {
				first = h
			}
			last = h
			if last.Ticks >= first.Ticks+8 {
				break
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	if first.Ticks == 0 || last.Ticks < first.Ticks+8 {
		panic(fmt.Sprintf("health did not advance: %+v %+v logs=%+v", first, last, session.Logs()))
	}
	p, err := os.FindProcess(last.PID)
	must(err)
	must(p.Signal(syscall.Signal(0)))
	logs := fmt.Sprint(session.Logs())
	if !strings.Contains(logs, "G2 bundled JavaScript startup") || !strings.Contains(logs, "G2 scene ready") {
		panic("missing startup logs: " + logs)
	}
	fmt.Printf("G2 nonce health passed: nonce=%s ticks=%d..%d pid=%d\n", last.Nonce, first.Ticks, last.Ticks, last.PID)
	stop()
	select {
	case err = <-done:
		if !errors.Is(err, context.Canceled) {
			panic(fmt.Sprintf("cancellation result: %v", err))
		}
	case <-time.After(time.Minute):
		panic("cleanup timeout")
	}
	for range 2 {
		err = session.Close(ctx)
		if err != nil && !errors.Is(err, context.Canceled) {
			must(err)
		}
	}
	if p.Signal(syscall.Signal(0)) == nil {
		panic("app PID survived cancellation")
	}
	devices, err := client.Devices(ctx, ns.DeviceQuery{Platform: ns.IOS})
	must(err)
	found := false
	for _, d := range devices {
		if d.ID == id {
			found = true
			if d.State != "Shutdown" {
				panic("owned boot survived")
			}
		}
	}
	if !found {
		panic("device missing")
	}
	fmt.Println("G2 cancellation Wait, repeated Close, retired app PID and owned shutdown passed")
}
