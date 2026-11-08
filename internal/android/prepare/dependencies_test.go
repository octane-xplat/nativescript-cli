package prepare

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/project"
)

func contribution(dir, rel string) project.Contribution {
	return project.Contribution{Platform: "android", PackageDirectory: dir, Path: filepath.Join(dir, "platforms/android", filepath.FromSlash(rel))}
}

// The packaged <short>.aar is upstream's own compilation output; sources only
// compile when no packaged result already satisfies the composition.
func TestModulePlanFollowsUpstreamBuildPredicate(t *testing.T) {
	app, withAar, withSources, empty := "/app", "/p/with-aar", "/p/with-sources", "/p/empty"
	r := project.Resolved{Directory: app,
		Packages: []project.Package{
			{Name: "with-aar", Directory: withAar, AndroidRequirement: "9.0.0"},
			{Name: "with-sources", Directory: withSources, AndroidRequirement: "9.0.0"},
			{Name: "empty", Directory: empty, AndroidRequirement: "9.0.0"},
		},
		Contributions: []project.Contribution{
			contribution(withAar, "with_aar.aar"),
			contribution(withAar, "java/x/Y.java"),
			contribution(withSources, "AndroidManifest.xml"),
			contribution(withSources, "java/x/Y.java"),
			contribution(withSources, "jniLibs/arm64-v8a/libx.so"),
			contribution(empty, "include.gradle"),
		},
	}
	owners := map[string]string{withAar: "contributions/a/platforms/android", withSources: "contributions/b/platforms/android", empty: "contributions/c/platforms/android"}
	comp := planComposition(r, owners)
	if comp.modules[withAar].build {
		t.Fatal("packaged short aar did not satisfy the build predicate")
	}
	sources := comp.modules[withSources]
	if !sources.build || sources.name != "with_sources" || !sources.manifest {
		t.Fatalf("source module plan wrong: %+v", sources)
	}
	if len(sources.jniDirs) != 1 || sources.jniDirs[0] != "jniLibs" {
		t.Fatalf("jniLibs leaf dir missing: %v", sources.jniDirs)
	}
	if comp.modules[empty].build {
		t.Fatal("include.gradle-only plugin must not produce a module")
	}
	if len(comp.deps) != 3 {
		t.Fatalf("dependencies.json lost entries: %v", comp.deps)
	}
	for _, d := range comp.deps {
		if !strings.HasPrefix(d.Directory, "contributions/") {
			t.Fatalf("contributing dependency points outside the snapshot: %v", d)
		}
	}
}

// dependencies.json rows carry real package names and emit dependencies before
// dependents, like upstream topologicalSortNativeDependencies.
func TestDependenciesJsonTopologicalOrder(t *testing.T) {
	app, a, b, c := "/app", "/p/a", "/p/b", "/p/c"
	r := project.Resolved{Directory: app,
		Packages: []project.Package{
			{Name: "a", Directory: a, AndroidRequirement: "1"},
			{Name: "b", Directory: b, AndroidRequirement: "1"},
			{Name: "c", Directory: c, AndroidRequirement: "1"},
		},
		DependencyOrder: []string{a, b, c},
		Dependencies: []project.Dependency{
			{From: a, Name: "b", Directory: b},
			{From: b, Name: "c", Directory: c},
		},
	}
	comp := planComposition(r, map[string]string{})
	got := []string{}
	for _, d := range comp.deps {
		got = append(got, d.Name)
	}
	if strings.Join(got, ",") != "c,b,a" {
		t.Fatalf("dependencies not topologically ordered: %v", got)
	}
	for _, d := range comp.deps {
		if d.Dependencies == nil {
			t.Fatalf("dependencies field must serialize as []: %v", d)
		}
	}
	if d := comp.deps[1]; len(d.Dependencies) != 1 || d.Dependencies[0] != "c" {
		t.Fatalf("dependency list mismatch: %+v", d)
	}
}

