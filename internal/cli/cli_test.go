package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	ns "github.com/octane-xplat/nativescript-cli"
)

type fakeLibrary struct {
	request   any
	operation string
	options   ns.Options
	err       error
	devices   []ns.Device
}

func (f *fakeLibrary) note(op string, r any) error {
	f.operation = op
	f.request = r
	if f.options.Sink != nil {
		if err := f.options.Sink(context.Background(), ns.Event{Operation: op, Stage: "fixture", Kind: ns.StageStarted}); err != nil {
			return err
		}
	}
	return f.err
}
func (f *fakeLibrary) Resolve(_ context.Context, r ns.ResolveRequest) (ns.Project, error) {
	return ns.Project{Directory: r.ProjectDir, ApplicationID: "org.example.app"}, f.note("resolve", r)
}
func (f *fakeLibrary) Prepare(_ context.Context, r ns.PrepareRequest) (ns.PreparedProject, error) {
	return ns.PreparedProject{NativeDir: "native"}, f.note("prepare", r)
}
func (f *fakeLibrary) Build(_ context.Context, r ns.BuildRequest) (ns.BuildResult, error) {
	return ns.BuildResult{Artifacts: []ns.Artifact{{Kind: "app", Path: "app path"}}}, f.note("build", r)
}
func (f *fakeLibrary) Devices(_ context.Context, r ns.DeviceQuery) ([]ns.Device, error) {
	f.note("devices", r)
	return f.devices, nil
}
func (f *fakeLibrary) Run(_ context.Context, r ns.RunRequest) (*ns.Session, error) {
	return &ns.Session{}, f.note("run", r)
}
func (f *fakeLibrary) InspectXcode(_ context.Context, r ns.XcodeInspectionRequest) (ns.XcodeInspection, error) {
	return ns.XcodeInspection{Text: "fixture text"}, f.note("inspect-xcode", r)
}
func factoryFor(f *fakeLibrary) factory {
	return func(o ns.Options) (library, error) { f.options = o; return f, nil }
}

var targetArgs = []string{"--platform", "ios", "--output", "generated path", "--destination", "simulator", "--device", "exact", "--arch", "arm64"}

func TestNativeDevelopmentFlags(t *testing.T) {
	for _, extra := range [][]string{{"--hmr", "--hmr-port", "51234"}, {"--hmr", "--configuration", "release"}, {"--hmr-port", "51234"}, {"--hmr", "--hmr-port", "65536"}} {
		f := &fakeLibrary{}
		args := append(append([]string{"run"}, targetArgs...), extra...)
		var out, diag bytes.Buffer
		code := execute(context.Background(), args, &out, &diag, factoryFor(f))
		if len(extra) == 3 && extra[0] == "--hmr" && extra[2] == "51234" {
			if code != 0 {
				t.Fatal(code, diag.String())
			}
			r := f.request.(ns.RunRequest)
			if r.Development == nil || r.Development.Port != 51234 {
				t.Fatal(r)
			}
		} else if code != 2 || f.operation != "" {
			t.Fatal("invalid development request reached library", extra, code, f.operation)
		}
	}
}

