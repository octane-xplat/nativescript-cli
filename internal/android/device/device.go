// Package device operates on existing APKs and exact ADB serials, never builds.
package device

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

type Reverse struct{ DevicePort, HostPort int }
type Adapter struct {
	Install func(context.Context, bool) error

	// BundleDirectory stages a full runtime sync instead of reinstalling the APK.
	BundleDirectory string

	Executor            process.Executor
	Environment         map[string]string
	AllowPhysicalDevice bool
	Reverse             []Reverse
}

func (a Adapter) executor() process.Executor {
	if a.Executor != nil {
		return a.Executor
	}
	return process.Runner{}
}
func (a Adapter) tool(key, fallback string) string {
	if v := a.Environment[key]; v != "" {
		return v
	}
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
func (a Adapter) command(ctx context.Context, executable string, args ...string) ([]byte, error) {
	var out bytes.Buffer
	h, e := a.executor().Start(ctx, process.Command{Executable: executable, Args: args, Dir: os.TempDir(), Environment: a.Environment, Output: func(_ context.Context, s process.Stream, b []byte) error {
		if s == process.Stdout {
			if out.Len()+len(b) > 8<<20 {
				return workflow.ErrHandoff
			}
			out.Write(b)
		}
		return nil
	}})
	if e != nil {
		return nil, e
	}
	_, e = h.Wait()
	return out.Bytes(), e
}
func (a Adapter) adb(ctx context.Context, serial string, args ...string) ([]byte, error) {
	if serial != "" {
		args = append([]string{"-s", serial}, args...)
	}
	return a.command(ctx, a.tool("ADB", "adb"), args...)
}
func (a Adapter) Discover(ctx context.Context, platform string) ([]project.Device, error) {
	if platform != "android" {
		return nil, workflow.ErrUnavailable
	}
	b, e := a.adb(ctx, "", "devices", "-l")
	if e != nil {
		return nil, e
	}
	ds, e := parseDevices(string(b))
	if e != nil {
		return nil, e
	}
	for i := range ds {
		if ds[i].State != "device" {
			continue
		}
		b, e = a.adb(ctx, ds[i].ID, "shell", "getprop", "ro.product.cpu.abi")
		if e != nil {
			return nil, e
		}
		ds[i].Architecture = architecture(strings.TrimSpace(string(b)))
		if ds[i].Architecture == "" {
			return nil, workflow.ErrHandoff
		}
	}
	return ds, nil
}
func architecture(s string) string {
	switch s {
	case "arm64-v8a":
		return "arm64-v8a"
	case "armeabi-v7a":
		return "armeabi-v7a"
	case "x86_64", "x86":
		return s
	}
	return ""
}
func parseDevices(data string) ([]project.Device, error) {
	var ds []project.Device
	seen := map[string]bool{}
	header := false
	for _, line := range strings.Split(data, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if line == "List of devices attached" {
			header = true
			continue
		}
		if !header {
			return nil, workflow.ErrHandoff
		}
		f := strings.Fields(line)
		if len(f) < 2 || seen[f[0]] || strings.HasPrefix(f[0], "-") {
			return nil, workflow.ErrHandoff
		}
		seen[f[0]] = true
		d := project.Device{ID: f[0], State: f[1], Platform: "android", Kind: "device", Name: f[0]}
		if strings.HasPrefix(d.ID, "emulator-") {
			d.Kind = "simulator"
		}
		for _, s := range f[2:] {
			if strings.HasPrefix(s, "model:") {
				d.Name = strings.TrimPrefix(s, "model:")
			}
		}
		ds = append(ds, d)
	}
	if !header {
		return nil, workflow.ErrHandoff
	}
	sort.Slice(ds, func(i, j int) bool { return ds[i].ID < ds[j].ID })
	return ds, nil
}
func Select(ds []project.Device, serial string) (project.Device, error) {
	var selected project.Device
	n := 0
	for _, d := range ds {
		if d.ID == serial && serial != "" {
			selected = d
			n++
		}
	}
	if n != 1 || selected.State != "device" {
		return project.Device{}, workflow.ErrInvalid
	}
	return selected, nil
}

var appID = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$`)

func Compatible(a project.Artifact, d project.Device) bool {
	t := a.Identity.Target
	return a.Identity.Schema == 1 && a.Identity.Revision != "" && filepath.IsAbs(a.Identity.ProjectDir) && filepath.IsAbs(a.Path) && a.Kind == "apk" && appID.MatchString(a.ApplicationID) && t.Platform == "android" && d.Platform == "android" && (t.DestinationID == d.ID || t.DestinationID == "generic") && t.DestinationKind == d.Kind && t.Architecture == d.Architecture
}
func (a Adapter) aapt() string {
	if v := a.tool("AAPT2", ""); v != "" {
		return v
	}
	sdk := a.tool("ANDROID_HOME", a.tool("ANDROID_SDK_ROOT", ""))
	paths, _ := filepath.Glob(filepath.Join(sdk, "build-tools", "*", "aapt2"))
	sort.Strings(paths)
	if len(paths) > 0 {
		return paths[len(paths)-1]
	}
	return "aapt2"
}

var packageName = regexp.MustCompile(`(?m)^package: name='([^']+)'`)
var minimumSDK = regexp.MustCompile(`(?m)^minSdkVersion:'([0-9]+)'`)
var nativeCode = regexp.MustCompile(`(?m)^native-code: (.+)$`)

