package nativescript_test

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
)

func resolutionFile(t *testing.T, root, name, content string) {
	t.Helper()
	p := filepath.Join(root, name)
	if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
}
func resolutionApp(t *testing.T) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("owned helper execution unavailable")
	}
	root := t.TempDir()
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1.0.0"}`)
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports = async env => ({id:env.R1_APP_ID || 'org.example.app',appPath:'app',appResourcesPath:'App_Resources',android:{v8Flags:'--expose_gc',markingMode:'none'}})`)
	for _, d := range []string{"app", "App_Resources"} {
		if err := os.Mkdir(filepath.Join(root, d), 0700); err != nil {
			t.Fatal(err)
		}
	}
	return root
}
func TestResolveInstalledGraphAndProvenance(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1.0.0","dependencies":{"plain":"1","@scope/link":"workspace:*","dual":"1"}}`)
	resolutionFile(t, root, "node_modules/plain/package.json", `{"name":"plain","version":"1","dependencies":{"dual":"2"},"peerDependencies":{"@scope/link":"1"}}`)
	resolutionFile(t, root, "node_modules/dual/package.json", `{"name":"dual","version":"1","nativescript":{"platforms":{"ios":"8"}}}`)
	resolutionFile(t, root, "node_modules/dual/platforms/ios/One.swift", "class One {}")
	resolutionFile(t, root, "node_modules/plain/node_modules/dual/package.json", `{"name":"dual","version":"2","nativescript":{"platforms":{"android":"8"}}}`)
	resolutionFile(t, root, "node_modules/plain/node_modules/dual/platforms/android/include.gradle", "dependencies {}")
	workspace := t.TempDir()
	resolutionFile(t, workspace, "package.json", `{"name":"@scope/link","version":"3","nativescript":{"platforms":{"ios":"8","android":"8"}}}`)
	resolutionFile(t, workspace, "platforms/ios/Podfile", "pod 'Fixture'")
	resolutionFile(t, workspace, "platforms/ios/Package.swift", "// swift-tools-version: 5.9")
	resolutionFile(t, workspace, "platforms/android/libs/local.aar", "fixture only")
	resolutionFile(t, workspace, "nativescript.config.mjs", `export default async () => ({android:{markingMode:'none'}})`)
	if err := os.MkdirAll(filepath.Join(root, "node_modules/@scope"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(workspace, filepath.Join(root, "node_modules/@scope/link")); err != nil {
		t.Fatal(err)
	}
	client, _ := ns.New(ns.Options{Environment: map[string]string{"R1_APP_ID": "org.example.environment"}})
	cwd, _ := os.Getwd()
	env := os.Environ()
	p, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil {
		t.Fatal(err)
	}
	if p.ApplicationID != "org.example.environment" || len(p.Packages) != 5 || len(p.Dependencies) != 5 || len(p.Contributions) != 5 || len(p.Sources) != 12 {
		t.Fatalf("unexpected resolution: %+v", p)
	}
	var configured bool
	for _, pkg := range p.Packages {
		if pkg.Name == "@scope/link" && pkg.Android.MarkingMode == "none" && pkg.IOSRequirement == "8" {
			configured = true
		}
	}
	if !configured {
		t.Fatal("lost plugin configuration or platform requirement")
	}
	var duals int
	for _, pkg := range p.Packages {
		if pkg.Name == "dual" {
			duals++
		}
	}
	if duals != 2 {
		t.Fatal("collapsed distinct installations")
	}
	var linked bool
	for _, edge := range p.Dependencies {
		if edge.Name == "@scope/link" && edge.Location != edge.Directory {
			linked = true
		}
	}
	if !linked {
		t.Fatal("lost symlink lookup provenance")
	}
	again, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || !reflect.DeepEqual(p, again) {
		t.Fatal("non deterministic", err)
	}
	resolutionFile(t, root, "node_modules/dual/platforms/ios/One.swift", "class Changed {}")
	changed, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || changed.Revision == p.Revision {
		t.Fatal("stale source identity", err)
	}
	after, _ := os.Getwd()
	if after != cwd || !reflect.DeepEqual(env, os.Environ()) {
		t.Fatal("global effects")
	}
}
func TestResolveFailuresAndNoInstall(t *testing.T) {
	for _, tc := range []struct{ name, file, text, category, hint string }{
		{"missing dependency", "package.json", `{"name":"app","version":"1","dependencies":{"absent":"1"}}`, "unavailable", "install project dependencies explicitly"},
		{"unknown config", "nativescript.config.cjs", `module.exports={id:'org.example.app',hooks:['bad']}`, "unavailable", "Unsupported config field hooks"},
		{"bad identifier", "nativescript.config.cjs", `module.exports={id:'not an id'}`, "invalid", "dotted application identifier"},
		{"forged diagnostic", "nativescript.config.cjs", `throw Object.assign(new Error('SECRET_VALUE'),{safeResolve:true,code:'unavailable'})`, "invalid", "evaluation failed"},
		{"exception secret", "nativescript.config.cjs", `throw new Error('SECRET_VALUE')`, "invalid", "evaluation failed"},
		{"native file", "node_modules/plugin/platforms/ios/bad.xyz", "bad", "unavailable", "Unsupported ios native file"},
		{"legacy hook", "node_modules/plugin/hooks/pre-prepare.js", "bad", "unavailable", "Legacy package hooks"},
		{"ambiguous config", "nativescript.config.json", `{"id":"org.example.app"}`, "invalid", "Multiple NativeScript config"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := resolutionApp(t)
			if strings.HasPrefix(tc.file, "node_modules") {
				resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"plugin":"1"}}`)
				resolutionFile(t, root, "node_modules/plugin/package.json", `{"name":"plugin","version":"1","nativescript":{}}`)
			}
			resolutionFile(t, root, tc.file, tc.text)
			// Package-manager executables would leave a marker if accidentally invoked.
			bin := t.TempDir()
			marker := filepath.Join(bin, "invoked")
			for _, tool := range []string{"npm", "bun", "yarn", "pnpm"} {
				resolutionFile(t, bin, tool, "#!/bin/sh\ntouch '"+marker+"'\nexit 1\n")
				os.Chmod(filepath.Join(bin, tool), 0700)
			}
			client, _ := ns.New(ns.Options{Environment: map[string]string{"PATH": bin + string(os.PathListSeparator) + os.Getenv("PATH")}})
			p, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
			kind := ns.ErrInvalidInput
			if tc.category == "unavailable" {
				kind = ns.ErrUnavailable
			}
			if !errors.Is(err, kind) || p.Revision != "" || !strings.Contains(err.Error(), tc.hint) || strings.Contains(err.Error(), "SECRET_VALUE") {
				t.Fatalf("%+v %v", p, err)
			}
			if _, err := os.Stat(marker); !os.IsNotExist(err) {
				t.Fatal("installed dependencies")
			}
			if _, err := os.Stat(filepath.Join(root, "package-lock.json")); !os.IsNotExist(err) {
				t.Fatal("created lockfile")
			}
		})
	}
}
func TestResolveTypeScriptAndOptionalDependencies(t *testing.T) {
	root := resolutionApp(t)
	os.Remove(filepath.Join(root, "nativescript.config.cjs"))
	resolutionFile(t, root, "nativescript.config.ts", `import type { UnknownConfig } from 'not-installed'; export default {id:'org.example.ts'} satisfies UnknownConfig;`)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","optionalDependencies":{"missing":"1"}}`)
	c, _ := ns.New(ns.Options{})
	p, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if errors.Is(err, ns.ErrUnavailable) && strings.Contains(err.Error(), "stripTypeScriptTypes") {
		t.Skip("older Node: explicit unavailable verified")
	}
	if err != nil || p.ApplicationID != "org.example.ts" {
		t.Fatal(p, err)
	}
}

func TestResolveTypeScriptJavaScriptProducerPair(t *testing.T) {
	root := resolutionApp(t)
	if err := os.Remove(filepath.Join(root, "nativescript.config.cjs")); err != nil {
		t.Fatal(err)
	}
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"native-plugin":"1"}}`)
	resolutionFile(t, root, "nativescript.config.ts", `export default {id:'org.example.authored'};`)
	resolutionFile(t, root, "nativescript.config.js", `throw new Error('INACTIVE_APP_COMPANION');`)
	plugin := "node_modules/native-plugin/"
	resolutionFile(t, root, plugin+"package.json", `{"name":"native-plugin","version":"1","nativescript":{"platforms":{"android":"9"}}}`)
	// CommonJS-form TS exercises selection without requiring a compiler install.
	// The real ESM/type-import producer pair is qualified with the installed compiler below.
	resolutionFile(t, root, plugin+"nativescript.config.ts", `module.exports={android:{v8Flags:'--selected-authored'}};`)
	resolutionFile(t, root, plugin+"nativescript.config.js", `throw new Error('INACTIVE_PLUGIN_COMPANION');`)
	client, _ := ns.New(ns.Options{})
	ctx := context.Background()
	first, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if errors.Is(err, ns.ErrUnavailable) && strings.Contains(err.Error(), "stripTypeScriptTypes") {
		t.Skip("older Node: explicit unavailable verified")
	}
	if err != nil || first.ApplicationID != "org.example.authored" {
		t.Fatal(first, err)
	}
	selected := false
	for _, pkg := range first.Packages {
		if pkg.Name == "native-plugin" {
			selected = pkg.Android.V8Flags == "--selected-authored"
		}
	}
	if !selected {
		t.Fatal("plugin TypeScript config was not selected")
	}
	resolutionFile(t, root, plugin+"nativescript.config.ts", `export default {android:{v8Flags:'--selected-authored'}};`)
	if _, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root}); err != nil && (!errors.Is(err, ns.ErrUnavailable) || !strings.Contains(err.Error(), "project-installed TypeScript compiler")) {
		t.Fatal("Node plugin type-stripping limitation lost compiler advice", err)
	}
	resolutionFile(t, root, plugin+"nativescript.config.ts", `module.exports={android:{v8Flags:'--selected-authored'}};`)
	for _, name := range []string{"nativescript.config.ts", "nativescript.config.js", plugin + "nativescript.config.ts", plugin + "nativescript.config.js"} {
		canonical, err := filepath.EvalSymlinks(filepath.Join(root, name))
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, source := range first.Sources {
			found = found || source.Path == canonical && source.Digest != ""
		}
		if !found {
			t.Fatal("producer config source identity missing", name)
		}
	}
	resolutionFile(t, root, plugin+"nativescript.config.js", `throw new Error('CHANGED_INACTIVE_COMPANION');`)
	changed, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if err != nil || changed.Revision == first.Revision {
		t.Fatal("companion edit was executed or lost its identity", err)
	}
	resolutionFile(t, root, plugin+"nativescript.config.ts", `throw new Error('AUTHORED_FAILURE');`)
	resolutionFile(t, root, plugin+"nativescript.config.js", `module.exports={android:{v8Flags:'--fallback'}};`)
	if _, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrInvalidInput) || strings.Contains(err.Error(), "AUTHORED_FAILURE") {
		t.Fatal("failed authored config fell back or leaked diagnostics", err)
	}
	if err := os.Remove(filepath.Join(root, plugin, "nativescript.config.ts")); err != nil {
		t.Fatal(err)
	}
	fallback, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if err != nil {
		t.Fatal(err)
	}
	for _, pkg := range fallback.Packages {
		if pkg.Name == "native-plugin" && pkg.Android.V8Flags != "--fallback" {
			t.Fatal("JS-only config was not selected")
		}
	}
	resolutionFile(t, root, "nativescript.config.mjs", `export default {id:'org.example.ambiguous'};`)
	if _, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrInvalidInput) {
		t.Fatal("unrecognized config coexistence accepted", err)
	}
}

func TestResolveViteConfiguration(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.example.viteconfig',cli:{packageManager:'bun'},bundler:'vite',bundlerConfigPath:'vite.config.mts'}`)
	// Resolve records the file without evaluating trusted Vite/plugin code.
	resolutionFile(t, root, "vite.config.mts", `throw new Error('CONFIG_WAS_EXECUTED'); export default {};`)
	c, _ := ns.New(ns.Options{})
	p, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || p.Config.PackageManager != "bun" || p.Config.BundlerConfigPath == "" {
		t.Fatal(p, err)
	}
	var found bool
	for _, source := range p.Sources {
		if source.Path == p.Config.BundlerConfigPath {
			found = true
		}
	}
	if !found {
		t.Fatal("Vite config missing from source identity")
	}
	resolutionFile(t, root, "vite.config.mts", `export default {};`)
	changed, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || changed.Revision == p.Revision {
		t.Fatal("stale Vite configuration identity", err)
	}
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.example.viteconfig',bundler:'vite'}`)
	p, err = c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || p.Config.BundlerConfigPath != changed.Config.BundlerConfigPath {
		t.Fatal("default Vite config selection", p, err)
	}
	for _, tc := range []struct {
		config string
		kind   error
	}{
		{`{bundler:'webpack'}`, ns.ErrUnavailable},
		{`{bundlerConfigPath:'missing.mts'}`, ns.ErrInvalidInput},
		{`{bundlerConfigPath:''}`, ns.ErrInvalidInput},
		{`{cli:{packageManager:'arbitrary-command'}}`, ns.ErrInvalidInput},
		{`{cli:{other:true}}`, ns.ErrUnavailable},
	} {
		resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.example.viteconfig',...`+tc.config+`}`)
		if _, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, tc.kind) {
			t.Fatal(tc.config, err)
		}
	}
}

