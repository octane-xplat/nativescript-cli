package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	ns "github.com/octane-xplat/nativescript-cli"
	"os"
	"path/filepath"
	"time"
)

func main() {
	if len(os.Args) != 5 {
		panic("usage: runtime build|build-android-debug|hold APP ARTIFACT_JSON DEVICE")
	}
	mode, root, saved, id := os.Args[1], os.Args[2], os.Args[3], os.Args[4]
	if mode != "build" && mode != "build-android-debug" && mode != "hold" {
		panic("unsupported qualification mode")
	}
	c, e := ns.New(ns.Options{OTAStartup: true})
	must(e)
	platform, configuration, arch := ns.IOS, ns.Release, "arm64"
	if mode == "build-android-debug" {
		platform, configuration, arch = ns.Android, ns.Debug, "arm64-v8a"
	}
	var a ns.Artifact
	if mode == "hold" {
		b, e := os.ReadFile(saved)
		must(e)
		must(json.Unmarshal(b, &a))
		platform, configuration, arch = a.Identity.Target.Platform, a.Identity.Target.Configuration, a.Identity.Target.Destination.Architecture
	}
	target := ns.Target{Platform: platform, Configuration: configuration, Destination: ns.Destination{Kind: ns.Simulator, ID: id, Architecture: arch}}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	req := ns.BuildRequest{ProjectDir: root, OutputDir: filepath.Join(root, ".xplat-ns"), Target: target, IOS: ns.IOSBuildOptions{SigningMode: "disabled"}}
	if mode == "build" || mode == "build-android-debug" {
		r, e := c.Build(ctx, req)
		must(e)
		if len(r.Artifacts) != 1 {
			panic("expected one artifact")
		}
		b, e := json.Marshal(r.Artifacts[0])
		must(e)
		must(os.WriteFile(saved, b, 0600))
		fmt.Printf("PASS public Build platform=%s configuration=%s artifact=%s\n", platform, configuration, r.Artifacts[0].Path)
		return
	}
	runctx, stop := context.WithCancel(ctx)
	defer stop()
	session, e := c.Run(runctx, ns.RunRequest{Build: req, Artifact: &a, DeviceID: id, AllowBoot: true})
	must(e)
	defer session.Close(context.Background())
	done := make(chan error, 1)
	go func() { done <- session.Wait() }()
	fmt.Println("READY public Run")
	input := make(chan bool, 1)
	go func() { input <- bufio.NewScanner(os.Stdin).Scan() }()
	select {
	case e := <-done:
		fmt.Printf("app exited logs=%+v\n", session.Logs())
		panic(fmt.Sprintf("app exited: %v", e))
	case <-input:
	}
	stop()
	select {
	case e := <-done:
		if e != nil && !errors.Is(e, context.Canceled) {
			panic(e)
		}
	case <-time.After(time.Minute):
		panic("cleanup timeout")
	}
	for range 2 {
		e = session.Close(context.Background())
		if e != nil && !errors.Is(e, context.Canceled) {
			panic(e)
		}
	}
	fmt.Printf("PASS public Run cancellation/repeated Close logs=%+v\n", session.Logs())
}
func must(e error) {
	if e != nil {
		panic(e)
	}
}
