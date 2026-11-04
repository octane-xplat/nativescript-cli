package bundle

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
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
	if _, err := os.Stat(filepath.Join(root, "node_modules/vite")); err != nil {
		t.Fatal("run bun install --frozen-lockfile for real Vite fixture")
	}
	dir := t.TempDir()
	write(t, filepath.Join(dir, "package.json"), `{"name":"independent-app","version":"1.0.0"}`)
	write(t, filepath.Join(dir, "nativescript.config.cjs"), `module.exports={id:'org.example.fixture',appPath:'app',appResourcesPath:'App_Resources'}`)
	os.MkdirAll(filepath.Join(dir, "app"), 0700)
	os.MkdirAll(filepath.Join(dir, "App_Resources"), 0700)
	write(t, filepath.Join(dir, "app/app.js"), `import { value } from './value.js'; globalThis.fixtureValue=value;`)
	write(t, filepath.Join(dir, "app/value.js"), `export const value=41;`)
	if err := os.Symlink(filepath.Join(root, "node_modules"), filepath.Join(dir, "node_modules")); err != nil {
		t.Fatal(err)
	}
	a := Adapter{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS(filepath.Join(root, "assets"))}, CacheDir: t.TempDir()}}
	r, err := (resolver.Resolver{Host: a.Host}).Resolve(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
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
func write(t *testing.T, p, s string) {
	t.Helper()
	if err := os.WriteFile(p, []byte(s), 0600); err != nil {
		t.Fatal(err)
	}
}
func event(t *testing.T, ch <-chan Event, kind string) Event {
	t.Helper()
	timeout := time.After(20 * time.Second)
	for {
		select {
		case e, ok := <-ch:
			if !ok {
				t.Fatal("events closed before", kind)
			}
			if e.Type == kind {
				return e
			}
		case <-timeout:
			t.Fatal("timeout", kind)
		}
	}
}
func TestRealBundleAndWatch(t *testing.T) {
	a, r, p, l := fixture(t)
	b, err := a.Bundle(context.Background(), r, p, l)
	if err != nil {
		t.Fatal(err)
	}
	out, err := exec.Command("node", "-e", `require(process.argv[1]);if(globalThis.fixtureValue!==41)process.exit(2)`, b.Entry).CombinedOutput()
	if err != nil {
		t.Fatalf("actual emitted JS: %s %v", out, err)
	}
	s, ch, err := a.Watch(context.Background(), r, p, l, Request{})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close(context.Background())
	ready := event(t, ch, "ready")
	if !strings.Contains(ready.Endpoint.HMRURL, "/__xplat_hmr") {
		t.Fatal(ready)
	}
	resp, err := http.Get(ready.Endpoint.URL + "/@vite/client")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || !strings.Contains(string(body), "WebSocket") {
		t.Fatal("actual HMR client missing")
	}
	wsOut, wsErr := exec.Command("node", "-e", `const timer=setTimeout(()=>process.exit(2),5000); const ws=new WebSocket(process.argv[1],'vite-hmr'); ws.onmessage=e=>{if(JSON.parse(e.data).type==='connected'){clearTimeout(timer);ws.close()}};ws.onerror=()=>process.exit(3);`, ready.Endpoint.HMRURL).CombinedOutput()
	if wsErr != nil {
		t.Fatalf("real WebSocket handshake: %s %v", wsOut, wsErr)
	}
	write(t, filepath.Join(r.Config.AppPath, "value.js"), `export const value=42;`)
	event(t, ch, "emitted")
	write(t, filepath.Join(r.Config.AppPath, "app.js"), `globalThis.bootstrapChanged=true;`)
	event(t, ch, "emitted")
	data, _ := os.ReadFile(b.Entry)
	if !strings.Contains(string(data), "bootstrapChanged") {
		t.Fatal("bootstrap was not rebuilt")
	}
	if err := s.Close(context.Background()); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if !errors.Is(s.Wait(), context.Canceled) {
		t.Fatal(s.Wait())
	}
	if _, err := http.Get(ready.Endpoint.URL); err == nil {
		t.Fatal("owned server survived cleanup")
	}
}
func TestPortFailureAndBorrowedServer(t *testing.T) {
	a, r, p, l := fixture(t)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	s, _, err := a.Watch(context.Background(), r, p, l, Request{Port: listener.Addr().(*net.TCPAddr).Port})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Wait(); !errors.Is(err, workspace.ErrBusy) {
		t.Fatalf("conflict %v", err)
	}
	caller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("caller")) }))
	defer caller.Close()
	s, ch, err := a.Watch(context.Background(), r, p, l, Request{CallerEndpoint: &Endpoint{URL: caller.URL, HMRURL: "ws://caller.invalid/hmr"}})
	if err != nil {
		t.Fatal(err)
	}
	event(t, ch, "ready")
	s.Close(context.Background())
	s.Close(context.Background())
	resp, err := http.Get(caller.URL)
	if err != nil {
		t.Fatal("borrowed server stopped", err)
	}
	resp.Body.Close()
}

