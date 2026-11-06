package bundle

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	resolver "github.com/octane-xplat/nativescript-cli/internal/resolve"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

func fixture(t *testing.T) (Adapter, project.Resolved, project.Prepared, *workspace.Ownership) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("F1 Windows runtime unavailable")
	}
	root, _ := filepath.Abs("../..")
	dir := t.TempDir()
	write(t, filepath.Join(dir, "package.json"), `{"name":"independent-app","version":"1.0.0","main":"app/app.ts","dependencies":{"@nativescript/ios":"9.1.0","@nativescript/android":"9.1.0"}}`)
	write(t, filepath.Join(dir, "nativescript.config.cjs"), `module.exports={id:'org.example.fixture',appPath:'app',appResourcesPath:'App_Resources'}`)
	os.MkdirAll(filepath.Join(dir, "app"), 0700)
	os.MkdirAll(filepath.Join(dir, "App_Resources"), 0700)
	write(t, filepath.Join(dir, "app/app.ts"), `import { value } from './value.js'; globalThis.fixtureValue=value;`)
	write(t, filepath.Join(dir, "app/value.ts"), `export const value=41;`)
	// A declared runtime is installed at the 9.1 floor; the engine itself is
	// linked per test by engineModules so its absence stays a real scenario.
	for _, platform := range []string{"ios", "android"} {
		writeRuntime(t, dir, platform, "9.1.0")
	}
	a := Adapter{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS(filepath.Join(root, "assets"))}, CacheDir: t.TempDir()}}
	r := resolve(t, a, dir)
	l, err := workspace.NewLayout(t.TempDir(), project.Identity{Schema: 1, Revision: r.Revision, ProjectDir: dir, Target: project.Target{Platform: "ios", DestinationKind: "simulator", Architecture: "arm64", Configuration: "debug"}})
	if err != nil {
		t.Fatal(err)
	}
	lease, err := workspace.Acquire(context.Background(), l)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { lease.Release() })
	return a, r, project.Prepared{Identity: l.Identity, NativeDir: l.GeneratedRoot, BundleDir: l.BundleStaging}, lease
}
func resolve(t *testing.T, a Adapter, dir string) project.Resolved {
	t.Helper()
	r, err := (resolver.Resolver{Host: a.Host}).Resolve(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	return r
}
func write(t *testing.T, p, s string) {
	t.Helper()
	if err := os.WriteFile(p, []byte(s), 0600); err != nil {
		t.Fatal(err)
	}
}

// engineModules links the real installed engine into the project, preserving a
// writable node_modules so fixture packages and runtimes can sit alongside it.
func engineModules(t *testing.T, dir string) {
	t.Helper()
	installed := os.Getenv("NS_NATIVE_VITE_DIR")
	if installed == "" {
		t.Skip("requires installed @nativescript/vite8.0.20 or 8.0.21/Vite8/core9.1.3")
	}
	modules := filepath.Join(dir, "node_modules")
	if err := os.RemoveAll(modules); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(modules, "@nativescript"), 0700); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Join(installed, "node_modules"))
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		src := filepath.Join(installed, "node_modules", name)
		if name == "@nativescript" {
			sub, err := os.ReadDir(src)
			if err != nil {
				t.Fatal(err)
			}
			for _, s := range sub {
				if err := os.Symlink(filepath.Join(src, s.Name()), filepath.Join(modules, "@nativescript", s.Name())); err != nil {
					t.Fatal(err)
				}
			}
			continue
		}
		if err := os.Symlink(src, filepath.Join(modules, name)); err != nil {
			t.Fatal(err)
		}
	}
	for _, platform := range []string{"ios", "android"} {
		writeRuntime(t, dir, platform, "9.1.0")
	}
}

func writeRuntime(t *testing.T, dir, platform, version string) {
	t.Helper()
	path := filepath.Join(dir, "node_modules/@nativescript", platform)
	if err := os.MkdirAll(path, 0700); err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(path, "package.json"), `{"name":"@nativescript/`+platform+`","version":"`+version+`"}`)
}

