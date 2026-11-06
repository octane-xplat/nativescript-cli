package extensions

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/project"
)

// This deliberately isolates the private handler. Public native compilation and
// compiled stamps require a separate qualification against real artifacts.
func TestCanonicalLocalSwiftOwnedSnapshot(t *testing.T) {
	consumer := os.Getenv("OTA_CONSUMER_DIR")
	if consumer == "" || runtime.GOOS != "darwin" {
		t.Skip("requires installed canonical packages and reserved Darwin tools")
	}
	consumer, _ = filepath.Abs(consumer)
	for _, placement := range []string{"app", "workspace", "installed"} {
		t.Run(placement, func(t *testing.T) {
			root := t.TempDir()
			if retain := os.Getenv("OTA_LOCAL_SPM_RETAIN_DIR"); retain != "" {
				var err error
				root, err = os.MkdirTemp(retain, "ota-local-"+placement+"-")
				if err != nil {
					t.Fatal(err)
				}
			}
			app, native := filepath.Join(root, "app"), filepath.Join(root, "state/native")
			write := func(file, body string) {
				t.Helper()
				if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(file, []byte(body), 0600); err != nil {
					t.Fatal(err)
				}
			}
			hash := func(body []byte) string { sum := sha256.Sum256(body); return hex.EncodeToString(sum[:]) }
			for _, file := range []string{"package.json", "bun.lock"} {
				body, err := os.ReadFile(filepath.Join(consumer, file))
				if err != nil {
					t.Fatal(err)
				}
				write(filepath.Join(app, file), string(body))
			}
			local, relative := filepath.Join(app, "Local"), "Local"
			if placement != "app" {
				local, relative = filepath.Join(root, "Library"), "../Library"
			}
			nodeModules := filepath.Join(app, "node_modules")
			if placement == "installed" {
				if err := os.MkdirAll(nodeModules, 0700); err != nil {
					t.Fatal(err)
				}
				entries, err := os.ReadDir(filepath.Join(consumer, "node_modules"))
				if err != nil {
					t.Fatal(err)
				}
				for _, entry := range entries {
					if err := os.Symlink(filepath.Join(consumer, "node_modules", entry.Name()), filepath.Join(nodeModules, entry.Name())); err != nil {
						t.Fatal(err)
					}
				}
				relative = "node_modules/ota-owned-local-shim"
				if err := os.Symlink(local, filepath.Join(app, relative)); err != nil {
					t.Fatal(err)
				}
			} else if err := os.Symlink(filepath.Join(consumer, "node_modules"), nodeModules); err != nil {
				t.Fatal(err)
			}
			config, _ := json.Marshal(map[string]any{"id": "org.example.localsnapshot", "appPath": "app", "appResourcesPath": "App_Resources", "ios": map[string]any{"SPMPackages": []any{map[string]any{"name": "Declared", "path": relative, "libs": []string{"Local"}}}}})
			write(filepath.Join(app, "nativescript.config.js"), "module.exports="+string(config))
			write(filepath.Join(app, "app/app.js"), "// private canonical snapshot fixture")
			if err := os.MkdirAll(filepath.Join(app, "App_Resources/iOS"), 0700); err != nil {
				t.Fatal(err)
			}
			manifest, source := filepath.Join(local, "Package.swift"), filepath.Join(local, "Sources/Local.c")
			write(manifest, "// swift-tools-version: 5.7\nimport PackageDescription\nlet package = Package(name: \"Evaluated\", products: [.library(name: \"Local\", targets: [\"Local\"])], targets: [.target(name: \"Local\", path: \"Sources\", publicHeadersPath: \"include\")])\n")
			write(source, "int localValue(void) { return 111; }\n")
			write(filepath.Join(local, "Sources/include/Local.h"), "int localValue(void);\n")
			sources := map[string]string{}
			for _, file := range []string{manifest, source, filepath.Join(local, "Sources/include/Local.h")} {
				body, err := os.ReadFile(file)
				if err != nil {
					t.Fatal(err)
				}
				sources[file] = hash(body)
			}
			assets, _ := filepath.Abs("../../assets")
			runtimeFixture, _ := filepath.Abs("../ios/prepare/testdata/runtime")
			host := jsbridge.Host{ProjectDir: app, CacheDir: filepath.Join(root, "helper"), Payload: jsbridge.Payload{Files: os.DirFS(assets)}}
			resolved := project.Resolved{Directory: app, Revision: "snapshot-fixture", ApplicationID: "org.example.localsnapshot", Packages: []project.Package{{Name: "@nativescript/ios", Version: "8.9.0", Directory: runtimeFixture}}, Contributions: []project.Contribution{{Platform: "ios", Kind: "spm", Path: manifest, SPM: &project.SwiftPackage{Name: "Declared", Path: relative, Products: []string{"Local"}}}}}
			for file, digest := range sources {
				resolved.Sources = append(resolved.Sources, project.Source{Path: file, Digest: digest})
			}
			payload, _ := json.Marshal(map[string]any{"resolved": resolved, "directory": native})
			frame, err := host.Call(context.Background(), jsbridge.Request{Version: jsbridge.ProtocolVersion, ID: "prepare-local", Feature: "xcode", Operation: "prepare", Payload: payload}, nil)
			if err != nil {
				t.Fatal(err)
			}
			var preparation struct {
				LocalSwiftPackages []project.LocalSwiftPackageEvaluation
			}
			if err := json.Unmarshal(frame.Payload, &preparation); err != nil || len(preparation.LocalSwiftPackages) != 1 {
				t.Fatal("missing real preparation receipt", err)
			}
			// Labeled boot/bundle fixtures, not compiled native artifacts.
			write(filepath.Join(native, "internal/main.m"), "int main() { NSString *baseDir = [[NSBundle mainBundle] resourcePath]; }")
			write(filepath.Join(native, "app/package.json"), `{"main":"bundle.mjs"}`)
			request := otaRequest{ProjectDir: app, NativeDir: native, BundleDir: filepath.Join(native, "app"), Platform: "ios", Configuration: "release", NativeConfig: config, Architecture: "arm64", DestinationKind: "simulator", SourceFiles: sources, LocalSwiftPackages: preparation.LocalSwiftPackages, ProjectStateDir: filepath.Dir(native)}
			var records []json.RawMessage
			var stages []string
			run := func(expected string) string {
				t.Helper()
				stage, err := os.MkdirTemp(filepath.Dir(native), "ota-")
				if err != nil {
					t.Fatal(err)
				}
				request.StageDir = stage
				payload, err := json.Marshal(request)
				if err != nil {
					t.Fatal(err)
				}
				if os.Getenv("OTA_LOCAL_SPM_RETAIN_DIR") != "" {
					write(filepath.Join(stage, "request.json"), string(payload))
				}
				frame, err := host.Call(context.Background(), jsbridge.Request{Version: jsbridge.ProtocolVersion, ID: "ota-local", Feature: "extensions", Operation: "otaStartup", Payload: payload}, nil)
				output := filepath.Join(stage, "native")
				if expected != "" {
					var remote *jsbridge.RemoteError
					if !errors.As(err, &remote) || remote.Failure.Code != expected {
						t.Fatalf("expected %s rejection: %v", expected, err)
					}
					if _, err := os.Stat(output); !errors.Is(err, os.ErrNotExist) {
						t.Fatal("failed helper published native stage", err)
					}
					return ""
				}
				if err != nil {
					t.Fatal(err)
				}
				var result struct {
					Hash    string
					Release bool
				}
				if err := json.Unmarshal(frame.Payload, &result); err != nil || !result.Release {
					t.Fatal("invalid helper result", err)
				}
				record, err := os.ReadFile(filepath.Join(output, ".xplat/fingerprints/ios.json"))
				if err != nil {
					t.Fatal(err)
				}
				var parsed struct {
					Hash    string
					Sources []struct{ Type, ID, Hash string }
				}
				if err := json.Unmarshal(record, &parsed); err != nil || parsed.Hash != result.Hash {
					t.Fatal("record mismatch", err)
				}
				expectedExtras := 0
				if len(request.LocalSwiftPackages) > 0 {
					expectedExtras++
				}
				if len(request.ExtensionNative) > 0 {
					expectedExtras++
				}
				fingerprintConfig, err := os.ReadFile(filepath.Join(stage, "project/fingerprint.config.json"))
				if err != nil && (expectedExtras > 0 || !errors.Is(err, os.ErrNotExist)) {
					t.Fatal(err)
				}
				var extras struct {
					ExtraSources []struct{ ID, Contents string }
				}
				if len(fingerprintConfig) > 0 {
					if err := json.Unmarshal(fingerprintConfig, &extras); err != nil {
						t.Fatal(err)
					}
				}
				if len(extras.ExtraSources) != expectedExtras {
					t.Fatal("missing owned canonical extra source")
				}
				for _, extra := range extras.ExtraSources {
					matches := 0
					for _, s := range parsed.Sources {
						if s.Type == "contents" && s.ID == extra.ID && s.Hash == hash([]byte(extra.Contents)) {
							matches++
						}
					}
					if matches != 1 {
						t.Fatal("canonical contents hash mismatch")
					}
				}
				if len(request.LocalSwiftPackages) == 0 {
					for _, s := range parsed.Sources {
						if s.ID == "xplat-ns/local-spm/v1" {
							t.Fatal("removed local source retained")
						}
					}
				}
				if len(request.LocalSwiftPackages) > 0 {
					for file, digest := range sources {
						body, err := os.ReadFile(filepath.Join(stage, "local-swift/0", strings.TrimPrefix(file, local+string(filepath.Separator))))
						if err != nil || hash(body) != digest {
							t.Fatal("owned source copy mismatch", err)
						}
					}
				}
				stamp, err := os.ReadFile(filepath.Join(output, "app/xplat-native.json"))
				if err != nil || !strings.Contains(string(stamp), result.Hash) {
					t.Fatal("stamp mismatch", err)
				}
				boot, err := os.ReadFile(filepath.Join(output, "internal/main.m"))
				if err != nil || !strings.Contains(string(boot), result.Hash) {
					t.Fatal("boot mismatch", err)
				}
				records = append(records, json.RawMessage(record))
				stages = append(stages, stage)
				return result.Hash
			}
			first := run("")
			if repeated := run(""); repeated != first {
				t.Fatal("not idempotent")
			}
			write(source, "int localValue(void) { return 222; }\n")
			run("invalid_input")
			body, _ := os.ReadFile(source)
			sources[source] = hash(body)
			changed := run("")
			if changed == first {
				t.Fatal("changed local source did not change canonical hash")
			}
			request.ExtensionNative = []project.ExtensionNativeInput{{Owner: "fixture", Version: "1.0.0", Platform: "ios", Kind: "source", Path: "Fixture.swift", SHA256: strings.Repeat("f", 64)}}
			if combined := run(""); combined == changed {
				t.Fatal("extension and local inputs did not combine")
			}
			request.ExtensionNative = nil
			if restored := run(""); restored != changed {
				t.Fatal("extension removal did not restore local identity")
			}
			request.LocalSwiftPackages = nil
			run("unavailable")
			request.LocalSwiftPackages = preparation.LocalSwiftPackages
			write(filepath.Join(app, "fingerprint.config.json"), `{"extraSources":[{"type":"contents","id":"xplat-ns/local-spm/v1","contents":"collision"}]}`)
			run("invalid_input")
			if err := os.Remove(filepath.Join(app, "fingerprint.config.json")); err != nil {
				t.Fatal(err)
			}
			config = json.RawMessage(`{"id":"org.example.localsnapshot","appPath":"app","appResourcesPath":"App_Resources"}`)
			write(filepath.Join(app, "nativescript.config.js"), "module.exports="+string(config))
			request.NativeConfig = config
			request.LocalSwiftPackages = nil
			resolved.Contributions = nil
			payload, _ = json.Marshal(map[string]any{"resolved": resolved, "directory": native})
			if _, err := host.Call(context.Background(), jsbridge.Request{Version: jsbridge.ProtocolVersion, ID: "remove-local", Feature: "xcode", Operation: "prepare", Payload: payload}, nil); err != nil {
				t.Fatal(err)
			}
			if removed := run(""); removed == changed {
				t.Fatal("local removal did not change canonical identity")
			}
			if reportDir := os.Getenv("OTA_LOCAL_SPM_REPORT_DIR"); reportDir != "" {
				data, _ := json.MarshalIndent(map[string]any{"scope": "private extracted-helper canonical snapshot/boot/stamp fixture; actual Swift manifest evaluation and native toolchain capture; no native library compilation, public OTA publication or installer acceptance", "placement": placement, "root": root, "stages": stages, "records": records}, "", "  ")
				file, err := os.OpenFile(filepath.Join(reportDir, placement+".json"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
				if err != nil {
					t.Fatal(err)
				}
				_, err = file.Write(data)
				file.Close()
				if err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}
