package nativescript

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/extension"
	"github.com/octane-xplat/nativescript-cli/extension/transport"
	"github.com/octane-xplat/nativescript-cli/internal/bundle"
	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	resolver "github.com/octane-xplat/nativescript-cli/internal/resolve"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
	devfixture "github.com/octane-xplat/nativescript-cli/tools/extensions/development/fixture"
)

// Native tools and devices are fixtures; public lifecycle, Vite, helper,
// extension scheduling/transports, materialization and filesystem leases are real.
type extensionDevelopmentNative struct {
	developmentNativeFixture
	mu         sync.Mutex
	digests    []string
	nativeRoot string
}

func (f *extensionDevelopmentNative) Prepare(ctx context.Context, r project.Resolved, l workspace.Lease) (project.Prepared, error) {
	if len(r.ExtensionNative) != 1 {
		return project.Prepared{}, errors.New("missing generated native input")
	}
	descriptor := r.ExtensionNative[0]
	matched := false
	for _, c := range r.Contributions {
		if filepath.Base(c.Path) == "Development.swift" {
			data, err := os.ReadFile(c.Path)
			if err != nil {
				return project.Prepared{}, err
			}
			sum := sha256.Sum256(data)
			matched = hex.EncodeToString(sum[:]) == descriptor.SHA256
		}
	}
	if !matched {
		return project.Prepared{}, errors.New("materialized extension input differs")
	}
	p, err := f.developmentNativeFixture.Prepare(ctx, r, l)
	f.mu.Lock()
	f.digests = append(f.digests, descriptor.SHA256)
	f.nativeRoot = p.NativeDir
	f.mu.Unlock()
	return p, err
}
func (f *extensionDevelopmentNative) Compile(ctx context.Context, p project.Prepared, b project.Bundle, l workspace.Lease) ([]project.Artifact, error) {
	for _, phase := range []string{"collect", "prepared"} {
		if _, err := os.Stat(filepath.Join(p.NativeDir, ".nativescript-extensions/dev-qualification", phase+".json")); err != nil {
			return nil, err
		}
	}
	if _, err := os.Stat(filepath.Join(p.NativeDir, ".nativescript-extensions/dev-qualification/post_build.json")); !errors.Is(err, os.ErrNotExist) {
		return nil, errors.New("stale post-build output reached compiler")
	}
	return f.developmentNativeFixture.Compile(ctx, p, b, l)
}
func (f *extensionDevelopmentNative) Launch(ctx context.Context, a project.Artifact, d project.Device) (*workflow.Session, error) {
	f.mu.Lock()
	root := f.nativeRoot
	f.mu.Unlock()
	data, err := os.ReadFile(filepath.Join(root, ".nativescript-extensions/dev-qualification/post_build.json"))
	if err != nil {
		return nil, err
	}
	var record devfixture.Record
	sumData, err := os.ReadFile(a.Path)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(sumData)
	if json.Unmarshal(data, &record) != nil || record.Input.Revision != a.Identity.Revision || record.ArtifactSHA256 != hex.EncodeToString(sum[:]) {
		return nil, errors.New("post-build artifact context differs")
	}
	return f.developmentNativeFixture.Launch(ctx, a, d)
}

