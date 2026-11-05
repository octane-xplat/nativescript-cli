package nativescript_test

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	ns "github.com/octane-xplat/nativescript-cli"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func androidApp(t *testing.T, actual bool) (string, *ns.Client, ns.PrepareRequest) {
	t.Helper()
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1.0.0","devDependencies":{"@nativescript/android":"9.0.0"},"dependencies":{"native-plugin":"1"}}`)
	resolutionFile(t, root, "node_modules/native-plugin/package.json", `{"name":"native-plugin","version":"1.0.0","nativescript":{"platforms":{"android":"9"}}}`)
	for name, body := range map[string]string{"Binding.java": "package example; public class Binding {}", "AndroidManifest.xml": `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-permission android:name="android.permission.CAMERA"/></manifest>`, "res/values/plugin.xml": `<resources><string name="plugin">plugin</string></resources>`, "libs/local.aar": "fixture aar", "libs/local.jar": "fixture jar", "libs/arm64-v8a/liblocal.so": "fixture so", "include.gradle": "// plugin config", "whitelist.mdg": "example:*"} {
		resolutionFile(t, root, "node_modules/native-plugin/platforms/android/"+name, body)
	}
	resolutionFile(t, root, "App_Resources/Android/src/main/AndroidManifest.xml", `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="App"/></manifest>`)
	resolutionFile(t, root, "App_Resources/Android/src/main/res/values/app.xml", `<resources><string name="app_name">App</string></resources>`)
	if actual {
		var jar bytes.Buffer
		z := zip.NewWriter(&jar)
		if e := z.Close(); e != nil {
			t.Fatal(e)
		}
		resolutionFile(t, root, "node_modules/native-plugin/platforms/android/libs/local.jar", jar.String())
		var aar bytes.Buffer
		z = zip.NewWriter(&aar)
		f, _ := z.Create("AndroidManifest.xml")
		f.Write([]byte(`<manifest package="org.example.library"/>`))
		f, _ = z.Create("classes.jar")
		f.Write(jar.Bytes())
		if e := z.Close(); e != nil {
			t.Fatal(e)
		}
		resolutionFile(t, root, "node_modules/native-plugin/platforms/android/libs/local.aar", aar.String())
	}
	runtime := filepath.Join(root, "node_modules/@nativescript/android")
	if actual {
		src := os.Getenv("P2_RUNTIME_DIR")
		if src == "" {
			t.Skip("set P2_RUNTIME_DIR to published Android 9.0.0 package")
		}
		if e := os.MkdirAll(filepath.Dir(runtime), 0700); e != nil {
			t.Fatal(e)
		}
		if e := os.Symlink(src, runtime); e != nil {
			t.Fatal(e)
		}
	} else {
		resolutionFile(t, root, "node_modules/@nativescript/android/package.json", `{"name":"@nativescript/android","version":"9.0.0"}`)
		for _, name := range []string{"build.gradle", "settings.gradle", "app/build.gradle", "gradlew", "gradle.properties", "gradle/wrapper/gradle-wrapper.jar", "build-tools/static-binding-generator.jar", "build-tools/android-metadata-generator.jar"} {
			resolutionFile(t, runtime, "framework/"+name, "// fixture __PROJECT_NAME__ $rootDir/../..")
		}
		resolutionFile(t, runtime, "framework/app/src/main/AndroidManifest.xml", `<manifest package="__PACKAGE__"/>`)
	}
	c, _ := ns.New(ns.Options{})
	return root, c, ns.PrepareRequest{ProjectDir: root, OutputDir: filepath.Join(t.TempDir(), "state with spaces"), Target: ns.Target{Platform: ns.Android, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: "android-fixture", Architecture: "arm64-v8a"}}}
}
func readAndroid(t *testing.T, root, name string) string {
	t.Helper()
	b, e := os.ReadFile(filepath.Join(root, name))
	if e != nil {
		t.Fatal(e)
	}
	return string(b)
}

