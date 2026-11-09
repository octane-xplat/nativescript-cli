package device

import (
	"context"
	"encoding/binary"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

const sims = `{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-27-0":[{"udid":"exact","name":"Fixture","state":"Shutdown","isAvailable":true},{"udid":"hidden","isAvailable":false}],"com.apple.CoreSimulator.SimRuntime.tvOS-27-0":[{"udid":"tv","isAvailable":true}]}}`
const physical = `{"result":{"devices":[{"identifier":"phone","hardwareProperties":{"platform":"iOS","reality":"physical","cpuType":{"name":"arm64"}},"deviceProperties":{"name":"Fixture phone"},"connectionProperties":{"pairingState":"paired","tunnelState":"connected"}},{"identifier":"sim","hardwareProperties":{"platform":"iOS","reality":"simulated"}}]}}`

func TestRecordedDiscoverySelectionAndCompatibility(t *testing.T) {
	ds, err := parseSimulators([]byte(sims), "arm64")
	if err != nil || len(ds) != 1 {
		t.Fatal(ds, err)
	}
	ps, err := parsePhysical([]byte(physical))
	if err != nil || len(ps) != 1 || ps[0].ID != "phone" {
		t.Fatal(ps, err)
	}
	for _, id := range []string{"", "missing", "Fixture"} {
		if _, err := Select(ds, id); !errors.Is(err, workflow.ErrInvalid) {
			t.Fatal(id, err)
		}
	}
	if _, err := Select(append(ds, ds...), "exact"); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatal(err)
	}
	artifact := fixtureArtifact(t)
	if !Compatible(artifact, ds[0]) {
		t.Fatal("valid handoff rejected")
	}
	for _, change := range []func(*project.Artifact){func(a *project.Artifact) { a.Kind = "ipa" }, func(a *project.Artifact) { a.Identity.Target.Architecture = "x86_64" }, func(a *project.Artifact) { a.Identity.Target.DestinationKind = "device" }, func(a *project.Artifact) { a.Identity.Target.DestinationID = "other" }, func(a *project.Artifact) { a.Identity.Revision = "" }, func(a *project.Artifact) { a.Path = "relative" }} {
		a := artifact
		change(&a)
		if Compatible(a, ds[0]) {
			t.Fatal("incompatible accepted", a)
		}
	}
	for _, data := range []string{`{}`, `broken`} {
		if _, err := parseSimulators([]byte(data), "arm64"); err == nil {
			t.Fatal(data)
		}
		if _, err := parsePhysical([]byte(data)); err == nil {
			t.Fatal(data)
		}
	}
}
func fixtureArtifact(t *testing.T) project.Artifact {
	root := t.TempDir()
	path := filepath.Join(root, "space app.app")
	os.Mkdir(path, 0700)
	// Minimal arm64 simulator Mach-O executable fixture; not native runtime evidence.
	words := []uint32{0xfeedfacf, 0x0100000c, 0, 2, 1, 24, 0, 0, 0x32, 24, 7, 0, 0, 0}
	data := make([]byte, len(words)*4)
	for i, w := range words {
		binary.LittleEndian.PutUint32(data[i*4:], w)
	}
	os.WriteFile(filepath.Join(path, "App"), data, 0600)
	return project.Artifact{Identity: project.Identity{Schema: 1, Revision: "fixture", ProjectDir: root, Target: project.Target{Platform: "ios", DestinationKind: "simulator", DestinationID: "generic", Architecture: "arm64", Configuration: "debug"}}, Path: path, Kind: "app", ApplicationID: "org.example.fixture"}
}

type fakeExecutor struct {
	mu             sync.Mutex
	calls          []string
	fail, running  string
	installed      string
	physical       bool
	booted         bool
	console        chan struct{}
	logReader      *fakeHandle
	readerCloseErr error
}
type fakeHandle struct {
	err      error
	closeErr error
	done     chan struct{}
	once     sync.Once
}

