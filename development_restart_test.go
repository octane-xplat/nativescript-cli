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
	f.resolved = project.Resolved{Directory: dir, Revision: "source", ApplicationID: "org.test.app", Sources: []project.Source{{Path: source}}, Config: project.Config{AppResourcesPath: resources}}

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