func TestResolveNativeAuxiliaryInputs(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1.0.0","dependencies":{"native-package":"1"}}`)
	resolutionFile(t, root, "node_modules/native-package/package.json", `{"name":"native-package","version":"1","nativescript":{"platforms":{"ios":"9.1","windows":"9.1.0"}}}`)
	for name, text := range map[string]string{
		"include/module.modulemap": `module Auxiliary { header "Health.h" export * }`,
		"include/Health.h":         "void AuxiliaryHealth(void);",
		"Producer.LICENSE":         "producer license bytes",
		"NOTICE.txt":               "producer notice bytes",
		"Package.resolved":         `{"version":3,"pins":[]}`,
	} {
		resolutionFile(t, root, "node_modules/native-package/platforms/ios/"+name, text)
	}
	c, _ := ns.New(ns.Options{})
	p, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Contributions) != 2 {
		t.Fatalf("auxiliary files became native inputs: %+v", p.Contributions)
	}
	var modulemap bool
	for _, contribution := range p.Contributions {
		if strings.HasSuffix(contribution.Path, "module.modulemap") && contribution.Kind == "configuration" {
			modulemap = true
		}
	}
	if !modulemap {
		t.Fatal("plugin module map missing")
	}
	var windows bool
	for _, pkg := range p.Packages {
		if pkg.Name == "native-package" && pkg.WindowsRequirement == "9.1.0" {
			windows = true
		}
	}
	if !windows {
		t.Fatal("lost foreign platform declaration")
	}
	for _, name := range []string{"Producer.LICENSE", "NOTICE.txt", "Package.resolved"} {
		var found bool
		for _, source := range p.Sources {
			if strings.HasSuffix(source.Path, "/"+name) {
				found = true
			}
		}
		if !found {
			t.Fatal("lost packaged metadata identity", name)
		}
		resolutionFile(t, root, "node_modules/native-package/platforms/ios/"+name, "changed producer input")
		next, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
		if err != nil || next.Revision == p.Revision {
			t.Fatal("stale auxiliary identity", name, err)
		}
		p = next
	}
}

