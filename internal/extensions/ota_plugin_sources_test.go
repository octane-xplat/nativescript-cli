package extensions

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

// Real extracted resolver/helper/canonical producer and Go publication adapter;
// native boot, bundle and preparation inputs are fixtures, not compiled apps.
func TestCanonicalPluginNativeSources(t *testing.T) {
	consumer := os.Getenv("OTA_CONSUMER_DIR")
	if consumer == "" {
		t.Skip("requires installed reviewed canonical packages and reserved host tools")
	}
	consumer, _ = filepath.Abs(consumer)
	root := t.TempDir()
	root, _ = filepath.EvalSymlinks(root)
	app, plugin := filepath.Join(root, "app"), filepath.Join(root, "plugin")
	write := func(file, body string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(app, "package.json"), `{"name":"plugin-ota-fixture","version":"1.0.0","dependencies":{"native-source-fixture":"1.0.0"}}`)
	lock, err := os.ReadFile(filepath.Join(consumer, "bun.lock"))
	if err != nil {
		t.Fatal(err)
	}
	write(filepath.Join(app, "bun.lock"), string(lock))
	write(filepath.Join(app, "nativescript.config.js"), `module.exports={id:'org.test.pluginota',appPath:'app',appResourcesPath:'App_Resources'}`)
	write(filepath.Join(app, "app/app.js"), "// canonical fixture, no runtime claim")
	if err := os.MkdirAll(filepath.Join(app, "App_Resources/iOS"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(app, "node_modules"), 0700); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Join(consumer, "node_modules"))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if err := os.Symlink(filepath.Join(consumer, "node_modules", entry.Name()), filepath.Join(app, "node_modules", entry.Name())); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(plugin, "package.json"), `{"name":"native-source-fixture","version":"1.0.0","nativescript":{"platforms":{"ios":"8"}}}`)
	write(filepath.Join(plugin, "nativescript.config.cjs"), `module.exports={ios:{NativeSource:[{name:'Shared',path:'src/*.swift'}]}}`)
	write(filepath.Join(plugin, "src/Bridge.swift"), "class PluginBridge {}")
	if err := os.Symlink(plugin, filepath.Join(app, "node_modules/native-source-fixture")); err != nil {
		t.Fatal(err)
	}
	assets, _ := filepath.Abs("../../assets")
	host := jsbridge.Host{ProjectDir: app, CacheDir: filepath.Join(root, "helper"), Payload: jsbridge.Payload{Files: os.DirFS(assets)}}
	resolve := func() project.Resolved {
		t.Helper()
		payload, _ := json.Marshal(map[string]string{"projectDir": app})
		frame, err := host.Call(context.Background(), jsbridge.Request{Version: jsbridge.ProtocolVersion, ID: "resolve-plugin", Feature: "resolve", Operation: "project", Payload: payload}, nil)
		if err != nil {
			t.Fatal(err)
		}
		var r project.Resolved
		if err := json.Unmarshal(frame.Payload, &r); err != nil {
			t.Fatal(err)
		}
		return r
	}
	run := func(r project.Resolved, expected string) string {
		t.Helper()
		id := project.Identity{Schema: 1, Revision: r.Revision, ProjectDir: app, Target: project.Target{Platform: "ios", DestinationKind: "simulator", Architecture: "arm64", Configuration: "release"}}
		layout, err := workspace.NewLayout(filepath.Join(root, "state"), id)
		if err != nil {
			t.Fatal(err)
		}
		lease, err := workspace.Acquire(context.Background(), layout)
		if err != nil {
			t.Fatal(err)
		}
		defer lease.Release()
		native := filepath.Join(layout.GeneratedRoot, "native")
		write(filepath.Join(native, "internal/main.m"), "int main() { NSString *baseDir = [[NSBundle mainBundle] resourcePath]; }")
		write(filepath.Join(native, "app/package.json"), `{"main":"bundle.mjs"}`)
		stampFile := filepath.Join(native, "app/xplat-native.json")
		previous, previousErr := os.ReadFile(stampFile)
		err = (OTAStartup{Host: host}).Apply(context.Background(), r, project.Prepared{Identity: id, NativeDir: native, BundleDir: filepath.Join(native, "app")}, lease)
		if expected != "" {
			var remote *jsbridge.RemoteError
			if !errors.As(err, &remote) || remote.Failure.Code != expected {
				t.Fatal("wrong rejection", err)
			}
			after, afterErr := os.ReadFile(stampFile)
			if string(after) != string(previous) || os.IsNotExist(previousErr) != os.IsNotExist(afterErr) {
				t.Fatal("rejected inputs changed the existing stamp", afterErr)
			}
			return ""
		}
		if err != nil {
			t.Fatal(err)
		}
		record, err := os.ReadFile(filepath.Join(native, ".xplat/fingerprints/ios.json"))
		if err != nil {
			t.Fatal(err)
		}
		if len(r.NativeSourceGroups) > 0 && !strings.Contains(string(record), "xplat-ns/plugin-native-source/v1") {
			t.Fatal("missing canonical plugin source descriptor")
		}
		var canonical struct {
			Hash    string
			Sources []struct{ Type, ID, Hash string }
		}
		if err := json.Unmarshal(record, &canonical); err != nil {
			t.Fatal(err)
		}
		if len(r.NativeSourceGroups) > 0 {
			// Independently reconstruct the portable descriptor rather than
			// accepting the helper's own record as proof of selected coverage.
			var digest string
			for _, source := range r.Sources {
				if source.Path == filepath.Join(plugin, "src/Bridge.swift") {
					digest = source.Digest
				}
			}
			contents, _ := json.Marshal(map[string]any{"format": "xplat-ns/plugin-native-source/v1", "groups": []any{map[string]any{
				"owner": map[string]string{"name": "native-source-fixture", "version": "1.0.0"}, "name": "Shared", "pattern": "src/*.swift",
				"files": []any{map[string]string{"path": "src/Bridge.swift", "sha256": digest}},
			}}})
			sum := sha256.Sum256(contents)
			count := 0
			for _, source := range canonical.Sources {
				if source.ID == "xplat-ns/plugin-native-source/v1" {
					count++
					if source.Type != "contents" || source.Hash != hex.EncodeToString(sum[:]) {
						t.Fatal("selected descriptor bytes differ", source)
					}
				}
			}
			if digest == "" || count != 1 {
				t.Fatal("selected plugin coverage incomplete")
			}
		}
		var stamp struct{ Hash string }
		body, _ := os.ReadFile(filepath.Join(native, "app/xplat-native.json"))
		if json.Unmarshal(body, &stamp) != nil || len(stamp.Hash) != 64 || canonical.Hash != stamp.Hash {
			t.Fatal("invalid canonical stamp")
		}
		t.Logf("selectedGroups=%d canonicalHash=%s sources=%d", len(r.NativeSourceGroups), stamp.Hash, len(canonical.Sources))
		return stamp.Hash
	}
	first := resolve()
	if len(first.NativeSourceGroups) != 1 || first.NativeSourceGroups[0].PackageDirectory != plugin {
		t.Fatal("plugin selector owner lost", first.NativeSourceGroups)
	}
	before := run(first, "")
	write(filepath.Join(plugin, "src/Bridge.swift"), "class PluginBridge { let changed = true }")
	run(first, "invalid_input")
	changed := resolve()
	if run(changed, "") == before {
		t.Fatal("selected plugin change omitted from canonical identity")
	}
	write(filepath.Join(plugin, "nativescript.config.cjs"), `module.exports={ios:{NativeSource:[]}}`)
	run(changed, "invalid_input")
	removed := resolve()
	if len(removed.NativeSourceGroups) != 0 || run(removed, "") == before {
		t.Fatal("plugin selector removal omitted")
	}
	write(filepath.Join(plugin, "src/Bridge.swift"), "class PluginBridge {}")
	write(filepath.Join(plugin, "nativescript.config.cjs"), `module.exports={ios:{NativeSource:[{name:'Shared',path:'src/*.swift'}]}}`)
	current := resolve()
	write(filepath.Join(app, "fingerprint.config.json"), `{"extraSources":[{"type":"contents","id":"xplat-ns/plugin-native-source/v1","contents":"collision","reasons":[]}]}`)
	run(current, "invalid_input")
	if err := os.Remove(filepath.Join(app, "fingerprint.config.json")); err != nil {
		t.Fatal(err)
	}
	write(filepath.Join(app, ".fingerprintignore"), "xplat-ns/plugin-native-source/**\n")
	run(current, "invalid_input")
}
