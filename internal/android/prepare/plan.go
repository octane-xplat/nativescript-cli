package prepare

import (
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"sort"
	"strings"

	"github.com/octane-xplat/nativescript-cli/internal/project"
)

// Module composition mirrors upstream's per-plugin AAR contract
// (android-plugin-build-service.js): a plugin compiles when its
// platforms/android tree owns a root AndroidManifest.xml or any directory
// named res, java, assets, jniLibs or cpp; a present <shortName>.aar is the
// already-packaged result of that compilation, so the application consumes it
// like any shipped archive instead of compiling sources a second time.
type modulePlan struct {
	owner     string   // package directory contributing the platform tree
	key       string   // contributions/<key> identity
	name      string   // Gradle project name (upstream short plugin name)
	short     string   // un-disambiguated short name
	namespace string   // Android namespace for the library module
	javaDirs  []string // source-set directories relative to platforms/android
	resDirs   []string
	assetDirs []string
	jniDirs   []string
	manifest  bool // a manifest file is contributed (root or src/main)
	build     bool // compile a Gradle module for this owner
}

type dependencyEntry struct {
	Name         string   `json:"name"`
	Directory    string   `json:"directory"`
	Dependencies []string `json:"dependencies"`
}

type composition struct {
	modules     map[string]*modulePlan         // owner directory -> plan
	moduleDeps  map[string][]string            // owner directory -> native dep dirs, dependency order
	names       map[string]string              // native dir -> dependencies.json directory
	nativeByDir map[string]string              // native package directory -> package name
	order       []string                       // dependency emission order of native dirs
	deps        []dependencyEntry              // topologically ordered dependencies.json rows
	artifacts   map[string]map[string][]string // owner -> "aar" basenames / "jar" rel paths
}

// shortPluginName mirrors upstream getShortPluginName: the last package-name
// segment with '-' mapped to '_' (common/helpers.js).
func shortPluginName(name string) string {
	return strings.ReplaceAll(name[strings.LastIndex(name, "/")+1:], "-", "_")
}

// gradleScope mirrors upstream getScope: text starting at the first occurrence
// of name through its balanced closing brace (or the remainder of the file).
func gradleScope(name, content string) string {
	index := strings.Index(content, name)
	if index < 0 {
		return ""
	}
	open, found := 0, false
	for i := index; i < len(content); i++ {
		switch content[i] {
		case '{':
			open++
			found = true
		case '}':
			open--
		}
		if found && open == 0 {
			return content[index : i+1]
		}
	}
	return content[index:]
}

// includeGradleScopes mirrors upstream getIncludeGradleCompileDependenciesScope:
// nothing unless the file mentions "dependencies"; then the repositories scope
// (when mentioned) followed by the dependencies scope, verbatim.
func includeGradleScopes(content string) []string {
	if !strings.Contains(content, "dependencies") {
		return nil
	}
	scopes := []string{}
	if strings.Contains(content, "repositories") {
		scopes = append(scopes, gradleScope("repositories", content))
	}
	return append(scopes, gradleScope("dependencies", content))
}

// migrateIncludeGradle strips the productFlavors scope, the single mutation
// upstream applies to plugin include.gradle before composition.
func migrateIncludeGradle(content []byte) []byte {
	scope := gradleScope("productFlavors", string(content))
	if scope == "" {
		return content
	}
	return []byte(strings.Replace(string(content), scope, "", 1))
}

var sourceSetLeafs = map[string]bool{"java": true, "res": true, "assets": true, "jniLibs": true, "cpp": true}

// leafDir returns the innermost contributed directory named like an Android
// source set, matching upstream getAndroidSourceDirectories' "ends with"
// enumeration of the plugin platforms/android tree.
func leafDir(rel string) (leaf, dir string) {
	parts := strings.Split(filepath.ToSlash(rel), "/")
	for i := len(parts) - 1; i > 0; i-- {
		if sourceSetLeafs[parts[i-1]] {
			return parts[i-1], strings.Join(parts[:i], "/")
		}
	}
	return "", ""
}