func TestResolveMasonProvenanceBoundary(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"@octane-xplat/nativescript-mason-core":"1.0.0-beta.5"}}`)
	plugin := "node_modules/@octane-xplat/nativescript-mason-core/"
	resolutionFile(t, root, plugin+"package.json", `{"name":"@octane-xplat/nativescript-mason-core","version":"1.0.0-beta.5","nativescript":{"platforms":{"ios":"9.1","android":"9.1"}}}`)
	const metadata = `{"platform":"Android","abi":"arm64-v8a"}`
	digest := sha256.Sum256([]byte(metadata))
	inventory, _ := json.Marshal([]map[string]string{{"name": "platforms/android/manifest.json", "sha256": fmt.Sprintf("%x", digest)}})
	resolutionFile(t, root, plugin+"artifact-inventory.json", string(inventory))
	resolutionFile(t, root, plugin+"platforms/android/manifest.json", metadata)
	resolutionFile(t, root, plugin+"platforms/android/Core.aar", "library fixture")
	c, _ := ns.New(ns.Options{})
	p, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || len(p.Contributions) != 1 || p.Contributions[0].Kind != "library" {
		t.Fatal(p, err)
	}
	for _, tc := range []struct {
		name, text string
		kind       error
	}{
		{"platforms/android/manifest.json", `{"platform":"modified"}`, ns.ErrInvalidInput},
		{"package.json", `{"name":"@octane-xplat/nativescript-mason-core","version":"unqualified","nativescript":{}}`, ns.ErrUnavailable},
	} {
		resolutionFile(t, root, plugin+"platforms/android/manifest.json", metadata)
		resolutionFile(t, root, plugin+tc.name, tc.text)
		if _, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, tc.kind) {
			t.Fatal(tc.name, err)
		}
	}
}

func TestResolveInactiveVisionOSDeclaration(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"font-plugin":"1"}}`)
	resolutionFile(t, root, "node_modules/font-plugin/package.json", `{"name":"font-plugin","version":"1","nativescript":{"platforms":{"ios":"9.1","windows":"9.1"}}}`)
	const url = "https://github.com/example/fonts.git"
	resolutionFile(t, root, "node_modules/font-plugin/nativescript.config.cjs", `module.exports={ios:{SPMPackages:[{name:'Font',libs:['Font'],repositoryURL:'`+url+`',version:'1.0.20'}]},visionos:{discardUncaughtJsExceptions:false,SPMPackages:[{name:'Font',libs:['VisionFont'],repositoryURL:'`+url+`',version:'1.0.12'}]}}`)
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.example.app',visionos:{discardUncaughtJsExceptions:true,SPMPackages:[{name:'Font',libs:['AppVisionFont'],repositoryURL:'`+url+`',version:'2.0.0'}]}}`)
	c, _ := ns.New(ns.Options{})
	p, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Contributions) != 1 || p.Contributions[0].Platform != "ios" || p.Contributions[0].SPM.Version != "1.0.20" || !reflect.DeepEqual(p.Contributions[0].SPM.Products, []string{"Font"}) {
		t.Fatal("inactive platform changed iOS dependency graph", p.Contributions)
	}
	if p.Config.VisionOS == nil || p.Config.VisionOS.DiscardUncaughtJSExceptions == nil || !*p.Config.VisionOS.DiscardUncaughtJSExceptions || p.Config.VisionOS.SPMPackages[0].Version != "2.0.0" {
		t.Fatal("lost app declaration", p.Config)
	}
	var found bool
	for _, pkg := range p.Packages {
		if pkg.Name == "font-plugin" {
			v := pkg.VisionOS
			if v == nil || v.DiscardUncaughtJSExceptions == nil || *v.DiscardUncaughtJSExceptions || v.SPMPackages[0].Version != "1.0.12" || !reflect.DeepEqual(v.SPMPackages[0].Products, []string{"VisionFont"}) {
				t.Fatal("lost plugin declaration", pkg)
			}
			found = true
		}
	}
	if !found {
		t.Fatal("missing plugin")
	}
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.example.app',visionos:{discardUncaughtJsExceptions:'SECRET_VALUE'}}`)
	if _, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrInvalidInput) || strings.Contains(err.Error(), "SECRET_VALUE") {
		t.Fatal("invalid inactive declaration accepted or leaked", err)
	}
}

