// Native hook qualification through the public library. Build and run phases
// are separate commands so their host resource reservations do not overlap.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"slices"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() (result error) {
	phase := flag.String("phase", "build", "build or run")
	project := flag.String("project", "", "absolute staged hook probe")
	output := flag.String("output", "", "absolute generated state")
	platform := flag.String("platform", "ios", "ios or android")
	device := flag.String("device", "", "exact reserved device ID")
	nonce := flag.String("nonce", "", "expected runtime marker")
	flag.Parse()
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	ctx, deadline := context.WithTimeout(ctx, 12*time.Minute)
	defer deadline()
	client, err := ns.New(ns.Options{Sink: func(_ context.Context, e ns.Event) error {
		fmt.Fprintf(os.Stderr, "%s %s %s\n", time.Now().Format(time.RFC3339), e.Stage, e.Kind)
		return nil
	}})
	if err != nil {
		return err
	}
	arch := "arm64"
	if *platform == "android" {
		arch = "arm64-v8a"
	}
	request := ns.BuildRequest{ProjectDir: *project, OutputDir: *output, Target: ns.Target{Platform: ns.Platform(*platform), Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: *device, Architecture: arch}}}
	artifactFile := filepath.Join(*project, "built-artifact.json")
	if *phase == "build" {
		built, err := client.Build(ctx, request)
		if err != nil {
			return err
		}
		if len(built.Artifacts) != 1 {
			return fmt.Errorf("unexpected artifacts: %d", len(built.Artifacts))
		}
		data, err := json.MarshalIndent(built, "", "  ")
		if err != nil {
			return err
		}
		return os.WriteFile(artifactFile, data, 0600)
	}
	if *phase != "run" {
		return fmt.Errorf("phase must be build or run")
	}
	data, err := os.ReadFile(artifactFile)
	if err != nil {
		return err
	}
	var built ns.BuildResult
	if err = json.Unmarshal(data, &built); err != nil {
		return err
	}
	if len(built.Artifacts) != 1 {
		return fmt.Errorf("missing built artifact")
	}
	orderFile := filepath.Join(*project, "hook-order.txt")
	expectedData, err := os.ReadFile(filepath.Join(*project, "expected-order.json"))
	if err != nil {
		return err
	}
	var expected []string
	if err = json.Unmarshal(expectedData, &expected); err != nil {
		return err
	}
	if len(expected) < 2 {
		return fmt.Errorf("invalid expected hook order")
	}
	beforeData, err := os.ReadFile(orderFile)
	if err != nil {
		return err
	}
	before := strings.Split(strings.TrimSpace(string(beforeData)), "\n")
	prefix := expected[:len(expected)-2]
	install := expected[len(expected)-2:]
	if len(before) < len(prefix) || !slices.Equal(before[:len(prefix)], prefix) || (len(before)-len(prefix))%2 != 0 {
		return fmt.Errorf("invalid prior hook order: %v", before)
	}
	for i := len(prefix); i < len(before); i += 2 {
		if !slices.Equal(before[i:i+2], install) {
			return fmt.Errorf("invalid prior install order")
		}
	}
	var samples atomic.Int64
	var launch ns.Launch
	session, err := client.Run(ctx, ns.RunRequest{Build: request, Artifact: &built.Artifacts[0], DeviceID: *device, Launched: func(l ns.Launch) error { launch = l; return nil }, Log: func(l ns.SessionLog) {
		if strings.Contains(l.Text, *nonce) {
			samples.Add(1)
		}
	}})
	if err != nil {
		return err
	}
	defer func() {
		logs, err := json.MarshalIndent(session.Logs(), "", "  ")
		if err == nil {
			err = os.WriteFile(filepath.Join(*project, "runtime-logs.json"), logs, 0600)
		}
		result = errors.Join(result, err)
	}()
	defer func() {
		err := session.Close(context.Background())
		if err != nil && (!errors.Is(err, context.Canceled) || errors.Is(err, ns.ErrCleanup)) {
			result = errors.Join(result, err)
		}
	}()
	done := make(chan error, 1)
	go func() { done <- session.Wait() }()
	limit := time.NewTimer(45 * time.Second)
	defer limit.Stop()
	stableUntil := time.Now().Add(3 * time.Second)
	for samples.Load() < 3 || time.Now().Before(stableUntil) {
		select {
		case err := <-done:
			var operation *ns.OperationError
			if errors.As(err, &operation) {
				// This owned probe contains no caller data. Preserve the original
				// session failure alongside the public error category.
				return fmt.Errorf("app exited before marker: %w; probe cause: %v", err, operation.Cause)
			}
			return fmt.Errorf("app exited before marker: %w", err)
		case <-limit.C:
			return fmt.Errorf("runtime marker not observed")
		case <-time.After(100 * time.Millisecond):
		}
	}
	if launch.ApplicationID != "org.example.registeredhooks" || launch.DeviceID != *device || launch.Identity != built.Artifacts[0].Identity {
		return fmt.Errorf("typed launch identity mismatch: %+v", launch)
	}
	data, err = os.ReadFile(orderFile)
	if err != nil {
		return err
	}
	actual := strings.Split(strings.TrimSpace(string(data)), "\n")
	want := append(append([]string(nil), before...), install...)
	if !slices.Equal(actual, want) {
		return fmt.Errorf("hook order mismatch: %v", actual)
	}
	fmt.Printf("HOOK_NATIVE_PASS platform=%s nonce=%s hooks=%d samples=%d device=%s\n", *platform, *nonce, len(actual), samples.Load(), *device)
	return nil
}