func (h *fakeHandle) Wait() (process.Exit, error) {
	if h.done != nil {
		<-h.done
	}
	return process.Exit{}, h.err
}
func (h *fakeHandle) Close(context.Context) error {
	h.once.Do(func() {
		if h.done != nil {
			close(h.done)
		}
	})
	return h.closeErr
}
func (f *fakeExecutor) Start(ctx context.Context, c process.Command) (process.Handle, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	args := strings.Join(c.Args, " ")
	f.calls = append(f.calls, c.Executable+" "+args)
	if c.Executable == "xcrun" && f.fail != "" && strings.Contains(args, f.fail) {
		return &fakeHandle{err: process.ErrExit}, nil
	}
	output := ""
	switch {
	case strings.Contains(args, "list devices available"):
		output = sims
		if f.booted {
			output = strings.ReplaceAll(output, "Shutdown", "Booted")
		}
	case strings.Contains(args, "devicectl list"):
		output = physical
	case strings.Contains(args, "device info processes"):
		output = `{"result":{"runningProcesses":[]}}`
		if f.console != nil {
			select {
			case <-f.console:
			default:
				output = `{"result":{"runningProcesses":[{"executable":"/App.app/App"}]}}`
			}
		}
	case c.Executable == "/usr/bin/plutil":
		xml := `<plist><dict><key>CFBundleIdentifier</key><string>org.example.fixture</string><key>CFBundleExecutable</key><string>App</string><key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array></dict></plist>`
		if f.physical {
			xml = strings.ReplaceAll(xml, "iPhoneSimulator", "iPhoneOS")
		}
		os.WriteFile(c.Args[3], []byte(xml), 0600)
	case strings.Contains(args, "get_app_container"):
		output = f.installed
	case strings.Contains(args, "launchctl list"):
		output = f.running
	case strings.Contains(args, "launch --stdout="):
		for _, arg := range c.Args {
			if strings.HasPrefix(arg, "--stdout=") {
				os.WriteFile(strings.TrimPrefix(arg, "--stdout="), []byte("fixture app log\n"), 0600)
			}
		}
		output = "org.example.fixture: 2147483647\n"
	case strings.Contains(args, "launch --console"):
		output = "org.example.fixture: 2147483647\n"
		f.console = make(chan struct{})
		if c.Output != nil {
			c.Output(ctx, process.Stdout, []byte(output))
		}
		return &fakeHandle{done: f.console}, nil
	case strings.Contains(args, "log stream"):
		if c.Output != nil {
			c.Output(ctx, process.Stdout, []byte("fixture unified application diagnostic\n"))
		}
		f.logReader = &fakeHandle{done: make(chan struct{}), closeErr: f.readerCloseErr}
		return f.logReader, nil
	}
	if c.Output != nil {
		if err := c.Output(ctx, process.Stdout, []byte(output)); err != nil {
			return nil, err
		}
	}
	return &fakeHandle{}, nil
}
func TestLaunchOwnershipFailuresAndCancellation(t *testing.T) {
	for _, failure := range []string{"bootstatus", "install exact", "spawn exact", "launch --stdout="} {
		t.Run(failure, func(t *testing.T) {
			f := &fakeExecutor{fail: failure}
			a := Adapter{Executor: f, AllowBoot: true}
			artifact := fixtureArtifact(t)
			d := project.Device{ID: "exact", Platform: "ios", Kind: "simulator", Architecture: "arm64"}
			s, err := a.Launch(context.Background(), artifact, d)
			if err == nil || s != nil {
				t.Fatal(s, err)
			}
			if !strings.Contains(strings.Join(f.calls, "\n"), "shutdown exact") {
				t.Fatal("owned boot not retired", f.calls)
			}
		})
	}
	f := &fakeExecutor{}
	a := Adapter{Executor: f, AllowBoot: true}
	artifact := fixtureArtifact(t)
	d := project.Device{ID: "exact", Platform: "ios", Kind: "simulator", Architecture: "arm64"}
	s, err := a.Launch(context.Background(), artifact, d)
	if err != nil {
		t.Fatal(err)
	}
	blocked, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, err = a.Launch(blocked, artifact, d); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("device ownership not exclusive", err)
	}
	if len(s.LogBuffer.Logs()) == 0 {
		t.Fatal("missing console output")
	}
	foundUnified := false
	for _, line := range s.LogBuffer.Logs() {
		foundUnified = foundUnified || strings.Contains(line.Text, "fixture unified application diagnostic")
	}
	if !foundUnified || !strings.Contains(strings.Join(f.calls, "\n"), `spawn exact log stream --level debug --style ndjson --predicate processIdentifier == 2147483647 AND (senderImagePath ENDSWITH "/NativeScript.framework/NativeScript" OR logType == "error" OR logType == "fault")`) {
		t.Fatal("missing PID-scoped simulator diagnostics", f.calls)
	}
	if err = s.Close(context.Background()); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	s.Close(context.Background())
	select {
	case <-f.logReader.done:
	default:
		t.Fatal("owned simulator log reader survived Close")
	}
	if !strings.Contains(strings.Join(f.calls, "\n"), "shutdown exact") {
		t.Fatal("shutdown missing")
	}
	f.running = "123 0 org.example.fixture"
	if _, err = a.Launch(context.Background(), artifact, d); !errors.Is(err, workspace.ErrBusy) {
		t.Fatal(err)
	}
	a.AllowBoot = false
	if _, err = a.Launch(context.Background(), artifact, d); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = a.Discover(ctx, "ios"); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}

