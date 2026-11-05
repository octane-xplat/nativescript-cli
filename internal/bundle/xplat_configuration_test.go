package bundle

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	resolver "github.com/octane-xplat/nativescript-cli/internal/resolve"
)

// Published Xplat preset/Octane compiler/real server, with installed native
// dependencies resolved but no native compilation or on-device HMR claim.
func TestInstalledXplatProjectConfiguration(t *testing.T) {
	installed := os.Getenv("NS_XPLAT_VITE_DIR")
	if installed == "" {
		t.Skip("requires independent installed Xplat preset fixture")
	}
	pinned := os.Getenv("NS_XPLAT_VITE_PROFILE") == "pinned"
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if pinned {
		workspace := dir
		dir = filepath.Join(workspace, "apps/mobile")
		if err := os.MkdirAll(filepath.Join(workspace, "packages/app/src"), 0700); err != nil {
			t.Fatal(err)
		}
		for _, name := range []string{"bamboo.config.ts", "src/probe.tsx"} {
			bytes, err := os.ReadFile(filepath.Join(installed, "../../packages/app", name))
			if err != nil {
				t.Fatal(err)
			}
			write(t, filepath.Join(workspace, "packages/app", name), string(bytes))
		}
		if err := os.Symlink(filepath.Join(installed, "node_modules"), filepath.Join(workspace, "node_modules")); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"src", "App_Resources"} {
		if err := os.MkdirAll(filepath.Join(dir, name), 0700); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"package.json", "nativescript.config.ts", "vite.config.mts", "src/main.tsx"} {
		bytes, err := os.ReadFile(filepath.Join(installed, name))
		if err != nil {
			t.Fatal(err)
		}
		write(t, filepath.Join(dir, name), string(bytes))
	}
	if err := os.Symlink(filepath.Join(installed, "node_modules"), filepath.Join(dir, "node_modules")); err != nil {
		t.Fatal(err)
	}
	a := Adapter{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS(filepath.Join(root, "assets"))}, CacheDir: t.TempDir()}}
	if pinned {
		a.Host.Environment = map[string]string{"VISUAL_CAPTURE_URL": "", "XPLAT_DOCS_DEMOS": ""}
	}
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
	response, err := http.Get(dev.Ready.Endpoint.URL + "/ns/m/src/main")
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != 200 {
		t.Fatalf("Octane module: %d %v", response.StatusCode, err)
	}
	marker := "XPLAT_PRESET_20261105"
	if pinned {
		marker = "PINNED_PRESET_20261105"
	}
	if !strings.Contains(string(body), marker) || strings.Contains(string(body), "<label") || !strings.Contains(string(body), "octane") {
		t.Fatal("preset define/Octane JSX transform missing")
	}
	bootstrap, err := os.ReadFile(dev.Ready.Manifest.Entry)
	if err != nil {
		t.Fatal(err)
	}
	var cssHashes = map[string]string{}
	if pinned {
		// The engine deliberately skips CSS AST inlining under HMR. Prove the
		// emitted asset here; actual native CSS application is a separate gate.
		for _, file := range dev.Ready.Manifest.Files {
			if strings.HasSuffix(file, ".css") {
				data, err := os.ReadFile(file)
				if err != nil {
					t.Fatal(err)
				}
				if strings.Contains(string(data), "--color-primary") && strings.Contains(string(data), "--space-4") {
					cssHashes[filepath.Base(file)] = fmt.Sprintf("%x", sha256.Sum256(data))
				}
			}
		}
		if len(cssHashes) == 0 {
			t.Fatal("Bamboo probe CSS asset missing")
		}
	}
	// Persist hashes and structural assertions only: dev tooling can inject
	// authentication defines, so never log/store arbitrary transformed source.
	if saved := os.Getenv("NS_XPLAT_VITE_EVIDENCE_FILE"); saved != "" {
		if !filepath.IsAbs(saved) {
			t.Fatal("evidence path must be absolute")
		}
		proof := map[string]any{"moduleSHA256": fmt.Sprintf("%x", sha256.Sum256(body)), "moduleBytes": len(body), "bootstrapSHA256": fmt.Sprintf("%x", sha256.Sum256(bootstrap)), "entry": filepath.Base(dev.Ready.Manifest.Entry), "configuredDefinePresent": true, "jsxRemoved": true, "octaneReferencesPresent": true, "scope": "actual published Xplat preset/Octane host helper; no native/device/pinned-source/Bamboo claim"}
		if pinned {
			proof["scope"] = "pinned source projection, original Vite/Bamboo configs, Octane module and emitted Bamboo CSS asset; host only, no native CSS application/full app claim"
			proof["bambooCSSAssets"] = cssHashes
			delete(proof, "configuredDefinePresent")
		}
		bytes, err := json.MarshalIndent(proof, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		file, err := os.OpenFile(saved, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			t.Fatal(err)
		}
		_, err = file.Write(append(bytes, '\n'))
		if err = errors.Join(err, file.Close()); err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("Xplat preset served compiled Octane module (%d bytes), native bootstrap=%s, pinned profile=%t", len(body), filepath.Base(dev.Ready.Manifest.Entry), pinned)
	// Internal sessions report cancellation and its terminated process exit.
	// Accept only those signals; any additional output/cleanup failure still fails.
	err = dev.Session.Close(context.Background())
	var expected func(error) bool
	expected = func(e error) bool {
		if e == nil || e == context.Canceled {
			return true
		}
		if p, ok := e.(*process.Error); ok {
			return p.Kind == process.ErrExit
		}
		if joined, ok := e.(interface{ Unwrap() []error }); ok {
			for _, cause := range joined.Unwrap() {
				if !expected(cause) {
					return false
				}
			}
			return true
		}
		return false
	}
	if !errors.Is(err, context.Canceled) || !expected(err) {
		t.Fatal("unexpected server teardown failure", err)
	}
	if _, err := os.Stat(dev.Ready.Manifest.Directory); !os.IsNotExist(err) {
		t.Fatal("private output survived close", err)
	}
	if err := dev.Session.Close(context.Background()); !expected(err) {
		t.Fatal("repeated close changed teardown", err)
	}
	if _, err := http.Get(dev.Ready.Endpoint.URL); err == nil {
		t.Fatal("server survived close")
	}
}
