// Simultaneous iOS simulator and Android emulator development sessions through
// one public client and one shared project directory. One broker grant covers
// both devices and the compilation capacity for the whole run; the native-stage
// sink must not hand reservations back because a release would evict the other
// live session.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
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

func runSimultaneous(args []string) (result error) {
	if len(args) != 4 {
		return errors.New("usage: development-consumer simultaneous APP EXACT_SHUTDOWN_SIMULATOR UNUSED_EVEN_PORT EVIDENCE_JSON")
	}
	app, id, saved := args[0], args[1], args[3]
	port, err := strconv.Atoi(args[2])
	if err != nil || port%2 != 0 || port < 5554 || port > 5584 {
		return errors.New("emulator port must be even and in the ADB discovery range 5554..5584")
	}
	if id != qualificationIOSUDID {
		return fmt.Errorf("qualification requires existing simulator %s; no substitution or creation", qualificationIOSUDID)
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
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	avdHome, err := existingQualificationAVD(home, sdk)
	if err != nil {
		return err
	}
	serial := fmt.Sprintf("emulator-%d", port)
	iosRes := &reservation{device: id}
	androidRes := &androidReservation{sdk: sdk, port: port, serial: serial, avd: qualificationAndroidAVD, avdHome: avdHome, logPath: saved + ".emulator.log"}
	var phases []map[string]string
	seenIOS, seenAndroid := 0, 0
	collect := func() {
		phases = append(phases, iosRes.phases[seenIOS:]...)
		seenIOS = len(iosRes.phases)
		phases = append(phases, androidRes.phases[seenAndroid:]...)
		seenAndroid = len(androidRes.phases)
	}
	grantID := ""
	var iosSession, androidSession *ns.Session
	evidence := map[string]any{"boundary": "real public-library simultaneous iOS simulator + Android emulator development sessions from one project and client; debug only; no OTA/release/physical claim",
		"udid": id, "serial": serial, "avd": qualificationAndroidAVD, "systemImage": qualificationAndroidImage,
		"avdOwnership": "caller-owned; never created, registered, rewritten or deleted"}
	defer func() {
		for _, session := range []*ns.Session{iosSession, androidSession} {
			if session != nil {
				if err := session.Close(context.Background()); err != nil && !errors.Is(err, context.Canceled) {
					result = errors.Join(result, fmt.Errorf("owned session cleanup: %w", err))
				}
			}
		}
		// Retire owned installs while both boots are still reachable.
		result = errors.Join(result, iosRes.retireInstallation())
		result = errors.Join(result, androidRes.retireInstallation(context.Background()))
		if iosRes.booted {
			if out, err := exec.Command("xcrun", "simctl", "shutdown", id).CombinedOutput(); err != nil {
				result = errors.Join(result, fmt.Errorf("owned simulator shutdown failed: %w: %s", err, out))
			} else {
				iosRes.booted = false
				iosRes.phases = append(iosRes.phases, map[string]string{"action": "shutdown", "device": id})
			}
		}
		result = errors.Join(result, androidRes.release())
		collect()
		if grantID != "" {
			out, err := exec.Command("goddard-agent", "resource", "release", grantID, "--output", "json").CombinedOutput()
			if err != nil {
				result = errors.Join(result, fmt.Errorf("resource release: %w: %s", err, out))
			}
			phases = append(phases, map[string]string{"action": "release", "id": grantID})
			grantID = ""
		}
		now, _ := os.Getwd()
		evidence["embeddingGlobalsPreserved"] = now == cwd && reflect.DeepEqual(env, os.Environ()) && log.Writer() == writer && log.Flags() == flags && log.Prefix() == prefix
		evidence["reservations"] = phases
		evidence["ownedBootRetired"] = !iosRes.booted && androidRes.emulator == nil
		evidence["emulatorTerminated"] = androidRes.emulator == nil
		evidence["iosOwnedInstallationRetired"] = !iosRes.installationOwned
		evidence["androidOwnedInstallationRetired"] = !androidRes.installationOwned
		evidence["passed"] = result == nil
		if result != nil {
			evidence["failure"] = result.Error()
		}
		data, _ := json.MarshalIndent(evidence, "", "  ")
		result = errors.Join(result, os.WriteFile(saved, append(data, '\n'), 0600))
		if result == nil {
			fmt.Println("PASS simultaneous iOS+Android development sessions, shared HMR, independent native rebuild and independent close")
		}
	}()
	client, err := ns.New(ns.Options{Sink: func(ctx context.Context, event ns.Event) error {
		fmt.Printf("EVENT %s %s\n", event.Stage, event.Kind)
		return nil
	}})
	if err != nil {
		return err
	}
	devices, err := client.Devices(ctx, ns.DeviceQuery{Platform: ns.IOS})
	if err != nil {
		return err
	}
	shutdown := false
	for _, device := range devices {
		if device.ID == id && device.State == "Shutdown" {
			shutdown = true
		}
	}
	if !shutdown {
		return errors.New("exact simulator must initially be shutdown")
	}
	request, _ := json.Marshal(map[string]any{"resources": map[string]any{"exclusive": []string{"ios:" + id, "android:" + qualificationAndroidAVD}, "resident_devices": 2, "native_builds": 1}, "purpose": "G5 simultaneous iOS+Android development sessions", "wait_seconds": 600})
	out, err := exec.CommandContext(ctx, "goddard-agent", "resource", "acquire", "--json", string(request), "--output", "json").CombinedOutput()
	if err != nil {
		return fmt.Errorf("resource acquisition failed: %w: %s", err, out)
	}
	var grant struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(out, &grant) != nil || grant.ID == "" {
		return fmt.Errorf("invalid resource result: %s", out)
	}
	grantID = grant.ID
	phases = append(phases, map[string]string{"action": "acquire", "id": grantID, "purpose": "G5 simultaneous iOS+Android development sessions"})
	if out, err := exec.CommandContext(ctx, "xcrun", "simctl", "boot", id).CombinedOutput(); err != nil {
		return fmt.Errorf("owned simulator boot failed: %w: %s", err, out)
	}
	iosRes.booted = true
	if out, err := exec.CommandContext(ctx, "xcrun", "simctl", "bootstatus", id, "-b").CombinedOutput(); err != nil {
		return fmt.Errorf("owned simulator boot readiness failed: %w: %s", err, out)
	}
	iosRes.phases = append(iosRes.phases, map[string]string{"action": "boot", "device": id})
	if err := androidRes.startEmulator(ctx, androidRes.logPath); err != nil {
		return err
	}
	collect()
	if err := iosRes.claimFixture(); err != nil {
		return err
	}
	out, inspectErr := androidRes.adb(ctx, "shell", "pm", "list", "packages", developmentAppID)
	present, err := packagePresence(out, inspectErr)
	if err != nil {
		return err
	}
	if present {
		return errors.New("refusing an existing fixture app installation")
	}
	androidRes.installationOwned = true
	collect()
	nonce, err := os.ReadFile(filepath.Join(app, "nonce"))
	if err != nil {
		return err
	}
	iosRequest := ns.RunRequest{Development: &ns.DevelopmentOptions{}, DeviceID: id, Build: ns.BuildRequest{
		ProjectDir: app, OutputDir: filepath.Join(app, "state"), Target: ns.Target{Platform: ns.IOS, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: id, Architecture: "arm64"}}, IOS: ns.IOSBuildOptions{SigningMode: "disabled"}}}
	androidRequest := ns.RunRequest{Development: &ns.DevelopmentOptions{}, DeviceID: serial, Build: ns.BuildRequest{
		ProjectDir: app, OutputDir: filepath.Join(app, "state"), Target: ns.Target{Platform: ns.Android, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: serial, Architecture: "arm64-v8a"}}}}
	type outcome struct {
		session *ns.Session
		err     error
	}
	iosCh, androidCh := make(chan outcome, 1), make(chan outcome, 1)
	go func() {
		session, err := client.Run(ctx, iosRequest)
		iosCh <- outcome{session, err}
	}()
	go func() {
		session, err := client.Run(ctx, androidRequest)
		androidCh <- outcome{session, err}
	}()
	iosRun, androidRun := <-iosCh, <-androidCh
	iosSession, androidSession = iosRun.session, androidRun.session
	var runErr error
	for _, candidate := range []struct {
		platform string
		err      error
	}{{platform: "iOS", err: iosRun.err}, {platform: "Android", err: androidRun.err}} {
		if candidate.err == nil {
			continue
		}
		var operation *ns.OperationError
		if errors.As(candidate.err, &operation) {
			runErr = errors.Join(runErr, fmt.Errorf("public %s development Run: %w; cause=%v", candidate.platform, candidate.err, operation.Cause))
		} else {
			runErr = errors.Join(runErr, fmt.Errorf("public %s development Run: %w", candidate.platform, candidate.err))
		}
	}
	if runErr != nil {
		return runErr
	}
	defer func() {
		if iosSession != nil {
			evidence["iosLogs"] = iosSession.Logs()
		}
		if androidSession != nil {
			evidence["androidLogs"] = androidSession.Logs()
		}
	}()
	iosDone, androidDone := make(chan error, 1), make(chan error, 1)
	go func() { iosDone <- iosSession.Wait() }()
	go func() { androidDone <- androidSession.Wait() }()
	readIOS := func() (health, error) {
		container, err := exec.CommandContext(ctx, "xcrun", "simctl", "get_app_container", id, developmentAppID, "data").Output()
		if err != nil {
			return health{}, err
		}
		data, err := os.ReadFile(filepath.Join(strings.TrimSpace(string(container)), "Documents", "go-dev-health.json"))
		if err != nil {
			return health{}, err
		}
		var h health
		return h, json.Unmarshal(data, &h)
	}
	readAndroid := func() (health, error) {
		out, err := androidRes.adb(ctx, "exec-out", "run-as", developmentAppID, "cat", "files/go-dev-health.json")
		if err != nil {
			return health{}, err
		}
		var h health
		return h, json.Unmarshal(out, &h)
	}
	observe := func(done chan error, read func() (health, error), lastKey string, timeout time.Duration, predicate func(health) bool) (health, error) {
		deadline := time.NewTimer(timeout)
		defer deadline.Stop()
		tick := time.NewTicker(250 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case err := <-done:
				return health{}, fmt.Errorf("session exited: %v", err)
			case <-deadline.C:
				return health{}, errors.New("health observation expired")
			case <-ctx.Done():
				return health{}, ctx.Err()
			case <-tick.C:
				h, err := read()
				if err == nil && h.Nonce == string(nonce) && h.PID > 0 {
					if lastKey != "" {
						evidence[lastKey] = h
					}
					if predicate(h) {
						return h, nil
					}
				}
			}
		}
	}
	iosObserve := func(timeout time.Duration, predicate func(health) bool) (health, error) {
		return observe(iosDone, readIOS, "iosLastObserved", timeout, predicate)
	}
	androidObserve := func(timeout time.Duration, predicate func(health) bool) (health, error) {
		return observe(androidDone, readAndroid, "androidLastObserved", timeout, predicate)
	}
	// 1. Both sessions come up on the same project at once.
	iosFirst, err := iosObserve(2*time.Minute, func(h health) bool { return h.Token == "G5_INITIAL" && h.Ticks >= 2 })
	if err != nil {
		return fmt.Errorf("iOS initial health: %w", err)
	}
	evidence["iosInitial"] = iosFirst
	androidFirst, err := androidObserve(2*time.Minute, func(h health) bool { return h.Token == "G5_INITIAL" && h.Ticks >= 2 })
	if err != nil {
		return fmt.Errorf("Android initial health: %w", err)
	}
	evidence["androidInitial"] = androidFirst
	iosEndpoint := iosSession.DevelopmentEndpoint().URL
	androidEndpoint := androidSession.DevelopmentEndpoint().URL
	if iosEndpoint == "" || androidEndpoint == "" || iosEndpoint == androidEndpoint {
		return errors.New("sessions did not expose distinct development endpoints")
	}
	evidence["iosEndpoint"], evidence["androidEndpoint"] = iosEndpoint, androidEndpoint
	iosAlive := false
	if process, err := os.FindProcess(iosFirst.PID); err == nil {
		iosAlive = process.Signal(syscall.Signal(0)) == nil
	}
	androidPID, _ := androidRes.adb(ctx, "shell", "pidof", developmentAppID)
	if !iosAlive || strings.TrimSpace(string(androidPID)) != strconv.Itoa(androidFirst.PID) {
		return errors.New("sessions did not overlap: one owned PID was already gone")
	}
	evidence["overlap"] = map[string]any{"iosPID": iosFirst.PID, "androidPID": androidFirst.PID, "bothAlive": true}
	fmt.Printf("HEALTH simultaneous initial ios=%d android=%d\n", iosFirst.PID, androidFirst.PID)
	// 2. One shared source edit must hot-update both live applications.
	write := func(token string) error {
		return os.WriteFile(filepath.Join(app, "app", "value.ts"), []byte(fmt.Sprintf("export const token = '%s';\n", token)), 0600)
	}
	if err := write("G5_SHARED"); err != nil {
		return err
	}
	shared := func(first health) func(health) bool {
		return func(h health) bool {
			return h.Token == "G5_SHARED" && h.PID == first.PID && h.Boot == first.Boot && h.HotUpdates > first.HotUpdates
		}
	}
	iosShared, err := iosObserve(time.Minute, shared(iosFirst))
	if err != nil {
		return fmt.Errorf("iOS shared hot update: %w", err)
	}
	androidShared, err := androidObserve(time.Minute, shared(androidFirst))
	if err != nil {
		return fmt.Errorf("Android shared hot update: %w", err)
	}
	evidence["iosShared"], evidence["androidShared"] = iosShared, androidShared
	// 3. An iOS-only native rebuild must leave the Android session untouched.
	if err := os.WriteFile(filepath.Join(app, "App_Resources/iOS/qualification.json"), []byte(`{"revision":2}`), 0600); err != nil {
		return err
	}
	type observed struct {
		health health
		err    error
	}
	iosRebuiltCh := make(chan observed, 1)
	go func() {
		h, err := iosObserve(4*time.Minute, func(h health) bool {
			return h.PID != iosFirst.PID && h.NativeResourceRevision == 2 && h.Token == "G5_SHARED" && h.Ticks >= 2
		})
		iosRebuiltCh <- observed{h, err}
	}()
	var iosRebuilt observed
	received := false
	lastAndroid := androidShared
	for !received {
		select {
		case iosRebuilt = <-iosRebuiltCh:
			received = true
		case err := <-androidDone:
			return fmt.Errorf("Android session exited during iOS rebuild: %v", err)
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(250 * time.Millisecond):
			h, err := readAndroid()
			if err != nil || h.Nonce != string(nonce) || h.PID != androidShared.PID || h.Boot != androidShared.Boot || h.Token != "G5_SHARED" || h.NativeResourceRevision != androidFirst.NativeResourceRevision {
				return fmt.Errorf("Android disturbed during iOS rebuild: health=%+v read=%v", h, err)
			}
			if h.Ticks > lastAndroid.Ticks {
				lastAndroid = h
			}
		}
	}
	if iosRebuilt.err != nil {
		return fmt.Errorf("iOS native rebuild: %w", iosRebuilt.err)
	}
	if iosRebuilt.health.Boot == iosFirst.Boot || iosSession.DevelopmentEndpoint().URL == iosEndpoint {
		return errors.New("iOS native edit did not replace the dev generation")
	}
	if lastAndroid.Ticks <= androidShared.Ticks {
		return errors.New("Android heartbeat did not advance during the iOS rebuild")
	}
	if androidSession.DevelopmentEndpoint().URL != androidEndpoint {
		return errors.New("Android development endpoint moved during the iOS rebuild")
	}
	evidence["iosRebuild"] = iosRebuilt.health
	evidence["androidDuringIosRebuild"] = lastAndroid
	fmt.Printf("HEALTH iOS rebuilt pid=%d ticks=%d resource=%d; Android undisturbed pid=%d ticks=%d\n", iosRebuilt.health.PID, iosRebuilt.health.Ticks, iosRebuilt.health.NativeResourceRevision, lastAndroid.PID, lastAndroid.Ticks)
	// 4. Closing iOS must not disturb Android; a second shared edit proves it.
	for range 2 {
		if err := iosSession.Close(context.Background()); !errors.Is(err, context.Canceled) {
			return fmt.Errorf("iOS Close: %v", err)
		}
	}
	if process, err := os.FindProcess(iosRebuilt.health.PID); err == nil && process.Signal(syscall.Signal(0)) == nil {
		return errors.New("owned iOS app PID survived Close")
	}
	if err := assertNoSimulatorLogReaders(iosFirst.PID, iosRebuilt.health.PID); err != nil {
		return err
	}
	if _, err := androidObserve(30*time.Second, func(h health) bool {
		return h.Ticks >= lastAndroid.Ticks+2 && h.PID == androidShared.PID && h.Boot == androidShared.Boot
	}); err != nil {
		return fmt.Errorf("Android did not keep advancing after iOS close: %w", err)
	}
	if err := write("G5_AFTER_IOS_CLOSE"); err != nil {
		return err
	}
	androidAfter, err := androidObserve(time.Minute, func(h health) bool {
		return h.Token == "G5_AFTER_IOS_CLOSE" && h.PID == androidShared.PID && h.Boot == androidShared.Boot
	})
	if err != nil {
		return fmt.Errorf("Android after iOS close: %w", err)
	}
	evidence["androidAfterIosClose"] = androidAfter
	// 5. Closing Android retires its PID and ADB reverse.
	for range 2 {
		if err := androidSession.Close(context.Background()); !errors.Is(err, context.Canceled) {
			return fmt.Errorf("Android Close: %v", err)
		}
	}
	pid, _ := androidRes.adb(ctx, "shell", "pidof", developmentAppID)
	if strings.TrimSpace(string(pid)) != "" {
		return fmt.Errorf("Android owned PID survived Close: %s", pid)
	}
	u, err := url.Parse(androidEndpoint)
	if err != nil || u.Port() == "" {
		return errors.New("invalid Android development endpoint")
	}
	mapping, err := androidRes.adb(ctx, "reverse", "--list")
	if err != nil || strings.Contains(string(mapping), "tcp:"+u.Port()) {
		return fmt.Errorf("owned Android reverse was not retired: %s: %v", mapping, err)
	}
	evidence["iosOwnedPIDRetired"] = true
	evidence["androidOwnedPIDRetired"] = true
	evidence["ownedReverseRetired"] = true
	return nil
}