func TestAndroidLegacyLibraryManifestNamespace(t *testing.T) {
	root, client, request := androidApp(t, false)
	flat := "node_modules/native-plugin/platforms/android/AndroidManifest.xml"
	nested := "node_modules/native-plugin/platforms/android/src/main/AndroidManifest.xml"
	source := `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools" package="com.example.flat"><application><activity android:name=".Activity" tools:node="merge"/></application></manifest>`
	resolutionFile(t, root, flat, source)
	ctx := context.Background()
	check := func(namespace, relative, body string) ns.PreparedProject {
		t.Helper()
		prepared, err := client.Prepare(ctx, request)
		if err != nil {
			t.Fatal(err)
		}
		manifests, err := filepath.Glob(filepath.Join(prepared.NativeDir, "contributions/*/platforms/android", relative))
		if err != nil || len(manifests) != 1 {
			t.Fatal("generated library manifest missing", manifests, err)
		}
		if got := readAndroid(t, filepath.Dir(manifests[0]), filepath.Base(manifests[0])); got != body {
			t.Fatalf("generated manifest changed: %s", got)
		}
		scripts, _ := filepath.Glob(filepath.Join(prepared.NativeDir, "contributions/*/build.gradle"))
		if len(scripts) != 1 || !strings.Contains(readAndroid(t, filepath.Dir(scripts[0]), "build.gradle"), "namespace '"+namespace+"'") {
			t.Fatal("library namespace missing", scripts)
		}
		if readAndroid(t, root, flat) != source {
			t.Fatal("caller source manifest changed")
		}
		return prepared
	}
	first := check("com.example.flat", "AndroidManifest.xml", strings.Replace(source, ` package="com.example.flat"`, "", 1))
	nestedBody := `<manifest package="com.example.nested"><application/></manifest>`
	resolutionFile(t, root, nested, nestedBody)
	second := check("com.example.nested", "src/main/AndroidManifest.xml", `<manifest><application/></manifest>`)
	if first.Identity.Revision == second.Identity.Revision || readAndroid(t, root, nested) != nestedBody {
		t.Fatal("manifest addition did not invalidate or changed caller source")
	}
	resolutionFile(t, root, nested, `<manifest package="broken..namespace"/>`)
	if _, err := client.Prepare(ctx, request); !errors.Is(err, ns.ErrInvalidInput) {
		t.Fatal("invalid library namespace accepted", err)
	}
	if _, err := os.Stat(second.NativeDir); err != nil {
		t.Fatal("failed preparation destroyed the previous generation", err)
	}
	if err := os.Remove(filepath.Join(root, nested)); err != nil {
		t.Fatal(err)
	}
	check("com.example.flat", "AndroidManifest.xml", strings.Replace(source, ` package="com.example.flat"`, "", 1))
}

func TestAndroidAppGoogleServicesConfiguration(t *testing.T) {
	root, client, request := androidApp(t, false)
	file := "App_Resources/Android/google-services.json"
	firstBody := "{\"project_info\":{\"project_id\":\"component-fixture\"}}\n"
	resolutionFile(t, root, file, firstBody)
	ctx := context.Background()
	first, err := client.Prepare(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"resources/Android/google-services.json", "app/google-services.json"} {
		if readAndroid(t, first.NativeDir, name) != firstBody {
			t.Fatal("Google services configuration bytes changed")
		}
	}
	secondBody := "{\"project_info\":{\"project_id\":\"changed-component-fixture\"}}\n"
	resolutionFile(t, root, file, secondBody)
	second, err := client.Prepare(ctx, request)
	if err != nil || second.Identity.Revision == first.Identity.Revision {
		t.Fatal("Google services input did not invalidate preparation", err)
	}
	if readAndroid(t, second.NativeDir, "app/google-services.json") != secondBody {
		t.Fatal("Google services update missing from app module")
	}
	if err := os.Remove(filepath.Join(root, file)); err != nil {
		t.Fatal(err)
	}
	removed, err := client.Prepare(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"resources/Android/google-services.json", "app/google-services.json"} {
		if _, err := os.Stat(filepath.Join(removed.NativeDir, name)); !errors.Is(err, os.ErrNotExist) {
			t.Fatal("removed app configuration survived preparation", err)
		}
	}
	for _, unsupported := range []string{"node_modules/native-plugin/platforms/android/google-services.json", "App_Resources/Android/unknown.json"} {
		resolutionFile(t, root, unsupported, firstBody)
		if _, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root}); !errors.Is(err, ns.ErrUnavailable) {
			t.Fatal("unsupported configuration ownership/type accepted", err)
		}
		if err := os.Remove(filepath.Join(root, unsupported)); err != nil {
			t.Fatal(err)
		}
	}
}