// topoSortNativeDependencies ports upstream topologicalSortNativeDependencies:
// entries whose dependencies are all already emitted move to the output in one
// input-ordered pass (later entries in a pass see earlier pushes), repeating
// until nothing new qualifies. Rows stuck in a cycle — which upstream cannot
// produce from a resolvable graph — keep input order at the end instead of
// recursing forever.
func topoSortNativeDependencies(entries []dependencyEntry) []dependencyEntry {
	total := len(entries)
	sorted := []dependencyEntry{}
	remaining := entries
	for len(remaining) > 0 && len(sorted) < total {
		emitted := map[string]bool{}
		for _, d := range sorted {
			emitted[d.Name] = true
		}
		var rest []dependencyEntry
		progress := false
		for _, d := range remaining {
			ready := true
			for _, name := range d.Dependencies {
				if !emitted[name] {
					ready = false
					break
				}
			}
			if ready {
				sorted = append(sorted, d)
				emitted[d.Name] = true
				progress = true
			} else {
				rest = append(rest, d)
			}
		}
		if !progress {
			return append(sorted, rest...)
		}
		remaining = rest
	}
	return sorted
}

// planComposition derives module ownership and dependencies.json content from
// the resolved graph. Ordering follows upstream: the production emission order
// with remaining native packages appended sorted, deduped to the first winning
// directory per name, then topologically sorted for the file.
func planComposition(r project.Resolved, owners map[string]string) *composition {
	c := &composition{
		modules:     map[string]*modulePlan{},
		moduleDeps:  map[string][]string{},
		names:       map[string]string{},
		nativeByDir: map[string]string{},
		artifacts:   map[string]map[string][]string{},
	}
	pkgByDir := map[string]project.Package{}
	for _, p := range r.Packages {
		pkgByDir[p.Directory] = p
		if p.AndroidRequirement != "" && p.Directory != r.Directory {
			c.nativeByDir[p.Directory] = p.Name
		}
	}
	manifest := map[string]map[string]bool{}
	for _, contribution := range r.Contributions {
		if contribution.Platform != "android" || contribution.PackageDirectory == r.Directory {
			continue
		}
		owner := contribution.PackageDirectory
		rel, err := filepath.Rel(filepath.Join(owner, "platforms/android"), contribution.Path)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		base := filepath.Base(rel)
		switch rel {
		case "AndroidManifest.xml":
			if manifest[owner] == nil {
				manifest[owner] = map[string]bool{}
			}
			manifest[owner]["root"] = true
		case filepath.FromSlash("src/main/AndroidManifest.xml"):
			if manifest[owner] == nil {
				manifest[owner] = map[string]bool{}
			}
			manifest[owner]["src"] = true
		default:
			// Source-set membership belongs to the module scan below.
		}
		if leaf, dir := leafDir(rel); leaf != "" {
			if c.artifacts[owner] == nil {
				c.artifacts[owner] = map[string][]string{}
			}
			c.artifacts[owner]["leaf:"+leaf] = append(c.artifacts[owner]["leaf:"+leaf], dir)
		}
		switch strings.ToLower(filepath.Ext(rel)) {
		case ".aar":
			if c.artifacts[owner] == nil {
				c.artifacts[owner] = map[string][]string{}
			}
			c.artifacts[owner]["aar"] = append(c.artifacts[owner]["aar"], base)
		case ".jar":
			if c.artifacts[owner] == nil {
				c.artifacts[owner] = map[string][]string{}
			}
			c.artifacts[owner]["jar"] = append(c.artifacts[owner]["jar"], filepath.ToSlash(rel))
		}
	}
	// Upstream emission order for native packages: dependencyOrder first.
	emission := []string{}
	seenOrder := map[string]bool{r.Directory: true}
	for _, dir := range r.DependencyOrder {
		if seenOrder[dir] {
			continue
		}
		seenOrder[dir] = true
		if _, ok := c.nativeByDir[dir]; ok {
			emission = append(emission, dir)
		}
	}
	rest := []string{}
	for dir := range c.nativeByDir {
		if !seenOrder[dir] {
			rest = append(rest, dir)
		}
	}
	sort.Strings(rest)
	emission = append(emission, rest...)
	// One row per package name; the first emission position wins a duplicate
	// (upstream filterUniqueDependencies keeps the shallowest install).
	nameSeen := map[string]bool{}
	for _, dir := range emission {
		name := c.nativeByDir[dir]
		if nameSeen[name] {
			continue
		}
		nameSeen[name] = true
		c.order = append(c.order, dir)
		if dst := owners[dir]; dst != "" {
			c.names[dir] = filepath.ToSlash(filepath.Dir(filepath.Dir(dst)))
		} else {
			// dependencies.json directory points at the installed package for
			// the runtime scripts, which read <directory>/package.json without
			// an existence guard. A stub keeps every read inside the snapshot.
			c.names[dir] = "contributions/" + ownerKey(dir)
		}
	}
	nativeNames := map[string]bool{}
	for _, name := range c.nativeByDir {
		nativeNames[name] = true
	}
	declared := map[string][]string{}
	for _, edge := range r.Dependencies {
		if nativeNames[edge.Name] {
			declared[edge.From] = append(declared[edge.From], edge.Name)
		}
	}
	rows := []dependencyEntry{}
	for _, dir := range c.order {
		names := []string{}
		rowSeen := map[string]bool{}
		for _, name := range declared[dir] {
			if !rowSeen[name] {
				rowSeen[name] = true
				names = append(names, name)
			}
		}
		rows = append(rows, dependencyEntry{Name: c.nativeByDir[dir], Directory: c.names[dir], Dependencies: names})
	}
	c.deps = topoSortNativeDependencies(rows)
	// Native dep directories for each owner, in topologically sorted order so
	// per-module include.gradle/buildscript application matches upstream's
	// nativescriptDependencies iteration.
	position := map[string]int{}
	for i, dir := range c.order {
		position[c.nativeByDir[dir]] = i
	}
	for _, edge := range r.Dependencies {
		if !nativeNames[edge.Name] {
			continue
		}
		depDir := edge.Directory
		// A losing duplicate still names the winning row through its name.
		if _, ok := c.names[depDir]; !ok {
			for _, dir := range c.order {
				if c.nativeByDir[dir] == edge.Name {
					depDir = dir
					break
				}
			}
		}
		c.moduleDeps[edge.From] = append(c.moduleDeps[edge.From], depDir)
	}
	for owner := range c.moduleDeps {
		sort.SliceStable(c.moduleDeps[owner], func(i, j int) bool {
			return position[c.nativeByDir[c.moduleDeps[owner][i]]] < position[c.nativeByDir[c.moduleDeps[owner][j]]]
		})
	}
	claimed := map[string]bool{}
	for _, dir := range c.order {
		pkg := pkgByDir[dir]
		short := shortPluginName(pkg.Name)
		plan := &modulePlan{owner: dir, short: short}
		if dst := owners[dir]; dst != "" {
			plan.key = filepath.Base(filepath.Dir(dst))
		}
		plan.manifest = manifest[dir]["root"] || manifest[dir]["src"]
		plan.javaDirs = uniqueSorted(c.artifacts[dir]["leaf:java"])
		plan.resDirs = uniqueSorted(c.artifacts[dir]["leaf:res"])
		plan.assetDirs = uniqueSorted(c.artifacts[dir]["leaf:assets"])
		plan.jniDirs = uniqueSorted(c.artifacts[dir]["leaf:jniLibs"])
		// upstream shouldBuildAar: a root manifest or any source-set directory
		// means the plugin compiles; a present <short>.aar is the packaged
		// result of an earlier compilation and is consumed like a shipped one.
		packaged := false
		for _, aar := range c.artifacts[dir]["aar"] {
			if aar == short+".aar" {
				packaged = true
			}
		}
		plan.build = (manifest[dir]["root"] || len(plan.javaDirs)+len(plan.resDirs)+len(plan.assetDirs)+len(plan.jniDirs) > 0) && !packaged
		if plan.build {
			plan.name = short
			if claimed[plan.name] {
				plan.name = short + "_" + plan.key
			}
			claimed[plan.name] = true
		}
		c.modules[dir] = plan
	}
	return c
}

// ownerKey is the contributions/<key> identity shared with materialize.
func ownerKey(dir string) string {
	h := sha256.Sum256([]byte(dir))
	return hex.EncodeToString(h[:8])
}

func uniqueSorted(values []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, v := range values {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	sort.Strings(out)
	return out
}
