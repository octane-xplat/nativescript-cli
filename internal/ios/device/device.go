// Package device installs existing Apple artifacts; it never prepares or builds.
package device

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	iosbuild "github.com/octane-xplat/nativescript-cli/internal/ios/build"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

type Adapter struct {
	Install func(context.Context, bool) error

	// BundleDirectory replaces only the installed simulator app payload; no install.
	BundleDirectory string

	Executor            process.Executor
	Environment         map[string]string
	AllowBoot           bool
	AllowPhysicalDevice bool
}

func (a Adapter) executor() process.Executor {
	if a.Executor != nil {
		return a.Executor
	}
	return process.Runner{}
}
func (a Adapter) run(ctx context.Context, dir string, args ...string) ([]byte, error) {
	var out bytes.Buffer
	h, err := a.executor().Start(ctx, process.Command{Executable: "xcrun", Args: args, Dir: dir, Environment: a.Environment, Output: func(_ context.Context, s process.Stream, b []byte) error {
		if s == process.Stdout {
			if out.Len()+len(b) > 8<<20 {
				return workflow.ErrHandoff
			}
			out.Write(b)
		}
		return nil
	}})
	if err != nil {
		return nil, err
	}
	_, err = h.Wait()
	return out.Bytes(), err
}
func (a Adapter) Discover(ctx context.Context, platform string) ([]project.Device, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if platform != "ios" {
		return nil, workflow.ErrUnavailable
	}
	if a.Executor == nil && runtime.GOOS != "darwin" {
		return nil, process.ErrUnavailable
	}
	data, err := a.run(ctx, os.TempDir(), "simctl", "list", "devices", "available", "--json")
	if err != nil {
		return nil, err
	}
	devices, err := parseSimulators(data, runtime.GOARCH)
	if err != nil {
		return nil, err
	}
	data, err = a.run(ctx, os.TempDir(), "devicectl", "list", "devices", "--json-output", "-")
	if err != nil {
		return nil, err
	}
	physical, err := parsePhysical(data)
	if err != nil {
		return nil, err
	}
	devices = append(devices, physical...)
	seen := map[string]bool{}
	for _, d := range devices {
		if d.ID == "" || seen[d.ID] {
			return nil, workflow.ErrHandoff
		}
		seen[d.ID] = true
	}
	sort.Slice(devices, func(i, j int) bool { return devices[i].ID < devices[j].ID })
	return devices, nil
}
func parseSimulators(data []byte, arch string) ([]project.Device, error) {
	var raw struct {
		Devices map[string][]struct {
			UDID, Name, State string
			IsAvailable       bool
		}
	}
	if json.Unmarshal(data, &raw) != nil || raw.Devices == nil {
		return nil, workflow.ErrHandoff
	}
	if arch == "amd64" {
		arch = "x86_64"
	}
	var out []project.Device
	for key, list := range raw.Devices {
		if !strings.Contains(key, ".iOS-") {
			continue
		}
		for _, d := range list {
			if d.IsAvailable {
				out = append(out, project.Device{ID: d.UDID, Name: d.Name, State: d.State, Platform: "ios", Kind: "simulator", Architecture: arch})
			}
		}
	}
	return out, nil
}
func parsePhysical(data []byte) ([]project.Device, error) {
	var raw struct {
		Result struct {
			Devices []struct {
				Identifier         string
				HardwareProperties struct {
					Platform, Reality string
					CPUType           struct{ Name string }
				}
				DeviceProperties     struct{ Name string }
				ConnectionProperties struct{ TunnelState, PairingState string }
			}
		}
	}
	if json.Unmarshal(data, &raw) != nil || raw.Result.Devices == nil {
		return nil, workflow.ErrHandoff
	}
	var out []project.Device
	for _, d := range raw.Result.Devices {
		h := d.HardwareProperties
		if h.Platform != "iOS" || h.Reality != "physical" {
			continue
		}
		state := d.ConnectionProperties.TunnelState
		if d.ConnectionProperties.PairingState != "paired" {
			state = "unpaired"
		}
		out = append(out, project.Device{ID: d.Identifier, Name: d.DeviceProperties.Name, State: state, Platform: "ios", Kind: "device", Architecture: strings.TrimSuffix(h.CPUType.Name, "e")})
	}
	return out, nil
}