func TestCommands(t *testing.T) {
	for _, op := range []string{"resolve", "prepare", "build", "devices", "run", "inspect-xcode"} {
		for _, structured := range []bool{false, true} {
			t.Run(op+map[bool]string{true: "/json", false: "/human"}[structured], func(t *testing.T) {
				f := &fakeLibrary{}
				args := []string{op}
				switch op {
				case "prepare", "build", "run":
					args = append(args, targetArgs...)
				case "devices":
					args = append(args, "--platform", "android")
				case "inspect-xcode":
					args = append(args, "--file", "input path", "--cache", "cache path")
				}
				if structured {
					args = append(args, "--json")
				}
				var out, diag bytes.Buffer
				if code := execute(context.Background(), args, &out, &diag, factoryFor(f)); code != 0 {
					t.Fatalf("code %d %s", code, diag.String())
				}
				if f.operation != op || !strings.Contains(diag.String(), "fixture") {
					t.Fatalf("missing public call/diagnostic: %s %s", f.operation, &diag)
				}
				if structured {
					var r response
					if err := json.Unmarshal(out.Bytes(), &r); err != nil || r.Version != 1 || r.Operation != op || r.Error != nil {
						t.Fatalf("bad response: %s %v", &out, err)
					}
					if strings.Contains(out.String(), "stage-started") {
						t.Fatal("diagnostic in stdout")
					}
				} else if out.Len() == 0 {
					t.Fatal("missing human result")
				}
				switch r := f.request.(type) {
				case ns.BuildRequest:
					if !filepath.IsAbs(r.ProjectDir) || !filepath.IsAbs(r.OutputDir) || r.Target.Destination.ID != "exact" {
						t.Fatalf("request %+v", r)
					}
				case ns.RunRequest:
					if r.DeviceID != r.Build.Target.Destination.ID {
						t.Fatalf("run %+v", r)
					}
				case ns.XcodeInspectionRequest:
					if !filepath.IsAbs(r.File) || !filepath.IsAbs(r.CacheDir) {
						t.Fatalf("inspect %+v", r)
					}
				}
			})
		}
	}
}
func TestValidationBeforeConstruction(t *testing.T) {
	cases := [][]string{{"unknown"}, {"resolve", "extra"}, {"devices"}, {"devices", "--platform", "bad"}, {"build"}, {"build", "--platform", "ios"}, {"inspect-xcode"}, {"resolve", "--unknown"}}
	for _, args := range cases {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			var out, diag bytes.Buffer
			calls := 0
			code := execute(context.Background(), append([]string{"--json"}, args...), &out, &diag, func(ns.Options) (library, error) { calls++; return nil, nil })
			var r response
			if code != 2 || calls != 0 || json.Unmarshal(out.Bytes(), &r) != nil || r.Error.Code != "invalid_input" {
				t.Fatalf("code=%d calls=%d out=%s diag=%s", code, calls, &out, &diag)
			}
		})
	}
}
func TestHelpIsLazy(t *testing.T) {
	for _, args := range [][]string{nil, {"--help"}, {"build", "--help"}, {"help", "run"}} {
		var out bytes.Buffer
		code := execute(context.Background(), args, &out, io.Discard, func(ns.Options) (library, error) { t.Fatal("help constructed library"); return nil, nil })
		if code != 0 || !strings.Contains(out.String(), "Usage:") {
			t.Fatalf("%v: %d %s", args, code, &out)
		}
	}
}
func TestErrorsAndRedaction(t *testing.T) {
	for _, tc := range []struct {
		err   error
		code  int
		label string
	}{{ns.ErrInvalidInput, 2, "invalid_input"}, {ns.ErrUnavailable, 3, "unavailable"}, {ns.ErrUnsupportedHost, 3, "unsupported_host"}, {ns.ErrToolchain, 3, "toolchain_unavailable"}, {ns.ErrContention, 4, "contention"}, {ns.ErrBuild, 1, "operation_failed"}, {ns.ErrSink, 1, "diagnostic_failed"}, {context.Canceled, 130, "cancelled"}, {context.DeadlineExceeded, 124, "deadline_exceeded"}} {
		t.Run(tc.label, func(t *testing.T) {
			f := &fakeLibrary{err: &ns.OperationError{Operation: "resolve", Kind: tc.err, Cause: errors.New("PRIVATE_SECRET")}}
			var out bytes.Buffer
			code := execute(context.Background(), []string{"resolve", "--json"}, &out, io.Discard, factoryFor(f))
			var r response
			if code != tc.code || json.Unmarshal(out.Bytes(), &r) != nil || r.Error.Code != tc.label || strings.Contains(out.String(), "PRIVATE_SECRET") {
				t.Fatalf("%d %s", code, &out)
			}
		})
	}
}