func TestPhysicalPermissionInstallConsoleCleanup(t *testing.T) {
	f := &fakeExecutor{physical: true}
	a := Adapter{Executor: f}
	artifact := fixtureArtifact(t)
	artifact.Identity.Target.DestinationKind = "device"
	artifact.Identity.Target.DestinationID = "phone"
	data, _ := os.ReadFile(filepath.Join(artifact.Path, "App"))
	binary.LittleEndian.PutUint32(data[40:], 2)
	os.WriteFile(filepath.Join(artifact.Path, "App"), data, 0600)
	d := project.Device{ID: "phone", Platform: "ios", Kind: "device", Architecture: "arm64"}
	if _, err := a.Launch(context.Background(), artifact, d); !errors.Is(err, workflow.ErrUnavailable) {
		t.Fatal("permission gate", err)
	}
	a.AllowPhysicalDevice = true
	s, err := a.Launch(context.Background(), artifact, d)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Close(context.Background()); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	calls := strings.Join(f.calls, "\n")
	if !strings.Contains(calls, "device install app --device phone") || !strings.Contains(calls, "process launch --console --device phone") || strings.Contains(calls, "simctl boot") {
		t.Fatal(calls)
	}
	if _, err = physicalRunning([]byte(`{}`), "App"); !errors.Is(err, workflow.ErrHandoff) {
		t.Fatal(err)
	}
}

func TestBorrowedBootAndActualProductRejection(t *testing.T) {
	f := &fakeExecutor{booted: true}
	a := Adapter{Executor: f}
	artifact := fixtureArtifact(t)
	d := project.Device{ID: "exact", Platform: "ios", Kind: "simulator", Architecture: "arm64"}
	invalid := artifact
	invalid.ApplicationID = "org.example.wrong"
	if _, err := a.Launch(context.Background(), invalid, d); err == nil {
		t.Fatal("forged app identity accepted")
	}
	s, err := a.Launch(context.Background(), artifact, d)
	if err != nil {
		t.Fatal(err)
	}
	s.Close(context.Background())
	calls := strings.Join(f.calls, "\n")
	if strings.Contains(calls, "simctl boot") || strings.Contains(calls, "simctl shutdown") {
		t.Fatal("borrowed boot modified", calls)
	}
}

func TestObservedAppExitRetiresConsole(t *testing.T) {
	f := &fakeExecutor{booted: true}
	a := Adapter{Executor: f}
	artifact := fixtureArtifact(t)
	d := project.Device{ID: "exact", Platform: "ios", Kind: "simulator", Architecture: "arm64"}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	s, err := a.Launch(ctx, artifact, d)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Wait(); !errors.Is(err, process.ErrExit) {
		t.Fatal("missing app exit", err)
	}
	if !strings.Contains(strings.Join(f.calls, "\n"), "launch --stdout=") {
		t.Fatal("missing owned log launch")
	}
}