// A changed project invalidates the prepared identity, so re-resolution needs a
// fresh layout and lease before Bundle accepts the stage inputs.
func reacquire(t *testing.T, r project.Resolved, p project.Prepared, old *workspace.Ownership) (*workspace.Ownership, project.Prepared) {
	t.Helper()
	old.Release()
	p.Identity.Revision = r.Revision
	layout, err := workspace.NewLayout(t.TempDir(), p.Identity)
	if err != nil {
		t.Fatal(err)
	}
	lease, err := workspace.Acquire(context.Background(), layout)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { lease.Release() })
	p.NativeDir = layout.GeneratedRoot
	p.BundleDir = layout.BundleStaging
	return lease, p
}

func TestBundleRequestValidation(t *testing.T) {
	t.Run("runtime floor", func(t *testing.T) {
		a, r, p, l := fixture(t)
		write(t, filepath.Join(r.Directory, "node_modules/@nativescript/ios/package.json"), `{"name":"@nativescript/ios","version":"8.9.0"}`)
		r = resolve(t, a, r.Directory)
		l, p = reacquire(t, r, p, l)
		if _, err := a.Bundle(context.Background(), r, p, l); !errors.Is(err, workflow.ErrUnavailable) {
			t.Fatal(err)
		}
	})
	t.Run("runtime missing", func(t *testing.T) {
		a, r, p, l := fixture(t)
		if err := os.RemoveAll(filepath.Join(r.Directory, "node_modules/@nativescript/ios")); err != nil {
			t.Fatal(err)
		}
		write(t, filepath.Join(r.Directory, "package.json"), `{"name":"independent-app","version":"1.0.0","main":"app/app.ts","dependencies":{"@nativescript/android":"9.1.0"}}`)
		r = resolve(t, a, r.Directory)
		l, p = reacquire(t, r, p, l)
		if _, err := a.Bundle(context.Background(), r, p, l); !errors.Is(err, workflow.ErrUnavailable) {
			t.Fatal(err)
		}
	})
	t.Run("entry missing", func(t *testing.T) {
		a, r, p, l := fixture(t)
		write(t, filepath.Join(r.Directory, "package.json"), `{"name":"independent-app","version":"1.0.0","dependencies":{"@nativescript/ios":"9.1.0","@nativescript/android":"9.1.0"}}`)
		r = resolve(t, a, r.Directory)
		l, p = reacquire(t, r, p, l)
		if _, err := a.Bundle(context.Background(), r, p, l); !errors.Is(err, workflow.ErrInvalid) {
			t.Fatal(err)
		}
	})
	t.Run("entry outside app path", func(t *testing.T) {
		a, r, p, l := fixture(t)
		write(t, filepath.Join(r.Directory, "outside.ts"), `globalThis.fixtureValue=1;`)
		write(t, filepath.Join(r.Directory, "package.json"), `{"name":"independent-app","version":"1.0.0","main":"outside.ts","dependencies":{"@nativescript/ios":"9.1.0","@nativescript/android":"9.1.0"}}`)
		r = resolve(t, a, r.Directory)
		l, p = reacquire(t, r, p, l)
		if _, err := a.Bundle(context.Background(), r, p, l); !errors.Is(err, workflow.ErrInvalid) {
			t.Fatal(err)
		}
	})
	t.Run("engine missing", func(t *testing.T) {
		a, r, p, l := fixture(t)
		if _, err := a.Bundle(context.Background(), r, p, l); !errors.Is(err, workflow.ErrUnavailable) {
			t.Fatal(err)
		}
		if _, err := os.Stat(filepath.Join(r.Directory, "package-lock.json")); !errors.Is(err, os.ErrNotExist) {
			t.Fatal("unexpected dependency installation")
		}
	})
}

type captureExecutor struct{ handles chan process.Handle }

func (c captureExecutor) Start(ctx context.Context, cmd process.Command) (process.Handle, error) {
	h, err := (process.Runner{}).Start(ctx, cmd)
	if err == nil {
		c.handles <- h
	}
	return h, err
}

