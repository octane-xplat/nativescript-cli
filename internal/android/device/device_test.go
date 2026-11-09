package device

import (
	"context"
	"errors"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestDiscoverySelectionCompatibility(t *testing.T) {
	ds, e := parseDevices("List of devices attached\nemulator-5580 device model:Fixture\noff offline\nphone unauthorized\n")
	if e != nil || len(ds) != 3 {
		t.Fatal(ds, e)
	}
	for _, id := range []string{"", "off", "phone", "missing"} {
		if _, e = Select(ds, id); !errors.Is(e, workflow.ErrInvalid) {
			t.Fatal(id, e)
		}
	}
	if _, e = Select(append(ds, ds...), "emulator-5580"); e == nil {
		t.Fatal("ambiguous accepted")
	}
	for _, s := range []string{"", "junk", "List of devices attached\nx device\nx device"} {
		if _, e = parseDevices(s); e == nil {
			t.Fatal(s)
		}
	}
	art, d := fixture(t)
	if !Compatible(art, d) {
		t.Fatal("compatible rejected")
	}
	art.Kind = "aab"
	if Compatible(art, d) {
		t.Fatal("AAB accepted")
	}
}
func fixture(t *testing.T) (project.Artifact, project.Device) {
	t.Helper()
	root := t.TempDir()
	path := filepath.Join(root, "space app.apk")
	os.WriteFile(path, []byte("component fixture"), 0600)
	return project.Artifact{Identity: project.Identity{Schema: 1, Revision: "fixture", ProjectDir: root, Target: project.Target{Platform: "android", DestinationKind: "simulator", DestinationID: "generic", Architecture: "arm64-v8a", Configuration: "debug"}}, Path: path, Kind: "apk", ApplicationID: "org.example.app"}, project.Device{ID: "emulator-5580", Platform: "android", Kind: "simulator", Architecture: "arm64-v8a", State: "device"}
}

type fake struct {
	mu                         sync.Mutex
	calls                      []string
	fail, badging              string
	running, forward, conflict bool
	timeout, errstatus         bool
}
type handle struct {
	err  error
	done chan struct{}
	once sync.Once
}

func (h *handle) Wait() (process.Exit, error) {
	if h.done != nil {
		<-h.done
	}
	return process.Exit{}, h.err
}
func (h *handle) Close(context.Context) error {
	h.once.Do(func() {
		if h.done != nil {
			close(h.done)
		}
	})
	return nil
}
func (f *fake) Start(ctx context.Context, c process.Command) (process.Handle, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	s := strings.Join(c.Args, " ")
	f.calls = append(f.calls, s)
	h := &handle{}
	if f.fail != "" && strings.Contains(s, f.fail) {
		h.err = process.ErrExit
		return h, nil
	}
	out := ""
	switch {
	case strings.Contains(s, "dump badging"):
		out = "package: name='org.example.app'\nminSdkVersion:'23'\nnative-code: 'arm64-v8a'\n"
		if f.badging != "" {
			out = f.badging
		}
	case s == "devices -l":
		out = "List of devices attached\nemulator-5580 device model:Fixture\n"
	case strings.Contains(s, "ro.product.cpu.abi"):
		out = "arm64-v8a"
	case strings.Contains(s, "ro.build.version.sdk"):
		out = "35"
	case strings.Contains(s, "pidof"):
		if f.running {
			out = "123"
		} else {
			h.err = process.ErrExit
		}
	case strings.Contains(s, "reverse --list"):
		if f.forward || f.conflict {
			out = "emulator-5580 tcp:5173 tcp:5173\n"
		}
	case strings.Contains(s, "reverse --no-rebind"):
		f.forward = true
		if f.fail == "reverse-cancel" {
			h.err = context.Canceled
		}
	case strings.Contains(s, "reverse --remove"):
		f.forward = false
	case strings.Contains(s, "install -r"):
		out = "Success"
	case strings.Contains(s, "resolve-activity"):
		out = "org.example.app/com.tns.NativeScriptActivity"
	case strings.Contains(s, "am start"):
		if f.timeout {
			out = "Status: timeout\nLaunchState: UNKNOWN (-1)\nWaitTime: 24711\nComplete"
			f.running = true
		} else if f.errstatus {
			out = "Error: Activity not started, unable to resolve Intent"
		} else {
			out = "Status: ok"
			f.running = true
		}
	case strings.Contains(s, "force-stop"):
		f.running = false
	case strings.Contains(s, "logcat"):
		out = "runtime-health fixture"
		h.done = make(chan struct{})
	}
	if c.Output != nil {
		c.Output(ctx, process.Stdout, []byte(out))
	}
	return h, nil
}
func TestLifecycleFailuresAndCleanup(t *testing.T) {
	for _, fail := range []string{"", "install -r", "am start", "logcat", "reverse-cancel"} {
		t.Run(fail, func(t *testing.T) {
			art, d := fixture(t)
			f := &fake{fail: fail}
			a := Adapter{Executor: f, Reverse: []Reverse{{5173, 5173}}}
			s, e := a.Launch(context.Background(), art, d)
			if fail != "" {
				if e == nil {
					t.Fatal("failure lost")
				}
			} else {
				if e != nil {
					t.Fatal(e)
				}
				if len(s.LogBuffer.Logs()) == 0 {
					t.Fatal("missing logs")
				}
				if e = s.Close(context.Background()); !errors.Is(e, context.Canceled) {
					t.Fatal(e)
				}
				s.Close(context.Background())
			}
			if f.running || f.forward {
				t.Fatal("owned resources leaked")
			}
			for _, c := range f.calls {
				if c != "devices -l" && !strings.Contains(c, "dump badging") && !strings.HasPrefix(c, "-s emulator-5580 ") {
					t.Fatal("inexact serial", c)
				}
			}
		})
	}
}
func TestLaunchStatusTimeoutStillRuns(t *testing.T) {
	art, d := fixture(t)
	f := &fake{timeout: true}
	a := Adapter{Executor: f, Reverse: []Reverse{{5173, 5173}}}
	s, e := a.Launch(context.Background(), art, d)
	if e != nil {
		t.Fatal(e)
	}
	if len(s.LogBuffer.Logs()) == 0 {
		t.Fatal("missing logs")
	}
	if e = s.Close(context.Background()); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	s.Close(context.Background())
	if f.running || f.forward {
		t.Fatal("owned resources leaked")
	}
}
func TestLaunchStatusErrorRejected(t *testing.T) {
	art, d := fixture(t)
	f := &fake{errstatus: true}
	a := Adapter{Executor: f, Reverse: []Reverse{{5173, 5173}}}
	if _, e := a.Launch(context.Background(), art, d); e == nil {
		t.Fatal("error status accepted")
	}
}
func TestRejectsBeforeInstall(t *testing.T) {
	for _, kind := range []string{"running", "forward", "identity", "abi", "sdk", "physical", "reverse"} {
		t.Run(kind, func(t *testing.T) {
			art, d := fixture(t)
			f := &fake{}
			a := Adapter{Executor: f, Reverse: []Reverse{{5173, 5173}}}
			switch kind {
			case "running":
				f.running = true
			case "forward":
				f.conflict = true
			case "identity":
				f.badging = "package: name='wrong'\nminSdkVersion:'23'"
			case "abi":
				f.badging = "package: name='org.example.app'\nminSdkVersion:'23'\nnative-code: 'x86_64'"
			case "sdk":
				f.badging = "package: name='org.example.app'\nminSdkVersion:'99'"
			case "physical":
				art.Identity.Target.DestinationKind = "device"
			case "reverse":
				a.Reverse = []Reverse{{0, 1}}
			}
			s, e := a.Launch(context.Background(), art, d)
			if e == nil || s != nil {
				t.Fatal("accepted", kind)
			}
			if kind == "forward" && !errors.Is(e, workspace.ErrBusy) {
				t.Fatal(e)
			}
			for _, c := range f.calls {
				if strings.Contains(c, "install -r") || strings.Contains(c, "--remove") {
					t.Fatal("unexpected mutation", c)
				}
			}
		})
	}
}

func TestSerialLeaseAndParentCancellation(t *testing.T) {
	art, d := fixture(t)
	f := &fake{}
	a := Adapter{Executor: f, Reverse: []Reverse{{5173, 5173}}}
	ctx, cancel := context.WithCancel(context.Background())
	s, e := a.Launch(ctx, art, d)
	if e != nil {
		t.Fatal(e)
	}
	waiting, stop := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer stop()
	if _, e = a.Launch(waiting, art, d); !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal("serial ownership not retained", e)
	}
	cancel()
	if e = s.Wait(); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	if f.forward || f.running {
		t.Fatal("parent cancellation leaked")
	}
}