// Operation advice rides the existing message field for both output modes; the
// envelope shape and failure code do not change.
func TestFailureAdviceSurfacesInMessage(t *testing.T) {
	advice := "xcodebuild build failed (exit 65): file.m:10:5: error: use of undeclared identifier 'x'"
	f := &fakeLibrary{err: &ns.OperationError{Operation: "build", Kind: ns.ErrBuild, Cause: errors.New("PRIVATE_SECRET"), Advice: advice}}
	var out, diag bytes.Buffer
	code := execute(context.Background(), append([]string{"build"}, targetArgs...), &out, &diag, factoryFor(f))
	if code != 1 || !strings.Contains(diag.String(), advice) {
		t.Fatalf("%d %s", code, &diag)
	}
	f = &fakeLibrary{err: &ns.OperationError{Operation: "build", Kind: ns.ErrBuild, Cause: errors.New("PRIVATE_SECRET"), Advice: advice}}
	out.Reset()
	code = execute(context.Background(), append(append([]string{"build"}, targetArgs...), "--json"), &out, io.Discard, factoryFor(f))
	var r response
	if code != 1 || json.Unmarshal(out.Bytes(), &r) != nil || r.Error == nil || r.Error.Code != "operation_failed" || r.Error.Message != advice || strings.Contains(out.String(), "PRIVATE_SECRET") {
		t.Fatalf("%d %s", code, &out)
	}
}

type brokenWriter struct{}

func (brokenWriter) Write([]byte) (int, error) { return 0, errors.New("broken") }
func TestOutputFailures(t *testing.T) {
	for _, structured := range []bool{true, false} {
		args := []string{"resolve"}
		if structured {
			args = append(args, "--json")
		}
		if code := execute(context.Background(), args, brokenWriter{}, io.Discard, factoryFor(&fakeLibrary{})); code != 1 {
			t.Fatalf("code %d", code)
		}
	}
	if code := execute(context.Background(), []string{"resolve", "--json"}, io.Discard, brokenWriter{}, factoryFor(&fakeLibrary{})); code != 1 {
		t.Fatalf("sink code %d", code)
	}
}
func TestRealPublicOperations(t *testing.T) {
	t.Setenv("ADB", filepath.Join(t.TempDir(), "missing-adb"))
	root := t.TempDir()
	os.WriteFile(filepath.Join(root, "package.json"), []byte(`{"name":"app","version":"1"}`), 0600)
	os.WriteFile(filepath.Join(root, "nativescript.config.cjs"), []byte(`module.exports={id:'org.example.app'}`), 0600)
	os.Mkdir(filepath.Join(root, "app"), 0700)
	os.Mkdir(filepath.Join(root, "App_Resources"), 0700)
	for _, op := range []string{"resolve", "prepare", "build", "devices", "run"} {
		args := []string{op, "--json", "--project", root}
		if op == "devices" {
			args = []string{op, "--json"}
		}
		switch op {
		case "prepare", "build", "run":
			args = append(args, targetArgs...)
		case "devices":
			args = append(args, "--platform", "android")
		}
		var out bytes.Buffer
		expected := 3
		text := `"code":"unavailable"`
		if op == "run" {
			expected = 2
			text = `"code":"invalid_input"`
		}
		if op == "devices" {
			text = `"code":"toolchain_unavailable"`
		}
		if op == "resolve" {
			expected = 0
			text = `"ApplicationID":"org.example.app"`
		}
		if code := Execute(context.Background(), args, &out, io.Discard); code != expected || !strings.Contains(out.String(), text) {
			t.Fatalf("%s %d %s", op, code, &out)
		}
	}
	if runtime.GOOS == "windows" {
		t.Skip("real helper unavailable on Windows")
	}
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("Node not installed")
	}
	fixture, err := filepath.Abs("../jsbridge/testdata/project.pbxproj")
	if err != nil {
		t.Fatal(err)
	}
	var out, diag bytes.Buffer
	if code := Execute(context.Background(), []string{"inspect-xcode", "--file", fixture, "--cache", t.TempDir(), "--json"}, &out, &diag); code != 0 {
		t.Fatalf("%d %s %s", code, &out, &diag)
	}
	var r struct{ Result ns.XcodeInspection }
	if err := json.Unmarshal(out.Bytes(), &r); err != nil || !strings.Contains(r.Result.Text, "PBXProject") {
		t.Fatalf("actual parser %s %v", &out, err)
	}
	if !strings.Contains(diag.String(), "stage-completed") {
		t.Fatalf("missing events %s", &diag)
	}
}
func TestLibraryImportGraph(t *testing.T) {
	cmd := exec.Command("go", "list", "-deps", "github.com/octane-xplat/nativescript-cli", "github.com/octane-xplat/nativescript-cli/extension")
	b, err := cmd.Output()
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"spf13", "internal/cli"} {
		if strings.Contains(string(b), forbidden) {
			t.Fatalf("library imports %s", forbidden)
		}
	}
}