// An in-flight helper retains the lease; a released lease fails the next call.
func TestBundleRetentionAndColdCancellation(t *testing.T) {
	a, r, p, l := fixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := a.Bundle(ctx, r, p, l); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	capture := captureExecutor{handles: make(chan process.Handle, 1)}
	a.Host.Executor = capture
	done := make(chan error, 1)
	go func() {
		_, err := a.Bundle(context.Background(), r, p, l)
		done <- err
	}()
	h := <-capture.handles
	released := make(chan error, 1)
	go func() { released <- l.Release() }()
	select {
	case <-released:
		t.Fatal("released active helper")
	case <-time.After(100 * time.Millisecond):
	}
	h.Close(context.Background())
	if err := <-done; err == nil {
		t.Fatal("terminated helper accepted")
	}
	select {
	case err := <-released:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("release blocked after child retirement")
	}
	if _, err := a.Bundle(context.Background(), r, p, l); !errors.Is(err, workspace.ErrReleased) {
		t.Fatal(err)
	}
}

// The installed engine's release build emits an ESM bundle.mjs plus a runtime
// package manifest; platform modules and the native export condition select the
// native graph, and core's XHR polyfill side effects survive tree-shaking.
func TestInstalledEngineNativeBundle(t *testing.T) {
	for _, platform := range []string{"ios", "android"} {
		t.Run(platform, func(t *testing.T) {
			a, r, p, l := fixture(t)
			engineModules(t, r.Directory)
			_ = filepath.Join(r.Directory, "node_modules")
			for _, osname := range []string{"ios", "android"} {
				write(t, filepath.Join(r.Config.AppPath, "choice."+osname+".ts"), `export const platform="`+osname+`-platform-module";`)
			}
			write(t, filepath.Join(r.Config.AppPath, "app.ts"), `import '@nativescript/core';import '@nativescript/core';import {platform} from './choice';globalThis.nativeResult=platform;`)
			lease := l
			if platform == "android" {
				l.Release()
				p.Identity.Target.Platform = "android"
				layout, err := workspace.NewLayout(t.TempDir(), p.Identity)
				if err != nil {
					t.Fatal(err)
				}
				lease, err = workspace.Acquire(context.Background(), layout)
				if err != nil {
					t.Fatal(err)
				}
				defer lease.Release()
				p.NativeDir = layout.GeneratedRoot
				p.BundleDir = layout.BundleStaging
				r.Config.Android = project.AndroidConfig{V8Flags: "--expose_gc", MarkingMode: "none"}
			}
			b, err := a.Bundle(context.Background(), r, p, lease)
			if err != nil {
				t.Fatal(err)
			}
			if filepath.Base(b.Entry) != "bundle.mjs" {
				t.Fatalf("entry %s", b.Entry)
			}
			data, err := os.ReadFile(filepath.Join(b.Directory, "package.json"))
			if err != nil {
				t.Fatal(err)
			}
			expected := []string{`"main":"bundle.mjs"`, `"id":"org.example.fixture"`}
			if platform == "android" {
				expected = append(expected, `"v8Flags":"--expose_gc"`, `"markingMode":"none"`)
			}
			for _, s := range expected {
				if !strings.Contains(string(data), s) {
					t.Fatal(string(data))
				}
			}
			bundle, err := os.ReadFile(b.Entry)
			if err != nil {
				t.Fatal(err)
			}
			text := string(bundle)
			for _, marker := range []string{platform + "-platform-module", "XMLHttpRequest", "FormData", "FileReader"} {
				if !strings.Contains(text, marker) {
					t.Fatalf("missing %s in emitted bundle", marker)
				}
			}
		})
	}
}

func TestInvalidEntryFailsEngineBuild(t *testing.T) {
	a, r, p, l := fixture(t)
	engineModules(t, r.Directory)
	write(t, filepath.Join(r.Config.AppPath, "app.ts"), "invalid (((")
	if _, err := a.Bundle(context.Background(), r, p, l); err == nil {
		t.Fatal("invalid JS accepted")
	}
}