// Contract evidence: full sync uses NativeScript's debug-runtime staging area,
// bypasses install, and retires its staging files on Close or transfer failure.
func TestBundleSyncSkipsInstallAndCleansStaging(t *testing.T) {
	for _, failure := range []string{"", " push "} {
		t.Run("transfer-"+failure, func(t *testing.T) {
			art, d := fixture(t)
			f := &fake{fail: failure}
			a := Adapter{Executor: f, BundleDirectory: t.TempDir()}
			session, err := a.Launch(context.Background(), art, d)
			if failure == "" {
				if err != nil {
					t.Fatal(err)
				}
				_ = session.Close(context.Background())
			} else if err == nil {
				t.Fatal("transfer failure accepted")
			}
			f.mu.Lock()
			defer f.mu.Unlock()
			calls := strings.Join(f.calls, "\n")
			if strings.Contains(calls, "install -r") {
				t.Fatal("sync reinstalled APK")
			}
			if !strings.Contains(calls, "/fullsync") || !strings.Contains(calls, "push ") {
				t.Fatal(calls)
			}
			if strings.Count(calls, "shell rm -rf /data/local/tmp/org.example.app/fullsync") != 2 {
				t.Fatal("staging not retired", calls)
			}
		})
	}
}

func TestInstallHooksBracketInstallBeforeLaunch(t *testing.T) {
	for _, reject := range []string{"", "before", "after"} {
		t.Run(reject, func(t *testing.T) {
			art, d := fixture(t)
			f := &fake{}
			rejected := errors.New("hook rejected")
			a := Adapter{Executor: f, Install: func(_ context.Context, before bool) error {
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
			install := strings.Index(calls, "install -r")
			if reject == "before" {
				if install >= 0 {
					t.Fatal("install ran after rejection")
				}
				return
			}
			if install < strings.Index(calls, "hook-before") || strings.Index(calls, "hook-after") < install {
				t.Fatal(calls)
			}
			launch := strings.Index(calls, "am start")
			if reject == "after" && launch >= 0 {
				t.Fatal("app launched after hook rejected")
			}
			if reject == "" && launch < strings.Index(calls, "hook-after") {
				t.Fatal(calls)
			}
		})
	}
}
