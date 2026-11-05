package prepare

import (
	"path/filepath"
	"sort"
	"strings"

	"github.com/octane-xplat/nativescript-cli/internal/project"
)

// Library compilation consumes the installed dependency graph and the shared
// NativeScript core native API. The app's runtime scripts still own packaging
// these binaries, so library inputs are compile-only and are not repackaged.
func libraryDependencies(r project.Resolved, owner string, owners map[string]string) string {
	graph := map[string][]string{}
	for _, edge := range r.Dependencies {
		graph[edge.From] = append(graph[edge.From], edge.Directory)
	}
	seen := map[string]bool{}
	var visit func(string)
	visit = func(dir string) {
		if seen[dir] {
			return
		}
		seen[dir] = true
		for _, dependency := range graph[dir] {
			visit(dependency)
		}
	}
	visit(owner)
	coreSeen := false
	for _, pkg := range r.Packages {
		if pkg.Name == "@nativescript/core" && seen[pkg.Directory] {
			coreSeen = true
		}
	}
	if !coreSeen {
		for _, edge := range r.Dependencies {
			if edge.From == r.Directory && edge.Name == "@nativescript/core" {
				visit(edge.Directory)
			}
		}
	}
	inputs := map[string]bool{}
	repositories := map[string]bool{}
	for _, contribution := range r.Contributions {
		dir := contribution.PackageDirectory
		if contribution.Platform != "android" || !seen[dir] || owners[dir] == "" {
			continue
		}
		ext := strings.ToLower(filepath.Ext(contribution.Path))
		switch ext {
		case ".aar", ".jar":
			rel, _ := filepath.Rel(filepath.Join(dir, "platforms/android"), contribution.Path)
			file := filepath.ToSlash(filepath.Join(owners[dir], rel))
			inputs["compileOnly files(rootProject.file("+groovy(file)+"))"] = true
			repositories[filepath.ToSlash(filepath.Dir(file))] = true
		case ".java", ".kt":
			if dir != owner {
				key := filepath.Base(filepath.Dir(filepath.Dir(owners[dir])))
				inputs["compileOnly project(':native"+key+"')"] = true
			}
		}
	}
	var script strings.Builder
	if len(repositories) != 0 {
		script.WriteString("repositories { flatDir { dirs ")
		paths := sortedKeys(repositories)
		for i, path := range paths {
			if i != 0 {
				script.WriteString(", ")
			}
			script.WriteString("rootProject.file(" + groovy(path) + ")")
		}
		script.WriteString(" } }\n")
	}
	script.WriteString("dependencies {\n")
	for _, input := range sortedKeys(inputs) {
		script.WriteString(" " + input + "\n")
	}
	script.WriteString("}\n")
	script.WriteString("if (file('platforms/android/include.gradle').exists()) { apply from: file('platforms/android/include.gradle') }\n")
	return script.String()
}

func sortedKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
