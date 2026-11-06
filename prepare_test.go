package nativescript_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	ns "github.com/octane-xplat/nativescript-cli"
)

func prepareApp(t *testing.T, actual bool) (string, *ns.Client, ns.PrepareRequest) {
	t.Helper()
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1.0.0","devDependencies":{"@nativescript/ios":"8.9.0"},"dependencies":{"native-plugin":"1"}}`)
	resolutionFile(t, root, "node_modules/native-plugin/package.json", `{"name":"native-plugin","version":"1.0.0","nativescript":{"platforms":{"ios":"8"}}}`)
	resolutionFile(t, root, "node_modules/native-plugin/platforms/ios/Binding.swift", "class Binding {}")
	runtimeDir, _ := filepath.Abs("internal/ios/prepare/testdata/runtime")
	if actual {
		runtimeDir = os.Getenv("P1_RUNTIME_DIR")
		if runtimeDir == "" {
			t.Skip("set P1_RUNTIME_DIR to explicitly supplied @nativescript/ios 8.9.0 package")
		}
	}
	runtimePath := filepath.Join(root, "node_modules/@nativescript/ios")
	if err := os.MkdirAll(filepath.Dir(runtimePath), 0700); err != nil {
		t.Fatal(err)
	}
	if actual {
		if err := os.Symlink(runtimeDir, runtimePath); err != nil {
			t.Fatal(err)
		}
	} else {
		if err := os.CopyFS(runtimePath, os.DirFS(runtimeDir)); err != nil {
			t.Fatal(err)
		}
		resolutionFile(t, root, "node_modules/@nativescript/ios/package.json", `{"name":"@nativescript/ios","version":"8.9.0"}`)
	}
	client, _ := ns.New(ns.Options{})
	return root, client, ns.PrepareRequest{ProjectDir: root, OutputDir: filepath.Join(t.TempDir(), "state"), Target: ns.Target{Platform: ns.IOS, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: "fixture-destination", Architecture: "arm64"}}}
}
func TestPublicPrepareResolvedGraphAndSerialization(t *testing.T) {
	root, client, q := prepareApp(t, false)
	var wg sync.WaitGroup
	for range 3 {
		wg.Go(func() {
			if _, err := client.Prepare(context.Background(), q); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	p, err := client.Prepare(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(p.NativeDir, "NativeScriptApp.xcodeproj/project.pbxproj")
	first, _ := os.ReadFile(file)
	if !strings.Contains(string(first), "Binding.swift") {
		t.Fatal("missing resolved plugin")
	}
	p2, err := client.Prepare(context.Background(), q)
	if err != nil || p2 != p {
		t.Fatal(err, "identity changed")
	}
	second, _ := os.ReadFile(file)
	if string(first) != string(second) {
		t.Fatal("graph not idempotent")
	}
	if err := os.Remove(filepath.Join(root, "node_modules/native-plugin/platforms/ios/Binding.swift")); err != nil {
		t.Fatal(err)
	}
	removed, err := client.Prepare(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	if removed.Identity.Revision == p.Identity.Revision {
		t.Fatal("stale revision")
	}
	second, _ = os.ReadFile(file)
	if strings.Contains(string(second), "Binding.swift") {
		t.Fatal("stale membership")
	}
}
func TestPublicPrepareFreshActualRuntime(t *testing.T) {
	_, client, q := prepareApp(t, true)
	p, err := client.Prepare(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"internal/NativeScript.xcframework/Info.plist", "internal/nsld.sh", "internal/metadata-generator-arm64/bin/build-step-metadata-generator.py", "NativeScriptApp.xcodeproj/project.pbxproj", "metadata-inputs.json"} {
		if _, err := os.Stat(filepath.Join(p.NativeDir, name)); err != nil {
			t.Fatal(err)
		}
	}
	t.Log("Actual published runtime template, scripts/frameworks and metadata tools prepared; no Xcode invocation/build/signing/device assertion")
}
func TestPublicPrepareUnsupportedAndFailure(t *testing.T) {
	root, client, q := prepareApp(t, false)
	resolutionFile(t, root, "App_Resources/iOS/other.plist", `<?xml version="1.0"?><plist version="1.0"><dict/></plist>`)
	if _, err := client.Prepare(context.Background(), q); !errors.Is(err, ns.ErrUnavailable) {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(root, "App_Resources/iOS/other.plist")); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Prepare(context.Background(), q); err != nil {
		t.Fatal("lease was not released after failure", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := client.Prepare(ctx, q); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}

func TestPublicPreparePackageRequirementAdvice(t *testing.T) {
	root, client, q := prepareApp(t, false)
	resolutionFile(t, root, "node_modules/native-plugin/package.json", `{"name":"native-plugin","version":"1.0.0","nativescript":{"platforms":{"ios":"~8"}}}`)
	if _, err := client.Prepare(context.Background(), q); err != nil {
		t.Fatal("range floor below the installed runtime rejected", err)
	}
	resolutionFile(t, root, "node_modules/native-plugin/package.json", `{"name":"native-plugin","version":"1.0.0","nativescript":{"platforms":{"ios":">8.9"}}}`)
	_, err := client.Prepare(context.Background(), q)
	var op *ns.OperationError
	if !errors.Is(err, ns.ErrUnavailable) || !errors.As(err, &op) || op.Advice != "package native-plugin requires ios >8.9 but the project has 8.9.0" {
		t.Fatalf("named requirement advice lost: %v", err)
	}
}

func TestPublicPrepareActualLocalDependencies(t *testing.T) {
	if os.Getenv("P1_NATIVE_DEPS") != "1" {
		t.Skip("explicit local dependency-tool qualification only")
	}
	root, _, q := prepareApp(t, true)
	resolutionFile(t, root, "node_modules/native-plugin/platforms/ios/pod/Example.podspec", `Pod::Spec.new do |s|
 s.name = 'Example'
 s.version = '1.0.0'
 s.summary = 'Local component qualification'
 s.homepage = 'https://example.invalid'
 s.license = { :type => 'MIT' }
 s.author = 'Fixture'
 s.source = { :path => '.' }
 s.platform = :ios, '13.0'
 s.source_files = 'Sources/*.m'
end
`)
	resolutionFile(t, root, "node_modules/native-plugin/platforms/ios/pod/Sources/Example.m", "void example(void) {}")
	resolutionFile(t, root, "node_modules/native-plugin/platforms/ios/spm/Package.swift", "// swift-tools-version: 5.7\nimport PackageDescription\nlet package = Package(name: \"ExampleSwift\", products: [.library(name: \"ExampleSwift\", targets: [\"ExampleSwift\"])], targets: [.target(name: \"ExampleSwift\")])")
	resolutionFile(t, root, "node_modules/native-plugin/platforms/ios/spm/Sources/ExampleSwift/Example.swift", "public struct ExampleSwift {}")
	client, _ := ns.New(ns.Options{Environment: map[string]string{"COCOAPODS_DISABLE_STATS": "true"}})
	p, err := client.Prepare(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range []string{"Podfile.lock", "NativeScriptApp.xcworkspace/contents.xcworkspacedata", "Pods/Pods.xcodeproj/project.pbxproj"} {
		if _, err := os.Stat(filepath.Join(p.NativeDir, file)); err != nil {
			t.Fatal(err)
		}
	}
	_, err = client.Prepare(context.Background(), q)
	if err != nil {

		t.Fatal("repeat local tools", err)
	}
	if err := os.RemoveAll(filepath.Join(root, "node_modules/native-plugin/platforms/ios/pod")); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(filepath.Join(root, "node_modules/native-plugin/platforms/ios/spm")); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Prepare(context.Background(), q); err != nil {
		t.Fatal("dependency removal", err)
	}
	b, _ := os.ReadFile(filepath.Join(p.NativeDir, "NativeScriptApp.xcodeproj/project.pbxproj"))
	if strings.Contains(string(b), "productName = \"ExampleSwift\"") {
		t.Fatal("stale SPM membership")
	}
	lock, _ := os.ReadFile(filepath.Join(p.NativeDir, "Podfile.lock"))
	if strings.Contains(string(lock), "Example") {
		t.Fatal("stale Pod membership")
	}
	t.Log("Actual local CocoaPods install and Xcode local SPM resolution completed twice plus dependency removal; native compilation remains unqualified")
}
