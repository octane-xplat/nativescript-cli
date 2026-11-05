// Package prepare materializes the installed Android runtime under F2 ownership.
package prepare

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

const supportedRuntimeVersions = "9.0.0 or 9.1.1"

type Adapter struct {
	// ResolveDependencies records the real variant graph before canonical OTA stamping.
	ResolveDependencies bool
	Environment         map[string]string
	Executor            process.Executor
}

func runtimeDir(r project.Resolved) string {
	for _, p := range r.Packages {
		if p.Name == "@nativescript/android" && project.RuntimeSupported("android", p.Version) {
			return filepath.Join(p.Directory, "framework")
		}
	}
	return ""
}
func (Adapter) Validate(r project.Resolved, t project.Target) error {
	if t.Platform != "android" {
		return workflow.ErrUnavailable
	}
	if _, err := project.AndroidSettings(r); err != nil {
		return fmt.Errorf("%s: %w", err, workflow.ErrInvalid)
	}
	dir := runtimeDir(r)
	if dir == "" {
		return fmt.Errorf("install @nativescript/android %s explicitly: %w", supportedRuntimeVersions, workflow.ErrUnavailable)
	}
	for _, name := range []string{"build.gradle", "settings.gradle", "app/build.gradle", "gradlew", "gradle/wrapper/gradle-wrapper.jar", "build-tools/static-binding-generator.jar", "build-tools/android-metadata-generator.jar"} {
		if st, e := os.Stat(filepath.Join(dir, name)); e != nil || !st.Mode().IsRegular() {
			return fmt.Errorf("Android runtime template incomplete: %w", workflow.ErrUnavailable)
		}
	}
	var installed string
	for _, p := range r.Packages {
		if p.Name == "@nativescript/android" {
			installed = p.Version
		}
	}
	for _, p := range r.Packages {
		if p.AndroidRequirement != "" && !project.RuntimeSatisfies(installed, p.AndroidRequirement) {
			return workflow.ErrUnavailable
		}
	}

	return nil
}