func TestResolveInactiveTVOSDeclaration(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"native-plugin":"1"}}`)
	resolutionFile(t, root, "node_modules/native-plugin/package.json", `{"name":"native-plugin","version":"1","nativescript":{"platforms":{"ios":"9.1"}}}`)
	resolutionFile(t, root, "node_modules/native-plugin/nativescript.config.cjs", `module.exports={ios:{SPMPackages:[{name:'Library',repositoryURL:'https://example.com/library.git',version:'1.0.0',libs:['IOSLibrary']}]},tvos:{discardUncaughtJsExceptions:false,SPMPackages:[{name:'Library',repositoryURL:'https://example.com/library.git',version:'2.0.0',libs:['TVLibrary']}]}}`)
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.example.app',tvos:{discardUncaughtJsExceptions:true,SPMPackages:[{name:'LocalTV',path:'missing-tvos-only',libs:['AppTVLibrary']}]}}`)
	client, _ := ns.New(ns.Options{})
	ctx := context.Background()
	resolved, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if err != nil {
		t.Fatal(err)
	}
	if len(resolved.Contributions) != 1 || resolved.Contributions[0].SPM.Version != "1.0.0" || !reflect.DeepEqual(resolved.Contributions[0].SPM.Products, []string{"IOSLibrary"}) {
		t.Fatal("inactive tvOS changed active iOS inputs", resolved.Contributions)
	}
	app := resolved.Config.TVOS
	if app == nil || app.DiscardUncaughtJSExceptions == nil || !*app.DiscardUncaughtJSExceptions || app.SPMPackages[0].Path != "missing-tvos-only" || resolved.Config.VisionOS != nil {
		t.Fatal("app declaration lost or mixed with visionOS", resolved.Config)
	}
	found := false
	for _, pkg := range resolved.Packages {
		if pkg.Name == "native-plugin" {
			found = pkg.TVOS != nil && pkg.TVOS.DiscardUncaughtJSExceptions != nil && !*pkg.TVOS.DiscardUncaughtJSExceptions && pkg.TVOS.SPMPackages[0].Version == "2.0.0" && reflect.DeepEqual(pkg.TVOS.SPMPackages[0].Products, []string{"TVLibrary"})
		}
	}
	if !found {
		t.Fatal("plugin tvOS declaration lost")
	}
	if _, err := client.Devices(ctx, ns.DeviceQuery{Platform: ns.Platform("tvos")}); !errors.Is(err, ns.ErrInvalidInput) {
		t.Fatal("declaration metadata enabled a backend", err)
	}
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.example.app',tvos:{discardUncaughtJsExceptions:'PRIVATE_MARKER'}}`)
	if _, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrInvalidInput) || strings.Contains(err.Error(), "PRIVATE_MARKER") {
		t.Fatal("invalid inactive declaration accepted or leaked", err)
	}
}