// Select requires an exact ID and rejects duplicates, including ambiguous records.
func Select(devices []project.Device, id string) (project.Device, error) {
	var found []project.Device
	for _, d := range devices {
		if id != "" && d.ID == id {
			found = append(found, d)
		}
	}
	if len(found) != 1 {
		return project.Device{}, workflow.ErrInvalid
	}
	return found[0], nil
}
func Compatible(a project.Artifact, d project.Device) bool {
	t := a.Identity.Target
	return a.Kind == "app" && filepath.IsAbs(a.Path) && a.ApplicationID != "" && a.Identity.Schema == 1 && a.Identity.Revision != "" && filepath.IsAbs(a.Identity.ProjectDir) && t.Platform == "ios" && d.Platform == "ios" && t.DestinationKind == d.Kind && (t.DestinationID == d.ID || t.DestinationID == "generic") && t.Architecture == d.Architecture
}
func (a Adapter) Launch(ctx context.Context, artifact project.Artifact, selected project.Device) (session *workflow.Session, err error) {
	if a.BundleDirectory != "" && selected.Kind != "simulator" {
		return nil, workflow.ErrInvalid
	}
	if !Compatible(artifact, selected) {
		return nil, workflow.ErrHandoff
	}
	devices, err := a.Discover(ctx, "ios")
	if err != nil {
		return nil, err
	}
	d, err := Select(devices, selected.ID)
	if err != nil {
		return nil, err
	}
	if d.Kind != selected.Kind || d.Architecture != selected.Architecture {
		return nil, workflow.ErrHandoff
	}
	if d.Kind == "device" && (!a.AllowPhysicalDevice || d.State != "connected") {
		return nil, fmt.Errorf("physical session requires explicit permission and connected trusted device: %w", workflow.ErrUnavailable)
	}
	if d.Kind == "simulator" && d.State != "Booted" && (!a.AllowBoot || d.State != "Shutdown") {
		return nil, workflow.ErrInvalid
	}
	// One process-wide and cross-process lease per exact device, independent of app.
	cache, err := os.UserCacheDir()
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256([]byte(d.ID))
	root := filepath.Join(cache, "xplat-ns", "devices", fmt.Sprintf("%x", sum))
	if err = os.MkdirAll(root, 0700); err != nil {
		return nil, err
	}
	id := artifact.Identity
	id.ProjectDir = root
	layout, err := workspace.NewLayout(filepath.Join(root, "state"), id)
	if err != nil {
		return nil, err
	}
	lease, err := (workspace.Manager{}).Acquire(ctx, layout)
	if err != nil {
		return nil, err
	}
	owned := true
	booted := false
	launched := false
	executable := ""
	cleanup := func() error {
		var e error
		if launched && d.Kind == "device" {
			c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			for {
				data, inspectErr := a.run(c, root, "devicectl", "device", "info", "processes", "--device", d.ID, "--json-output", "-")
				if inspectErr != nil {
					return errors.Join(process.ErrCleanup, inspectErr)
				}
				running, inspectErr := physicalRunning(data, executable)
				if inspectErr != nil {
					return errors.Join(process.ErrCleanup, inspectErr)
				}
				if !running {
					break
				}
				select {
				case <-c.Done():
					return errors.Join(process.ErrCleanup, c.Err())
				case <-time.After(100 * time.Millisecond):
				}
			}
		}
		if booted {
			c, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			_, e = a.run(c, root, "simctl", "shutdown", d.ID)
		}
		return errors.Join(e, lease.Release())
	}
	defer func() {
		if owned && !errors.Is(err, process.ErrCleanup) {
			err = errors.Join(err, cleanup())
		}
	}()
	// Reinspect the actual product, not only caller-supplied compatibility metadata.
	tmp, err := os.MkdirTemp(root, "inspect-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)
	plist := filepath.Join(tmp, "Info.plist")
	h, err := a.executor().Start(ctx, process.Command{Executable: "/usr/bin/plutil", Args: []string{"-convert", "xml1", "-o", plist, filepath.Join(artifact.Path, "Info.plist")}, Dir: root, Environment: a.Environment})
	if err != nil {
		return nil, err
	}
	if _, err = h.Wait(); err != nil {
		return nil, err
	}
	if err = iosbuild.ValidateApplication(artifact.Path, plist, artifact.ApplicationID, d.Architecture, d.Kind); err != nil {
		return nil, err
	}
	if d.State == "Shutdown" {
		booted = true
		if _, err = a.run(ctx, root, "simctl", "boot", d.ID); err != nil {
			return nil, err
		}
		if _, err = a.run(ctx, root, "simctl", "bootstatus", d.ID, "-b"); err != nil {
			return nil, err
		}
	}
	// Refuse to replace or attach to an already running app.
	if d.Kind == "simulator" {
		data, e := a.run(ctx, root, "simctl", "spawn", d.ID, "launchctl", "list")
		if e != nil {
			return nil, e
		}
		if simulatorRunning(data, artifact.ApplicationID) {
			return nil, workspace.ErrBusy
		}
		if a.BundleDirectory != "" {
			if artifact.Identity.Target.Configuration != "debug" {
				return nil, workflow.ErrInvalid
			}
			data, e := a.run(ctx, root, "simctl", "get_app_container", d.ID, artifact.ApplicationID, "app")
			if e != nil {
				return nil, e
			}
			installed := strings.TrimSpace(string(data))
			if !filepath.IsAbs(installed) || filepath.Ext(installed) != ".app" {
				return nil, workflow.ErrHandoff
			}
			// The serial lease and running-process preflight cover replacement.
			if err = workspace.SyncDir(filepath.Join(installed, "app"), a.BundleDirectory, func(string) bool { return false }); err != nil {
				return nil, err
			}
		} else {
			if a.Install != nil {
				if err = a.Install(ctx, true); err != nil {
					return nil, err
				}
			}
			if _, err = a.run(ctx, root, "simctl", "install", d.ID, artifact.Path); err != nil {
				return nil, err
			}
			if a.Install != nil {
				if err = a.Install(ctx, false); err != nil {
					return nil, err
				}
			}
		}
	} else {
		data, e := a.run(ctx, root, "devicectl", "device", "info", "processes", "--device", d.ID, "--json-output", "-")
		if e != nil {
			return nil, e
		}
		info, e := iosbuild.ApplicationExecutable(plist)
		executable = info
		if e != nil {
			return nil, e
		}
		exists, e := physicalRunning(data, info)
		if e != nil {
			return nil, e
		}
		if exists {
			return nil, workspace.ErrBusy
		}
		if a.Install != nil {
			if err = a.Install(ctx, true); err != nil {
				return nil, err
			}
		}
		if _, err = a.run(ctx, root, "devicectl", "device", "install", "app", "--device", d.ID, artifact.Path, "--json-output", "-"); err != nil {
			return nil, err
		}
		if a.Install != nil {
			if err = a.Install(ctx, false); err != nil {
				return nil, err
			}
		}
	}
	if d.Kind == "simulator" {
		session, err = a.launchSimulator(ctx, root, artifact, d, cleanup)
		if err == nil {
			owned = false
		}
		return session, err
	}
	logs := &workflow.LogBuffer{}
	handle, err := a.executor().Start(ctx, process.Command{Executable: "xcrun", Args: []string{"devicectl", "device", "process", "launch", "--console", "--device", d.ID, artifact.ApplicationID}, Dir: root, Environment: a.Environment, Output: logs.Append})
	if err != nil {
		return nil, err
	}
	launched = true
	done := make(chan error, 1)
	go func() { _, e := handle.Wait(); done <- e }()
	if d.Kind == "device" {
		info, e := iosbuild.ApplicationExecutable(plist)
		if e != nil {
			return nil, errors.Join(e, handle.Close(context.Background()), <-done)
		}
		deadline := time.NewTimer(30 * time.Second)
		defer deadline.Stop()
		poll := time.NewTicker(100 * time.Millisecond)
		defer poll.Stop()
	polling:
		for {
			select {
			case e := <-done:
				return nil, errors.Join(workflow.ErrHandoff, e)
			case <-ctx.Done():
				return nil, errors.Join(ctx.Err(), handle.Close(context.Background()), <-done)
			case <-deadline.C:
				return nil, errors.Join(context.DeadlineExceeded, handle.Close(context.Background()), <-done)
			case <-poll.C:
				data, e := a.run(ctx, root, "devicectl", "device", "info", "processes", "--device", d.ID, "--json-output", "-")
				if e != nil {
					return nil, errors.Join(e, handle.Close(context.Background()), <-done)
				}
				exists, e := physicalRunning(data, info)
				if e != nil {
					return nil, errors.Join(e, handle.Close(context.Background()), <-done)
				}
				if exists {
					break polling
				}
			}
		}
	}
	// devicectl forwards console cancellation signals to the owned application.
	session = workflow.StartSession(ctx, func(work context.Context) (result error) {
		defer func() {
			if !errors.Is(result, process.ErrCleanup) {
				result = errors.Join(result, cleanup())
			}
		}()
		select {
		case e := <-done:
			return e
		case <-work.Done():
			return errors.Join(work.Err(), handle.Close(context.Background()), <-done)
		}
	})
	session.LogBuffer = logs
	owned = false
	return session, nil
}

// Reject unknown process schemas rather than assuming the device is idle.
func physicalRunning(data []byte, executable string) (bool, error) {
	var raw struct {
		Result struct{ RunningProcesses []struct{ Executable string } }
	}
	if json.Unmarshal(data, &raw) != nil || raw.Result.RunningProcesses == nil {
		return false, workflow.ErrHandoff
	}
	for _, p := range raw.Result.RunningProcesses {
		if p.Executable == "" {
			return false, workflow.ErrHandoff
		}
		if strings.HasSuffix(p.Executable, "/"+executable) {
			return true, nil
		}
	}
	return false, nil
}

func simulatorRunning(data []byte, id string) bool {
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 3 && fields[0] != "-" && strings.Contains(fields[2], id) {
			return true
		}
	}
	return false
}

