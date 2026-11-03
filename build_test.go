package nativescript_test

import (
	"context"
	"errors"
	ns "github.com/octane-xplat/nativescript-cli"
	iosbuild "github.com/octane-xplat/nativescript-cli/internal/ios/build"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// This opt-in test requires a native_builds reservation; it never boots a device.
func TestFreshIOSSimulatorBuild(t *testing.T) {
	if os.Getenv("B1_NATIVE_BUILD") != "1" {
		t.Skip("requires explicit runtime/Vite inputs and native build reservation")
	}
	root, _, q := prepareApp(t, true)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1.0.0","main":"app.js","devDependencies":{"@nativescript/ios":"8.9.0","vite":"7.3.1"},"dependencies":{"native-plugin":"1"}}`)
	resolutionFile(t, root, "app/app.js", `console.log("B1 bundled startup");`)
	if err := os.Symlink(os.Getenv("B1_VITE_DIR"), filepath.Join(root, "node_modules/vite")); err != nil {
		t.Fatal(err)
	}
	resolutionFile(t, root, "App_Resources/iOS/build.xcconfig", "IPHONEOS_DEPLOYMENT_TARGET = 15.0\n")
	q.Target.Destination.ID = "generic"
	client, _ := ns.New(ns.Options{})
	result, err := client.Build(context.Background(), ns.BuildRequest{ProjectDir: q.ProjectDir, OutputDir: q.OutputDir, Target: q.Target})
	if err != nil {
		var failure *iosbuild.Failure
		if errors.As(err, &failure) {
			t.Log(failure.Diagnostic)
		}
		t.Fatal(err)
	}
	if len(result.Artifacts) != 1 || result.Artifacts[0].Kind != "app" || result.Artifacts[0].ApplicationID != "org.example.app" {
		t.Fatalf("unexpected artifacts: %+v", result.Artifacts)
	}
	if _, err := os.Stat(filepath.Join(result.Artifacts[0].Path, "app", "bundle.js")); err != nil {
		t.Fatal("bundled entry absent from app", err)
	}
	if dest := os.Getenv("B1_ARTIFACT_DIR"); dest != "" {
		if !filepath.IsAbs(dest) {
			t.Fatal("artifact destination must be absolute")
		}
		if err := exec.Command("/usr/bin/ditto", result.Artifacts[0].Path, filepath.Join(dest, "NativeScriptApp.app")).Run(); err != nil {
			t.Fatal(err)
		}
		t.Log("retained simulator app at", dest)
	}
	t.Logf("fresh simulator app: %+v", result.Artifacts[0])
}
