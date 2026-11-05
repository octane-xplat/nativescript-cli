package nativescript

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/octane-xplat/nativescript-cli/extension"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"sync/atomic"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/bundle"
	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	resolver "github.com/octane-xplat/nativescript-cli/internal/resolve"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

func TestDevelopmentTeardownPreservesFailures(t *testing.T) {
	if err := developmentTeardownError(errors.Join(context.Canceled, bundle.ErrRestart)); err != nil {
		t.Fatal(err)
	}
	if err := developmentTeardownError(errors.Join(context.Canceled, &process.Error{Kind: process.ErrExit, Cause: errors.New("owned termination")})); err != nil {
		t.Fatal(err)
	}
	failure := errors.New("resource cleanup failed")
	err := developmentTeardownError(errors.Join(context.Canceled, bundle.ErrRestart, failure, process.ErrCleanup))
	if !errors.Is(err, failure) || !errors.Is(err, process.ErrCleanup) || errors.Is(err, context.Canceled) || errors.Is(err, bundle.ErrRestart) {
		t.Fatal(err)
	}
}

// Only native preparation/compilation/device adapters are fixtures here. The
// public workflow, resolver, helper, native Vite engine and ownership are real.
type developmentNativeFixture struct {
	compileError      error
	compiled          atomic.Int32
	launched          atomic.Int32
	retired           atomic.Int32
	active            atomic.Int32
	configuredSources atomic.Int32
}

type developmentNativeExtension struct{}

func (developmentNativeExtension) Manifest(context.Context) (extension.Manifest, error) {
	return extension.Manifest{ID: "native-development", Version: "1.0.0", API: extension.APIVersion, Phases: []extension.Phase{extension.Collect}, Required: []string{"native_files"}}, nil
}
func (developmentNativeExtension) Invoke(context.Context, extension.Input) (extension.Result, error) {
	return extension.Result{NativeFiles: []extension.NativeFile{{Platform: "ios", Kind: "source", Path: "Development.swift", Content: []byte("class Development {}")}}}, nil
}

func (f *developmentNativeFixture) Prepare(_ context.Context, r project.Resolved, l workspace.Lease) (project.Prepared, error) {
	count := 0
	for _, group := range r.NativeSourceGroups {
		count += len(group.Files)
	}
	f.configuredSources.Store(int32(count))
	p := project.Prepared{Identity: l.Layout().Identity, NativeDir: filepath.Join(l.Layout().GeneratedRoot, "native"), BundleDir: filepath.Join(l.Layout().GeneratedRoot, "bundle")}
	return p, os.MkdirAll(p.NativeDir, 0700)
}