// launchSimulator uses completed simctl launch output, since --console buffers
// its PID acknowledgement until app exit when stdout is a pipe.
func (a Adapter) launchSimulator(ctx context.Context, root string, artifact project.Artifact, d project.Device, cleanup func() error) (*workflow.Session, error) {
	dir, err := os.MkdirTemp(root, "console-")
	if err != nil {
		return nil, err
	}
	transferred := false
	defer func() {
		if !transferred {
			os.RemoveAll(dir)
		}
	}()
	paths := []string{filepath.Join(dir, "stdout"), filepath.Join(dir, "stderr")}
	for _, path := range paths {
		if err = os.WriteFile(path, nil, 0600); err != nil {
			return nil, err
		}
	}
	data, err := a.run(ctx, root, "simctl", "launch", "--stdout="+paths[0], "--stderr="+paths[1], d.ID, artifact.ApplicationID)
	stop := func() error {
		c, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_, e := a.run(c, root, "simctl", "terminate", d.ID, artifact.ApplicationID)
		return e
	}
	if err != nil {
		return nil, errors.Join(err, stop())
	}
	pid, err := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(string(data)), artifact.ApplicationID+":")))
	if err != nil || pid <= 0 {
		return nil, errors.Join(workflow.ErrHandoff, stop())
	}
	logs := &workflow.LogBuffer{}
	logs.Append(ctx, process.Stdout, data)
	offsets := []int64{0, 0}
	read := func() error {
		for i, path := range paths {
			f, e := os.Open(path)
			if e != nil {
				return e
			}
			st, e := f.Stat()
			if e != nil {
				f.Close()
				return e
			}
			if st.Size() > 64<<20 {
				f.Close()
				return workflow.ErrHandoff
			}
			_, e = f.Seek(offsets[i], 0)
			if e != nil {
				f.Close()
				return e
			}
			b, e := io.ReadAll(io.LimitReader(f, 1<<20))
			f.Close()
			if e != nil {
				return e
			}
			offsets[i] += int64(len(b))
			stream := process.Stdout
			if i == 1 {
				stream = process.Stderr
			}
			if len(b) > 0 {
				logs.Append(context.Background(), stream, b)
			}
		}
		return nil
	}
	if err = read(); err != nil {
		return nil, errors.Join(err, stop())
	}
	// NativeScript's iOS console also writes through unified logging. Stdio
	// redirection alone misses those diagnostics. Follow only this launched PID;
	// the reader is an owned child and shares the session's bounded log buffer.
	reader, err := a.executor().Start(ctx, process.Command{Executable: "xcrun", Args: []string{"simctl", "spawn", d.ID, "log", "stream", "--level", "debug", "--style", "ndjson", "--predicate", fmt.Sprintf("processIdentifier == %d", pid)}, Dir: root, Environment: a.Environment, Output: logs.Append})
	if err != nil {
		return nil, errors.Join(err, stop())
	}
	readerDone := make(chan error, 1)
	go func() { _, err := reader.Wait(); readerDone <- err }()
	readerExited := false
	alive := func() bool { app, e := os.FindProcess(pid); return e == nil && app.Signal(syscall.Signal(0)) == nil }
	session := workflow.StartSession(ctx, func(work context.Context) (result error) {
		defer func() {
			readerErr := reader.Close(context.Background())
			if !readerExited {
				<-readerDone
			}
			result = errors.Join(result, readerCleanupError(readerErr))
			if alive() {
				result = errors.Join(result, stop())
			}
			if alive() {
				result = errors.Join(result, process.ErrCleanup)
				return
			}
			if errors.Is(readerErr, process.ErrCleanup) {
				return // Retain ownership if the log reader failed to retire.
			}
			result = errors.Join(result, read(), os.RemoveAll(dir), cleanup())
		}()
		tick := time.NewTicker(100 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case <-work.Done():
				return work.Err()
			case err := <-readerDone:
				readerExited = true
				return errors.Join(process.ErrExit, err)
			case <-tick.C:
				if e := read(); e != nil {
					return e
				}
				if !alive() {
					return process.ErrExit
				}
			}
		}
	})
	session.LogBuffer = logs
	transferred = true
	return session, nil
}
