package nativescript

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/project"
)

// Restart mode re-iterates only on a debounced resolved-source change: no
// Resolve runs while idle, a failed rebuild keeps the last app alive and emits
// a Diagnostic, and the next confirmed change relaunches.
func TestRestartDevelopmentIterations(t *testing.T) {
	c, f, r := fixture(t)
	dir := r.ProjectDir
	app := filepath.Join(dir, "app")
	os.MkdirAll(app, 0700)
	source := filepath.Join(app, "app.ts")
	if err := os.WriteFile(source, []byte("one"), 0600); err != nil {
		t.Fatal(err)
	}
	resources := filepath.Join(dir, "App_Resources")
	os.MkdirAll(filepath.Join(resources, "iOS"), 0700)
	plist := filepath.Join(resources, "iOS", "Info.plist")
	os.WriteFile(plist, []byte("<plist/>"), 0600)
	f.resolved = project.Resolved{Directory: dir, Revision: "source", ApplicationID: "org.test.app", Config: project.Config{AppPath: app, AppResourcesPath: resources}}

	var diag atomic.Value
	var afterWait atomic.Bool
	done := make(chan struct{})
	c.options.Sink = func(ctx context.Context, e Event) error {
		if e.Kind == Diagnostic {
			diag.Store(e.Message)
		}
		return nil
	}
	s, err := c.Run(context.Background(), RunRequest{
		Build:       r,
		DeviceID:    "exact",
		Development: &DevelopmentOptions{Mode: Restart},
		Log: func(SessionLog) {
			select {
			case <-done:
				afterWait.Store(true)
			default:
			}
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	countCalls := func(name string) int {
		n := 0
		for _, v := range f.calls {
			if v == name {
				n++
			}
		}
		return n
	}
	// Idle: no Resolve or build work ticks without a change.
	startupResolves := countCalls("resolve")
	time.Sleep(1800 * time.Millisecond)
	if got := countCalls("resolve"); got != startupResolves {
		t.Fatalf("idle resolve calls %d vs startup %d", got, startupResolves)
	}
	// Confirmed JS-source change → rebuild + relaunch.
	if err := os.WriteFile(source, []byte("two"), 0600); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(6 * time.Second)
	for countCalls("launch") < 2 && time.Now().Before(deadline) {
		time.Sleep(100 * time.Millisecond)
	}
	if countCalls("launch") < 2 {
		t.Fatalf("no relaunch after change; calls %v", f.calls)
	}
	var firstTerm, secondLaunch int
	for i, c := range f.calls {
		if c == "terminate" && firstTerm == 0 {
			firstTerm = i
		}
		if c == "launch" {
			secondLaunch = i
		}
	}
	if firstTerm == 0 || firstTerm > secondLaunch {
		t.Fatalf("old app not terminated before relaunch: %v", f.calls)
	}
	resolvesAfterFirst := countCalls("resolve")
	// Failed rebuild: diagnostic emitted, session survives, old app stays up.
	f.fail, f.cause = "bundle", errors.New("forced bundle failure")
	if err := os.WriteFile(source, []byte("three"), 0600); err != nil {
		t.Fatal(err)
	}
	deadline = time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		if diag.Load() != nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	got, ok := diag.Load().(string)
	if !ok {
		t.Fatalf("no diagnostic after failed rebuild; calls=%v", f.calls)
	}
	if !strings.Contains(got, "forced bundle failure") {
		t.Fatalf("diagnostic message lost: %q", got)
	}
	if countCalls("launch") != 2 {
		t.Fatal("failed rebuild replaced the running app")
	}
	// The same fingerprint is not retried: no extra resolves while unchanged.
	before := countCalls("resolve")
	time.Sleep(1800 * time.Millisecond)
	if countCalls("resolve") != before {
		t.Fatal("failed marks retried without a change")
	}
	// Next change → successful rebuild + relaunch.
	f.fail = ""
	if err := os.WriteFile(plist, []byte("<plist>2</plist>"), 0600); err != nil {
		t.Fatal(err)
	}
	deadline = time.Now().Add(6 * time.Second)
	for countCalls("launch") < 3 && time.Now().Before(deadline) {
		time.Sleep(100 * time.Millisecond)
	}
	if countCalls("launch") < 3 {
		t.Fatalf("no relaunch after recovery; calls %v", f.calls)
	}
	if countCalls("resolve") <= resolvesAfterFirst {
		t.Fatal("resolve did not run per iteration")
	}
	// Launch failure: diagnostic, session stays open with no app; the next
	// confirmed change rebuilds and relaunches.
	f.fail, f.cause = "launch", errors.New("forced launch failure")
	if err := os.WriteFile(source, []byte("four"), 0600); err != nil {
		t.Fatal(err)
	}
	deadline = time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		if v := diag.Load(); v != nil && strings.Contains(v.(string), "forced launch failure") {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if v := diag.Load(); v == nil || !strings.Contains(v.(string), "forced launch failure") {
		t.Fatalf("no launch diagnostic: %v", diag.Load())
	}
	if countCalls("terminate") < 2 {
		t.Fatal("failed launch left old app running")
	}
	f.fail = ""
	diag.Store("")
	if err := os.WriteFile(source, []byte("five"), 0600); err != nil {
		t.Fatal(err)
	}
	deadline = time.Now().Add(6 * time.Second)
	for countCalls("launch") < 4 && time.Now().Before(deadline) {
		time.Sleep(100 * time.Millisecond)
	}
	if countCalls("launch") < 4 {
		t.Fatalf("no recovery launch after launch failure; calls %v", f.calls)
	}
	// Teardown: session ends cleanly; no Log callbacks after Wait/Close return.
	if err := s.Close(context.Background()); err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, ErrCleanup) {
		t.Fatal(err)
	}
	close(done)
	time.Sleep(200 * time.Millisecond)
	if afterWait.Load() {
		t.Fatal("Log invoked after session ended")
	}
	if !slices.Contains(f.calls, "launch") {
		t.Fatal("missing launches")
	}
}

// Bundle-only work retains the writer lease and validates handoffs, but never
// requires or invokes a compiler. A rejected bundle cannot escape to a device.
func TestRestartBundleOnlyWorkflow(t *testing.T) {
	for _, stale := range []string{"", "bundle"} {
		t.Run("identity-"+stale, func(t *testing.T) {
			c, f, r := fixture(t)
			f.stale = stale
			s := c.stages()
			s.Compiler = nil
			resolved, err := s.Resolver.Resolve(context.Background(), r.ProjectDir)
			if err != nil {
				t.Fatal(err)
			}
			p, b, err := c.engine.Bundle(context.Background(), s, resolved, internalRequest(r), nil)
			if stale != "" {
				if err == nil || b.Directory != "" || p.NativeDir != "" {
					t.Fatal("stale bundle escaped", err)
				}
			} else if err != nil || !p.Identity.Compatible(b.Identity) {
				t.Fatal(err)
			}
			if slices.Contains(f.calls, "compile") || f.held.Load() {
				t.Fatal("compiler called or lease retained", f.calls)
			}
		})
	}
}

func TestRestartMarksDetectHookRegistrationMembership(t *testing.T) {
	root := t.TempDir()
	resolved := project.Resolved{Directory: root}
	before := restartMarks(resolved)
	dir := filepath.Join(root, "hooks/after-prepare")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "new.cjs"), []byte("module.exports=()=>{}"), 0600); err != nil {
		t.Fatal(err)
	}
	if restartMarksSame(before, restartMarks(resolved)) {
		t.Fatal("new registered hook was invisible to restart mode")
	}
}