func TestPublicConfiguredSourceDevelopment(t *testing.T) {
	installed := os.Getenv("NS_NATIVE_VITE_DIR")
	if installed == "" {
		t.Skip("requires installed native Vite engine; compiler/device remain fixtures")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	dir, shared := t.TempDir(), t.TempDir()
	for _, name := range []string{"app", "App_Resources"} {
		if err := os.MkdirAll(filepath.Join(dir, name), 0700); err != nil {
			t.Fatal(err)
		}
	}
	write := func(file, body string) {
		t.Helper()
		if err := os.WriteFile(file, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(dir, "package.json"), `{"name":"configured-dev","version":"1.0.0","main":"app/app.ts","dependencies":{"@nativescript/core":"9.1.3"}}`)
	write(filepath.Join(dir, "app/app.ts"), `export const initial=41;`)
	write(filepath.Join(shared, "Configured.swift"), "class Configured {}")
	relative, err := filepath.Rel(dir, shared)
	if err != nil {
		t.Fatal(err)
	}
	config, _ := json.Marshal(map[string]any{"id": "org.example.nativedev", "appPath": "app", "appResourcesPath": "App_Resources", "ios": map[string]any{"NativeSource": []map[string]string{{"name": "Configured", "path": filepath.ToSlash(relative) + "/*.swift"}}}})
	write(filepath.Join(dir, "nativescript.config.ts"), "export default "+string(config))
	if err := os.Symlink(filepath.Join(installed, "node_modules"), filepath.Join(dir, "node_modules")); err != nil {
		t.Fatal(err)
	}
	host := jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS("assets")}, CacheDir: t.TempDir()}
	native := &developmentNativeFixture{}
	c, _ := New(Options{})
	c.engine = workflow.Engine{Factory: func(map[string]string) workflow.Stages {
		return workflow.Stages{Resolver: resolver.Resolver{Host: host}, Bundler: bundle.Adapter{Host: host}, Preparer: native, Compiler: native, Devices: native, Launcher: native}
	}}
	session, err := c.Run(ctx, RunRequest{Development: &DevelopmentOptions{}, DeviceID: "fixture", Build: BuildRequest{ProjectDir: dir, OutputDir: filepath.Join(dir, ".generated"), Target: Target{Platform: IOS, Configuration: Debug, Destination: Destination{Kind: Simulator, ID: "fixture", Architecture: "arm64"}}}})
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close(context.Background())
	wait := func(launches, sources int32) {
		t.Helper()
		ticker := time.NewTicker(20 * time.Millisecond)
		defer ticker.Stop()
		for native.launched.Load() < launches || session.DevelopmentEndpoint().URL == "" {
			select {
			case <-ctx.Done():
				t.Fatal("configured-source rebuild timed out", ctx.Err())
			case <-ticker.C:
			}
		}
		if native.launched.Load() != launches || native.compiled.Load() != launches || native.configuredSources.Load() != sources {
			t.Fatal("configured-source handoff", native.launched.Load(), native.compiled.Load(), native.configuredSources.Load())
		}
	}
	wait(1, 1)
	first := session.DevelopmentEndpoint()
	write(filepath.Join(shared, "unmatched.txt"), "not a native input")
	if err := os.MkdirAll(filepath.Join(shared, "state"), 0700); err != nil {
		t.Fatal(err)
	}
	write(filepath.Join(shared, "state/generation.json"), "{}")
	time.Sleep(700 * time.Millisecond)
	wait(1, 1)
	added := filepath.Join(shared, "Second.swift")
	write(added, "class Second {}")
	wait(2, 2)
	if session.DevelopmentEndpoint().URL == first.URL {
		t.Fatal("configured addition retained old server")
	}
	if err := os.Remove(added); err != nil {
		t.Fatal(err)
	}
	wait(3, 1)
	last := session.DevelopmentEndpoint()
	for range 2 {
		if err := session.Close(context.Background()); !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	}
	if native.active.Load() != 0 || native.retired.Load() != 3 {
		t.Fatal("configured source session leaked", native.active.Load(), native.retired.Load())
	}
	if _, err := http.Get(last.URL); err == nil {
		t.Fatal("configured source server survived close")
	}
}
func (f *developmentNativeFixture) Compile(ctx context.Context, p project.Prepared, b project.Bundle, l workspace.Lease) ([]project.Artifact, error) {
	if f.compileError != nil {
		return nil, f.compileError
	}
	if filepath.Base(b.Entry) != "bundle.mjs" {
		return nil, errors.New("wrong native bootstrap")
	}
	if _, err := os.Stat(b.Entry); err != nil {
		return nil, err
	}
	if err := l.(interface {
		RunHelper(context.Context, func(context.Context) error) error
	}).RunHelper(ctx, func(context.Context) error { return nil }); err != nil {
		return nil, err
	}
	f.compiled.Add(1)
	return []project.Artifact{{Identity: p.Identity, Path: b.Entry, Kind: "native-compiler-fixture", ApplicationID: "org.example.nativedev"}}, nil
}
func (f *developmentNativeFixture) Discover(context.Context, string) ([]project.Device, error) {
	return []project.Device{{ID: "fixture", Platform: "ios", Kind: "simulator", Architecture: "arm64", State: "booted"}}, nil
}
func (f *developmentNativeFixture) Launch(ctx context.Context, _ project.Artifact, _ project.Device) (*workflow.Session, error) {
	if !f.active.CompareAndSwap(0, 1) {
		return nil, errors.New("previous app not retired before relaunch")
	}
	f.launched.Add(1)
	return workflow.StartSession(ctx, func(ctx context.Context) error {
		<-ctx.Done()
		f.active.Store(0)
		f.retired.Add(1)
		return ctx.Err()
	}), nil
}

