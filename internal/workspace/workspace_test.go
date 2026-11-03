package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
)

func layout(t *testing.T) Layout {
	t.Helper()
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("OS locking unavailable")
	}
	l, e := NewLayout(filepath.Join(t.TempDir(), "state with spaces"), project.Identity{Schema: 1, Revision: "source1", ProjectDir: t.TempDir(), Target: project.Target{Platform: "ios", DestinationKind: "simulator", DestinationID: "device1", Architecture: "arm64", Configuration: "debug"}})
	if e != nil {
		t.Fatal(e)
	}
	return l
}
func own(t *testing.T, l Layout) *Ownership {
	t.Helper()
	o, e := Acquire(context.Background(), l)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		if e := o.Release(); e != nil {
			t.Error(e)
		}
	})
	return o
}
func write(t *testing.T, p, s string) {
	t.Helper()
	if e := os.MkdirAll(filepath.Dir(p), 0700); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(p, []byte(s), 0600); e != nil {
		t.Fatal(e)
	}
}
func TestIsolationAndCanonicalProject(t *testing.T) {
	l := layout(t)
	root := filepath.Dir(filepath.Dir(filepath.Dir(l.GeneratedRoot)))
	id := l.Identity
	for _, change := range []func(*project.Identity){func(i *project.Identity) { i.Target.DestinationID = "device2" }, func(i *project.Identity) { i.Target.DestinationKind = "device" }, func(i *project.Identity) { i.Target.Configuration = "release" }, func(i *project.Identity) { i.Target.Platform = "android" }, func(i *project.Identity) { i.Target.Architecture = "x86_64" }, func(i *project.Identity) { i.ProjectDir = t.TempDir() }} {
		next := id
		change(&next)
		other, e := NewLayout(root, next)
		if e != nil {
			t.Fatal(e)
		}
		if other.GeneratedRoot == l.GeneratedRoot {
			t.Fatal("shared destination")
		}
	}
	alias := filepath.Join(t.TempDir(), "alias")
	if e := os.Symlink(id.ProjectDir, alias); e != nil {
		t.Fatal(e)
	}
	id.ProjectDir = alias
	other, e := NewLayout(root, id)
	if e != nil || other != l {
		t.Fatalf("canonical identity: %v %v", other, e)
	}
}
func TestConcurrentAcquisitionCancellation(t *testing.T) {
	l := layout(t)
	first := own(t, l)
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()
	if _, e := Acquire(ctx, l); !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal(e)
	}
	// A different destination and state root still contends for project files.
	id := l.Identity
	id.Target.Configuration = "release"
	other, e := NewLayout(t.TempDir(), id)
	if e != nil {
		t.Fatal(e)
	}
	ctx2, cancel2 := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel2()
	if _, e = Acquire(ctx2, other); !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal(e)
	}
	independent := own(t, layout(t))
	if e = independent.Release(); e != nil {
		t.Fatal(e)
	}
	if e = first.Release(); e != nil {
		t.Fatal(e)
	}
	var wg sync.WaitGroup
	for range 8 {
		wg.Go(func() {
			o, e := Acquire(context.Background(), l)
			if e != nil {
				t.Error(e)
				return
			}
			p := filepath.Join(l.GeneratedRoot, "counter")
			b, _ := os.ReadFile(p)
			time.Sleep(time.Millisecond)
			if e = os.WriteFile(p, append(b, 'x'), 0600); e != nil {
				t.Error(e)
			}
			if e = o.Release(); e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	b, e := os.ReadFile(filepath.Join(l.GeneratedRoot, "counter"))
	if e != nil || len(b) != 8 {
		t.Fatalf("overwrite %q %v", b, e)
	}
}
func TestAtomicStagingInvalidationAndPins(t *testing.T) {
	l := layout(t)
	o := own(t, l)
	ctx := context.Background()
	if _, e := o.Inspect("inputs1"); !errors.Is(e, ErrIncomplete) {
		t.Fatal(e)
	}
	stage, e := o.Begin(ctx, "inputs1", nil)
	if e != nil {
		t.Fatal(e)
	}
	pins := []string{"Podfile.lock", "App.xcworkspace/xcshareddata/swiftpm/Package.resolved"}
	for _, p := range pins {
		write(t, filepath.Join(stage.State.NativeDir, p), "resolved pin")
	}
	write(t, filepath.Join(stage.State.NativeDir, "removed-plugin"), "old")
	state, e := stage.Commit(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = o.Inspect("inputs1"); e != nil {
		t.Fatal(e)
	}
	if _, e = o.Inspect("inputs2"); !errors.Is(e, ErrStale) {
		t.Fatal(e)
	}
	next, e := o.Begin(ctx, "inputs2", pins)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = o.Inspect("inputs1"); !errors.Is(e, ErrIncomplete) {
		t.Fatal(e)
	}
	b, e := os.ReadFile(filepath.Join(state.NativeDir, "removed-plugin"))
	if e != nil || string(b) != "old" {
		t.Fatal("old publication overwritten")
	}
	for _, p := range pins {
		b, e = os.ReadFile(filepath.Join(next.State.NativeDir, p))
		if e != nil || string(b) != "resolved pin" {
			t.Fatal(p, e)
		}
	}
	if _, e = os.Stat(filepath.Join(next.State.NativeDir, "removed-plugin")); !errors.Is(e, os.ErrNotExist) {
		t.Fatal("stale plugin retained")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, e = next.Commit(cancelled); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	if e = next.Abort(); e != nil {
		t.Fatal(e)
	}
	// Interruption leaves evidence and the previously committed generation intact.
	interrupted, e := o.Begin(ctx, "inputs2", pins)
	if e != nil {
		t.Fatal(e)
	}
	if e = o.Release(); e != nil {
		t.Fatal(e)
	}
	o2 := own(t, l)
	if _, e = o2.Inspect("inputs1"); !errors.Is(e, ErrIncomplete) {
		t.Fatal(e)
	}
	if _, e = os.Stat(interrupted.path); e != nil {
		t.Fatal(e)
	}
	if e = o2.QuarantineInterrupted(ctx); e != nil {
		t.Fatal(e)
	}
	o2.layout.Identity.Revision = "source2"
	if _, e = o2.Inspect("inputs1"); !errors.Is(e, ErrStale) {
		t.Fatal(e)
	}
	next, e = o2.Begin(ctx, "inputs2", pins)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = next.Commit(ctx); e != nil {
		t.Fatal(e)
	}
	if _, e = o2.Inspect("inputs2"); e != nil {
		t.Fatal(e)
	}
}
func TestRejectPinEscapeAndCorruptState(t *testing.T) {
	o := own(t, layout(t))
	ctx := context.Background()
	for _, p := range []string{"../escape", "/absolute", "."} {
		if _, e := o.Begin(ctx, "x", []string{p}); !errors.Is(e, ErrInvalid) {
			t.Fatal(e)
		}
	}
	s, e := o.Begin(ctx, "x", nil)
	if e != nil {
		t.Fatal(e)
	}
	if e = os.Symlink(t.TempDir(), filepath.Join(s.State.NativeDir, "pins")); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Commit(ctx); e != nil {
		t.Fatal(e)
	}
	if _, e = o.Begin(ctx, "y", []string{"pins/Podfile.lock"}); !errors.Is(e, ErrInvalid) {
		t.Fatal(e)
	}
	write(t, filepath.Join(o.layout.GeneratedRoot, "state.json"), "broken")
	if _, e = o.Begin(ctx, "new", nil); !errors.Is(e, ErrIncomplete) {
		t.Fatal(e)
	}
	if _, e = o.Inspect("x"); !errors.Is(e, ErrIncomplete) {
		t.Fatal(e)
	}
}
func TestLockAcrossProcesses(t *testing.T) {
	if p := os.Getenv("NS_WORKSPACE_LOCK_HELPER"); p != "" {
		l := Layout{}
		b, e := os.ReadFile(p)
		if e != nil {
			t.Fatal(e)
		}
		if e = json.Unmarshal(b, &l); e != nil {
			t.Fatal(e)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Millisecond)
		defer cancel()
		if _, e = Acquire(ctx, l); !errors.Is(e, context.DeadlineExceeded) {
			t.Fatalf("cross process lock %v", e)
		}
		return
	}
	l := layout(t)
	own(t, l)
	p := filepath.Join(t.TempDir(), "layout.json")
	b, _ := json.Marshal(l)
	write(t, p, string(b))
	cmd := exec.Command(os.Args[0], "-test.run=^TestLockAcrossProcesses$")
	cmd.Env = append(os.Environ(), "NS_WORKSPACE_LOCK_HELPER="+p)
	if b, e := cmd.CombinedOutput(); e != nil {
		t.Fatalf("%v %s", e, b)
	}
}
func TestRunRetainsOwnershipThroughDescendantMutation(t *testing.T) {
	l := layout(t)
	node, e := exec.LookPath("node")
	if e != nil {
		t.Skip("Node unavailable")
	}
	o := own(t, l)
	stage, e := o.Begin(context.Background(), "pins", nil)
	if e != nil {
		t.Fatal(e)
	}
	ready := filepath.Join(stage.State.NativeDir, "ready")
	pin := filepath.Join(stage.State.NativeDir, "Podfile.lock")
	script := `const {spawn}=require('child_process');const child=spawn(process.execPath,['-e',"const fs=require('fs');fs.writeFileSync(process.argv[1],'ready');process.on('SIGTERM',()=>{setTimeout(()=>{fs.writeFileSync(process.argv[2],'resolved');process.exit(0)},80)});setInterval(()=>{},1000)",process.argv[1],process.argv[2]],{stdio:'ignore'});process.on('SIGTERM',()=>{});child.on('exit',()=>process.exit(0));`
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() {
		_, e := o.Run(ctx, process.Runner{}, process.Command{Executable: node, Args: []string{"-e", script, ready, pin}, Dir: stage.State.NativeDir})
		done <- e
	}()
	deadline := time.Now().Add(5 * time.Second)
	for {
		if _, e = os.Stat(ready); e == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("child not ready")
		}
		time.Sleep(5 * time.Millisecond)
	}
	if _, e = stage.Commit(context.Background()); !errors.Is(e, ErrBusy) {
		t.Fatal(e)
	}
	if e = stage.Abort(); !errors.Is(e, ErrBusy) {
		t.Fatal(e)
	}
	released := make(chan error, 1)
	go func() { released <- o.Release() }()
	select {
	case e = <-released:
		t.Fatalf("released with descendant alive: %v", e)
	case <-time.After(30 * time.Millisecond):
	}
	waiting, c := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer c()
	if _, e = Acquire(waiting, l); !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal(e)
	}
	cancel()
	if e = <-done; !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	if e = <-released; e != nil {
		t.Fatal(e)
	}
	b, e := os.ReadFile(pin)
	if e != nil || string(b) != "resolved" {
		t.Fatalf("descendant write %q %v", b, e)
	}
	next := own(t, l)
	if _, e = next.Inspect("pins"); !errors.Is(e, ErrIncomplete) {
		t.Fatal(e)
	}
}

type blockedExecutor struct {
	started chan struct{}
	finish  chan struct{}
	err     error
}
type blockedHandle struct{ executor *blockedExecutor }

func (e *blockedExecutor) Start(context.Context, process.Command) (process.Handle, error) {
	close(e.started)
	return blockedHandle{e}, nil
}
func (h blockedHandle) Wait() (process.Exit, error) {
	<-h.executor.finish
	return process.Exit{}, h.executor.err
}
func (h blockedHandle) Close(context.Context) error { return nil }
func TestUnconfirmedCleanupFailsClosed(t *testing.T) {
	l := layout(t)
	o, e := Acquire(context.Background(), l)
	if e != nil {
		t.Fatal(e)
	}
	executor := &blockedExecutor{started: make(chan struct{}), finish: make(chan struct{}), err: process.ErrCleanup}
	done := make(chan error, 1)
	go func() { _, e := o.Run(context.Background(), executor, process.Command{}); done <- e }()
	<-executor.started
	if _, e = o.Run(context.Background(), executor, process.Command{}); !errors.Is(e, ErrBusy) {
		t.Fatal(e)
	}
	close(executor.finish)
	if e = <-done; !errors.Is(e, process.ErrCleanup) {
		t.Fatal(e)
	}
	if e = o.Release(); !errors.Is(e, process.ErrCleanup) {
		t.Fatal(e)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, e = Acquire(ctx, l); !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal(e)
	}
	// The synthetic handle has no real descendants; explicitly retire the test lock.
	if e = unlock(o.file); e != nil {
		t.Fatal(e)
	}
	o.file.Close()
}

func TestConcurrentTargetsPublishSeparateTrees(t *testing.T) {
	l := layout(t)
	root := filepath.Dir(filepath.Dir(filepath.Dir(l.GeneratedRoot)))
	id := l.Identity
	id.Target.Configuration = "release"
	other, e := NewLayout(root, id)
	if e != nil {
		t.Fatal(e)
	}
	var wg sync.WaitGroup
	for n, target := range []Layout{l, other} {
		wg.Go(func() {
			o, e := Acquire(context.Background(), target)
			if e != nil {
				t.Error(e)
				return
			}
			defer o.Release()
			stage, e := o.Begin(context.Background(), "inputs", nil)
			if e != nil {
				t.Error(e)
				return
			}
			value := []byte{byte('a' + n)}
			if e = os.WriteFile(filepath.Join(stage.State.NativeDir, "native"), value, 0600); e != nil {
				t.Error(e)
			}
			if e = os.WriteFile(filepath.Join(stage.State.BundleDir, "bundle"), value, 0600); e != nil {
				t.Error(e)
			}
			if _, e = stage.Commit(context.Background()); e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	for n, target := range []Layout{l, other} {
		o := own(t, target)
		state, e := o.Inspect("inputs")
		if e != nil {
			t.Fatal(e)
		}
		for _, p := range []string{filepath.Join(state.NativeDir, "native"), filepath.Join(state.BundleDir, "bundle")} {
			b, e := os.ReadFile(p)
			if e != nil || string(b) != string([]byte{byte('a' + n)}) {
				t.Fatalf("target overwritten %s %q %v", p, b, e)
			}
		}
		o.Release()
	}
}