func TestAndroidPluginUsageDoesNotActivateFiltering(t *testing.T) {
	root, client, request := androidApp(t, false)
	if err := os.Remove(filepath.Join(root, "node_modules/native-plugin/platforms/android/whitelist.mdg")); err != nil {
		t.Fatal(err)
	}
	usage := "node_modules/native-plugin/platforms/android/native-api-usage.json"
	resolutionFile(t, root, usage, `{"uses":["example.used:*"],"blacklist":["example.hidden:*"]}`)
	prepared, err := client.Prepare(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"whitelist.mdg", "blacklist.mdg"} {
		if _, err := os.Stat(filepath.Join(prepared.NativeDir, name)); !errors.Is(err, os.ErrNotExist) {
			t.Fatal("plugin hint activated metadata filtering", err)
		}
	}
	if err := filepath.WalkDir(prepared.NativeDir, func(path string, entry os.DirEntry, err error) error {
		if err == nil && entry.Name() == "native-api-usage.json" {
			t.Fatal("plugin hint was copied as an instruction or app resource")
		}
		return err
	}); err != nil {
		t.Fatal(err)
	}
	resolutionFile(t, root, usage, `{"uses":["example.changed:*"]}`)
	changed, err := client.Prepare(context.Background(), request)
	if err != nil || changed.Identity.Revision == prepared.Identity.Revision {
		t.Fatal("native preparation did not invalidate on hint changes", err)
	}
}

