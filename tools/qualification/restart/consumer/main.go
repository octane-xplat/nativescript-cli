// Qualify restart-mode JS sync against a caller-selected installed project.
// Run under a reservation covering builds and the exact device: compilation
// and the running app overlap during native-input restart qualification.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
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
	project := flag.String("project", "", "absolute caller project")
	output := flag.String("output", "", "absolute build output")
	device := flag.String("device", "", "exact reserved simulator/emulator")
	platform := flag.String("platform", "ios", "ios or android")
	source := flag.String("source", "", "absolute entry source, temporarily edited and restored")
	native := flag.String("native", "", "optional absolute native text resource, append newline and restore")
	flag.Parse()
	original, err := os.ReadFile(*source)
	if err != nil {
		return err
	}
	info, err := os.Stat(*source)
	if err != nil {
		return err
	}
	nonce := fmt.Sprintf("RESTART_SYNC_%d", time.Now().UnixNano())
	edited := append(append([]byte(nil), original...), []byte("\nconsole.log('"+nonce+"');\n")...)
	defer func() {
		current, e := os.ReadFile(*source)
		if e != nil {
			result = errors.Join(result, e)
			return
		}
		if string(current) == string(edited) {
			result = errors.Join(result, os.WriteFile(*source, original, info.Mode().Perm()))
		} else if string(current) != string(original) {
			result = errors.Join(result, errors.New("source changed concurrently; automatic restore refused"))
		}
	}()
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	ctx, deadline := context.WithTimeout(ctx, 22*time.Minute)
	defer deadline()
	var launches atomic.Int64
	var compiles atomic.Int64
	var sawNonce atomic.Bool
	client, err := ns.New(ns.Options{Sink: func(ctx context.Context, e ns.Event) error {
		fmt.Fprintf(os.Stderr, "%s %s %s\n", time.Now().Format(time.RFC3339), e.Stage, e.Kind)
		if e.Kind == ns.StageStarted && e.Stage == "native" {
			compiles.Add(1)

		}
		if e.Kind == ns.StageCompleted && e.Stage == "launch" {
			launches.Add(1)
		}
		return nil
	}})
	if err != nil {
		return err
	}
	arch := "arm64"
	if *platform == "android" {
		arch = "arm64-v8a"
	}
	session, err := client.Run(ctx, ns.RunRequest{Build: ns.BuildRequest{ProjectDir: *project, OutputDir: *output, Target: ns.Target{Platform: ns.Platform(*platform), Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: *device, Architecture: arch}}}, DeviceID: *device, Development: &ns.DevelopmentOptions{Mode: ns.Restart}, Log: func(l ns.SessionLog) {
		if strings.Contains(l.Text, nonce) {
			sawNonce.Store(true)
		}
	}})
	if err != nil {
		return err
	}
	defer func() {
		e := session.Close(context.Background())
		if !errors.Is(e, context.Canceled) {
			result = errors.Join(result, e)
		}
	}()
	wait := func(count int64) error {
		timeout := time.NewTimer(8 * time.Minute)
		defer timeout.Stop()
		for launches.Load() < count {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-timeout.C:
				return fmt.Errorf("launch %d not observed", count)
			case <-time.After(200 * time.Millisecond):
			}
		}
		return nil
	}
	baselineCompiles := compiles.Load()
	start := time.Now()
	if err = os.WriteFile(*source, edited, info.Mode().Perm()); err != nil {
		return err
	}
	if err = wait(2); err != nil {
		return err
	}
	logDeadline := time.Now().Add(30 * time.Second)
	for !sawNonce.Load() && time.Now().Before(logDeadline) {
		time.Sleep(200 * time.Millisecond)
	}
	if !sawNonce.Load() {
		return fmt.Errorf("new app did not log edited JS nonce")
	}
	if compiles.Load() != baselineCompiles {
		return fmt.Errorf("JS edit invoked native compilation")
	}
	fmt.Printf("js_sync_pass platform=%s elapsed=%s nonce=%s launches=%d\n", *platform, time.Since(start), nonce, launches.Load())
	if *native != "" {
		bytes, e := os.ReadFile(*native)
		if e != nil {
			return e
		}
		ni, e := os.Stat(*native)
		if e != nil {
			return e
		}
		changed := append(append([]byte(nil), bytes...), '\n')
		defer func() {
			current, e := os.ReadFile(*native)
			if e == nil && string(current) == string(changed) {
				result = errors.Join(result, os.WriteFile(*native, bytes, ni.Mode().Perm()))
			} else if e != nil || string(current) != string(bytes) {
				result = errors.Join(result, fmt.Errorf("native resource changed concurrently: %s", filepath.Base(*native)))
			}
		}()
		start = time.Now()
		if e = os.WriteFile(*native, changed, ni.Mode().Perm()); e != nil {
			return e
		}
		if e = wait(3); e != nil {
			return e
		}
		if compiles.Load() != baselineCompiles+1 {
			return fmt.Errorf("native edit did not invoke compilation")
		}
		fmt.Printf("native_restart_pass platform=%s elapsed=%s launches=%d\n", *platform, time.Since(start), launches.Load())
	}
	return nil
}
