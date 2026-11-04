package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"syscall"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
)

const developmentAppID = "org.example.godevelopment"

func ownedAVDName(output []byte, name string) bool {
	return strings.TrimSpace(strings.SplitN(string(output), "\n", 2)[0]) == name
}

// The harness owns a new AVD and every emulator boot, while the public session
// owns the installed app process and ADB reverse. Build and device grants never
// overlap. The AVD survives our intermediate boots, then is deleted at cleanup.
type androidReservation struct {
	id, avd, serial, sdk string
	port                 int
	phases               []map[string]string
	emulator             *exec.Cmd
	emulatorDone         chan error
	emulatorLog          *os.File
}

func (r *androidReservation) adb(ctx context.Context, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, filepath.Join(r.sdk, "platform-tools/adb"), append([]string{"-s", r.serial}, args...)...).CombinedOutput()
}

func (r *androidReservation) release() error {
	if r.emulator != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		defer cancel()
		// Only send the ADB shutdown after checking our exact AVD identity.
		name, err := r.adb(ctx, "emu", "avd", "name")
		if err == nil && ownedAVDName(name, r.avd) {
			_, _ = r.adb(ctx, "emu", "kill")
		} else {
			_ = r.emulator.Process.Signal(os.Interrupt)
		}
		select {
		case <-r.emulatorDone:
		case <-ctx.Done():
			_ = r.emulator.Process.Kill()
			select {
			case <-r.emulatorDone:
			case <-time.After(10 * time.Second):
				return errors.New("owned emulator did not retire; retaining reservation")
			}
		}
		r.emulator = nil
		_ = r.emulatorLog.Close()
		r.phases = append(r.phases, map[string]string{"action": "shutdown", "avd": r.avd})
	}
	if r.id != "" {
		out, err := exec.Command("goddard-agent", "resource", "release", r.id, "--output", "json").CombinedOutput()
		if err != nil {
			return fmt.Errorf("resource release: %w: %s", err, out)
		}
		r.phases = append(r.phases, map[string]string{"action": "release", "id": r.id})
		r.id = ""
	}
	return nil
}

func (r *androidReservation) acquire(ctx context.Context, device bool, logPath string) error {
	if err := r.release(); err != nil {
		return err
	}
	resources := map[string]any{"native_builds": 1}
	purpose := "public Android development compilation"
	if device {
		resources = map[string]any{"exclusive": []string{"android:" + r.avd}, "resident_devices": 1}
		purpose = "public Android development emulator HMR"
	}
	data, _ := json.Marshal(map[string]any{"resources": resources, "purpose": purpose})
	out, err := exec.CommandContext(ctx, "goddard-agent", "resource", "acquire", "--json", string(data), "--output", "json").CombinedOutput()
	if err != nil {
		return fmt.Errorf("resource acquire: %w: %s", err, out)
	}
	var grant struct{ ID string }
	if json.Unmarshal(out, &grant) != nil || grant.ID == "" {
		return fmt.Errorf("invalid resource grant: %s", out)
	}
	r.id = grant.ID
	r.phases = append(r.phases, map[string]string{"action": "acquire", "id": r.id, "purpose": purpose})
	if !device {
		return nil
	}
	for _, port := range []int{r.port, r.port + 1} {
		listener, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", port))
		if err != nil {
			return fmt.Errorf("emulator port occupied: %w", err)
		}
		_ = listener.Close()
	}
	r.emulatorLog, err = os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	command := exec.Command(filepath.Join(r.sdk, "emulator/emulator"), "-avd", r.avd, "-port", strconv.Itoa(r.port), "-no-window", "-no-audio", "-no-snapshot", "-no-boot-anim")
	command.Stdout, command.Stderr = r.emulatorLog, r.emulatorLog
	if err := command.Start(); err != nil {
		_ = r.emulatorLog.Close()
		return err
	}
	r.emulator = command
	r.emulatorDone = make(chan error, 1)
	go func() { r.emulatorDone <- command.Wait() }()
	bootCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	for {
		select {
		case err := <-r.emulatorDone:
			r.emulatorDone <- err // Release also observes the completed process.
			return fmt.Errorf("owned emulator exited before readiness: %v", err)
		case <-bootCtx.Done():
			return bootCtx.Err()
		case <-time.After(time.Second):
			out, err := r.adb(bootCtx, "shell", "getprop", "sys.boot_completed")
			if err != nil || strings.TrimSpace(string(out)) != "1" {
				continue
			}
			name, err := r.adb(bootCtx, "emu", "avd", "name")
			if err != nil || !ownedAVDName(name, r.avd) {
				return errors.New("serial does not belong to owned AVD")
			}
			r.phases = append(r.phases, map[string]string{"action": "boot", "avd": r.avd, "serial": r.serial})
			return nil
		}
	}
}

