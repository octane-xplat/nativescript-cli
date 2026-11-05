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
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
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
	if !strings.Contains(string(body), "XPLAT_PRESET_20261105") || strings.Contains(string(body), "<label") || !strings.Contains(string(body), "octane") {
		t.Fatal("preset define/Octane JSX transform missing")
	}
	bootstrap, err := os.ReadFile(dev.Ready.Manifest.Entry)
	if err != nil {
		t.Fatal(err)
	}
	// Persist hashes and structural assertions only: dev tooling can inject
	// authentication defines, so never log/store arbitrary transformed source.
	if saved := os.Getenv("NS_XPLAT_VITE_EVIDENCE_FILE"); saved != "" {
		if !filepath.IsAbs(saved) {
			t.Fatal("evidence path must be absolute")
		}
		proof := map[string]any{"moduleSHA256": fmt.Sprintf("%x", sha256.Sum256(body)), "moduleBytes": len(body), "bootstrapSHA256": fmt.Sprintf("%x", sha256.Sum256(bootstrap)), "entry": filepath.Base(dev.Ready.Manifest.Entry), "configuredDefinePresent": true, "jsxRemoved": true, "octaneReferencesPresent": true, "scope": "actual published Xplat preset/Octane host helper; no native/device/pinned-source/Bamboo claim"}
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
	t.Logf("actual published Xplat preset served compiled Octane module (%d bytes), native bootstrap=%s", len(body), filepath.Base(dev.Ready.Manifest.Entry))
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
