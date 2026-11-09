package nativescript

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strings"
	"sync/atomic"
	"testing"

	androidbuild "github.com/octane-xplat/nativescript-cli/internal/android/build"
	"github.com/octane-xplat/nativescript-cli/internal/bundle"
	iosbuild "github.com/octane-xplat/nativescript-cli/internal/ios/build"
	iosprepare "github.com/octane-xplat/nativescript-cli/internal/ios/prepare"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

// These adapters are component fakes, never installed by New.
type stages struct {
	launched *workflow.Session
	calls    []string
	fail     string
	cause    error
	cancel   context.CancelFunc
	stale    string
	held     atomic.Bool
	p        project.Prepared
	d        project.Device
	resolved project.Resolved
}

func (f *stages) step(ctx context.Context, name string) error {
	f.calls = append(f.calls, name)
	if name == "prepare" || name == "bundle" || name == "compile" {
		if !f.held.Load() {
			return errors.New("writer without lease")
		}
	}
	if name == f.fail {
		if f.cancel != nil {
			f.cancel()
		}
		return f.cause
	}
	return ctx.Err()
}
func (f *stages) Resolve(ctx context.Context, dir string) (project.Resolved, error) {
	err := f.step(ctx, "resolve")
	if f.resolved.Directory != "" {
		return f.resolved, err
	}
	return project.Resolved{Directory: dir, Revision: "source", ApplicationID: "org.test.app"}, err
}
func (f *stages) Prepare(ctx context.Context, r project.Resolved, l workspace.Lease) (project.Prepared, error) {
	err := f.step(ctx, "prepare")
	id := l.Layout().Identity
	f.p = project.Prepared{Identity: id, NativeDir: filepath.Join(l.Layout().GeneratedRoot, "native"), BundleDir: l.Layout().BundleStaging}
	p := f.p
	if f.stale == "prepare" {
		p.Identity.Revision = "stale"
	}
	return p, err
}
func (f *stages) Bundle(ctx context.Context, r project.Resolved, p project.Prepared, l workspace.Lease) (project.Bundle, error) {
	err := f.step(ctx, "bundle")
	id := p.Identity
	if f.stale == "bundle" {
		id.Revision = "stale"
	}
	return project.Bundle{Identity: id, Directory: p.BundleDir, Entry: filepath.Join(p.BundleDir, "main.js")}, err
}
func (f *stages) Compile(ctx context.Context, p project.Prepared, b project.Bundle, l workspace.Lease) ([]project.Artifact, error) {
	err := f.step(ctx, "compile")
	id := p.Identity
	if f.stale == "compile" {
		id.Revision = "stale"
	}
	return []project.Artifact{{Identity: id, Path: filepath.Join(p.NativeDir, "app"), Kind: "app", ApplicationID: "org.test.app"}}, err
}
func (f *stages) Discover(ctx context.Context, p string) ([]project.Device, error) {
	return []project.Device{f.d}, f.step(ctx, "devices")
}
func (f *stages) Launch(ctx context.Context, a project.Artifact, d project.Device) (*workflow.Session, error) {
	if err := f.step(ctx, "launch"); err != nil {
		return nil, err
	}
	f.launched = workflow.StartSession(ctx, func(ctx context.Context) error {
		<-ctx.Done()
		f.calls = append(f.calls, "terminate")
		return ctx.Err()
	})
	return f.launched, nil
}

type trackedLocker struct{ f *stages }
type trackedLease struct {
	workspace.Lease
	f *stages
}