func TestAndroidLibraryDependencyGraph(t *testing.T) {
	root, client, request := androidApp(t, false)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","devDependencies":{"@nativescript/android":"9.0.0"},"dependencies":{"native-plugin":"1","native-helper":"1","unrelated":"1"}}`)
	pluginManifest := "node_modules/native-plugin/package.json"
	resolutionFile(t, root, pluginManifest, `{"name":"native-plugin","version":"1","nativescript":{"platforms":{"android":"9"}},"dependencies":{"wrapper":"1"}}`)
	resolutionFile(t, root, "node_modules/wrapper/package.json", `{"name":"wrapper","version":"1","dependencies":{"native-helper":"1"}}`)
	for _, name := range []string{"native-helper", "unrelated"} {
		resolutionFile(t, root, "node_modules/"+name+"/package.json", `{"name":"`+name+`","version":"1","nativescript":{"platforms":{"android":"9"}}}`)
		resolutionFile(t, root, "node_modules/"+name+"/platforms/android/"+name+".java", "// component source fixture")
		resolutionFile(t, root, "node_modules/"+name+"/platforms/android/libs/"+name+".aar", "component binary fixture")
	}
	moduleFor := func(prepared ns.PreparedProject, file string) string {
		t.Helper()
		matches, _ := filepath.Glob(filepath.Join(prepared.NativeDir, "contributions/*/platforms/android", file))
		if len(matches) != 1 {
			t.Fatal("source owner missing", file, matches)
		}
		return filepath.Dir(filepath.Dir(filepath.Dir(matches[0])))
	}
	prepared, err := client.Prepare(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	plugin := moduleFor(prepared, "Binding.java")
	helper := filepath.Base(moduleFor(prepared, "native-helper.java"))
	unrelated := filepath.Base(moduleFor(prepared, "unrelated.java"))
	script := readAndroid(t, plugin, "build.gradle")
	for _, expected := range []string{"compileOnly project(':native" + helper + "')", "contributions/" + helper + "/platforms/android/libs/native-helper.aar", "apply from: file('platforms/android/include.gradle')"} {
		if !strings.Contains(script, expected) {
			t.Fatal("library compile input missing", expected, script)
		}
	}
	if strings.Contains(script, unrelated) || strings.Contains(script, root) {
		t.Fatal("unrelated dependency or caller path leaked into library build", script)
	}
	resolutionFile(t, root, pluginManifest, `{"name":"native-plugin","version":"1","nativescript":{"platforms":{"android":"9"}}}`)
	removed, err := client.Prepare(context.Background(), request)
	if err != nil || removed.Identity.Revision == prepared.Identity.Revision {
		t.Fatal("dependency change did not regenerate", err)
	}
	if strings.Contains(readAndroid(t, moduleFor(removed, "Binding.java"), "build.gradle"), helper) {
		t.Fatal("removed library dependency retained")
	}
}

func TestAndroidPublicPrepareRegenerationRemoval(t *testing.T) {
	root, c, q := androidApp(t, false)
	p, e := c.Prepare(context.Background(), q)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(readAndroid(t, p.NativeDir, "whitelist.mdg"), "example:*") {
		t.Fatal("missing metadata filter")
	}
	deps := readAndroid(t, p.NativeDir, "dependencies.json")
	if !strings.Contains(deps, "contributions/") {
		t.Fatal(deps)
	}
	inputs := readAndroid(t, p.NativeDir, "metadata-inputs.json")
	for _, name := range []string{"Binding.java", "local.aar", "local.jar", "plugin.xml", "liblocal.so", "include.gradle"} {
		if !strings.Contains(inputs, name) {
			t.Fatal("missing metadata input", name)
		}
	}
	if strings.Contains(readAndroid(t, p.NativeDir, "app/src/main/AndroidManifest.xml"), "CAMERA") {
		t.Fatal("preparer merged library manifest")
	}
	if !strings.Contains(readAndroid(t, p.NativeDir, "settings.gradle"), "include ':native") {
		t.Fatal("missing Gradle module")
	}
	before := map[string]string{}
	filepath.WalkDir(p.NativeDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			t.Fatal(err)
		}
		if !d.IsDir() {
			rel, _ := filepath.Rel(p.NativeDir, path)
			before[rel] = readAndroid(t, p.NativeDir, rel)
		}
		return nil
	})
	var wg sync.WaitGroup
	for range 3 {
		wg.Go(func() {
			if _, e := c.Prepare(context.Background(), q); e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	p2, e := c.Prepare(context.Background(), q)
	if e != nil {
		t.Fatal(e)
	}
	for name, b := range before {
		if readAndroid(t, p2.NativeDir, name) != b {
			t.Fatal("non deterministic", name)
		}
	}
	// Native sources remain untouched, and removal publishes a clean new tree.
	if e = os.RemoveAll(filepath.Join(root, "node_modules/native-plugin/platforms/android")); e != nil {
		t.Fatal(e)
	}
	p3, e := c.Prepare(context.Background(), q)
	if e != nil {
		t.Fatal(e)
	}
	if p3.Identity.Revision == p.Identity.Revision {
		t.Fatal("stale identity")
	}
	if _, e := os.Stat(filepath.Join(p3.NativeDir, "whitelist.mdg")); !errors.Is(e, os.ErrNotExist) {
		t.Fatal("stale metadata filter", e)
	}
	if readAndroid(t, p3.NativeDir, "dependencies.json") != "[]" {
		t.Fatal("stale dependencies")
	}
	if strings.Contains(readAndroid(t, p3.NativeDir, "settings.gradle"), "include ':native") {
		t.Fatal("stale module")
	}
	if _, e = os.Stat(filepath.Join(p.NativeDir, "metadata-inputs.json")); e != nil {
		t.Fatal("previous generation destroyed", e)
	}
}
func TestAndroidFailureAndCancellationPreserveState(t *testing.T) {
	root, c, q := androidApp(t, false)
	p, e := c.Prepare(context.Background(), q)
	if e != nil {
		t.Fatal(e)
	}
	resolutionFile(t, root, "node_modules/native-plugin/platforms/android/unsupported.cpp", "// requires explicit build configuration")
	if _, e = c.Prepare(context.Background(), q); !errors.Is(e, ns.ErrUnavailable) {
		t.Fatal(e)
	}
	if !strings.Contains(readAndroid(t, p.NativeDir, "metadata-inputs.json"), "Binding.java") {
		t.Fatal("previous state damaged")
	}
	os.Remove(filepath.Join(root, "node_modules/native-plugin/platforms/android/unsupported.cpp"))
	if _, e = c.Prepare(context.Background(), q); e != nil {
		t.Fatal("failed lease retirement", e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e = c.Prepare(ctx, q); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	os.Remove(filepath.Join(root, "node_modules/@nativescript/android/framework/gradlew"))
	if _, e = c.Prepare(context.Background(), q); !errors.Is(e, ns.ErrUnavailable) {
		t.Fatal(e)
	}
}
func TestAndroidPrepareActualPublishedRuntime(t *testing.T) {
	_, c, q := androidApp(t, true)
	p, e := c.Prepare(context.Background(), q)
	if e != nil {
		t.Fatal(e)
	}
	for _, name := range []string{"gradlew", "gradle/wrapper/gradle-wrapper.jar", "app/libs/runtime-libs/nativescript-regular.aar", "build-tools/static-binding-generator.jar", "build-tools/android-metadata-generator.jar", "app/src/main/java/com/tns/RuntimeHelper.java"} {
		if _, e = os.Stat(filepath.Join(p.NativeDir, name)); e != nil {
			t.Fatal(e)
		}
	}
	if strings.Contains(readAndroid(t, p.NativeDir, "build.gradle"), "$rootDir/../..") {
		t.Fatal("upstream layout assumption")
	}
	if os.Getenv("P2_GRADLE_CONFIG") == "1" {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		cmd := exec.CommandContext(ctx, filepath.Join(p.NativeDir, "gradlew"), "help", "--no-daemon", "--console=plain")
		cmd.Dir = p.NativeDir
		out, e := cmd.CombinedOutput()
		t.Log(string(out))
		if e != nil {
			t.Fatal(e)
		}
	}
	t.Log("Published runtime templates/tools/AARs + real R1/F2/public Prepare; no Gradle compile or device assertion")
}

// A real failing dependency child must not publish a replacement generation or
// proceed to OTA; this also verifies that the public option reaches P2.
func TestAndroidOTADependencyFailurePreservesGeneration(t *testing.T) {
	if os.PathSeparator == '\\' {
		t.Skip("Unix wrapper fixture")
	}
	root, c, q := androidApp(t, false)
	before, e := c.Prepare(context.Background(), q)
	if e != nil {
		t.Fatal(e)
	}
	wrapper := filepath.Join(root, "node_modules/@nativescript/android/framework/gradlew")
	if e = os.WriteFile(wrapper, []byte("#!/bin/sh\nexit 17\n"), 0700); e != nil {
		t.Fatal(e)
	}
	ota, e := ns.New(ns.Options{OTAStartup: true})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = ota.Prepare(context.Background(), q); !errors.Is(e, ns.ErrBuild) {
		t.Fatalf("dependency failure: %v", e)
	}
	if _, e = os.Stat(filepath.Join(before.NativeDir, "dependencies.json")); e != nil {
		t.Fatal("previous generation lost", e)
	}
	if _, e = c.Prepare(context.Background(), q); e != nil {
		t.Fatal("lease not released", e)
	}
}

func TestAndroidRuntimeMinimumMatrix(t *testing.T) {
	for _, tc := range []struct {
		version, minimum string
		supported        bool
	}{
		{"9.0.0", "9", true}, {"9.0.0", "9.1.0", false}, {"9.1.1", "9.1.0", true},
		{"9.1.1", "9.1.2", false}, {"9.1.0", "9.1.0", false}, {"9.2.0", "9", false},
	} {
		t.Run(tc.version+"_"+tc.minimum, func(t *testing.T) {
			root, c, q := androidApp(t, false)
			resolutionFile(t, root, "node_modules/@nativescript/android/package.json", `{"name":"@nativescript/android","version":"`+tc.version+`"}`)
			resolutionFile(t, root, "node_modules/native-plugin/package.json", `{"name":"native-plugin","version":"1.0.0","nativescript":{"platforms":{"android":"`+tc.minimum+`"}}}`)
			_, e := c.Prepare(context.Background(), q)
			if (e == nil) != tc.supported {
				t.Fatalf("%+v: %v", tc, e)
			}
		})
	}
}
