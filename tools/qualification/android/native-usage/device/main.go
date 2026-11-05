// This consumer runs only after the harness reserves and boots a fresh owned AVD.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
)

type health struct {
	Nonce, Boot, NativeClassName string
	PID, Ticks                   int
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() (result error) {
	if len(os.Args) != 4 {
		return errors.New("usage: native-usage-device BUILD_JSON EXACT_OWNED_SERIAL NONCE")
	}
	data, err := os.ReadFile(os.Args[1])
	if err != nil {
		return err
	}
	var built ns.BuildResult
	if err = json.Unmarshal(data, &built); err != nil || len(built.Artifacts) != 1 {
		return errors.New("expected one public build artifact")
	}
	artifact := built.Artifacts[0]
	if artifact.ApplicationID != "org.example.nativeusage" || artifact.Kind != "apk" {
		return errors.New("unexpected native usage artifact")
	}
	serial, nonce := os.Args[2], os.Args[3]
	adb := func(args ...string) (string, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		b, err := exec.CommandContext(ctx, filepath.Join(os.Getenv("ANDROID_HOME"), "platform-tools/adb"), append([]string{"-s", serial}, args...)...).CombinedOutput()
		return string(b), err
	}
	if output, _ := adb("shell", "pm", "path", artifact.ApplicationID); strings.Contains(output, "package:") {
		return errors.New("refusing an existing fixture installation")
	}
	cwd, _ := os.Getwd()
	environment := os.Environ()
	writer, flags, prefix := log.Writer(), log.Flags(), log.Prefix()
	evidence := map[string]any{"boundary": "actual Android debug GestureHandler class binding and heartbeat; no release/HMR/OTA/full app claim", "serial": serial, "artifact": artifact}
	var session *ns.Session
	defer func() {
		if session != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			err := session.Close(ctx)
			cancel()
			if errors.Is(err, ns.ErrCleanup) || err != nil && !errors.Is(err, context.Canceled) {
				result = errors.Join(result, fmt.Errorf("owned session cleanup: %w", err))
			}
		}
		pid, pidErr := adb("shell", "sh", "-c", "'pidof "+artifact.ApplicationID+" || true'")
		evidence["ownedPIDAbsent"] = pidErr == nil && strings.TrimSpace(pid) == ""
		if pidErr != nil || strings.TrimSpace(pid) != "" {
			result = errors.Join(result, errors.New("owned app PID remains"))
		}
		out, err := adb("uninstall", artifact.ApplicationID)
		if err != nil || !strings.Contains(out, "Success") {
			result = errors.Join(result, fmt.Errorf("owned app uninstall failed: %v", err))
		} else {
			evidence["ownedAppUninstalled"] = true
		}
		now, _ := os.Getwd()
		globals := now == cwd && reflect.DeepEqual(environment, os.Environ()) && writer == log.Writer() && flags == log.Flags() && prefix == log.Prefix()
		evidence["embeddingGlobalsPreserved"] = globals
		if !globals {
			result = errors.Join(result, errors.New("embedding process globals changed"))
		}
		evidence["passed"] = result == nil
		if result != nil {
			evidence["failure"] = result.Error()
		}
		encoded, _ := json.MarshalIndent(evidence, "", "  ")
		result = errors.Join(result, os.WriteFile(os.Args[1]+".runtime.json", append(encoded, '\n'), 0600))
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	client, err := ns.New(ns.Options{})
	if err != nil {
		return err
	}
	devices, err := client.Devices(ctx, ns.DeviceQuery{Platform: ns.Android})
	if err != nil {
		return err
	}
	var device ns.Device
	for _, candidate := range devices {
		if candidate.ID == serial {
			device = candidate
		}
	}
	if device.Kind != ns.Simulator || device.State != "device" {
		return errors.New("exact owned emulator unavailable")
	}
	target := artifact.Identity.Target
	target.Destination = ns.Destination{Kind: device.Kind, ID: serial, Architecture: device.Architecture}
	session, err = client.Run(ctx, ns.RunRequest{Artifact: &artifact, DeviceID: serial, Build: ns.BuildRequest{ProjectDir: artifact.Identity.ProjectDir, OutputDir: filepath.Join(filepath.Dir(os.Args[1]), "device-state"), Target: target}})
	if err != nil {
		return err
	}
	var first, last health
	for deadline := time.Now().Add(30 * time.Second); time.Now().Before(deadline); {
		body, err := adb("shell", "run-as", artifact.ApplicationID, "cat", "files/go-native-usage-health.json")
		var sample health
		if err == nil && json.Unmarshal([]byte(body), &sample) == nil && sample.Nonce == nonce && sample.NativeClassName == "com.swmansion.gesturehandler.PanGestureHandler" && sample.PID > 0 && sample.Boot != "" && sample.Ticks > 0 {
			pid, err := adb("shell", "pidof", artifact.ApplicationID)
			if err != nil || strings.TrimSpace(pid) != strconv.Itoa(sample.PID) {
				return errors.New("health does not belong to the running app PID")
			}
			if first.Ticks == 0 {
				first = sample
			}
			if sample.PID != first.PID || sample.Boot != first.Boot || sample.Ticks < last.Ticks {
				return errors.New("app restarted or heartbeat regressed")
			}
			last = sample
			if last.Ticks >= first.Ticks+8 {
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	if first.Ticks == 0 || last.Ticks < first.Ticks+8 {
		return errors.New("actual native class/nonce/advancing heartbeat missing")
	}
	evidence["firstHealth"], evidence["lastHealth"] = first, last
	cancel()
	for i := 0; i < 2; i++ {
		closeCtx, stop := context.WithTimeout(context.Background(), 20*time.Second)
		err := session.Close(closeCtx)
		stop()
		if !errors.Is(err, context.Canceled) || errors.Is(err, ns.ErrCleanup) {
			return fmt.Errorf("close %d: %w", i+1, err)
		}
	}
	if err := session.Wait(); !errors.Is(err, context.Canceled) || errors.Is(err, ns.ErrCleanup) {
		return fmt.Errorf("session wait: %w", err)
	}
	evidence["repeatedCloseCanceled"] = true
	return nil
}
