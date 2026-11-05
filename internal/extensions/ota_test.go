package extensions

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

func TestDeclaredLocalSPMDoesNotStampUnqualifiedCanonicalInputs(t *testing.T) {
	root := t.TempDir()
	id := project.Identity{Schema: 1, Revision: "fixture", ProjectDir: root, Target: project.Target{Platform: "ios", DestinationKind: "simulator", Architecture: "arm64", Configuration: "debug"}}
	layout, err := workspace.NewLayout(t.TempDir(), id)
	if err != nil {
		t.Fatal(err)
	}
	lease, err := workspace.Acquire(context.Background(), layout)
	if err != nil {
		t.Fatal(err)
	}
	defer lease.Release()
	r := project.Resolved{Directory: root, Revision: id.Revision, Config: project.Config{NativeConfig: json.RawMessage(`{}`)}, Contributions: []project.Contribution{{Platform: "ios", Kind: "spm", SPM: &project.SwiftPackage{Name: "Local", Path: "Local", Products: []string{"Local"}}}}}
	p := project.Prepared{Identity: layout.Identity, NativeDir: filepath.Join(layout.GeneratedRoot, "native")}
	if err := (OTAStartup{}).Apply(context.Background(), r, p, lease); !errors.Is(err, ErrOTAUnavailable) {
		t.Fatal("local package canonical inputs were not rejected before helper launch", err)
	}
	if _, err := os.Stat(p.NativeDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("rejected OTA operation created native outputs", err)
	}
	// A nonempty receipt must still match the selected contribution and source
	// identities; presence alone cannot enable the canonical helper.
	p.LocalSwiftPackages = []project.LocalSwiftPackageEvaluation{{Name: "Substituted", Path: "Local", Manifest: "/other/Package.swift", Products: []string{"Local"}, SourceSHA256: strings.Repeat("a", 64), Evaluation: json.RawMessage(`{"products":[],"targets":[]}`)}}
	if err := (OTAStartup{}).Apply(context.Background(), r, p, lease); !errors.Is(err, ErrOTAUnavailable) || !errors.Is(err, project.ErrLocalSwiftHandoff) {
		t.Fatal("substituted local preparation receipt accepted", err)
	}
}

func TestCanonicalOTAOwnedHelperPublication(t *testing.T) {
	consumer := os.Getenv("OTA_CONSUMER_DIR")
	if consumer == "" {
		t.Skip("requires independently installed canonical packages")
	}
	consumer, _ = filepath.Abs(consumer)
	root := t.TempDir()
	write := func(file, content string) {
		t.Helper()
		if e := os.MkdirAll(filepath.Dir(file), 0700); e != nil {
			t.Fatal(e)
		}
		if e := os.WriteFile(file, []byte(content), 0600); e != nil {
			t.Fatal(e)
		}
	}
	for _, name := range []string{"package.json", "bun.lock"} {
		b, e := os.ReadFile(filepath.Join(consumer, name))
		if e != nil {
			t.Fatal(e)
		}
		write(filepath.Join(root, name), string(b))
	}
	if e := os.Symlink(filepath.Join(consumer, "node_modules"), filepath.Join(root, "node_modules")); e != nil {
		t.Fatal(e)
	}
	config := json.RawMessage(`{"id":"org.test.ota","appPath":"app","appResourcesPath":"App_Resources"}`)
	write(filepath.Join(root, "nativescript.config.js"), "module.exports="+string(config))
	write(filepath.Join(root, "app/app.js"), "// fixture")
	if e := os.MkdirAll(filepath.Join(root, "App_Resources/iOS"), 0700); e != nil {
		t.Fatal(e)
	}
	id := project.Identity{Schema: 1, Revision: "fixture", ProjectDir: root, Target: project.Target{Platform: "ios", DestinationKind: "simulator", Architecture: "arm64", Configuration: "release"}}
	layout, e := workspace.NewLayout(t.TempDir(), id)
	if e != nil {
		t.Fatal(e)
	}
	lease, e := workspace.Acquire(context.Background(), layout)
	if e != nil {
		t.Fatal(e)
	}
	defer lease.Release()
	native := filepath.Join(layout.GeneratedRoot, "native")
	write(filepath.Join(native, "internal/main.m"), "int main() { NSString *baseDir = [[NSBundle mainBundle] resourcePath]; }")
	write(filepath.Join(native, "app/package.json"), `{"main":"bundle.js"}`)
	assets, e := filepath.Abs("../../assets")
	if e != nil {
		t.Fatal(e)
	}
	adapter := OTAStartup{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS(assets)}, CacheDir: t.TempDir()}}
	resolved := project.Resolved{Directory: root, Revision: "fixture", Config: project.Config{NativeConfig: config}}
	// Digest fixture isolates the Go/helper handoff; native compilation is qualified separately.
	resolved.ExtensionNative = []project.ExtensionNativeInput{{Owner: "fixture", Version: "1.0.0", Platform: "ios", Kind: "source", Path: "Fixture.swift", SHA256: strings.Repeat("a", 64)}}
	prepared := project.Prepared{Identity: layout.Identity, NativeDir: native, BundleDir: filepath.Join(native, "app")}
	if e = adapter.Apply(context.Background(), resolved, prepared, lease); e != nil {
		t.Fatal(e)
	}
	stamp, e := os.ReadFile(filepath.Join(native, "app/xplat-native.json"))
	if e != nil {
		t.Fatal(e)
	}
	if e = adapter.Apply(context.Background(), resolved, prepared, lease); e != nil {
		t.Fatal(e)
	}
	again, _ := os.ReadFile(filepath.Join(native, "app/xplat-native.json"))
	if string(stamp) != string(again) {
		t.Fatal("not idempotent")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if e = adapter.Apply(ctx, resolved, prepared, lease); e == nil {
		t.Fatal("accepted cancellation")
	}
	after, _ := os.ReadFile(filepath.Join(native, "app/xplat-native.json"))
	if string(after) != string(stamp) {
		t.Fatal("cancel changed stamp")
	}
	if _, e = os.Stat(filepath.Join(native, ".xplat/fingerprints/ios.json")); e != nil {
		t.Fatal(e)
	}
	record, e := os.ReadFile(filepath.Join(native, ".xplat/fingerprints/ios.json"))
	if e != nil || !strings.Contains(string(record), "xplat-ns/extension-native/v1") {
		t.Fatal("canonical extension source not published", e)
	}
	// A FIFO blocks snapshot reading inside the real canonical helper. The
	// deadline must retire that Node process before the lease can be reused.
	fifo := filepath.Join(root, "app", "blocked")
	if e = exec.Command("mkfifo", fifo).Run(); e != nil {
		t.Fatal(e)
	}
	blocked, stop := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer stop()
	if e = adapter.Apply(blocked, resolved, prepared, lease); !errors.Is(e, context.DeadlineExceeded) {
		t.Fatalf("active cancellation: %v", e)
	}
	if e = os.Remove(fifo); e != nil {
		t.Fatal(e)
	}
	if e = adapter.Apply(context.Background(), resolved, prepared, lease); e != nil {
		t.Fatalf("lease reuse after cancellation: %v", e)
	}
	if e = adapter.Apply(context.Background(), resolved, prepared, nil); e == nil {
		t.Fatal("accepted absent ownership")
	}
}