// Prepare resolves cached Gradle dependencies only for OTA-enabled callers.
// Failed staging leaves the previously published generation intact.
func (a Adapter) Prepare(ctx context.Context, r project.Resolved, l workspace.Lease) (project.Prepared, error) {
	if err := ctx.Err(); err != nil {
		return project.Prepared{}, err
	}
	if l == nil {
		return project.Prepared{}, workflow.ErrHandoff
	}
	layout := l.Layout()
	if r.Directory != layout.Identity.ProjectDir || r.Revision != layout.Identity.Revision {
		return project.Prepared{}, workflow.ErrHandoff
	}
	if err := a.Validate(r, layout.Identity.Target); err != nil {
		return project.Prepared{}, err
	}
	owner, ok := l.(*workspace.Ownership)
	if !ok {
		return project.Prepared{}, workflow.ErrHandoff
	}
	fingerprint := sha256.Sum256([]byte("android-prepare-v1:" + r.Revision))
	inputs := hex.EncodeToString(fingerprint[:])
	stage, err := owner.Begin(ctx, inputs, nil)
	if err != nil {
		return project.Prepared{}, err
	}
	defer stage.Abort()
	dir := stage.State.NativeDir
	if err = materialize(ctx, r, dir); err != nil {
		return project.Prepared{}, err
	}
	if a.ResolveDependencies {
		// Resolve, rather than Gradle's diagnostic dependencies task: unresolved
		// artifacts must fail before a generation or compatibility stamp is published.
		script := `
allprojects { dependencyLocking { lockAllConfigurations() } }
project(':app') { tasks.register('resolveNativeDependencies') { doLast {
 ['` + layout.Identity.Target.Configuration + `CompileClasspath','` + layout.Identity.Target.Configuration + `RuntimeClasspath'].each { name ->
 def config = configurations.getByName(name)
 config.incoming.resolutionResult.allDependencies.each { dep -> if (dep instanceof org.gradle.api.artifacts.result.UnresolvedDependencyResult) { throw dep.failure } }
 config.incoming.artifactView { componentFilter { id -> !(id instanceof org.gradle.api.artifacts.component.ProjectComponentIdentifier) } }.files.files
 }
} } }
`
		b, e := os.ReadFile(filepath.Join(dir, "build.gradle"))
		if e != nil {
			return project.Prepared{}, e
		}
		if e = write(dir, "build.gradle", append(b, []byte(script)...)); e != nil {
			return project.Prepared{}, e
		}
		executor := a.Executor
		if executor == nil {
			executor = process.Runner{}
		}
		child, e := executor.Start(ctx, process.Command{Executable: filepath.Join(dir, "gradlew"), Args: []string{"--offline", "--no-daemon", "--console=plain", "--max-workers=2", ":app:resolveNativeDependencies", "--write-locks"}, Dir: dir, Environment: a.Environment})
		if e != nil {
			return project.Prepared{}, e
		}
		if _, e = child.Wait(); e != nil {
			return project.Prepared{}, fmt.Errorf("Android dependency resolution: %w", e)
		}
	}
	state, err := stage.Commit(ctx)
	if err != nil {
		return project.Prepared{}, err
	}
	return project.Prepared{Identity: layout.Identity, NativeDir: state.NativeDir, BundleDir: filepath.Join(state.NativeDir, "app/src/main/assets/app")}, nil
}
func copyTree(ctx context.Context, src, dst string) error {
	return filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if err = ctx.Err(); err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		out := filepath.Join(dst, rel)
		if d.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlink in Android native input: %w", workflow.ErrUnavailable)
		}
		if d.IsDir() {
			return os.MkdirAll(out, 0700)
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return workflow.ErrInvalid
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(out, b, info.Mode().Perm())
	})
}
func write(dir, name string, b []byte) error {
	p := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
		return err
	}
	return os.WriteFile(p, b, 0600)
}
func jsonFile(dir, name string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return write(dir, name, b)
}
func groovy(s string) string {
	return "'" + strings.NewReplacer("\\", "\\\\", "'", "\\'", "\n", "\\n", "\r", "\\r").Replace(s) + "'"
}
func materialize(ctx context.Context, r project.Resolved, dir string) error {
	config, err := project.AndroidSettings(r)
	if err != nil {
		return workflow.ErrInvalid
	}
	r.Config.Android = config
	if err := copyTree(ctx, runtimeDir(r), dir); err != nil {
		return err
	}
	// The published scripts assume platforms/android beneath the application.
	// Point every such lookup at the generated snapshot instead of caller files.
	for _, name := range []string{"settings.gradle", "build.gradle"} {
		b, e := os.ReadFile(filepath.Join(dir, name))
		if e != nil {
			return e
		}
		s := strings.ReplaceAll(string(b), "$rootDir/../../", "$rootDir")
		s = strings.ReplaceAll(s, "${rootProject.projectDir}/../..", "${rootProject.projectDir}")
		s = strings.ReplaceAll(s, "$rootDir/../..", "$rootDir")
		s = strings.ReplaceAll(s, "__PROJECT_NAME__", "NativeScriptApp")
		if e = write(dir, name, []byte(s)); e != nil {
			return e
		}
	}
	if err := write(dir, "additional_gradle.properties", nil); err != nil {
		return err
	}
	props, err := os.ReadFile(filepath.Join(dir, "gradle.properties"))
	if err != nil {
		return err
	}
	props = append(props, []byte("\nappPath=app/src/main/assets/app\nappResourcesPath=resources\n")...)
	if err = write(dir, "gradle.properties", props); err != nil {
		return err
	}
	if err = jsonFile(dir, "package.json", map[string]any{"nativescript": map[string]string{"id": r.ApplicationID}}); err != nil {
		return err
	}
	// Retain the effective settings for compiler consumers outside bundle output.
	if err = jsonFile(dir, "runtime-config.json", r.Config.Android); err != nil {
		return err
	}
	if err = jsonFile(dir, "app/src/main/assets/app/package.json", map[string]any{"main": "bundle.js", "id": r.ApplicationID, "android": map[string]string{"v8Flags": r.Config.Android.V8Flags, "markingMode": r.Config.Android.MarkingMode}}); err != nil {
		return err
	}
	contributions := append([]project.Contribution(nil), r.Contributions...)
	sort.Slice(contributions, func(i, j int) bool { return contributions[i].Path < contributions[j].Path })
	manifests := map[string][]byte{}
	namespaces := map[string]string{}
	for _, c := range contributions {
		if c.Platform != "android" {
			continue
		}
		rel, e := filepath.Rel(filepath.Join(c.PackageDirectory, "platforms/android"), c.Path)
		if e != nil {
			return e
		}
		if rel != "AndroidManifest.xml" && rel != filepath.FromSlash("src/main/AndroidManifest.xml") {
			continue
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		b, e := os.ReadFile(c.Path)
		if e != nil {
			return e
		}
		b, namespace, e := libraryManifest(b)
		if e != nil {
			return fmt.Errorf("Android library manifest: %w", e)
		}
		manifests[c.Path] = b
		// Match the source-set selection below when both layouts are present.
		if _, exists := namespaces[c.PackageDirectory]; !exists || rel != "AndroidManifest.xml" {
			namespaces[c.PackageDirectory] = namespace
		}
	}
	type dependency struct {
		Name      string `json:"name"`
		Directory string `json:"directory"`
	}
	deps := []dependency{}
	owners := map[string]string{}
	settings := "\n"
	app := "\n"
	metadata := []project.Contribution{}
	filters := map[string][]byte{}
	for _, c := range contributions {
		if c.Platform != "android" {
			continue
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		info, err := os.Lstat(c.Path)
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return workflow.ErrInvalid
		}
		metadata = append(metadata, c)
		base := filepath.Join(c.PackageDirectory, "platforms/android")
		isApp := c.PackageDirectory == r.Directory && strings.HasPrefix(c.Path, filepath.Join(r.Config.AppResourcesPath, "Android")+string(filepath.Separator))
		if isApp {
			base = filepath.Join(r.Config.AppResourcesPath, "Android")
		}
		rel, e := filepath.Rel(base, c.Path)
		if e != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
			return workflow.ErrInvalid
		}
		ext := strings.ToLower(filepath.Ext(rel))
		if ext == ".mdg" {
			name := filepath.Base(rel)
			if name != "whitelist.mdg" && name != "blacklist.mdg" {
				return workflow.ErrUnavailable
			}
			b, e := os.ReadFile(c.Path)
			if e != nil {
				return e
			}
			filters[name] = append(filters[name], append(b, '\n')...)
			continue
		}
		if ext == ".gradle" {
			allowed := map[string]bool{"include.gradle": !isApp, "buildscript.gradle": true, "rootbuildscript.gradle": true, "app.gradle": isApp, "before-plugins.gradle": isApp, "settings.gradle": isApp}
			if !allowed[rel] {
				return fmt.Errorf("unsupported Android Gradle contribution: %w", workflow.ErrUnavailable)
			}
		}
		if ext == ".properties" && (!isApp || rel != "gradle.properties") {
			return workflow.ErrUnavailable
		}
		if ext == ".c" || ext == ".cpp" || ext == ".h" {
			return fmt.Errorf("C/C++ Android sources require an explicit Gradle build: %w", workflow.ErrUnavailable)
		}
		dst := "resources/Android"
		if !isApp {
			dst = owners[c.PackageDirectory]
			if dst == "" {
				h := sha256.Sum256([]byte(c.PackageDirectory))
				key := hex.EncodeToString(h[:8])
				root := "contributions/" + key
				dst = root + "/platforms/android"
				owners[c.PackageDirectory] = dst
				if e = jsonFile(dir, root+"/package.json", map[string]string{"name": key}); e != nil {
					return e
				}
				deps = append(deps, dependency{Name: key, Directory: root})
				settings += "include ':native" + key + "'\nproject(':native" + key + "').projectDir = file(" + groovy(root) + ")\n"
				app += "dependencies { implementation project(':native" + key + "') }\n"
				namespace := namespaces[c.PackageDirectory]
				if namespace == "" {
					namespace = "org.nativescript.contrib.p" + key
				}
				script := "apply plugin: 'com.android.library'\napply plugin: 'kotlin-android'\nandroid { namespace " + groovy(namespace) + "; compileSdk rootProject.ext.NS_DEFAULT_COMPILE_SDK_VERSION.toInteger(); defaultConfig { minSdk rootProject.ext.NS_DEFAULT_MIN_SDK_VERSION.toInteger() }; sourceSets.main { java.srcDirs = ['platforms/android']; res.srcDirs = ['platforms/android/res', 'platforms/android/src/main/res']; assets.srcDirs = ['platforms/android/assets', 'platforms/android/src/main/assets']; jniLibs.srcDirs = ['platforms/android/libs', 'platforms/android/src/main/jniLibs']; manifest.srcFile file('platforms/android/src/main/AndroidManifest.xml').exists() ? 'platforms/android/src/main/AndroidManifest.xml' : 'platforms/android/AndroidManifest.xml' }; compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }; kotlinOptions { jvmTarget = '17' } }\ndependencies { compileOnly fileTree(dir: 'platforms/android', include: ['**/*.jar']); compileOnly files(rootProject.file('app/libs/runtime-libs/nativescript-regular.aar')) }\n"
				if e = write(dir, root+"/build.gradle", []byte(script)); e != nil {
					return e
				}
				if e = write(dir, dst+"/AndroidManifest.xml", []byte(`<manifest xmlns:android="http://schemas.android.com/apk/res/android"/>`)); e != nil {
					return e
				}
			}
		}
		if ext == ".aar" {
			app += "repositories { flatDir { dirs rootProject.file(" + groovy(filepath.ToSlash(filepath.Join(dst, filepath.Dir(rel)))) + ") } }\n"
		}
		b, e := os.ReadFile(c.Path)
		if e != nil {
			return e
		}
		if manifest, ok := manifests[c.Path]; ok {
			b = manifest
		}
		if e = write(dir, filepath.Join(dst, rel), b); e != nil {
			return e
		}
		if isApp {
			target := ""
			switch {
			case rel == "AndroidManifest.xml":
				target = "app/src/main/AndroidManifest.xml"
			case rel == "google-services.json":
				target = "app/google-services.json"
			case strings.HasPrefix(rel, "src/main/jniLibs/"):
				target = "app/libs/jni/" + strings.TrimPrefix(rel, "src/main/jniLibs/")
			case strings.HasPrefix(rel, "src/main/"):
				target = "app/" + rel
			case strings.HasPrefix(rel, "res/") || strings.HasPrefix(rel, "assets/"):
				target = "app/src/main/" + rel
			case ext == ".java" || ext == ".kt":
				target = "app/src/main/java/" + rel
			case ext == ".so":
				target = "app/libs/jni/" + strings.TrimPrefix(rel, "libs/")
			}
			if target != "" {
				if e = write(dir, target, b); e != nil {
					return e
				}
			}
		}
	}
	for name, b := range filters {
		if err = write(dir, name, b); err != nil {
			return err
		}
	}
	for _, owner := range sortedKeys(owners) {
		module := filepath.Dir(filepath.Dir(owners[owner]))
		name := filepath.Join(module, "build.gradle")
		b, e := os.ReadFile(filepath.Join(dir, name))
		if e != nil {
			return e
		}
		if e = write(dir, name, append(b, []byte(libraryDependencies(r, owner, owners))...)); e != nil {
			return e
		}
	}
	if err = jsonFile(dir, "dependencies.json", deps); err != nil {
		return err
	}
	if err = jsonFile(dir, "metadata-inputs.json", metadata); err != nil {
		return err
	}
	for name, addition := range map[string]string{"settings.gradle": settings, "app/build.gradle": app} {
		b, e := os.ReadFile(filepath.Join(dir, name))
		if e != nil {
			return e
		}
		if e = write(dir, name, append(b, []byte(addition)...)); e != nil {
			return e
		}
	}
	manifest, e := os.ReadFile(filepath.Join(dir, "app/src/main/AndroidManifest.xml"))
	if e != nil {
		return e
	}
	manifest = []byte(strings.ReplaceAll(string(manifest), "__PACKAGE__", r.ApplicationID))
	if e = write(dir, "app/src/main/AndroidManifest.xml", manifest); e != nil {
		return e
	}
	// Preserve wrapper executability regardless of npm extraction permissions.
	if e = os.Chmod(filepath.Join(dir, "gradlew"), 0700); e != nil {
		return e
	}
	return ctx.Err()
}
