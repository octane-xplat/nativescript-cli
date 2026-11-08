package prepare

import (
	"sort"
	"strings"

	"github.com/octane-xplat/nativescript-cli/internal/project"
)

// moduleScript emits the per-plugin library build script upstream produces in
// vendor/gradle-plugin: the app's buildscript.gradle and each native
// dependency's buildscript.gradle feed the module buildscript; inside
// android{}, the app's before-plugins.gradle and each dependency's
// include.gradle apply before the module configuration, and the plugin's own
// include.gradle contributes only its repositories and dependencies scopes.
func moduleScript(r project.Resolved, comp *composition, plan *modulePlan, ownScopes []string) string {
	var b strings.Builder
	// Upstream's generated plugin project imports these for the Gradle
	// fragments it applies; extracted scopes may use them verbatim.
	b.WriteString("import groovy.json.JsonSlurper\nimport org.gradle.internal.logging.text.StyledTextOutputFactory\nimport static org.gradle.internal.logging.text.StyledTextOutput.Style\nimport java.nio.file.Paths\n\n")
	b.WriteString("buildscript {\n repositories { google(); mavenCentral() }\n")
	b.WriteString(" project.ext.PLUGIN_NAME = " + groovy(comp.nativeByDir[plan.owner]) + "\n")
	if r.Config.AppResourcesPath != "" {
		b.WriteString(" if (rootProject.file('resources/Android/buildscript.gradle').exists()) { apply from: rootProject.file('resources/Android/buildscript.gradle'), to: buildscript }\n")
	}
	for _, dep := range comp.moduleDeps[plan.owner] {
		b.WriteString(" if (rootProject.file(" + groovy(comp.names[dep]+"/platforms/android/buildscript.gradle") + ").exists()) { apply from: rootProject.file(" + groovy(comp.names[dep]+"/platforms/android/buildscript.gradle") + "), to: buildscript }\n")
	}
	b.WriteString("}\n")
	// Upstream builds each plugin project with -PtempBuild=true; the module is
	// that build, so tempBuild-guarded fragments evaluate the same way.
	b.WriteString("project.ext.tempBuild = true\n")
	b.WriteString("apply plugin: 'com.android.library'\napply plugin: 'kotlin-android'\napply plugin: 'kotlin-parcelize'\n")
	b.WriteString("android {\n")
	b.WriteString(" namespace " + groovy(plan.namespace) + "\n")
	b.WriteString(" if (rootProject.file('resources/Android/before-plugins.gradle').exists()) { apply from: rootProject.file('resources/Android/before-plugins.gradle') }\n")
	for _, dep := range comp.moduleDeps[plan.owner] {
		b.WriteString(" if (rootProject.file(" + groovy(comp.names[dep]+"/platforms/android/include.gradle") + ").exists()) { apply from: rootProject.file(" + groovy(comp.names[dep]+"/platforms/android/include.gradle") + ") }\n")
	}
	b.WriteString(" kotlinOptions { jvmTarget = '17' }\n")
	b.WriteString(" compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }\n")
	b.WriteString(" compileSdk (project.hasProperty('compileSdk') ? compileSdk.toString().toInteger() : NS_DEFAULT_COMPILE_SDK_VERSION.toInteger())\n")
	b.WriteString(" buildToolsVersion = (project.hasProperty('buildToolsVersion') ? buildToolsVersion : NS_DEFAULT_BUILD_TOOLS_VERSION).toString()\n")
	b.WriteString(" defaultConfig {\n  targetSdkVersion (project.hasProperty('targetSdk') ? targetSdk.toString().toInteger() : NS_DEFAULT_COMPILE_SDK_VERSION.toInteger())\n  versionCode 1\n  versionName '1.0'\n }\n")
	b.WriteString(" sourceSets.main {\n")
	b.WriteString("  java.srcDirs = " + gradleList(plan.javaDirs) + "\n")
	b.WriteString("  res.srcDirs = " + gradleList(plan.resDirs) + "\n")
	b.WriteString("  assets.srcDirs = " + gradleList(plan.assetDirs) + "\n")
	b.WriteString("  jniLibs.srcDirs = " + gradleList(plan.jniDirs) + "\n")
	b.WriteString("  manifest.srcFile file('platforms/android/AndroidManifest.xml').exists() ? 'platforms/android/AndroidManifest.xml' : 'platforms/android/src/main/AndroidManifest.xml'\n")
	b.WriteString(" }\n")
	b.WriteString("}\n")
	// Upstream allprojects repositories: dependency platform directories and
	// their libs/ children are flatDir repositories; the standard repositories
	// come from the template.
	b.WriteString("repositories {\n mavenLocal()\n mavenCentral()\n maven { url 'https://maven.google.com/'; name 'Google' }\n")
	flatDirs := []string{}
	for _, dep := range comp.moduleDeps[plan.owner] {
		base := comp.names[dep] + "/platforms/android"
		flatDirs = append(flatDirs, base, base+"/libs")
	}
	if len(flatDirs) != 0 {
		b.WriteString(" flatDir { dirs ")
		for i, dir := range uniqueSorted(flatDirs) {
			if i != 0 {
				b.WriteString(", ")
			}
			b.WriteString("rootProject.file(" + groovy(dir) + ")")
		}
		b.WriteString(" }\n")
	}
	b.WriteString("}\n")
	b.WriteString("dependencies {\n")
	for _, dep := range comp.moduleDeps[plan.owner] {
		if other := comp.modules[dep]; other != nil && other.build {
			b.WriteString(" implementation project(':" + other.name + "')\n")
		}
		for _, aar := range comp.artifacts[dep]["aar"] {
			name := strings.TrimSuffix(aar, ".aar")
			b.WriteString(" implementation name:" + groovy(name) + ", ext:'aar'\n")
		}
		for _, jar := range comp.artifacts[dep]["jar"] {
			b.WriteString(" implementation files(rootProject.file(" + groovy(comp.names[dep]+"/platforms/android/"+jar) + "))\n")
		}
	}
	b.WriteString(" compileOnly fileTree(dir: 'platforms/android', include: ['**/*.jar'])\n")
	// Plugin code compiles against the shipped NativeScript runtime classes;
	// keep the runtime archive compile-only so it is never repackaged.
	b.WriteString(" compileOnly files(rootProject.file('app/libs/runtime-libs/nativescript-regular.aar'))\n")
	b.WriteString("}\n")
	for _, scope := range ownScopes {
		b.WriteString(scope + "\n")
	}
	return b.String()
}

func gradleList(dirs []string) string {
	if len(dirs) == 0 {
		return "[]"
	}
	out := make([]string, len(dirs))
	for i, dir := range dirs {
		out[i] = groovy("platforms/android/" + dir)
	}
	return "[" + strings.Join(out, ", ") + "]"
}

func sortedKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// projectNameFromID mirrors upstream getProjectNameFromId: the last identifier
// segment becomes the Gradle root project name.
func projectNameFromID(applicationID string) string {
	i := strings.LastIndex(applicationID, ".")
	return applicationID[i+1:]
}