func TestSimulatorLogReaderFailureRetiresOwnedBoot(t *testing.T) {
	f := &fakeExecutor{fail: "log stream"}
	a := Adapter{Executor: f, AllowBoot: true}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	s, err := a.Launch(ctx, fixtureArtifact(t), project.Device{ID: "exact", Platform: "ios", Kind: "simulator", Architecture: "arm64"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Wait(); !errors.Is(err, process.ErrExit) {
		t.Fatal("missing log-reader failure", err)
	}
	if !strings.Contains(strings.Join(f.calls, "\n"), "shutdown exact") {
		t.Fatal("log-reader failure retained owned simulator boot", f.calls)
	}
}

func TestBundleSyncReplacesPayloadWithoutInstall(t *testing.T) {
	art := fixtureArtifact(t)
	installed := filepath.Join(t.TempDir(), "installed.app")
	payload := filepath.Join(installed, "app")
	os.MkdirAll(payload, 0700)
	os.WriteFile(filepath.Join(payload, "removed.js"), []byte("old"), 0600)
	bundle := t.TempDir()
	os.WriteFile(filepath.Join(bundle, "bundle.mjs"), []byte("new"), 0600)
	f := &fakeExecutor{installed: installed}
	a := Adapter{Executor: f, AllowBoot: true, BundleDirectory: bundle}
	d := project.Device{ID: "exact", Kind: "simulator", Platform: "ios", Architecture: "arm64"}
	session, err := a.Launch(context.Background(), art, d)
	if err != nil {
		t.Fatal(err)
	}
	_ = session.Close(context.Background())
	b, err := os.ReadFile(filepath.Join(payload, "bundle.mjs"))
	if err != nil || string(b) != "new" {
		t.Fatal(string(b), err)
	}
	if _, err := os.Stat(filepath.Join(payload, "removed.js")); !os.IsNotExist(err) {
		t.Fatal("removed bundle file retained", err)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, call := range f.calls {
		if strings.Contains(call, "simctl install") {
			t.Fatal("sync reinstalled app")
		}
	}
}

func TestInstallHooksBracketSimulatorInstallBeforeLaunch(t *testing.T) {
	for _, reject := range []string{"", "before", "after"} {
		t.Run(reject, func(t *testing.T) {
			art := fixtureArtifact(t)
			d := project.Device{ID: "exact", Kind: "simulator", Platform: "ios", Architecture: "arm64"}
			f := &fakeExecutor{}
			rejected := errors.New("hook rejected")
			a := Adapter{Executor: f, AllowBoot: true, Install: func(_ context.Context, before bool) error {
				name := "after"
				if before {
					name = "before"
				}
				f.mu.Lock()
				f.calls = append(f.calls, "hook-"+name)
				f.mu.Unlock()
				if name == reject {
					return rejected
				}
				return nil
			}}
			session, err := a.Launch(context.Background(), art, d)
			if reject == "" {
				if err != nil {
					t.Fatal(err)
				}
				_ = session.Close(context.Background())
			} else if !errors.Is(err, rejected) {
				t.Fatal(err)
			}
			f.mu.Lock()
			calls := strings.Join(f.calls, "\n")
			f.mu.Unlock()
			install := strings.Index(calls, "simctl install")
			if reject == "before" {
				if install >= 0 {
					t.Fatal("install ran after rejection")
				}
				return
			}
			if install < strings.Index(calls, "hook-before") || strings.Index(calls, "hook-after") < install {
				t.Fatal(calls)
			}
			launch := strings.Index(calls, "simctl launch")
			if reject == "after" && launch >= 0 {
				t.Fatal("app launched after hook rejected")
			}
			if reject == "" && launch < strings.Index(calls, "hook-after") {
				t.Fatal(calls)
			}
		})
	}
}