// The module consumes the installed dependency graph and its Gradle
// declarations the way upstream's generated plugin project does.
func TestModuleScriptAppliesDependencyGradle(t *testing.T) {
	app, owner, dep := "/app", "/p/owner", "/p/dep"
	r := project.Resolved{Directory: app,
		Config:   project.Config{AppResourcesPath: filepath.Join(app, "App_Resources")},
		Packages: []project.Package{{Name: "owner", Directory: owner, AndroidRequirement: "1"}, {Name: "dep", Directory: dep, AndroidRequirement: "1"}},
		Dependencies: []project.Dependency{
			{From: app, Name: "owner", Directory: owner},
			{From: owner, Name: "dep", Directory: dep},
		},
		DependencyOrder: []string{dep, owner},
		Contributions: []project.Contribution{
			contribution(owner, "java/x/Y.java"),
			contribution(dep, "dep.aar"),
			contribution(dep, "libs/tool.jar"),
		},
	}
	owners := map[string]string{owner: "contributions/aa/platforms/android", dep: "contributions/bb/platforms/android"}
	comp := planComposition(r, owners)
	plan := comp.modules[owner]
	plan.namespace = "org.nativescript.owner"
	script := moduleScript(r, comp, plan, []string{"dependencies { implementation 'x:y:1' }"})
	for _, want := range []string{
		"namespace 'org.nativescript.owner'",
		"rootProject.file('resources/Android/before-plugins.gradle')",
		"rootProject.file('resources/Android/buildscript.gradle')",
		"contributions/bb/platforms/android/include.gradle",
		"contributions/bb/platforms/android/buildscript.gradle",
		"implementation name:'dep', ext:'aar'",
		"contributions/bb/platforms/android/libs/tool.jar",
		"dependencies { implementation 'x:y:1' }",
	} {
		if !strings.Contains(script, want) {
			t.Fatalf("module script missing %q:\n%s", want, script)
		}
	}
}

// Duplicate-version losers do not leak into a dependent's module inputs; the
// application-selected directory owns the dependency row like upstream's
// shallowest dedup.
func TestModuleDepsUseWinningDuplicate(t *testing.T) {
	app, owner, coreA, coreB := "/app", "/p/owner", "/p/a", "/p/b"
	r := project.Resolved{Directory: app,
		Packages: []project.Package{
			{Name: "owner", Directory: owner, AndroidRequirement: "1"},
			{Name: "core", Directory: coreA, AndroidRequirement: "1"},
			{Name: "core", Directory: coreB, AndroidRequirement: "1"},
		},
		DependencyOrder: []string{coreA, owner, coreB},
		Dependencies:    []project.Dependency{{From: owner, Name: "core", Directory: coreB}},
		Contributions: []project.Contribution{
			contribution(owner, "java/x/Y.java"),
			contribution(coreA, "core.aar"),
		},
	}
	owners := map[string]string{owner: "contributions/aa/platforms/android", coreA: "contributions/bb/platforms/android"}
	comp := planComposition(r, owners)
	if len(comp.moduleDeps[owner]) != 1 || comp.moduleDeps[owner][0] != coreA {
		t.Fatalf("losing duplicate selected for module deps: %v", comp.moduleDeps[owner])
	}
	if len(comp.deps) != 2 {
		t.Fatalf("duplicate name produced two dependencies rows: %v", comp.deps)
	}
}

func TestGradleScopePorts(t *testing.T) {
	content := "android { a { b } }\ndependencies { implementation 'x:y' }\nrepositories { maven { url 'u' } }\n"
	if got := gradleScope("dependencies", content); got != "dependencies { implementation 'x:y' }" {
		t.Fatalf("scope mismatch: %q", got)
	}
	if got := gradleScope("repositories", content); got != "repositories { maven { url 'u' } }" {
		t.Fatalf("scope mismatch: %q", got)
	}
	if got := gradleScope("absent", content); got != "" {
		t.Fatalf("absent scope produced output: %q", got)
	}
	scopes := includeGradleScopes("repositories { r }\ndependencies { d }\n")
	if len(scopes) != 2 || scopes[0] != "repositories { r }" || scopes[1] != "dependencies { d }" {
		t.Fatalf("scope order mismatch: %v", scopes)
	}
	if scopes := includeGradleScopes("apply plugin: 'x'"); scopes != nil {
		t.Fatalf("dependencies-free file contributed scopes: %v", scopes)
	}
	withFlavors := "android { }\nproductFlavors { free { } }\ndependencies { }\n"
	migrated := migrateIncludeGradle([]byte(withFlavors))
	if strings.Contains(string(migrated), "productFlavors") || !strings.Contains(string(migrated), "dependencies") {
		t.Fatalf("productFlavors migration wrong: %q", migrated)
	}
}