func runAndroid(args []string) (result error) {
	if len(args) != 3 {
		return errors.New("usage: development-consumer android APP UNUSED_EVEN_PORT EVIDENCE_JSON")
	}
	app, saved := args[0], args[2]
	port, err := strconv.Atoi(args[1])
	if err != nil || port%2 != 0 || port < 5554 || port > 5584 {
		return errors.New("emulator port must be even and in the ADB discovery range 5554..5584")
	}
	sdk := os.Getenv("ANDROID_HOME")
	if !filepath.IsAbs(sdk) {
		return errors.New("ANDROID_HOME must identify the existing SDK")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()
	cwd, _ := os.Getwd()
	env := os.Environ()
	writer, flags, prefix := log.Writer(), log.Flags(), log.Prefix()
	r := &androidReservation{sdk: sdk, port: port, serial: fmt.Sprintf("emulator-%d", port), avd: fmt.Sprintf("nativescript-g5-%d-%d", os.Getpid(), time.Now().UnixNano())}
	avdmanager := filepath.Join(sdk, "cmdline-tools/latest/bin/avdmanager")
	image := "system-images;android-35;google_apis;arm64-v8a"
	avdPath := filepath.Join(filepath.Dir(app), r.avd+".avd")
	create := exec.CommandContext(ctx, avdmanager, "create", "avd", "--name", r.avd, "--path", avdPath, "--package", image, "--device", "pixel_6")
	create.Stdin = strings.NewReader("no\n")
	if out, err := create.CombinedOutput(); err != nil {
		return fmt.Errorf("create owned AVD: %w: %s", err, out)
	}
	evidence := map[string]any{"boundary": "real public-library Android debug development startup/HMR/native resource; no OTA/release/physical claim", "avd": r.avd, "serial": r.serial, "systemImage": image}
	defer func() {
		result = errors.Join(result, r.release())
		if r.emulator == nil {
			out, err := exec.Command(avdmanager, "delete", "avd", "--name", r.avd).CombinedOutput()
			if err != nil {
				result = errors.Join(result, fmt.Errorf("delete owned AVD: %w: %s", err, out))
			} else {
				evidence["ownedAVDDeleted"] = true
			}
		}
		now, _ := os.Getwd()
		globals := now == cwd && reflect.DeepEqual(env, os.Environ()) && log.Writer() == writer && log.Flags() == flags && log.Prefix() == prefix
		evidence["embeddingGlobalsPreserved"] = globals
		if !globals {
			result = errors.Join(result, errors.New("embedding process globals changed"))
		}
		evidence["reservations"] = r.phases
		evidence["ownedBootRetired"] = r.emulator == nil
		evidence["passed"] = result == nil
		if result != nil {
			evidence["failure"] = result.Error()
		}
		data, _ := json.MarshalIndent(evidence, "", "  ")
		result = errors.Join(result, os.WriteFile(saved, append(data, '\n'), 0600))
	}()
	// Bound the owned fixture's data partition. The stock Pixel profile requests
	// 12 GiB despite this app needing only a small debug installation.
	configPath := filepath.Join(avdPath, "config.ini")
	config, err := os.ReadFile(configPath)
	if err != nil {
		return err
	}
	lines := strings.Split(string(config), "\n")
	filtered := lines[:0]
	for _, line := range lines {
		if !strings.HasPrefix(line, "disk.dataPartition.size=") {
			filtered = append(filtered, line)
		}
	}
	if err := os.WriteFile(configPath, []byte(strings.Join(filtered, "\n")+"\ndisk.dataPartition.size=2G\n"), 0600); err != nil {
		return err
	}
	if err := r.acquire(ctx, true, saved+".emulator.log"); err != nil {
		return err
	}
	if out, _ := r.adb(ctx, "shell", "pm", "path", developmentAppID); strings.Contains(string(out), "package:") {
		return errors.New("refusing an existing fixture app installation")
	}
	client, err := ns.New(ns.Options{Sink: func(ctx context.Context, event ns.Event) error {
		fmt.Printf("EVENT %s %s\n", event.Stage, event.Kind)
		if event.Stage == "native" && event.Kind == ns.StageStarted {
			return r.acquire(ctx, false, "")
		}
		if event.Stage == "native" && event.Kind == ns.StageCompleted {
			return r.acquire(ctx, true, saved+".emulator.log")
		}
		return nil
	}})
	if err != nil {
		return err
	}
	request := ns.RunRequest{Development: &ns.DevelopmentOptions{}, DeviceID: r.serial, Build: ns.BuildRequest{
		ProjectDir: app, OutputDir: filepath.Join(app, "state"), Target: ns.Target{Platform: ns.Android, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: r.serial, Architecture: "arm64-v8a"}}}}
	session, err := client.Run(ctx, request)
	if err != nil {
		var operation *ns.OperationError
		if errors.As(err, &operation) {
			return fmt.Errorf("public Android development Run: %w; cause=%v", err, operation.Cause)
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
		tick := time.NewTicker(250 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case err := <-done:
				return health{}, fmt.Errorf("Android app/session exited: %v; logs=%+v", err, session.Logs())
			case <-deadline.C:
				return health{}, fmt.Errorf("Android health expired; logs=%+v", session.Logs())
			case <-ctx.Done():
				return health{}, ctx.Err()
			case <-tick.C:
				out, err := r.adb(ctx, "exec-out", "run-as", developmentAppID, "cat", "files/go-dev-health.json")
				var h health
				if err == nil && json.Unmarshal(out, &h) == nil && h.Nonce == string(nonce) && h.PID > 0 {
					evidence["lastObserved"] = h
					if predicate(h) {
						return h, nil
					}
				}
			}
		}
	}
	checkReverse := func(endpoint ns.DevelopmentEndpoint, present bool) error {
		u, err := url.Parse(endpoint.URL)
		if err != nil || u.Port() == "" {
			return errors.New("invalid native development endpoint")
		}
		out, err := r.adb(ctx, "reverse", "--list")
		if err != nil || strings.Contains(string(out), "tcp:"+u.Port()+" tcp:"+u.Port()) != present {
			return fmt.Errorf("owned reverse expectation %t: %s: %v", present, out, err)
		}
		return nil
	}
	first, err := observe(time.Minute, func(h health) bool { return h.Token == "G5_INITIAL" && h.Ticks >= 2 })
	if err != nil {
		return err
	}
	evidence["initial"] = first
	fmt.Printf("HEALTH Android initial pid=%d ticks=%d\n", first.PID, first.Ticks)
	if err := checkReverse(session.DevelopmentEndpoint(), true); err != nil {
		return err
	}
	last, err := observe(time.Minute, func(h health) bool { return h.PID == first.PID && h.Boot == first.Boot && h.Ticks >= first.Ticks+8 })
	if err != nil {
		return err
	}
	evidence["progression"] = last
	if err := os.WriteFile(filepath.Join(app, "app/value.ts"), []byte("export const token = 'G5_HOT';\n"), 0600); err != nil {
		return err
	}
	hot, err := observe(time.Minute, func(h health) bool { return h.Token == "G5_HOT" && h.HotUpdates > 0 })
	if err != nil {
		return err
	}
	if hot.PID != first.PID || hot.Boot != first.Boot || hot.Ticks <= last.Ticks {
		return errors.New("Android hot update lost process/heartbeat continuity")
	}
	evidence["hotUpdate"] = hot
	fmt.Printf("HEALTH Android hot pid=%d ticks=%d updates=%d\n", hot.PID, hot.Ticks, hot.HotUpdates)
	firstEndpoint := session.DevelopmentEndpoint()
	resource := filepath.Join(app, "App_Resources/Android/src/main/res/values/qualification.xml")
	if err := os.MkdirAll(filepath.Dir(resource), 0700); err != nil {
		return err
	}
	if err := os.WriteFile(resource, []byte(`<resources><string name="qualification_revision">2</string></resources>`), 0600); err != nil {
		return err
	}
	rebuilt, err := observe(5*time.Minute, func(h health) bool {
		return h.Boot != first.Boot && h.NativeResourceRevision == 2 && h.Token == "G5_HOT" && h.Ticks >= 2
	})
	if err != nil {
		return err
	}
	if session.DevelopmentEndpoint().URL == firstEndpoint.URL {
		return errors.New("Android native edit did not replace development generation")
	}
	evidence["nativeRebuild"] = rebuilt
	fmt.Printf("HEALTH Android rebuilt pid=%d ticks=%d resource=%d\n", rebuilt.PID, rebuilt.Ticks, rebuilt.NativeResourceRevision)
	endpoint := session.DevelopmentEndpoint()
	if err := checkReverse(endpoint, true); err != nil {
		return err
	}
	for range 2 {
		if err := session.Close(context.Background()); !errors.Is(err, context.Canceled) {
			return fmt.Errorf("Android repeated Close: %v", err)
		}
	}
	if err := checkReverse(endpoint, false); err != nil {
		return err
	}
	pid, _ := r.adb(ctx, "shell", "pidof", developmentAppID)
	if strings.TrimSpace(string(pid)) != "" {
		return fmt.Errorf("Android owned PID survived Close: %s", pid)
	}
	evidence["ownedPIDRetired"] = true
	evidence["ownedReverseRetired"] = true
	out, err := r.adb(ctx, "uninstall", developmentAppID)
	if err != nil || !strings.Contains(string(out), "Success") {
		return fmt.Errorf("owned Android app uninstall: %v: %s", err, out)
	}
	fmt.Println("PASS real public Android native development, same-process HMR, resource rebuild and owned cleanup")
	return nil
}