func TestResolveInstalledTypeScriptCompiler(t *testing.T) {
	compiler := os.Getenv("NS_CONFIG_COMPILER_DIR")
	if compiler == "" {
		t.Skip("requires an independently installed TypeScript compiler")
	}
	compiler, err := filepath.Abs(compiler)
	if err != nil {
		t.Fatal(err)
	}
	root := resolutionApp(t)
	if err := os.Remove(filepath.Join(root, "nativescript.config.cjs")); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "node_modules"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(compiler, filepath.Join(root, "node_modules/typescript-classic")); err != nil {
		t.Fatal(err)
	}
	// This is the import shape used by the original app. Neither the type package
	// nor its runtime is installed: the real compiler must erase the type-only use.
	resolutionFile(t, root, "nativescript.config.ts", `import { NativeScriptConfig } from '@nativescript/core'; export default {id:process.env.R1_APP_ID,android:{markingMode:'none'}} as NativeScriptConfig;`)
	resolutionFile(t, root, "nativescript.config.js", `throw new Error('INACTIVE_COMPILED_APP');`)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"native-plugin":"1"}}`)
	resolutionFile(t, root, "node_modules/native-plugin/package.json", `{"name":"native-plugin","version":"1","nativescript":{"platforms":{"android":"9"}}}`)
	resolutionFile(t, root, "node_modules/native-plugin/nativescript.config.ts", `import { NativeScriptConfig } from '@nativescript/core'; export default {android:{v8Flags:'--compiled-plugin'}} as NativeScriptConfig;`)
	resolutionFile(t, root, "node_modules/native-plugin/nativescript.config.js", `throw new Error('INACTIVE_COMPILED_PLUGIN');`)
	client, _ := ns.New(ns.Options{Environment: map[string]string{"R1_APP_ID": "org.example.compiled"}})
	p, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || p.ApplicationID != "org.example.compiled" || p.Config.Android.MarkingMode != "none" {
		t.Fatal("installed compiler config", p, err)
	}
	for _, pkg := range p.Packages {
		if pkg.Name == "native-plugin" && pkg.Android.V8Flags != "--compiled-plugin" {
			t.Fatal("installed compiler did not select the authored plugin config")
		}
	}
	// CJS emission must preserve runtime imports relative to the config file.
	resolutionFile(t, root, "local.cjs", `module.exports={id:'org.example.relative'}`)
	resolutionFile(t, root, "nativescript.config.ts", `import { NativeScriptConfig } from '@nativescript/core'; import value = require('./local.cjs'); export default value as NativeScriptConfig;`)
	p, err = client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || p.ApplicationID != "org.example.relative" {
		t.Fatal("relative config import", p, err)
	}
}

func TestResolveConfiguredNativeSources(t *testing.T) {
	root := resolutionApp(t)
	shared := t.TempDir()
	resolutionFile(t, shared, "src/Bridge.swift", "class Bridge {}")
	resolutionFile(t, shared, "src/ignored.txt", "not selected")
	relative, err := filepath.Rel(root, shared)
	if err != nil {
		t.Fatal(err)
	}
	pattern := filepath.ToSlash(relative) + "/src/**/*.swift"
	config := func(groups any) {
		t.Helper()
		data, err := json.Marshal(map[string]any{"id": "org.test.sources", "ios": map[string]any{"NativeSource": groups}})
		if err != nil {
			t.Fatal(err)
		}
		resolutionFile(t, root, "nativescript.config.cjs", "module.exports="+string(data))
	}
	config([]map[string]string{{"name": "Bridge", "path": pattern}})
	client, _ := ns.New(ns.Options{})
	resolve := func() ns.Project {
		t.Helper()
		p, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	first := resolve()
	if len(first.Contributions) != 1 || first.Contributions[0].Kind != "source" || first.Contributions[0].Platform != "ios" || filepath.Base(first.Contributions[0].Path) != "Bridge.swift" {
		t.Fatal("configured membership", first.Contributions)
	}
	resolutionFile(t, shared, "src/Bridge.swift", "class Bridge { let changed = true }")
	if resolve().Revision == first.Revision {
		t.Fatal("source bytes not in identity")
	}
	resolutionFile(t, shared, "src/Second.swift", "class Second {}")
	if len(resolve().Contributions) != 2 {
		t.Fatal("new glob member missing")
	}
	config([]map[string]string{})
	if len(resolve().Contributions) != 0 {
		t.Fatal("removed declaration retained membership")
	}
	for _, groups := range []any{"invalid", []map[string]string{{"name": "Missing", "path": "missing/**/*.swift"}}, []map[string]string{{"name": "Same", "path": pattern}, {"name": "Same", "path": pattern}}} {
		config(groups)
		if _, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrInvalidInput) {
			t.Fatal("invalid NativeSource accepted", err)
		}
	}
}

func TestConfiguredSourcesDeduplicateInstalledOwnership(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"native":"1"}}`)
	resolutionFile(t, root, "node_modules/native/package.json", `{"name":"native","version":"1","nativescript":{"platforms":{"ios":"8"}}}`)
	resolutionFile(t, root, "node_modules/native/platforms/ios/Bridge.swift", "class Bridge {}")
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.test.sources',ios:{NativeSource:[{name:'Explicit',path:'node_modules/native/platforms/ios/*.swift'}]}}`)
	client, _ := ns.New(ns.Options{})
	p, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || len(p.Contributions) != 1 || filepath.Base(p.Contributions[0].PackageDirectory) != "native" {
		t.Fatal("duplicate membership or lost package ownership", p.Contributions, err)
	}
}

func TestResolveDeclaredLocalSwiftPackages(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.example.app',ios:{NativeSource:[{name:'Overlap',path:'node_modules/a-plugin/platforms/ios/Local/Sources/Owned.swift'}]}}`)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"a-plugin":"1","b-plugin":"1"}}`)
	for _, name := range []string{"a-plugin", "b-plugin"} {
		base := "node_modules/" + name + "/"
		resolutionFile(t, root, base+"package.json", `{"name":"`+name+`","version":"1","nativescript":{"platforms":{"ios":"8"}}}`)
		resolutionFile(t, root, base+"nativescript.config.cjs", `module.exports={ios:{SPMPackages:[{name:'Shared',path:'`+base+`platforms/ios/Local',libs:['SharedLibrary']}]}}`)
		resolutionFile(t, root, base+"platforms/ios/Local/Package.swift", "// fixture package "+name)
		resolutionFile(t, root, base+"platforms/ios/Local/Sources/Owned.swift", "// owned "+name)
	}
	client, _ := ns.New(ns.Options{})
	ctx := context.Background()
	first, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Contributions) != 1 || first.Contributions[0].Kind != "spm" || first.Contributions[0].SPM == nil || !strings.Contains(first.Contributions[0].Path, "a-plugin") || first.Contributions[0].SPM.Path != "node_modules/a-plugin/platforms/ios/Local" {
		t.Fatal("first plugin declaration was not selected once", first.Contributions)
	}
	for _, name := range []string{"a-plugin", "b-plugin"} {
		found := false
		for _, source := range first.Sources {
			found = found || strings.Contains(source.Path, name+"/platforms/ios/Local/Sources/Owned.swift")
		}
		if !found {
			t.Fatal("losing or selected package source identity missing", name)
		}
	}
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.example.app',ios:{SPMPackages:[{name:'Shared',path:'node_modules/b-plugin/platforms/ios/Local',libs:['SharedLibrary']}]},visionos:{SPMPackages:[{name:'Inactive',path:'missing-vision-only',libs:['VisionLibrary']}]}}`)
	overridden, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if err != nil || len(overridden.Contributions) != 1 || !strings.Contains(overridden.Contributions[0].Path, "b-plugin") || overridden.Config.VisionOS == nil || overridden.Config.VisionOS.SPMPackages[0].Path != "missing-vision-only" || overridden.Revision == first.Revision {
		t.Fatal("app override or inactive declaration lost", overridden, err)
	}
	if overridden.Contributions[0].SPM.Name != "Shared" || overridden.Contributions[0].SPM.RepositoryURL != "" {
		t.Fatal("inactive or remote package applied to active iOS")
	}
	resolutionFile(t, root, "node_modules/a-plugin/platforms/ios/Local/Sources/Owned.swift", "// losing declaration changed")
	changed, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if err != nil || changed.Revision == overridden.Revision {
		t.Fatal("losing input mutation lost source identity", err)
	}
	resolutionFile(t, root, "node_modules/b-plugin/platforms/ios/Local/.build/compiler-cache.bin", "tool cache")
	resolutionFile(t, root, "node_modules/b-plugin/platforms/ios/Local/.swiftpm/cache.bin", "tool cache")
	withCache, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if err != nil || withCache.Revision != changed.Revision {
		t.Fatal("SwiftPM cache became an authored input", err)
	}
	for _, value := range []string{
		`{name:'Bad',path:'missing',libs:['Bad']}`,
		`{name:'Bad',path:'node_modules/a-plugin/platforms/ios/Local',repositoryURL:'https://example.com/a.git',version:'1.0.0',libs:['Bad']}`,
	} {
		resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.example.app',ios:{SPMPackages:[`+value+`]}}`)
		if _, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrInvalidInput) {
			t.Fatal("invalid local declaration accepted", err)
		}
	}
}

func TestResolveAppAndTransitiveSwiftPackages(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"plain":"1"}}`)
	resolutionFile(t, root, "node_modules/plain/package.json", `{"name":"plain","version":"1","dependencies":{"native":"1"}}`)
	resolutionFile(t, root, "node_modules/native/package.json", `{"name":"native","version":"1","nativescript":{"platforms":{"ios":"9.1.0"}}}`)
	resolutionFile(t, root, "node_modules/native/nativescript.config.cjs", `module.exports={ios:{SPMPackages:[{name:'Pulsar',repositoryURL:'https://github.com/software-mansion-labs/pulsar-ios',version:'1.4.0',libs:['Pulsar']},{name:'Aztec',repositoryURL:'https://github.com/wordpress-mobile/AztecEditor-iOS',version:'#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',libs:['Aztec']}]}}`)
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.test.remote',ios:{SPMPackages:[{name:'Pulsar',repositoryURL:'https://github.com/software-mansion-labs/pulsar-ios',version:'2.0.0',libs:['PulsarExtra']}]}}`)
	client, _ := ns.New(ns.Options{})
	p, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || len(p.Contributions) != 2 {
		t.Fatal("remote resolution", p.Contributions, err)
	}
	for _, c := range p.Contributions {
		if c.Kind != "spm-remote" || c.SPM == nil || !filepath.IsAbs(c.Path) {
			t.Fatal("remote domain result", c)
		}
		if c.SPM.Name == "Pulsar" && (c.SPM.Version != "2.0.0" || !reflect.DeepEqual(c.SPM.Products, []string{"Pulsar", "PulsarExtra"})) {
			t.Fatal("app selection lost required products", c.SPM)
		}
	}
	// Resolver is read-only: native dependency tools and workspace creation belong
	// to Prepare, not to remote declaration discovery.
	if _, err := os.Stat(filepath.Join(root, "platforms")); !os.IsNotExist(err) {
		t.Fatal("Resolve created native output", err)
	}
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.test.remote',ios:{SPMPackages:[{name:'Pulsar',repositoryURL:'https://secret@github.com/a/b',version:'1.0.0',libs:['Pulsar']}]}}`)
	if _, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrInvalidInput) || strings.Contains(err.Error(), "secret") {
		t.Fatal("unsafe repository accepted or exposed", err)
	}
}

func TestResolveCancellationAndRemoval(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports = async () => { await new Promise(() => setInterval(()=>{},100)); }`)
	c, _ := ns.New(ns.Options{})
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	p, err := c.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if !errors.Is(err, context.DeadlineExceeded) || p.Revision != "" {
		t.Fatal(p, err)
	}
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.example.app'}`)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"plugin":"1"}}`)
	resolutionFile(t, root, "node_modules/plugin/package.json", `{"name":"plugin","version":"1","exports":{},"nativescript":{}}`)
	resolutionFile(t, root, "node_modules/plugin/platforms/ios/Native.swift", "class Native {}")
	p, err = c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || len(p.Contributions) != 1 {
		t.Fatal(p, err)
	}
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1"}`)
	removed, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || len(removed.Contributions) != 0 || len(removed.Packages) != 1 || removed.Revision == p.Revision {
		t.Fatal(removed, err)
	}
}

func TestResolveLinkedAppPath(t *testing.T) {
	root := resolutionApp(t)
	link := filepath.Join(t.TempDir(), "linked app")
	if err := os.Symlink(root, link); err != nil {
		t.Fatal(err)
	}
	c, _ := ns.New(ns.Options{})
	p, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: link})
	canonical, realErr := filepath.EvalSymlinks(root)
	if err != nil || realErr != nil || p.Directory != link || p.Config.AppPath != filepath.Join(canonical, "app") {
		t.Fatal(p, err, realErr)
	}
}

func TestResolveAppResourceIdentity(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "App_Resources/iOS/Info.plist", "<plist/>")
	c, _ := ns.New(ns.Options{})
	p, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || len(p.Contributions) != 1 || p.Contributions[0].Kind != "configuration" {
		t.Fatal(p, err)
	}
	resolutionFile(t, root, "App_Resources/iOS/Info.plist", "<plist><dict/></plist>")
	changed, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || p.Revision == changed.Revision {
		t.Fatal("resource source not tracked", err)
	}
}

func TestResolvePluginNativeUsageInventory(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"usage-plugin":"1"}}`)
	plugin := "node_modules/usage-plugin"
	resolutionFile(t, root, plugin+"/package.json", `{"name":"usage-plugin","version":"1","nativescript":{"platforms":{"ios":"9","android":"9"}}}`)
	valid := `{"uses":["example.*:*"],"blacklist":["example.internal.*:*"]}`
	for _, platform := range []string{"ios", "android"} {
		resolutionFile(t, root, plugin+"/platforms/"+platform+"/native-api-usage.json", valid)
	}
	client, _ := ns.New(ns.Options{})
	ctx := context.Background()
	resolved, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if err != nil || len(resolved.Contributions) != 0 {
		t.Fatal("plugin hints became native/resource contributions", err)
	}
	for _, platform := range []string{"ios", "android"} {
		file, err := filepath.EvalSymlinks(filepath.Join(root, plugin, "platforms", platform, "native-api-usage.json"))
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, source := range resolved.Sources {
			if source.Path == file && source.Digest == fmt.Sprintf("%x", sha256.Sum256([]byte(valid))) {
				found = true
			}
		}
		if !found {
			t.Fatal("plugin hint identity missing")
		}
	}
	android := plugin + "/platforms/android/native-api-usage.json"
	resolutionFile(t, root, android, `{"uses":["example.changed.*:*"]}`)
	changed, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if err != nil || changed.Revision == resolved.Revision {
		t.Fatal("usage declaration changes did not invalidate resolution", err)
	}
	if err := os.Remove(filepath.Join(root, android)); err != nil {
		t.Fatal(err)
	}
	removed, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if err != nil || removed.Revision == changed.Revision {
		t.Fatal("usage declaration removal did not invalidate resolution", err)
	}
	// Validation also applies before package-owned Sources bypass app compilation.
	resolutionFile(t, root, plugin+"/platforms/ios/Package.swift", "// swift-tools-version:5.9")
	for _, invalid := range []string{`{"uses":"PRIVATE_USAGE_MARKER"}`, `{"uses":[null]}`, `{"blacklist":["PRIVATE_USAGE_MARKER\nother"]}`, `{"uses":[""]}`} {
		resolutionFile(t, root, plugin+"/platforms/ios/native-api-usage.json", invalid)
		_, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
		if !errors.Is(err, ns.ErrInvalidInput) || strings.Contains(err.Error(), "PRIVATE_USAGE_MARKER") {
			t.Fatal("invalid hint schema accepted or leaked", err)
		}
	}
	resolutionFile(t, root, plugin+"/platforms/ios/native-api-usage.json", `{"whitelist":["example:*"]}`)
	if _, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrUnavailable) {
		t.Fatal("app schema accepted as plugin hint", err)
	}
	resolutionFile(t, root, plugin+"/platforms/ios/native-api-usage.json", valid)
	for _, platform := range []string{"iOS", "Android"} {
		file := "App_Resources/" + platform + "/native-api-usage.json"
		resolutionFile(t, root, file, `{"whitelist-plugins-usages":true,"whitelist":["example:*"]}`)
		if _, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrUnavailable) {
			t.Fatal("unimplemented app filtering was silently accepted", err)
		}
		if err := os.Remove(filepath.Join(root, file)); err != nil {
			t.Fatal(err)
		}
	}
}

func TestResolveGestureProducerMarker(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"@nativescript-community/gesturehandler":"2.1.0"}}`)
	plugin := "node_modules/@nativescript-community/gesturehandler"
	manifest := `{"name":"@nativescript-community/gesturehandler","version":"2.1.0","nativescript":{"platforms":{"android":"9"}}}`
	resolutionFile(t, root, plugin+"/package.json", manifest)
	marker := plugin + "/platforms/android/sync"
	resolutionFile(t, root, marker, "force livesync\n")
	client, _ := ns.New(ns.Options{})
	resolved, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || len(resolved.Contributions) != 0 {
		t.Fatal("qualified inert marker became an input or instruction", err)
	}
	canonical, err := filepath.EvalSymlinks(filepath.Join(root, marker))
	if err != nil {
		t.Fatal(err)
	}
	tracked := false
	for _, source := range resolved.Sources {
		tracked = tracked || source.Path == canonical
	}
	if !tracked {
		t.Fatal("producer marker identity missing")
	}
	resolutionFile(t, root, marker, "changed marker")
	if _, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrUnavailable) {
		t.Fatal("changed producer marker accepted", err)
	}
	resolutionFile(t, root, marker, "force livesync\n")
	resolutionFile(t, root, plugin+"/package.json", strings.Replace(manifest, "2.1.0", "2.1.1", 1))
	if _, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrUnavailable) {
		t.Fatal("unqualified marker version accepted", err)
	}
}

func TestResolveRejectsLossyCanonicalConfig(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.test.ota',appPath:'app',ios:undefined}`)
	client, _ := ns.New(ns.Options{})
	if _, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrUnavailable) {
		t.Fatalf("lossy config accepted: %v", err)
	}
}