func TestPublicNativeDevelopmentLifecycle(t *testing.T) {
	installed := os.Getenv("NS_NATIVE_VITE_DIR")
	if installed == "" {
		t.Skip("set NS_NATIVE_VITE_DIR for real native Vite engine; native compiler/device remain fixtures")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	dir := t.TempDir()
	for _, name := range []string{"app", "App_Resources"} {
		if err := os.MkdirAll(filepath.Join(dir, name), 0700); err != nil {
			t.Fatal(err)
		}
	}
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("package.json", `{"name":"public-dev-fixture","version":"1.0.0","main":"app/app.ts","dependencies":{"@nativescript/core":"9.1.3"}}`)
	write("nativescript.config.ts", `export default {id:'org.example.nativedev',appPath:'app',appResourcesPath:'App_Resources'};`)
	write("app/app.ts", `export const initial = 41;`)
	if err := os.Symlink(filepath.Join(installed, "node_modules"), filepath.Join(dir, "node_modules")); err != nil {
		t.Fatal(err)
	}
	cwd, _ := os.Getwd()
	environment := os.Environ()
	writer, flags, prefix := log.Writer(), log.Flags(), log.Prefix()
	host := jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS("assets")}, CacheDir: t.TempDir()}
	native := &developmentNativeFixture{}
	c, _ := New(Options{Extensions: []extension.Extension{developmentNativeExtension{}}})
	c.engine = workflow.Engine{Factory: func(map[string]string) workflow.Stages {
		return workflow.Stages{Extensions: c.options.Extensions, Resolver: resolver.Resolver{Host: host}, Bundler: bundle.Adapter{Host: host}, Preparer: native, Compiler: native, Devices: native, Launcher: native}
	}}
	settings := &DevelopmentOptions{}
	session, err := c.Run(ctx, RunRequest{Development: settings, DeviceID: "fixture", Build: BuildRequest{ProjectDir: dir, OutputDir: filepath.Join(dir, ".generated"), Target: Target{Platform: IOS, Configuration: Debug, Destination: Destination{Kind: Simulator, ID: "fixture", Architecture: "arm64"}}}})
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close(context.Background())
	first := session.DevelopmentEndpoint()
	if first.URL == "" || native.compiled.Load() != 1 || native.launched.Load() != 1 {
		t.Fatal("initial lifecycle", first)
	}
	settings.Port = -1 // Background rebuild must retain its own request copy.
	write("app/app.ts", `export const changed = 42;`)
	response, err := http.Get(first.URL + "/ns/entry")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatal(response.Status)
	}
	write("App_Resources/native-input.json", `{"revision":2}`)
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	for native.launched.Load() < 2 {
		select {
		case <-ctx.Done():
			t.Fatal("native rebuild timed out", ctx.Err())
		case <-ticker.C:
		}
	}
	for session.DevelopmentEndpoint().URL == "" {
		select {
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		case <-ticker.C:
		}
	}
	if native.compiled.Load() != 2 || native.retired.Load() != 1 {
		t.Fatal("rebuild ordering", native.compiled.Load(), native.retired.Load())
	}
	second := session.DevelopmentEndpoint()
	if second.URL == first.URL {
		t.Fatal("server did not restart with native inputs")
	}
	for range 2 {
		if err := session.Close(context.Background()); !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	}
	if native.active.Load() != 0 || native.retired.Load() != 2 || session.DevelopmentEndpoint().URL != "" {
		t.Fatal("session leaked its app or endpoint")
	}
	if _, err := http.Get(second.URL); err == nil {
		t.Fatal("native dev server survived close")
	}
	now, _ := os.Getwd()
	if now != cwd || !reflect.DeepEqual(os.Environ(), environment) || log.Writer() != writer || log.Flags() != flags || log.Prefix() != prefix {
		t.Fatal("development mutated embedding globals")
	}
	// A compiler can return cancellation while the outer context remains live.
	// Owned server shutdown must not strip that initiating failure into success.
	native = &developmentNativeFixture{compileError: context.Canceled}
	failed, err := c.Run(ctx, RunRequest{Development: &DevelopmentOptions{}, DeviceID: "fixture", Build: BuildRequest{ProjectDir: dir, OutputDir: filepath.Join(dir, ".generated"), Target: Target{Platform: IOS, Configuration: Debug, Destination: Destination{Kind: Simulator, ID: "fixture", Architecture: "arm64"}}}})
	if failed != nil || !errors.Is(err, context.Canceled) || native.launched.Load() != 0 {
		var op *OperationError
		errors.As(err, &op)
		if op != nil {
			t.Fatalf("cancelled compiler failed before cancellation branch: session=%v error=%v cause=%T %v", failed, err, op.Cause, op.Cause)
		}
		t.Fatal("cancelled compiler returned success or launched app", failed, err)
	}
	// Reject the same native-completed boundary that failed in native testing.
	// The installed engine/helper are real; compilation and devices remain fixtures.
	for attempt := 0; attempt < 3; attempt++ {
		native = &developmentNativeFixture{}
		rejected := errors.New("qualification observer rejected native completion")
		c.options.Sink = func(_ context.Context, event Event) error {
			if event.Stage == "native" && event.Kind == StageCompleted {
				return rejected
			}
			return nil
		}
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		address := listener.Addr().String()
		port := listener.Addr().(*net.TCPAddr).Port
		listener.Close()
		failed, err := c.Run(ctx, RunRequest{Development: &DevelopmentOptions{Port: port}, DeviceID: "fixture", Build: BuildRequest{ProjectDir: dir, OutputDir: filepath.Join(dir, ".generated"), Target: Target{Platform: IOS, Configuration: Debug, Destination: Destination{Kind: Simulator, ID: "fixture", Architecture: "arm64"}}}})
		if failed != nil || !errors.Is(err, ErrSink) || !errors.Is(err, rejected) || errors.Is(err, ErrCleanup) || native.compiled.Load() != 1 || native.launched.Load() != 0 {
			t.Fatalf("observer rejection/retirement: session=%v error=%v compiled=%d launched=%d", failed, err, native.compiled.Load(), native.launched.Load())
		}
		listener, err = net.Listen("tcp", address)
		if err != nil {
			t.Fatal("rejected operation retained its server port", err)
		}
		listener.Close()
	}
}
