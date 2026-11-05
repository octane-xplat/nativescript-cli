package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const qualificationIOSUDID = "91D40099-A056-497D-A572-ADDDFD6A8F23"
const qualificationAndroidAVD = "elegant-fir-probe"
const qualificationAndroidImage = "system-images/android-35/google_apis/arm64-v8a"

func readDeviceConfig(file string) (map[string]string, error) {
	data, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	values := make(map[string]string)
	for _, line := range strings.Split(string(data), "\n") {
		key, value, ok := strings.Cut(line, "=")
		if ok {
			key = strings.TrimSpace(key)
			if _, duplicate := values[key]; duplicate {
				return nil, errors.New("ambiguous duplicate field in device config")
			}
			values[key] = strings.TrimSpace(value)
		}
	}
	return values, nil
}

func existingQualificationAVD(home, sdk string) (string, error) {
	root := filepath.Join(home, ".android", "avd")
	data := filepath.Join(root, qualificationAndroidAVD+".avd")
	registry, err := readDeviceConfig(filepath.Join(root, qualificationAndroidAVD+".ini"))
	if err != nil {
		return "", fmt.Errorf("required existing AVD registry: %w", err)
	}
	if filepath.Clean(registry["path"]) != data {
		return "", errors.New("required AVD registry points outside the prescribed data directory")
	}
	config, err := readDeviceConfig(filepath.Join(data, "config.ini"))
	if err != nil {
		return "", fmt.Errorf("required existing AVD config: %w", err)
	}
	if config["abi.type"] != "arm64-v8a" || config["hw.device.name"] != "pixel_6" ||
		filepath.ToSlash(filepath.Clean(config["image.sysdir.1"])) != qualificationAndroidImage {
		return "", errors.New("existing AVD is incompatible with the prescribed Pixel 6/API35/Google APIs/arm64 target")
	}
	if info, err := os.Stat(filepath.Join(sdk, qualificationAndroidImage)); err != nil || !info.IsDir() {
		return "", errors.New("prescribed Android system image is unavailable; no download or replacement is permitted")
	}
	return root, nil
}

type qualificationCommand func(context.Context, string, ...string) ([]byte, error)

func executeQualification(ctx context.Context, file string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, file, args...).CombinedOutput()
}

func noAndroidEmulator(ctx context.Context, sdk string, run qualificationCommand) error {
	out, err := run(ctx, filepath.Join(sdk, "platform-tools", "adb"), "devices")
	if err != nil {
		return fmt.Errorf("cannot establish Android emulator availability: %w", err)
	}
	header := false
	for _, line := range strings.Split(string(out), "\n") {
		if strings.TrimSpace(line) == "List of devices attached" {
			header = true
		}
		if fields := strings.Fields(line); len(fields) > 0 && strings.HasPrefix(fields[0], "emulator-") {
			return errors.New("an Android emulator is already present; coordinate or wait")
		}
	}
	if !header {
		return errors.New("ADB returned no device-list header; emulator availability is unknown")
	}
	// A starting emulator may not have registered with ADB yet. Print no argv or
	// unrelated process data; only use pgrep's presence/absence exit contract.
	_, err = run(ctx, "pgrep", "-f", `/emulator/(qemu/[^ ]*/)?(emulator|qemu-system-(aarch64|x86_64))( |$)`)
	var exit interface{ ExitCode() int }
	if errors.As(err, &exit) && exit.ExitCode() == 1 {
		return nil
	}
	if err != nil {
		return fmt.Errorf("cannot establish emulator process absence: %w", err)
	}
	return errors.New("an Android emulator process is already running or starting; coordinate or wait")
}

type iosFixtureState int

const (
	iosFixtureAbsent iosFixtureState = iota
	iosFixturePresent
	iosFixtureStale
)

// simctl exits non-zero when the fixture is not installed. A zero exit naming a
// container path that no longer exists is a stale launch-services registration:
// the owned files are gone yet the record would still refuse the next run.
func classifyIOSFixture(output []byte, err error, exists func(string) bool) (iosFixtureState, error) {
	if err != nil {
		return iosFixtureAbsent, nil
	}
	path := strings.TrimSpace(string(output))
	if path == "" || !filepath.IsAbs(path) {
		return iosFixtureAbsent, errors.New("invalid fixture container response")
	}
	if exists(path) {
		return iosFixturePresent, nil
	}
	return iosFixtureStale, nil
}

func packagePresence(output []byte, err error) (bool, error) {
	text := strings.TrimSpace(string(output))
	if err != nil {
		return false, fmt.Errorf("cannot establish fixture application presence: %w", err)
	}
	present := false
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, "package:") {
			return false, errors.New("invalid package-list response")
		}
		present = present || strings.TrimPrefix(line, "package:") == developmentAppID
	}
	return present, nil
}
