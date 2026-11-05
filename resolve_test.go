package nativescript_test

import (
	"context"
	"errors"
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
	client, _ := ns.New(ns.Options{Environment: map[string]string{"R1_APP_ID": "org.example.compiled"}})
	p, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || p.ApplicationID != "org.example.compiled" || p.Config.Android.MarkingMode != "none" {
		t.Fatal("installed compiler config", p, err)
	}
	// CJS emission must preserve runtime imports relative to the config file.
	resolutionFile(t, root, "local.cjs", `module.exports={id:'org.example.relative'}`)
	resolutionFile(t, root, "nativescript.config.ts", `import { NativeScriptConfig } from '@nativescript/core'; import value = require('./local.cjs'); export default value as NativeScriptConfig;`)
	p, err = client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || p.ApplicationID != "org.example.relative" {
		t.Fatal("relative config import", p, err)
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

func TestResolveRejectsLossyCanonicalConfig(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "nativescript.config.cjs", `module.exports={id:'org.test.ota',appPath:'app',ios:undefined}`)
	client, _ := ns.New(ns.Options{})
	if _, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrUnavailable) {
		t.Fatalf("lossy config accepted: %v", err)
	}
}