func (l trackedLocker) Acquire(ctx context.Context, v workspace.Layout) (workspace.Lease, error) {
	lease, err := workspace.Acquire(ctx, v)
	if err != nil {
		return nil, err
	}
	l.f.held.Store(true)
	return trackedLease{lease, l.f}, nil
}
func (l trackedLease) Release() error { err := l.Lease.Release(); l.f.held.Store(false); return err }
func fixture(t *testing.T) (*Client, *stages, BuildRequest) {
	t.Helper()
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("real F2 locking unavailable")
	}
	root := t.TempDir()
	dir := filepath.Join(root, "My App")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	r := BuildRequest{ProjectDir: dir, OutputDir: filepath.Join(root, "native outputs"), Target: Target{Platform: IOS, Configuration: Debug, Destination: Destination{Kind: Simulator, ID: "exact", Architecture: "arm64"}}}
	f := &stages{d: project.Device{ID: "exact", Platform: "ios", Kind: "simulator", Architecture: "arm64", State: "booted"}}
	c, _ := New(Options{})
	c.engine = workflow.Engine{Factory: func(map[string]string) workflow.Stages {
		return workflow.Stages{Resolver: f, Preparer: f, Bundler: f, Compiler: f, Devices: f, Launcher: f}
	}, Locker: trackedLocker{f}}
	return c, f, r
}
func TestPublicStageOrderingAndConversions(t *testing.T) {
	for _, op := range []string{"resolve", "prepare", "build", "devices", "run"} {
		t.Run(op, func(t *testing.T) {
			c, f, r := fixture(t)
			var events []Event
			c.options.Sink = func(ctx context.Context, e Event) error {
				if f.held.Load() {
					t.Fatal("sink inside lease")
				}
				events = append(events, e)
				return nil
			}
			var err error
			switch op {
			case "resolve":
				var p Project
				p, err = c.Resolve(context.Background(), ResolveRequest{r.ProjectDir})
				if p.ApplicationID != "org.test.app" {
					t.Fatal(p)
				}
			case "prepare":
				var p PreparedProject
				p, err = c.Prepare(context.Background(), PrepareRequest{ProjectDir: r.ProjectDir, OutputDir: r.OutputDir, Target: r.Target})
				if p.Identity.Target != r.Target {
					t.Fatal(p)
				}
			case "build":
				var b BuildResult
				b, err = c.Build(context.Background(), r)
				if len(b.Artifacts) != 1 || b.Prepared.Identity != b.Artifacts[0].Identity {
					t.Fatal(b)
				}
			case "devices":
				var d []Device
				d, err = c.Devices(context.Background(), DeviceQuery{IOS})
				if len(d) != 1 || d[0].ID != "exact" {
					t.Fatal(d)
				}
			case "run":
				var s *Session
				s, err = c.Run(context.Background(), RunRequest{Build: r, DeviceID: "exact"})
				if err == nil {
					for range 2 {
						if !errors.Is(s.Close(context.Background()), context.Canceled) {
							t.Fatal("close")
						}
					}
					if !errors.Is(s.Wait(), context.Canceled) {
						t.Fatal("wait")
					}
				}
			}
			if err != nil {
				t.Fatal(err)
			}
			expected := map[string][]string{"resolve": {"resolve"}, "prepare": {"resolve", "prepare"}, "build": {"resolve", "prepare", "bundle", "compile"}, "devices": {"devices"}, "run": {"devices", "resolve", "prepare", "bundle", "compile", "launch", "terminate"}}
			if !reflect.DeepEqual(f.calls, expected[op]) {
				t.Fatal(f.calls)
			}
			for i, e := range events {
				if e.Operation != op || e.Sequence != uint64(i+1) {
					t.Fatal(events)
				}
			}
			if f.held.Load() {
				t.Fatal("leaked lease")
			}
		})
	}
}
func TestFailureCancellationAndStaleHandoffs(t *testing.T) {
	for _, stage := range []string{"resolve", "prepare", "bundle", "compile", "devices", "launch"} {
		for _, cancelled := range []bool{false, true} {
			t.Run(stage+map[bool]string{true: "-cancel", false: "-fail"}[cancelled], func(t *testing.T) {
				c, f, r := fixture(t)
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				cause := errors.New("stage failure")
				f.fail = stage
				f.cause = cause
				if cancelled {
					f.cancel = cancel
					f.cause = context.Canceled
					cause = context.Canceled
				}
				_, err := c.Run(ctx, RunRequest{Build: r, DeviceID: "exact"})
				if !errors.Is(err, cause) {
					t.Fatal(err)
				}
				if f.calls[len(f.calls)-1] != stage || f.held.Load() {
					t.Fatal(f.calls, "ownership leak")
				}
				// A second operation can take the same real F2 project lock after failure.
				f.fail = ""
				f.cancel = nil
				f.calls = nil
				if _, err = c.Build(context.Background(), r); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
	for _, stage := range []string{"prepare", "bundle", "compile"} {
		t.Run("stale-"+stage, func(t *testing.T) {
			c, f, r := fixture(t)
			f.stale = stage
			b, err := c.Build(context.Background(), r)
			if !errors.Is(err, ErrBuild) || len(b.Artifacts) != 0 || f.held.Load() {
				t.Fatal(b, err)
			}
		})
	}
}
func TestSinkFailureBackpressureAndReentry(t *testing.T) {
	c, f, r := fixture(t)
	cause := errors.New("sink failed")
	calls := 0
	c.options.Sink = func(ctx context.Context, e Event) error {
		calls++
		if len(f.calls) != 0 {
			t.Fatal("advanced before sink")
		}
		return cause
	}
	_, err := c.Build(context.Background(), r)
	if !errors.Is(err, ErrSink) || !errors.Is(err, cause) || calls != 1 {
		t.Fatal(err, calls)
	}
	depth := 0
	c.options.Sink = func(ctx context.Context, e Event) error {
		if f.held.Load() {
			t.Fatal("sink under lease")
		}
		if depth == 0 {
			depth++
			_, err := c.Devices(ctx, DeviceQuery{IOS})
			depth--
			return err
		}
		return nil
	}
	if _, err = c.Build(context.Background(), r); err != nil {
		t.Fatal(err)
	}
	c.options.Sink = func(ctx context.Context, e Event) error {
		if e.Stage == "native" && e.Kind == StageCompleted {
			return cause
		}
		return nil
	}
	b, err := c.Build(context.Background(), r)
	if !errors.Is(err, ErrSink) || len(b.Artifacts) != 0 || f.held.Load() {
		t.Fatal(b, err)
	}
}
func TestUnavailableValidationAndLazyConstruction(t *testing.T) {
	c, _, r := fixture(t)
	c, _ = New(Options{Environment: map[string]string{"ADB": filepath.Join(t.TempDir(), "missing-adb")}})
	os.WriteFile(filepath.Join(r.ProjectDir, "package.json"), []byte(`{"name":"app","version":"1"}`), 0600)
	os.WriteFile(filepath.Join(r.ProjectDir, "nativescript.config.cjs"), []byte(`module.exports={id:'org.example.app'}`), 0600)
	os.Mkdir(filepath.Join(r.ProjectDir, "app"), 0700)
	os.Mkdir(filepath.Join(r.ProjectDir, "App_Resources"), 0700)
	_, err := c.Build(context.Background(), r)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatal(err)
	}
	_, err = c.Prepare(context.Background(), PrepareRequest{ProjectDir: r.ProjectDir, OutputDir: r.OutputDir, Target: r.Target})
	if !errors.Is(err, ErrUnavailable) {
		t.Fatal(err)
	}
	_, err = c.Resolve(context.Background(), ResolveRequest{r.ProjectDir})
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.Devices(context.Background(), DeviceQuery{Android})
	if !errors.Is(err, ErrToolchain) {
		t.Fatal(err)
	}
	r.Target.Platform = Android
	s, err := c.Run(context.Background(), RunRequest{Build: r, DeviceID: "exact"})
	if s != nil || !errors.Is(err, ErrToolchain) {
		t.Fatal(s, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = c.Build(ctx, r)
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	_, err = c.Build(context.Background(), BuildRequest{})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatal(err)
	}
	if _, err = os.Stat(r.OutputDir); !os.IsNotExist(err) {
		t.Fatal("unavailable operation created output")
	}
}
func TestEnvironmentCopiesAndDeviceMismatch(t *testing.T) {
	c, f, r := fixture(t)
	env := map[string]string{"TEST": "original"}
	configured, _ := New(Options{Environment: env})
	env["TEST"] = "caller change"
	c.options = configured.options
	factory := c.engine.Factory
	c.engine.Factory = func(e map[string]string) workflow.Stages {
		if e["TEST"] != "original" {
			t.Fatal(e)
		}
		e["TEST"] = "adapter change"
		return factory(e)
	}
	for range 2 {
		if _, err := c.Build(context.Background(), r); err != nil {
			t.Fatal(err)
		}
	}
	f.calls = nil
	f.d.ID = "other"
	if _, err := c.Run(context.Background(), RunRequest{Build: r, DeviceID: "exact"}); !errors.Is(err, ErrInvalidInput) || !reflect.DeepEqual(f.calls, []string{"devices"}) {
		t.Fatal(err, f.calls)
	}
}

func TestEveryOperationRejectsPreCancellation(t *testing.T) {
	c, f, r := fixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	checks := []func() error{
		func() error { _, e := c.Resolve(ctx, ResolveRequest{r.ProjectDir}); return e },
		func() error {
			_, e := c.Prepare(ctx, PrepareRequest{ProjectDir: r.ProjectDir, OutputDir: r.OutputDir, Target: r.Target})
			return e
		},
		func() error { _, e := c.Build(ctx, r); return e },
		func() error { _, e := c.Devices(ctx, DeviceQuery{IOS}); return e },
		func() error { _, e := c.Run(ctx, RunRequest{Build: r, DeviceID: "exact"}); return e },
	}
	for _, check := range checks {
		err := check()
		var op *OperationError
		if !errors.Is(err, context.Canceled) || !errors.As(err, &op) {
			t.Fatal(err)
		}
	}
	if len(f.calls) != 0 {
		t.Fatal(f.calls)
	}
}

func TestLaunchTerminalSinkFailureRetiresSession(t *testing.T) {
	c, f, r := fixture(t)
	cause := errors.New("terminal sink failure")
	c.options.Sink = func(ctx context.Context, e Event) error {
		if e.Stage == "launch" && e.Kind == StageCompleted {
			return cause
		}
		return nil
	}
	s, err := c.Run(context.Background(), RunRequest{Build: r, DeviceID: "exact"})
	if s != nil || !errors.Is(err, cause) || !errors.Is(err, ErrSink) || f.held.Load() {
		t.Fatal(s, err)
	}
	if f.launched == nil || !errors.Is(f.launched.Wait(), context.Canceled) {
		t.Fatal("launched session not retired")
	}
}

func TestSinkBlocksStageAdvancement(t *testing.T) {
	c, f, r := fixture(t)
	entered, release, done := make(chan struct{}), make(chan struct{}), make(chan error, 1)
	c.options.Sink = func(ctx context.Context, e Event) error {
		if e.Sequence == 1 {
			close(entered)
			<-release
		}
		return nil
	}
	go func() { _, err := c.Build(context.Background(), r); done <- err }()
	<-entered
	if len(f.calls) != 0 {
		t.Fatal("stage advanced while sink blocked")
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

// Tool failures keep their stage, exit status and a bounded sanitized summary
// in Advice instead of collapsing to a bare category.
func TestToolFailureDiagnosticsSurfaceInAdvice(t *testing.T) {
	for _, c := range []struct {
		name string
		err  error
		want []string
	}{
		{"xcodebuild", &iosbuild.Failure{Stage: "build", ExitCode: 65, Diagnostic: "CompileC file.o file.m\nfile.m:10:5: error: use of undeclared identifier 'x'\nnote: expanded\n** BUILD FAILED **\n", Cause: errors.New("exit")}, []string{"xcodebuild build failed (exit 65)", "error: use of undeclared identifier 'x'", "** BUILD FAILED **"}},
		{"pod", &iosprepare.Failure{Stage: "pod install", ExitCode: 1, Diagnostic: "Analyzing dependencies\n[!] Invalid `Podfile` file: cannot eval fragment twice\n", Cause: errors.New("exit")}, []string{"pod install failed (exit 1)", "Invalid `Podfile` file"}},
		{"spm resolve", &iosprepare.Failure{Stage: "xcodebuild -resolvePackageDependencies", ExitCode: 74, Diagnostic: "Fetching\ncould not resolve: error: no such module 'Missing'\n", Cause: errors.New("exit")}, []string{"xcodebuild -resolvePackageDependencies failed (exit 74)", "no such module"}},
		{"vite", &bundle.Failure{Diagnostic: "[MISSING_EXPORT] \"missing\" is not exported by \"app/value.ts\", imported by \"app/app.ts\"", Cause: errors.New("remote")}, []string{"bundling failed", "MISSING_EXPORT", "is not exported"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			err := operationError("build", c.err)
			var op *OperationError
			if !errors.As(err, &op) || !errors.Is(err, ErrBuild) {
				t.Fatalf("category lost: %v", err)
			}
			for _, want := range c.want {
				if !strings.Contains(op.Advice, want) {
					t.Fatalf("advice %q missing %q", op.Advice, want)
				}
			}
		})
	}
}

// Native and dependency failures also convert to BuildError, preserving stage
// and exit code for programmatic inspection.
func TestToolFailurePreservesBuildError(t *testing.T) {
	for _, err := range []error{
		&iosbuild.Failure{Stage: "archive", ExitCode: 65, Cause: errors.New("exit")},
		&iosprepare.Failure{Stage: "pod install", ExitCode: 1, Cause: errors.New("exit")},
	} {
		var be *BuildError
		if !errors.As(operationError("build", err), &be) {
			t.Fatalf("BuildError lost: %v", err)
		}
	}
	var be *BuildError
	if !errors.As(operationError("build", &androidbuild.Failure{Stage: ":app:assembleDebug", ExitCode: 1, Cause: errors.New("exit")}), &be) || be.Stage != ":app:assembleDebug" {
		t.Fatal("android BuildError lost")
	}
}

// Advice stays bounded no matter how large the captured tool log is.
func TestToolDiagnosticBounded(t *testing.T) {
	var sb strings.Builder
	for i := 0; i < 500; i++ {
		sb.WriteString("noise line\n")
	}
	for i := 0; i < 200; i++ {
		sb.WriteString("file.m:1:1: error: repeated failure line\n")
	}
	op, ok := operationError("build", &iosbuild.Failure{Stage: "build", ExitCode: 65, Diagnostic: sb.String(), Cause: errors.New("exit")}).(*OperationError)
	if !ok {
		t.Fatal("not OperationError")
	}
	if len(op.Advice) > 2048+64 {
		t.Fatalf("unbounded advice: %d bytes", len(op.Advice))
	}
	if strings.Count(op.Advice, "\n") > 10 {
		t.Fatalf("unbounded advice lines: %d", strings.Count(op.Advice, "\n"))
	}
	if !strings.Contains(op.Advice, "error: repeated failure line") {
		t.Fatalf("error lines missing: %q", op.Advice)
	}
	// Output without failure markers falls back to the bounded tail.
	op, ok = operationError("build", &iosprepare.Failure{Stage: "pod install", ExitCode: 1, Diagnostic: "first\nmiddle\nlast line of output\n", Cause: errors.New("exit")}).(*OperationError)
	if !ok || !strings.Contains(op.Advice, "last line of output") {
		t.Fatalf("tail fallback lost: %q", op.Advice)
	}
	// ANSI sequences never reach advice.
	op, ok = operationError("build", &iosprepare.Failure{Stage: "pod install", ExitCode: 1, Diagnostic: "\x1b[31merror: colored\x1b[0m\n", Cause: errors.New("exit")}).(*OperationError)
	if !ok || strings.Contains(op.Advice, "\x1b") || !strings.Contains(op.Advice, "error: colored") {
		t.Fatalf("ANSI leaked: %q", op.Advice)
	}
	// A cancellation wrapped in a tool failure is never reported as a tool failure.
	err := operationError("run", errors.Join(context.Canceled, &iosprepare.Failure{Stage: "pod install", ExitCode: 1, Diagnostic: "error: x\n"}))
	var op2 *OperationError
	if !errors.As(err, &op2) || !errors.Is(err, context.Canceled) || op2.Advice != "" {
		t.Fatalf("cancellation gained tool advice: %v", err)
	}
}

func TestErrorCategoriesPreserveCause(t *testing.T) {
	for _, pair := range [][2]error{
		{workflow.ErrUnavailable, ErrUnavailable}, {workflow.ErrInvalid, ErrInvalidInput},
		{workspace.ErrBusy, ErrContention}, {workspace.ErrUnavailable, ErrUnsupportedHost},
		{workflow.ErrHandoff, ErrBuild}, {context.Canceled, context.Canceled},
	} {
		err := operationError("test", pair[0])
		var detail *OperationError
		if !errors.Is(err, pair[0]) || !errors.Is(err, pair[1]) || !errors.As(err, &detail) || detail.Operation != "test" {
			t.Fatal(err)
		}
	}
}

// Run sessions surface a bounded diagnostic for otherwise silent
// operation_failed teardown/leg failures.
func TestRunSessionFailureCarriesBoundedAdvice(t *testing.T) {
	err := operationError("run", errors.Join(bundle.ErrServer, errors.New("session teardown failed\x1b[31m")))
	var op *OperationError
	if !errors.As(err, &op) {
		t.Fatalf("category lost: %v", err)
	}
	if op.Advice == "" {
		t.Fatal("empty advice")
	}
	if strings.Contains(op.Advice, "\x1b") {
		t.Fatal("control characters leaked")
	}
	if errors.Is(err, ErrInvalidInput) {
		t.Fatal("session failure reclassified")
	}
	// Richer diagnostics are not replaced by the fallback.
	rich := operationError("run", &bundle.Failure{Diagnostic: "engine detail", Cause: errors.New("x")})
	var rop *OperationError
	if !errors.As(rich, &rop) || rop.Advice != "bundling failed: engine detail" {
		t.Fatalf("advice replaced: %q", rop.Advice)
	}
}

func TestLaunchObserverMetadataAndFailureRetirement(t *testing.T) {
	c, f, r := fixture(t)
	rejected := errors.New("launch observer rejected")
	var seen Launch
	_, err := c.Run(context.Background(), RunRequest{Build: r, DeviceID: "exact", Launched: func(l Launch) error { seen = l; return rejected }})
	if !errors.Is(err, rejected) || seen.ApplicationID != "org.test.app" || seen.DeviceID != "exact" || seen.Identity.Revision != "source" {
		t.Fatal(seen, err)
	}
	if !slices.Contains(f.calls, "terminate") {
		t.Fatal("rejected launch was left running", f.calls)
	}
}