// An unmapped helper error keeps its bounded detail instead of collapsing to a
// bare operation_failed code, preserving the engine's diagnostic summary.
func TestRemoteFailureDetailSurfaces(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("F1 helper unavailable")
	}
	if _, e := exec.LookPath("node"); e != nil {
		t.Skip("Node unavailable")
	}
	script := `console.log(JSON.stringify({version:1,payloadVersion:'0.1.0',id:'vite',kind:'event',sequence:1}));` +
		`console.log(JSON.stringify({version:1,payloadVersion:'0.1.0',id:'vite',kind:'error',error:{code:'operation_failed',message:'Helper operation failed',detail:'[MISSING_EXPORT] "missing" is not exported by "app/value.ts", imported by "app/app.ts"'}}));`
	a := Adapter{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: fstest.MapFS{
		"helper.cjs":  {Data: []byte(script)},
		"NOTICES.txt": {Data: []byte("fixture")},
	}}, CacheDir: t.TempDir()}}
	_, err := a.call(context.Background(), Request{ProjectDir: t.TempDir()}, nil)
	var failure *Failure
	if !errors.As(err, &failure) || !strings.Contains(failure.Diagnostic, `MISSING_EXPORT`) || !strings.Contains(failure.Diagnostic, `is not exported by "app/value.ts"`) {
		t.Fatalf("engine diagnostic lost: %v", err)
	}
	var remote *jsbridge.RemoteError
	if !errors.As(err, &remote) {
		t.Fatal("remote cause replaced")
	}
}

// Mapped helper codes still translate to their typed categories; detail only
// rides on unmapped engine failures.
func TestMappedRemoteCodesIgnoreDetail(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("F1 helper unavailable")
	}
	if _, e := exec.LookPath("node"); e != nil {
		t.Skip("Node unavailable")
	}
	for code, want := range map[string]error{"unavailable": workflow.ErrUnavailable, "restart_required": ErrRestart, "server_closed": ErrServer} {
		script := `console.log(JSON.stringify({version:1,payloadVersion:'0.1.0',id:'vite',kind:'error',error:{code:'` + code + `',message:'Helper operation failed',detail:'noise'}}));`
		a := Adapter{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: fstest.MapFS{
			"helper.cjs":  {Data: []byte(script)},
			"NOTICES.txt": {Data: []byte("fixture")},
		}}, CacheDir: t.TempDir()}}
		_, err := a.call(context.Background(), Request{ProjectDir: t.TempDir()}, nil)
		var failure *Failure
		if !errors.Is(err, want) || errors.As(err, &failure) {
			t.Fatalf("%s mapped to %v", code, err)
		}
	}
}

type fixturePreparer struct{}

func (fixturePreparer) Prepare(ctx context.Context, r project.Resolved, l workspace.Lease) (project.Prepared, error) {
	return project.Prepared{Identity: l.Layout().Identity, NativeDir: l.Layout().GeneratedRoot, BundleDir: l.Layout().BundleStaging}, nil
}

type fixtureCompiler struct{}

func (fixtureCompiler) Compile(ctx context.Context, p project.Prepared, b project.Bundle, l workspace.Lease) ([]project.Artifact, error) {
	if _, err := os.Stat(b.Entry); err != nil {
		return nil, err
	}
	return []project.Artifact{{Identity: p.Identity, Path: b.Entry, Kind: "javascript-component", ApplicationID: "org.example.fixture"}}, nil
}
func TestWorkflowRealProducers(t *testing.T) {
	a, r, _, l := fixture(t)
	engineModules(t, r.Directory)
	l.Release()
	s := workflow.Stages{Resolver: resolver.Resolver{Host: a.Host}, Preparer: fixturePreparer{}, Bundler: a, Compiler: fixtureCompiler{}}
	resolved, err := workflow.Resolve(context.Background(), s, r.Directory, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, artifacts, err := (workflow.Engine{}).Native(context.Background(), s, resolved, workflow.Request{ProjectDir: r.Directory, OutputDir: t.TempDir(), Target: l.Layout().Identity.Target}, true, nil)
	if err != nil || len(artifacts) != 1 {
		t.Fatal(artifacts, err)
	}
}
