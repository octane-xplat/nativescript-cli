package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type policyExit int

func (e policyExit) Error() string { return "fixture command failed" }
func (e policyExit) ExitCode() int { return int(e) }

func TestPrescribedAVDInputsAreReadOnly(t *testing.T) {
	for _, scenario := range []string{"valid", "missing-registry", "other-path", "other-image", "other-abi", "other-profile", "missing-image", "ambiguous-registry"} {
		t.Run(scenario, func(t *testing.T) {
			// Data-only metadata fixtures; no AVD is created/registered or booted.
			home, sdk := t.TempDir(), t.TempDir()
			root := filepath.Join(home, ".android", "avd")
			data := filepath.Join(root, qualificationAndroidAVD+".avd")
			if err := os.MkdirAll(data, 0700); err != nil {
				t.Fatal(err)
			}
			registry := "path=" + data + "\n"
			config := "abi.type=arm64-v8a\nhw.device.name=pixel_6\nimage.sysdir.1=" + qualificationAndroidImage + "/\ndisk.dataPartition.size=12G\n"
			switch scenario {
			case "other-path":
				registry = "path=" + filepath.Join(home, "other") + "\n"
			case "ambiguous-registry":
				registry += "path=" + filepath.Join(home, "other") + "\n"
			case "other-image":
				config = strings.ReplaceAll(config, "android-35", "android-34")
			case "other-abi":
				config = strings.ReplaceAll(config, "arm64-v8a", "x86_64")
			case "other-profile":
				config = strings.ReplaceAll(config, "pixel_6", "pixel_7")
			}
			ini := filepath.Join(root, qualificationAndroidAVD+".ini")
			if scenario != "missing-registry" {
				if err := os.WriteFile(ini, []byte(registry), 0600); err != nil {
					t.Fatal(err)
				}
			}
			configFile := filepath.Join(data, "config.ini")
			if err := os.WriteFile(configFile, []byte(config), 0600); err != nil {
				t.Fatal(err)
			}
			if scenario != "missing-image" {
				if err := os.MkdirAll(filepath.Join(sdk, qualificationAndroidImage), 0700); err != nil {
					t.Fatal(err)
				}
			}
			got, err := existingQualificationAVD(home, sdk)
			if (err == nil) != (scenario == "valid") {
				t.Fatalf("root=%q error=%v", got, err)
			}
			if scenario == "valid" && got != root {
				t.Fatalf("wrong AVD home: %s", got)
			}
			after, err := os.ReadFile(configFile)
			if err != nil || string(after) != config {
				t.Fatal("AVD config changed", err)
			}
			if scenario != "missing-registry" {
				after, err = os.ReadFile(ini)
				if err != nil || string(after) != registry {
					t.Fatal("AVD registry changed", err)
				}
			}
		})
	}
}

func TestBusyOrUnknownAndroidHostCannotStartAnotherEmulator(t *testing.T) {
	for _, scenario := range []struct {
		name, adb          string
		adbErr, processErr error
		wantOK             bool
		processQueried     bool
	}{
		{"idle", "List of devices attached\n", nil, policyExit(1), true, true},
		{"physical-only", "List of devices attached\nphone123\tdevice\n", nil, policyExit(1), true, true},
		{"online", "List of devices attached\nemulator-5584\tdevice\n", nil, nil, false, false},
		{"offline", "List of devices attached\nemulator-5584\toffline\n", nil, nil, false, false},
		{"starting", "List of devices attached\n", nil, nil, false, true},
		{"process-error", "List of devices attached\n", nil, policyExit(2), false, true},
		{"invalid-adb", "", nil, policyExit(1), false, false},
		{"adb-error", "", context.Canceled, policyExit(1), false, false},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			processQueried := false
			run := func(_ context.Context, file string, args ...string) ([]byte, error) {
				if filepath.Base(file) == "adb" {
					if !reflect.DeepEqual(args, []string{"devices"}) {
						t.Fatal(args)
					}
					return []byte(scenario.adb), scenario.adbErr
				}
				if file != "pgrep" || len(args) != 2 || args[0] != "-f" {
					t.Fatalf("unexpected command %s %v", file, args)
				}
				processQueried = true
				return nil, scenario.processErr
			}
			err := noAndroidEmulator(context.Background(), "/existing/sdk", run)
			if (err == nil) != scenario.wantOK || processQueried != scenario.processQueried {
				t.Fatalf("error=%v processQueried=%t", err, processQueried)
			}
			if scenario.adbErr != nil && !errors.Is(err, context.Canceled) {
				t.Fatal("cancellation identity lost", err)
			}
		})
	}
}

