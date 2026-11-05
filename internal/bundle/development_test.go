package bundle

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	resolver "github.com/octane-xplat/nativescript-cli/internal/resolve"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

// This opt-in check runs the installed engine, not a fake Vite/plugin. Native
// compilation, guest boot and actual on-device hot application are separate.
func TestInstalledNativeDevelopmentServer(t *testing.T) {
	installed := os.Getenv("NS_NATIVE_VITE_DIR")
	if installed == "" {
		t.Skip("set NS_NATIVE_VITE_DIR to an installed @nativescript/vite8.0.20 or 8.0.21/Vite8/core9.1.3 consumer")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	for _, name := range []string{"app", "App_Resources"} {
		if err := os.MkdirAll(filepath.Join(dir, name), 0700); err != nil {
			t.Fatal(err)
		}
	}
	write(t, filepath.Join(dir, "package.json"), `{"name":"native-dev-fixture","version":"1.0.0","main":"app/app.ts","dependencies":{"@nativescript/core":"9.1.3"}}`)
	write(t, filepath.Join(dir, "nativescript.config.ts"), `export default {id:'org.example.nativedev',appPath:'app',appResourcesPath:'App_Resources'};`)
	write(t, filepath.Join(dir, "app/app.ts"), `import {nativeValue} from './value'; export const nativeDevFixture = nativeValue;`)
	write(t, filepath.Join(dir, "app/value.ts"), `export const nativeValue = "native-value-before";`)
	if err := os.Symlink(filepath.Join(installed, "node_modules"), filepath.Join(dir, "node_modules")); err != nil {
		t.Fatal(err)
	}
	a := Adapter{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS(filepath.Join(root, "assets"))}, CacheDir: t.TempDir()}}
	r, err := (resolver.Resolver{Host: a.Host}).Resolve(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}
	target := project.Target{Platform: "ios", Configuration: "debug", DestinationKind: "simulator", DestinationID: "fixture", Architecture: "arm64"}
	dev, err := a.StartDevelopment(ctx, r, target, Request{})
	if err != nil {
		t.Fatal(err)
	}
	defer dev.Session.Close(context.Background())
	data, err := os.ReadFile(dev.Ready.Manifest.Entry)
	if err != nil || !strings.Contains(string(data), "/ns/") {
		t.Fatalf("native bootstrap: %v %s", err, data)
	}
	response, err := http.Get(dev.Ready.Endpoint.URL + "/ns/entry")
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != 200 || !strings.Contains(string(body), "/ns/entry-rt") {
		t.Fatalf("native entry: %v %d %s", err, response.StatusCode, body)
	}
	for _, route := range []string{"hmr/client/hot-context.js", "hmr/frameworks/typescript/client/strategy.js"} {
		response, err := http.Get(dev.Ready.Endpoint.URL + "/ns/m/node_modules/@nativescript/vite/" + route)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != 200 || !strings.Contains(string(body), "__xplat") {
			t.Fatalf("native accept adapter not served: %s: %v %d", route, err, response.StatusCode)
		}
	}
	readModule := func() string {
		response, err := http.Get(dev.Ready.Endpoint.URL + "/ns/m/app/value")
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != 200 {
			t.Fatalf("native value module: %v %d", err, response.StatusCode)
		}
		return string(body)
	}
	if !strings.Contains(readModule(), "native-value-before") {
		t.Fatal("initial native value missing")
	}
	probe := exec.CommandContext(ctx, "node", filepath.Join(root, "tools/qualification/development/ws-updates.mjs"), dev.Ready.Endpoint.URL, filepath.Join(dir, "app/value.ts"))
	if output, err := probe.CombinedOutput(); err != nil {
		t.Fatalf("native update wire contract: %v: %s", err, output)
	} else {
		t.Logf("native update wire contract: %s", output)
	}
	deadline := time.Now().Add(10 * time.Second)
	for !strings.Contains(readModule(), "native-value-after") {
		if time.Now().After(deadline) {
			t.Fatal("native transform cache retained stale source after hot edit")
		}
		time.Sleep(50 * time.Millisecond)
	}
	// The live helper owns only its own output: a separate native workspace can
	// acquire its lease, import bootstrap files and run a mutating tool.
	layout, err := workspace.NewLayout(t.TempDir(), project.Identity{Schema: 1, Revision: r.Revision, ProjectDir: r.Directory, Target: target})
	if err != nil {
		t.Fatal(err)
	}
	lease, err := workspace.Acquire(ctx, layout)
	if err != nil {
		t.Fatal(err)
	}
	defer lease.Release()
	r.Directory = layout.Identity.ProjectDir
	p := project.Prepared{Identity: layout.Identity, NativeDir: layout.GeneratedRoot, BundleDir: filepath.Join(layout.GeneratedRoot, "app")}
	bundle, err := dev.Bundle(ctx, r, p, lease)
	if err != nil || filepath.Base(bundle.Entry) != "bundle.mjs" {
		t.Fatal(bundle, err)
	}
	if err := lease.RunHelper(ctx, func(context.Context) error { return nil }); err != nil {
		t.Fatal("server retained the compiler lease", err)
	}
	// An addition under native resources must stop this server for re-resolution.
	write(t, filepath.Join(r.Config.AppResourcesPath, "new-native-input.txt"), "native change")
	done := make(chan error, 1)
	go func() { done <- dev.Session.Wait() }()
	select {
	case err := <-done:
		if !errors.Is(err, ErrRestart) {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("native input edit did not retire server")
	}
	if _, err := os.Stat(dev.Ready.Manifest.Directory); !os.IsNotExist(err) {
		t.Fatal("owned development output survived", err)
	}
	if _, err := http.Get(dev.Ready.Endpoint.URL); err == nil {
		t.Fatal("owned native server survived")
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	if _, err := a.StartDevelopment(ctx, r, target, Request{Port: listener.Addr().(*net.TCPAddr).Port}); !errors.Is(err, workspace.ErrBusy) {
		t.Fatalf("strict native port: %v", err)
	}
}