type crashExecutor struct{}

func (crashExecutor) Start(ctx context.Context, c process.Command) (process.Handle, error) {
	c.Args = []string{"-e", "process.exit(9)"}
	return (process.Runner{}).Start(ctx, c)
}
func TestCrashCancellationAndInvalidBundle(t *testing.T) {
	a, r, p, l := fixture(t)
	a.Host.Executor = crashExecutor{}
	s, _, err := a.Watch(context.Background(), r, p, l, Request{})
	if err != nil {
		t.Fatal(err)
	}
	if s.Wait() == nil {
		t.Fatal("crash accepted")
	}
	a.Host.Executor = nil
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = a.Bundle(ctx, r, p, l)
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	write(t, filepath.Join(r.Config.AppPath, "app.js"), "invalid (((")
	if _, err = a.Bundle(context.Background(), r, p, l); err == nil {
		t.Fatal("invalid JS accepted")
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

type captureExecutor struct{ handles chan process.Handle }

func (c captureExecutor) Start(ctx context.Context, cmd process.Command) (process.Handle, error) {
	h, err := (process.Runner{}).Start(ctx, cmd)
	if err == nil {
		c.handles <- h
	}
	return h, err
}
func TestRunningServerCrashAndConfigRestart(t *testing.T) {
	a, r, p, l := fixture(t)
	capture := captureExecutor{handles: make(chan process.Handle, 1)}
	a.Host.Executor = capture
	s, ch, err := a.Watch(context.Background(), r, p, l, Request{})
	if err != nil {
		t.Fatal(err)
	}
	event(t, ch, "ready")
	h := <-capture.handles
	h.Close(context.Background())
	if s.Wait() == nil {
		t.Fatal("server crash accepted")
	}
	a.Host.Executor = nil
	s, ch, err = a.Watch(context.Background(), r, p, l, Request{})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close(context.Background())
	event(t, ch, "ready")
	write(t, filepath.Join(r.Directory, "nativescript.config.cjs"), `module.exports={id:'org.example.changed'}`)
	done := make(chan error, 1)
	go func() { done <- s.Wait() }()
	select {
	case err := <-done:
		if !errors.Is(err, ErrRestart) {
			t.Fatal(err)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("config edit did not require restart")
	}
}

func TestReleaseRetainsActiveHelper(t *testing.T) {
	a, r, p, l := fixture(t)
	s, ch, err := a.Watch(context.Background(), r, p, l, Request{})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close(context.Background())
	event(t, ch, "ready")
	released := make(chan error, 1)
	go func() { released <- l.Release() }()
	select {
	case <-released:
		t.Fatal("released active helper")
	case <-time.After(100 * time.Millisecond):
	}
	s.Close(context.Background())
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

func TestMissingViteAndColdCancellation(t *testing.T) {
	a, r, p, l := fixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond)
	defer cancel()
	s, _, err := a.Watch(ctx, r, p, l, Request{})
	if err != nil {
		t.Fatal(err)
	}
	if !errors.Is(s.Wait(), context.DeadlineExceeded) {
		t.Fatal(s.Wait())
	}
	if err := os.Remove(filepath.Join(r.Directory, "node_modules")); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Bundle(context.Background(), r, p, l); !errors.Is(err, workflow.ErrUnavailable) {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(r.Directory, "package-lock.json")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("unexpected dependency installation")
	}
}

func TestAndroidBundleRetainsRuntimeSettings(t *testing.T) {
	a, r, p, l := fixture(t)
	p.Identity.Target.Platform = "android"
	// Use a genuine Android lease, rather than altering a compatible identity.
	l.Release()
	layout, err := workspace.NewLayout(t.TempDir(), p.Identity)
	if err != nil {
		t.Fatal(err)
	}
	owned, err := workspace.Acquire(context.Background(), layout)
	if err != nil {
		t.Fatal(err)
	}
	defer owned.Release()
	p.NativeDir = layout.GeneratedRoot
	p.BundleDir = layout.BundleStaging
	r.Config.Android = project.AndroidConfig{V8Flags: "--expose_gc", MarkingMode: "none"}
	b, err := a.Bundle(context.Background(), r, p, owned)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(b.Directory, "package.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range []string{`"main":"bundle.js"`, `"id":"org.example.fixture"`, `"v8Flags":"--expose_gc"`, `"markingMode":"none"`} {
		if !strings.Contains(string(data), s) {
			t.Fatal(string(data))
		}
	}
}

func TestNativePackageAndPlatformResolution(t *testing.T) {
	for _, platform := range []string{"ios", "android"} {
		t.Run(platform, func(t *testing.T) {
			a, r, p, lease := fixture(t)
			modules := filepath.Join(r.Directory, "node_modules")
			vite, e := filepath.EvalSymlinks(filepath.Join(modules, "vite"))
			if e != nil {
				t.Fatal(e)
			}
			if e = os.Remove(modules); e != nil {
				t.Fatal(e)
			}
			if e = os.MkdirAll(filepath.Join(modules, "native-package"), 0700); e != nil {
				t.Fatal(e)
			}
			if e = os.Symlink(vite, filepath.Join(modules, "vite")); e != nil {
				t.Fatal(e)
			}
			write(t, filepath.Join(modules, "native-package/package.json"), `{"name":"native-package","exports":{".":{"native":"./native.js","default":"./web.js"}}}`)
			write(t, filepath.Join(modules, "native-package/native.js"), `export const target="native-selected";`)
			write(t, filepath.Join(modules, "native-package/web.js"), `throw new Error("web branch selected");`)
			for _, osname := range []string{"ios", "android"} {
				write(t, filepath.Join(r.Config.AppPath, "choice."+osname+".js"), `export const platform="`+osname+`-selected";`)
			}
			write(t, filepath.Join(r.Config.AppPath, "app.js"), `import {target} from 'native-package';import {platform} from './choice';import pkg from '~/package.json';globalThis.nativeResult=[target,platform,pkg.main,global.isIOS,global.isAndroid,__DEV__,__IOS__,__ANDROID__,__APPLE__,__VISIONOS__,__COMMONJS__];`)
			if platform == "android" {
				write(t, filepath.Join(r.Config.AppPath, "package.json"), `{"main":"app.js","profiling":"fixture"}`)
			}
			q := Request{ProjectDir: r.Directory, Directory: p.BundleDir, Entry: filepath.Join(r.Config.AppPath, "app.js"), Mode: "bundle", Platform: platform, AppPath: r.Config.AppPath, Configuration: "release"}
			m, e := a.call(context.Background(), q, nil)
			if e != nil {
				t.Fatal(e)
			}
			data, e := os.ReadFile(m.Entry)
			if e != nil {
				t.Fatal(e)
			}
			if !strings.Contains(string(data), "native-selected") || !strings.Contains(string(data), platform+"-selected") || strings.Contains(string(data), "web branch selected") {
				t.Fatal(string(data))
			}
			out, e := exec.Command("node", "-e", string(data)+`;console.log(JSON.stringify(globalThis.nativeResult));`).CombinedOutput()
			if e != nil {
				t.Fatal(e, string(out))
			}
			expected := `["native-selected","` + platform + `-selected","bundle.js",` + map[bool]string{true: "true,false", false: "false,true"}[platform == "ios"] + `,false,` + map[bool]string{true: "true,false,true,false,false", false: "false,true,false,false,false"}[platform == "ios"] + `]`
			if strings.TrimSpace(string(out)) != expected {
				t.Fatalf("%s != %s", out, expected)
			}
			_ = lease
		})
	}
}

// Independent callers must retain separate helper, server and bundle ownership.
// This exercises real Vite and F1/F2 without claiming native HMR/device behavior.
func TestIndependentWatchersRetainOwnership(t *testing.T) {
	a, r, p, l := fixture(t)
	other, r2, p2, l2 := fixture(t)
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	env := os.Environ()
	s, ch, err := a.Watch(context.Background(), r, p, l, Request{})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close(context.Background())
	ready := event(t, ch, "ready")
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	s2, ch2, err := other.Watch(context.Background(), r2, p2, l2, Request{Port: port})
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close(context.Background())
	ready2 := event(t, ch2, "ready")
	if ready.Endpoint.URL == ready2.Endpoint.URL {
		t.Fatal("independent servers share endpoint")
	}
	write(t, filepath.Join(r.Config.AppPath, "app.js"), `globalThis.onlyFirstCaller=true;`)
	event(t, ch, "emitted")
	write(t, filepath.Join(r2.Config.AppPath, "app.js"), `globalThis.onlySecondCaller=true;`)
	event(t, ch2, "emitted")
	first, err := os.ReadFile(filepath.Join(p.BundleDir, "bundle.js"))
	if err != nil {
		t.Fatal(err)
	}
	second, err := os.ReadFile(filepath.Join(p2.BundleDir, "bundle.js"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(first), "onlyFirstCaller") || strings.Contains(string(first), "onlySecondCaller") || !strings.Contains(string(second), "onlySecondCaller") || strings.Contains(string(second), "onlyFirstCaller") {
		t.Fatal("crossed independent bundle outputs")
	}
	for range 2 {
		if err := s.Close(context.Background()); !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	}
	resp, err := http.Get(ready2.Endpoint.URL + "/@vite/client")
	if err != nil {
		t.Fatal("closing first caller stopped second", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatal(resp.Status)
	}
	write(t, filepath.Join(r2.Config.AppPath, "app.js"), `globalThis.remainingCaller=true;`)
	event(t, ch2, "emitted")
	now, err := os.Getwd()
	if err != nil || now != cwd || !reflect.DeepEqual(env, os.Environ()) {
		t.Fatal("watchers changed process globals", err)
	}
}