func (a Adapter) validate(ctx context.Context, art project.Artifact, d project.Device) error {
	st, e := os.Stat(art.Path)
	if e != nil {
		return e
	}
	if !st.Mode().IsRegular() {
		return workflow.ErrInvalid
	}
	b, e := a.command(ctx, a.aapt(), "dump", "badging", art.Path)
	if e != nil {
		return e
	}
	p := packageName.FindSubmatch(b)
	m := minimumSDK.FindSubmatch(b)
	if len(p) != 2 || string(p[1]) != art.ApplicationID || len(m) != 2 {
		return workflow.ErrHandoff
	}
	n, _ := strconv.Atoi(string(m[1]))
	bSDK, e := a.adb(ctx, d.ID, "shell", "getprop", "ro.build.version.sdk")
	if e != nil {
		return e
	}
	sdk, e := strconv.Atoi(strings.TrimSpace(string(bSDK)))
	if e != nil || sdk < n {
		return workflow.ErrHandoff
	}
	if codes := nativeCode.FindSubmatch(b); len(codes) == 2 {
		matched := false
		for _, abi := range strings.Fields(string(codes[1])) {
			if architecture(strings.Trim(abi, "'")) == d.Architecture {
				matched = true
			}
		}
		if !matched {
			return workflow.ErrHandoff
		}
	}
	return nil
}
func (a Adapter) Launch(ctx context.Context, art project.Artifact, requested project.Device) (session *workflow.Session, err error) {
	ds, err := a.Discover(ctx, "android")
	if err != nil {
		return nil, err
	}
	d, err := Select(ds, requested.ID)
	if err != nil {
		return nil, err
	}
	if !Compatible(art, d) {
		return nil, workflow.ErrHandoff
	}
	if d.Kind == "device" && !a.AllowPhysicalDevice {
		return nil, workflow.ErrInvalid
	}
	seen := map[int]bool{}
	for _, r := range a.Reverse {
		if r.DevicePort < 1 || r.DevicePort > 65535 || r.HostPort < 1 || r.HostPort > 65535 || seen[r.DevicePort] {
			return nil, workflow.ErrInvalid
		}
		seen[r.DevicePort] = true
	}
	cache, e := os.UserCacheDir()
	if e != nil {
		return nil, e
	}
	root := filepath.Join(cache, "xplat-ns", "android-devices", fmt.Sprintf("%x", sha256.Sum256([]byte(d.ID))))
	if e = os.MkdirAll(root, 0700); e != nil {
		return nil, e
	}
	// Stable identity: every project targeting this serial shares the same lock.
	id := project.Identity{Schema: 1, Revision: "device", ProjectDir: root, Target: project.Target{Platform: "android", DestinationKind: "device", DestinationID: d.ID, Architecture: "device", Configuration: "debug"}}
	layout, e := workspace.NewLayout(filepath.Join(root, "state"), id)
	if e != nil {
		return nil, e
	}
	lease, e := (workspace.Manager{}).Acquire(ctx, layout)
	if e != nil {
		return nil, e
	}
	var forwards []Reverse
	launched := false
	syncStaged := false
	syncRemote := "/data/local/tmp/" + art.ApplicationID + "/fullsync"
	transferred := false
	cleanup := func() error {
		c, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		var result error
		if launched {
			_, e := a.adb(c, d.ID, "shell", "am", "force-stop", art.ApplicationID)
			result = errors.Join(result, e)
		}
		if syncStaged {
			_, e := a.adb(c, d.ID, "shell", "rm", "-rf", syncRemote)
			result = errors.Join(result, e)
		}
		for _, r := range forwards {
			b, e := a.adb(c, d.ID, "reverse", "--list")
			if e != nil {
				result = errors.Join(result, e)
				continue
			}
			owned := false
			for _, line := range strings.Split(string(b), "\n") {
				f := strings.Fields(line)
				if len(f) == 3 && f[1] == fmt.Sprint("tcp:", r.DevicePort) && f[2] == fmt.Sprint("tcp:", r.HostPort) {
					owned = true
				}
			}
			if owned {
				_, e = a.adb(c, d.ID, "reverse", "--remove", fmt.Sprint("tcp:", r.DevicePort))
				result = errors.Join(result, e)
			}
		}
		if result != nil {
			return errors.Join(process.ErrCleanup, result)
		}
		return lease.Release()
	}
	defer func() {
		if !transferred && !errors.Is(err, process.ErrCleanup) {
			err = errors.Join(err, cleanup())
		}
	}()
	// Sync launches never read art.Path: the published generation that produced
	// the APK may already be pruned by workspace retention. The installed
	// package checked below stands in for local artifact validation.
	if a.BundleDirectory == "" {
		if err = a.validate(ctx, art, d); err != nil {
			return nil, err
		}
	}
	b, err := a.adb(ctx, d.ID, "shell", "pidof", art.ApplicationID)
	if err != nil && !errors.Is(err, process.ErrExit) {
		return nil, err
	}
	if len(bytes.TrimSpace(b)) > 0 {
		return nil, workspace.ErrBusy
	}
	for _, r := range a.Reverse {
		existing, e := a.adb(ctx, d.ID, "reverse", "--list")
		if e != nil {
			return nil, e
		}
		for _, line := range strings.Split(string(existing), "\n") {
			f := strings.Fields(line)
			if len(f) != 0 && len(f) != 3 {
				return nil, workflow.ErrHandoff
			}
			if len(f) == 3 && f[1] == fmt.Sprint("tcp:", r.DevicePort) {
				return nil, workspace.ErrBusy
			}
		}
		// The command can apply before cancellation loses its acknowledgement.
		// Preflight established absence under our serial lease; reconcile on exit.
		forwards = append(forwards, r)
		_, err = a.adb(ctx, d.ID, "reverse", "--no-rebind", fmt.Sprint("tcp:", r.DevicePort), fmt.Sprint("tcp:", r.HostPort))
		if err != nil {
			return nil, err
		}
	}
	if a.BundleDirectory != "" {
		if d.Kind != "simulator" || art.Identity.Target.Configuration != "debug" || !appID.MatchString(art.ApplicationID) {
			return nil, workflow.ErrInvalid
		}
		// Sync reuses the APK installed by the earlier native launch; require
		// the package to still be present on the device before staging files.
		b, err = a.adb(ctx, d.ID, "shell", "pm", "path", art.ApplicationID)
		if err != nil {
			return nil, err
		}
		installed := false
		for _, line := range strings.Split(string(b), "\n") {
			if strings.HasPrefix(strings.TrimSpace(line), "package:") {
				installed = true
			}
		}
		if !installed {
			return nil, workflow.ErrHandoff
		}
		remote := syncRemote
		syncStaged = true // A cancelled transfer may have created partial files.
		if _, err = a.adb(ctx, d.ID, "shell", "rm", "-rf", remote); err != nil {
			return nil, err
		}
		if _, err = a.adb(ctx, d.ID, "shell", "mkdir", "-p", remote); err != nil {
			return nil, err
		}
		if _, err = a.adb(ctx, d.ID, "push", filepath.Clean(a.BundleDirectory)+string(filepath.Separator)+".", remote); err != nil {
			return nil, err
		}
		if _, err = a.adb(ctx, d.ID, "shell", "chmod", "-R", "777", "/data/local/tmp/"+art.ApplicationID); err != nil {
			return nil, err
		}
	} else {
		if a.Install != nil {
			if err = a.Install(ctx, true); err != nil {
				return nil, err
			}
		}
		b, err = a.adb(ctx, d.ID, "install", "-r", art.Path)
		if err != nil {
			return nil, err
		}
		if !strings.Contains(string(b), "Success") {
			return nil, workflow.ErrHandoff
		}
		if a.Install != nil {
			if err = a.Install(ctx, false); err != nil {
				return nil, err
			}
		}
	}
	b, err = a.adb(ctx, d.ID, "shell", "cmd", "package", "resolve-activity", "--brief", art.ApplicationID)
	if err != nil {
		return nil, err
	}
	component := ""
	for _, line := range strings.Split(string(b), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, art.ApplicationID+"/") && !strings.ContainsAny(line, " \t\r") {
			component = line
		}
	}
	if component == "" {
		return nil, workflow.ErrHandoff
	}
	launched = true
	b, err = a.adb(ctx, d.ID, "shell", "am", "start", "-W", "-n", component)
	if err != nil {
		return nil, err
	}
	if !strings.Contains(string(b), "Status: ok") && !strings.Contains(string(b), "Status: timeout") {
		return nil, workflow.ErrHandoff
	}
	if !strings.Contains(string(b), "Status: ok") {
		// `am start -W` reports "Status: timeout" when the first frame exceeds
		// its wait on a slow emulator; the app still launches. Only accept it
		// when the process is live.
		p, e := a.adb(ctx, d.ID, "shell", "pidof", art.ApplicationID)
		if e != nil {
			return nil, e
		}
		if strings.TrimSpace(string(p)) == "" {
			return nil, workflow.ErrHandoff
		}
	}
	b, err = a.adb(ctx, d.ID, "shell", "pidof", art.ApplicationID)
	if err != nil {
		return nil, err
	}
	pid := strings.TrimSpace(string(b))
	if _, e = strconv.Atoi(pid); e != nil {
		return nil, workflow.ErrHandoff
	}
	logs := &workflow.LogBuffer{}
	h, err := a.executor().Start(ctx, process.Command{Executable: a.tool("ADB", "adb"), Args: []string{"-s", d.ID, "logcat", "--pid=" + pid, "-v", "threadtime"}, Dir: root, Environment: a.Environment, Output: logs.Append})
	if err != nil {
		return nil, err
	}
	done := make(chan error, 1)
	go func() { _, e := h.Wait(); done <- e }()
	session = workflow.StartSession(ctx, func(work context.Context) (result error) {
		defer func() {
			if !errors.Is(result, process.ErrCleanup) {
				result = errors.Join(result, cleanup())
			}
		}()
		tick := time.NewTicker(time.Second)
		defer tick.Stop()
		for {
			select {
			case e := <-done:
				return errors.Join(process.ErrExit, e)
			case <-work.Done():
				return errors.Join(work.Err(), h.Close(context.Background()), <-done)
			case <-tick.C:
				b, e := a.adb(work, d.ID, "shell", "pidof", art.ApplicationID)
				if e != nil || strings.TrimSpace(string(b)) != pid {
					return errors.Join(process.ErrExit, e, h.Close(context.Background()), <-done)
				}
			}
		}
	})
	session.LogBuffer = logs
	transferred = true
	return session, nil
}