func TestStaleSimulatorRegistrationsAreNotInstallations(t *testing.T) {
	for _, scenario := range []struct {
		name    string
		output  string
		err     error
		exists  bool
		want    iosFixtureState
		wantErr bool
	}{
		{"absent", "", policyExit(1), false, iosFixtureAbsent, false},
		{"present", "/devices/UDID/data/Containers/Bundle/Application/FIXTURE/NativeScriptApp.app\n", nil, true, iosFixturePresent, false},
		{"stale", "/devices/UDID/data/Containers/Bundle/Application/FIXTURE/NativeScriptApp.app\n", nil, false, iosFixtureStale, false},
		{"empty", "\n", nil, false, iosFixtureAbsent, true},
		{"relative", "NativeScriptApp.app\n", nil, true, iosFixtureAbsent, true},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			state, err := classifyIOSFixture([]byte(scenario.output), scenario.err, func(string) bool { return scenario.exists })
			if state != scenario.want || (err != nil) != scenario.wantErr {
				t.Fatalf("state=%v err=%v", state, err)
			}
		})
	}
}

func TestInstallationRetirementRequiresOwnershipAndVerifiedAbsence(t *testing.T) {
	for _, scenario := range []struct {
		name      string
		owned     bool
		first     string
		firstErr  error
		uninstall string
		after     string
		wantOK    bool
		wantCalls int
	}{
		{"caller-installation", false, "package:" + developmentAppID, nil, "Success", "", true, 0},
		{"already-absent", true, "", nil, "Success", "", true, 1},
		{"different-filter-match", true, "package:" + developmentAppID + ".other", nil, "Success", "", true, 1},
		{"transport-error", true, "", policyExit(1), "Success", "", false, 1},
		{"invalid-presence", true, "permission denied", nil, "Success", "", false, 1},
		{"owned-present", true, "package:" + developmentAppID, nil, "Success", "", true, 3},
		{"uninstall-rejected", true, "package:" + developmentAppID, nil, "Failure", "", false, 2},
		{"still-present", true, "package:" + developmentAppID, nil, "Success", "package:" + developmentAppID, false, 3},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			calls := 0
			r := &androidReservation{sdk: "/existing/sdk", serial: "emulator-5584", installationOwned: scenario.owned}
			r.execute = func(_ context.Context, file string, args ...string) ([]byte, error) {
				calls++
				if filepath.Base(file) != "adb" || !reflect.DeepEqual(args[:2], []string{"-s", r.serial}) {
					t.Fatalf("wrong device command %s %v", file, args)
				}
				switch calls {
				case 1:
					if !reflect.DeepEqual(args[2:], []string{"shell", "pm", "list", "packages", developmentAppID}) {
						t.Fatal(args)
					}
					return []byte(scenario.first), scenario.firstErr
				case 2:
					if !reflect.DeepEqual(args[2:], []string{"uninstall", developmentAppID}) {
						t.Fatal(args)
					}
					return []byte(scenario.uninstall), nil
				case 3:
					if !reflect.DeepEqual(args[2:], []string{"shell", "pm", "list", "packages", developmentAppID}) {
						t.Fatal(args)
					}
					return []byte(scenario.after), nil
				default:
					t.Fatal("extra device operation")
					return nil, nil
				}
			}
			err := r.retireInstallation(context.Background())
			if (err == nil) != scenario.wantOK || calls != scenario.wantCalls {
				t.Fatalf("error=%v calls=%d", err, calls)
			}
			if r.installationOwned != (scenario.owned && !scenario.wantOK) {
				t.Fatal("ownership lost before verified cleanup")
			}
		})
	}
}