type ownedSession struct {
	done   chan struct{}
	closed bool
}

func (s *ownedSession) Wait() error                 { <-s.done; return context.Canceled }
func (s *ownedSession) Close(context.Context) error { s.closed = true; close(s.done); return nil }
func TestCancellationClosesOnlyReturnedSession(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	owned := &ownedSession{done: make(chan struct{})}
	unrelated := &ownedSession{done: make(chan struct{})}
	if err := waitSession(ctx, owned); !errors.Is(err, context.Canceled) || !owned.closed || unrelated.closed {
		t.Fatalf("cleanup %v", err)
	}
}
func TestCancelledBeforeCall(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	code := execute(ctx, []string{"resolve", "--json"}, io.Discard, io.Discard, func(ns.Options) (library, error) { t.Fatal("constructed after cancellation"); return nil, nil })
	if code != 130 {
		t.Fatal(code)
	}
}

func TestJSONFlagAfterInvalidFlag(t *testing.T) {
	var out bytes.Buffer
	code := Execute(context.Background(), []string{"resolve", "--unknown", "--json"}, &out, io.Discard)
	var r response
	if code != 2 || json.Unmarshal(out.Bytes(), &r) != nil || r.Error.Code != "invalid_input" {
		t.Fatalf("%d %s", code, &out)
	}
}
func TestHumanErrorUsesOnlyStderr(t *testing.T) {
	var out, diag bytes.Buffer
	code := Execute(context.Background(), []string{"resolve"}, &out, &diag)
	if code != 2 || out.Len() != 0 || !strings.Contains(diag.String(), "check the selected project") {
		t.Fatalf("%d %s %s", code, &out, &diag)
	}
}

func TestRunDeviceDefaulting(t *testing.T) {
	base := []string{"run", "--platform", "ios", "--output", "generated path", "--configuration", "debug"}
	sim := ns.Device{ID: "SIM1", Name: "iPhone", Platform: "ios", Kind: ns.Simulator, Architecture: "arm64", State: "Booted"}
	sim2 := ns.Device{ID: "SIM2", Name: "iPhone2", Platform: "ios", Kind: ns.Simulator, Architecture: "arm64", State: "Booted"}
	shut := ns.Device{ID: "SHUT", Name: "Off", Platform: "ios", Kind: ns.Simulator, Architecture: "arm64", State: "Shutdown"}
	physical := ns.Device{ID: "PHYS", Name: "Phone", Platform: "ios", Kind: ns.PhysicalDevice, Architecture: "arm64", State: "connected"}

	// Single running simulator fills id, kind and arch.
	f := &fakeLibrary{devices: []ns.Device{sim, shut, physical}}
	var out, diag bytes.Buffer
	if code := execute(context.Background(), base, &out, &diag, factoryFor(f)); code != 0 {
		t.Fatal(code, diag.String())
	}
	r := f.request.(ns.RunRequest)
	if r.DeviceID != "SIM1" || r.Build.Target.Destination.ID != "SIM1" || r.Build.Target.Destination.Kind != ns.Simulator || r.Build.Target.Destination.Architecture != "arm64" {
		t.Fatalf("default not applied: %+v", r.Build.Target.Destination)
	}
	// Explicit --device wins without calling Devices.
	f2 := &fakeLibrary{}
	args := append([]string{"run"}, targetArgs...)
	out.Reset()
	diag.Reset()
	if code := execute(context.Background(), args, &out, &diag, factoryFor(f2)); code != 0 {
		t.Fatal(code, diag.String())
	}
	if f2.request.(ns.RunRequest).DeviceID != "exact" {
		t.Fatal("explicit device lost")
	}
	// Zero or multiple candidates reject with a listing.
	for _, ds := range [][]ns.Device{{shut}, {sim, sim2}} {
		f3 := &fakeLibrary{devices: ds}
		out.Reset()
		diag.Reset()
		if code := execute(context.Background(), base, &out, &diag, factoryFor(f3)); code != 2 || f3.operation != "devices" {
			t.Fatalf("expected invalid-input after discovery, got %d %s", code, f3.operation)
		}
	}
}