func TestPublicDevelopmentExtensionForms(t *testing.T) {
	installed := os.Getenv("NS_NATIVE_VITE_DIR")
	if installed == "" {
		t.Skip("requires installed native Vite; native compiler/device remain fixtures")
	}
	if runtime.GOOS == "windows" {
		t.Skip("external extension process backend remains unavailable on Windows")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	binary := filepath.Join(t.TempDir(), "extension")
	command := exec.CommandContext(ctx, "go", "build", "-o", binary, "./tools/extensions/development/server")
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("fixture build: %v %s", err, output)
	}
	for _, form := range []string{"direct", "go", "node"} {
		t.Run(form, func(t *testing.T) {
			root := t.TempDir()
			app := filepath.Join(root, "app")
			control, trace := filepath.Join(root, "control.json"), filepath.Join(root, "trace.jsonl")
			write := func(file, body string) {
				t.Helper()
				if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(file, []byte(body), 0600); err != nil {
					t.Fatal(err)
				}
			}
			mode := func(value devfixture.Control) {
				t.Helper()
				data, _ := json.Marshal(value)
				write(control, string(data))
			}
			mode(devfixture.Control{Version: 1})
			write(filepath.Join(app, "package.json"), `{"name":"extension-dev","version":"1.0.0","main":"app/app.ts","dependencies":{"@nativescript/core":"9.1.3"}}`)
			write(filepath.Join(app, "nativescript.config.ts"), `export default {id:'org.example.nativedev',appPath:'app',appResourcesPath:'App_Resources'};`)
			write(filepath.Join(app, "app/app.ts"), `export const value=41;`)
			write(filepath.Join(app, "App_Resources/native.json"), `{"version":1}`)
			if err := os.Symlink(filepath.Join(installed, "node_modules"), filepath.Join(app, "node_modules")); err != nil {
				t.Fatal(err)
			}
			env := append(os.Environ(), "NS_DEV_EXTENSION_CONTROL="+control, "NS_DEV_EXTENSION_TRACE="+trace)
			var impl extension.Extension
			closeExtension := func() {}
			var err error
			switch form {
			case "direct":
				impl = devfixture.Extension{Control: control, Trace: trace}
			case "go":
				impl, closeExtension, err = transport.Open(ctx, binary, nil, root, env, io.Discard)
			case "node":
				node, e := exec.LookPath("node")
				if e != nil {
					t.Fatal(e)
				}
				module, _ := filepath.Abs("tools/extensions/development/plugin.cjs")
				impl, closeExtension, err = transport.OpenNode(ctx, node, module, filepath.Join(root, "runner"), root, env, io.Discard)
			}
			if err != nil {
				t.Fatal(err)
			}
			defer closeExtension()
			host := jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS("assets")}, CacheDir: filepath.Join(root, "helper")}
			client, _ := New(Options{})
			var native *extensionDevelopmentNative
			client.engine = workflow.Engine{Factory: func(map[string]string) workflow.Stages {
				return workflow.Stages{Extensions: []extension.Extension{impl}, Resolver: resolver.Resolver{Host: host}, Bundler: bundle.Adapter{Host: host}, Preparer: native, Compiler: native, Devices: native, Launcher: native}
			}}
			request := RunRequest{Development: &DevelopmentOptions{}, DeviceID: "fixture", Build: BuildRequest{ProjectDir: app, OutputDir: filepath.Join(root, "state"), Target: Target{Platform: IOS, Configuration: Debug, Destination: Destination{Kind: Simulator, ID: "fixture", Architecture: "arm64"}}}}
			reserve := func() {
				t.Helper()
				listener, err := net.Listen("tcp", "127.0.0.1:0")
				if err != nil {
					t.Fatal(err)
				}
				request.Development.Port = listener.Addr().(*net.TCPAddr).Port
				listener.Close()
			}
			free := func() {
				t.Helper()
				listener, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", fmt.Sprint(request.Development.Port)))
				if err != nil {
					t.Fatal("owned development port survived", err)
				}
				listener.Close()
			}
			records := func() []devfixture.Record {
				t.Helper()
				data, err := os.ReadFile(trace)
				if errors.Is(err, os.ErrNotExist) {
					return nil
				}
				if err != nil {
					t.Fatal(err)
				}
				lines := strings.Split(string(data), "\n")
				var result []devfixture.Record
				for _, line := range lines[:len(lines)-1] {
					var record devfixture.Record
					if err := json.Unmarshal([]byte(line), &record); err != nil {
						t.Fatal(err)
					}
					result = append(result, record)
				}
				return result
			}
			wait := func(condition func() bool) {
				t.Helper()
				ticker := time.NewTicker(10 * time.Millisecond)
				defer ticker.Stop()
				for !condition() {
					select {
					case <-ctx.Done():
						t.Fatal(ctx.Err())
					case <-ticker.C:
					}
				}
			}
			finish := func(session *Session) {
				t.Helper()
				for range 2 {
					stop, done := context.WithTimeout(context.Background(), 10*time.Second)
					err := session.Close(stop)
					done()
					if !errors.Is(err, context.Canceled) {
						t.Fatal("session close", err)
					}
				}
				if native.active.Load() != 0 || session.DevelopmentEndpoint().URL != "" {
					t.Fatal("session retained app or endpoint")
				}
				free()
			}
			native = &extensionDevelopmentNative{}
			reserve()
			session, err := client.Run(ctx, request)
			if err != nil {
				t.Fatal(err)
			}
			defer session.Close(context.Background())
			mode(devfixture.Control{Version: 2})
			write(filepath.Join(app, "App_Resources/native.json"), `{"version":2}`)
			wait(func() bool { return native.launched.Load() == 2 && session.DevelopmentEndpoint().URL != "" })
			if native.retired.Load() != 1 {
				t.Fatal("extension rebuild did not retire previous iteration")
			}
			native.mu.Lock()
			digests := append([]string(nil), native.digests...)
			native.mu.Unlock()
			if len(digests) != 2 || digests[0] == digests[1] {
				t.Fatal("generated native version did not reach preparation")
			}
			seen := records()
			if len(seen) != 6 {
				t.Fatal("hook count", len(seen))
			}
			for i, record := range seen {
				if record.ProcessID <= 0 || record.ProcessID != seen[0].ProcessID || record.Input.Phase != []extension.Phase{extension.Collect, extension.Prepared, extension.PostBuild}[i%3] || record.Version != i/3+1 || record.Input.Project != app || record.Input.Platform != "ios" || record.Input.Configuration != "debug" {
					t.Fatal("hook context/order differs")
				}
				if i%3 == 2 && (record.Input.Revision != seen[i-1].Input.Revision || record.ArtifactSHA256 == "") {
					t.Fatal("completed artifact/revision missing")
				}
			}
			endpoint := session.DevelopmentEndpoint().URL
			finish(session)
			if response, err := (&http.Client{Timeout: 2 * time.Second}).Get(endpoint); err == nil {
				response.Body.Close()
				t.Fatal("closed server remained reachable")
			}
			for _, phase := range []extension.Phase{extension.Collect, extension.Prepared, extension.PostBuild} {
				write(trace, "")
				mode(devfixture.Control{Version: 2, Fail: phase})
				native = &extensionDevelopmentNative{}
				reserve()
				failed, err := client.Run(ctx, request)
				var operation *OperationError
				if failed != nil || !errors.As(err, &operation) || operation.Cause == nil || !strings.Contains(operation.Cause.Error(), "development hook rejected "+string(phase)) || native.launched.Load() != 0 {
					t.Fatal("hook failure lost or app launched", err)
				}
				free()
				write(trace, "")
				mode(devfixture.Control{Version: 2, Block: phase})
				native = &extensionDevelopmentNative{}
				reserve()
				blocked, stop := context.WithCancel(ctx)
				type outcome struct {
					session *Session
					err     error
				}
				finished := make(chan outcome, 1)
				go func() { s, err := client.Run(blocked, request); finished <- outcome{s, err} }()
				wait(func() bool {
					for _, record := range records() {
						if record.Input.Phase == phase {
							return true
						}
					}
					return false
				})
				stop()
				select {
				case result := <-finished:
					if result.session != nil || !errors.Is(result.err, context.Canceled) || native.launched.Load() != 0 {
						t.Fatal("blocked hook cancellation lost", result.err)
					}
				case <-ctx.Done():
					t.Fatal("blocked hook did not retire")
				}
				free()
				if _, err := impl.Manifest(ctx); err != nil {
					t.Fatal("caller-owned extension failed after cancellation", err)
				}
			}
			mode(devfixture.Control{Version: 2})
			native = &extensionDevelopmentNative{}
			reserve()
			recovered, err := client.Run(ctx, request)
			if err != nil {
				t.Fatal("extension/lease reuse failed", err)
			}
			defer recovered.Close(context.Background())
			mode(devfixture.Control{Version: 3, Fail: extension.Prepared})
			write(filepath.Join(app, "App_Resources/native.json"), `{"version":3}`)
			terminal := make(chan error, 1)
			go func() { terminal <- recovered.Wait() }()
			select {
			case err := <-terminal:
				var operation *OperationError
				if !errors.As(err, &operation) || operation.Cause == nil || !strings.Contains(operation.Cause.Error(), "development hook rejected prepared") || errors.Is(err, ErrCleanup) {
					t.Fatal("live rebuild hook error lost", err)
				}
			case <-ctx.Done():
				t.Fatal("live rebuild failure did not finish")
			}
			if native.active.Load() != 0 || native.retired.Load() != 1 || native.launched.Load() != 1 || recovered.DevelopmentEndpoint().URL != "" {
				t.Fatal("failed rebuild retained old app or endpoint")
			}
			for range 2 {
				stop, done := context.WithTimeout(context.Background(), 10*time.Second)
				err := recovered.Close(stop)
				done()
				if err == nil || errors.Is(err, ErrCleanup) {
					t.Fatal("repeated close lost terminal failure", err)
				}
			}
			free()
			if _, err := impl.Manifest(ctx); err != nil {
				t.Fatal("caller-owned extension failed after live rejection", err)
			}
			closeExtension()
			closeExtension()
			if form != "direct" {
				process, err := os.FindProcess(seen[0].ProcessID)
				if err != nil {
					t.Fatal(err)
				}
				deadline := time.Now().Add(5 * time.Second)
				for process.Signal(syscall.Signal(0)) == nil {
					if time.Now().After(deadline) {
						t.Fatal("owned external extension process survived explicit close")
					}
					time.Sleep(10 * time.Millisecond)
				}
			}
		})
	}
}
