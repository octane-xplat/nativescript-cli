package nativescript_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	ns "github.com/octane-xplat/nativescript-cli"
)

// Resolution and project editing are real; prepareApp supplies a runtime
// template fixture. This does not compile Swift or qualify a guest runtime.
func TestPluginNativeSourceResolutionAndPreparation(t *testing.T) {
	for _, linked := range []bool{false, true} {
		name := "installed"
		if linked {
			name = "linked"
		}
		t.Run(name, func(t *testing.T) {
			root, client, request := prepareApp(t, false)
			parent := filepath.Join(root, "node_modules/native-plugin")
			resolutionFile(t, parent, "package.json", `{"name":"native-plugin","version":"1.0.0","nativescript":{"platforms":{"ios":"8"}},"dependencies":{"leaf":"1"}}`)
			resolutionFile(t, parent, "nativescript.config.cjs", `module.exports={ios:{NativeSource:[{name:'Shared',path:'native/*.swift'}]}}`)
			resolutionFile(t, parent, "native/Configured.swift", "class Configured {}")
			leaf := filepath.Join(root, "node_modules/leaf")
			if linked {
				leaf = t.TempDir()
				if err := os.Symlink(leaf, filepath.Join(root, "node_modules/leaf")); err != nil {
					t.Fatal(err)
				}
			}
			resolutionFile(t, leaf, "package.json", `{"name":"leaf","version":"1.0.0","nativescript":{"platforms":{"ios":"8"}}}`)
			leaf, err := filepath.EvalSymlinks(leaf)
			if err != nil {
				t.Fatal(err)
			}
			config := func(enabled bool) {
				groups := "[]"
				if enabled {
					groups = "[{name:'Shared',path:'src/*.swift'}]"
				}
				resolutionFile(t, leaf, "nativescript.config.cjs", "module.exports={ios:{NativeSource:"+groups+"}}")
			}
			config(true)
			resolutionFile(t, leaf, "src/Leaf.swift", "class Leaf {}")
			// The app explicitly selects the same physical file. Plugin ownership
			// must win and Xcode membership must remain singular.
			resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.test.plugin_sources',ios:{NativeSource:[{name:'Shared',path:'node_modules/leaf/src/*.swift'}]}}`)
			ctx := context.Background()
			resolved, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
			if err != nil {
				t.Fatal(err)
			}
			if len(resolved.Contributions) != 3 {
				t.Fatal("plugin/app overlap duplicated or lost membership", resolved.Contributions)
			}
			for _, c := range resolved.Contributions {
				if filepath.Base(c.Path) == "Leaf.swift" && c.PackageDirectory != leaf {
					t.Fatal("transitive plugin ownership lost", c)
				}
			}
			prepare := func() (ns.PreparedProject, string) {
				t.Helper()
				p, err := client.Prepare(ctx, request)
				if err != nil {
					t.Fatal(err)
				}
				data, err := os.ReadFile(filepath.Join(p.NativeDir, "NativeScriptApp.xcodeproj/project.pbxproj"))
				if err != nil {
					t.Fatal(err)
				}
				return p, string(data)
			}
			first, project := prepare()
			if !strings.Contains(project, "Leaf.swift") || !strings.Contains(project, "Configured.swift") {
				t.Fatal("plugin selectors missing from native project")
			}
			repeat, _ := prepare()
			if repeat.Identity != first.Identity {
				t.Fatal("unchanged plugin selectors changed identity")
			}
			resolutionFile(t, leaf, "src/Leaf.swift", "class Leaf { let changed = true }")
			changed, _ := prepare()
			if changed.Identity.Revision == first.Identity.Revision {
				t.Fatal("changed selected plugin bytes ignored")
			}
			resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.test.plugin_sources'}`)
			config(false)
			removed, project := prepare()
			if removed.Identity.Revision == changed.Identity.Revision || strings.Contains(project, "Leaf.swift") || !strings.Contains(project, "Configured.swift") {
				t.Fatal("plugin selector removal or independent owner membership failed")
			}
		})
	}
}

func TestPluginSourceSelectorPreservesPhysicalPackageOwnership(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1.0.0","dependencies":{"a-plugin":"1","z-plugin":"1"}}`)
	for _, name := range []string{"a-plugin", "z-plugin"} {
		resolutionFile(t, root, "node_modules/"+name+"/package.json", `{"name":"`+name+`","version":"1.0.0","nativescript":{"platforms":{"ios":"8"}}}`)
	}
	resolutionFile(t, root, "node_modules/a-plugin/nativescript.config.cjs", `module.exports={ios:{NativeSource:[{name:'Shared',path:'../z-plugin/platforms/ios/*.swift'}]}}`)
	resolutionFile(t, root, "node_modules/z-plugin/platforms/ios/Owned.swift", "class Owned {}")
	client, _ := ns.New(ns.Options{})
	p, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || len(p.Contributions) != 1 || filepath.Base(p.Contributions[0].PackageDirectory) != "z-plugin" {
		t.Fatal("selector replaced physical package ownership", p.Contributions, err)
	}
}
