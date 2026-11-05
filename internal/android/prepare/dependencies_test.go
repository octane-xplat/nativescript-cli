package prepare

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/project"
)

func TestLibraryCoreSelection(t *testing.T) {
	app, plugin, appCore, privateCore := t.TempDir(), t.TempDir(), t.TempDir(), t.TempDir()
	r := project.Resolved{Directory: app,
		Packages:     []project.Package{{Name: "@nativescript/core", Directory: appCore}, {Name: "@nativescript/core", Directory: privateCore}},
		Dependencies: []project.Dependency{{From: app, Name: "@nativescript/core", Directory: appCore}},
		Contributions: []project.Contribution{
			{Platform: "android", PackageDirectory: appCore, Path: filepath.Join(appCore, "platforms/android/widgets.aar")},
			{Platform: "android", PackageDirectory: privateCore, Path: filepath.Join(privateCore, "platforms/android/private-widgets.aar")},
		},
	}
	owners := map[string]string{plugin: "contributions/plugin/platforms/android", appCore: "contributions/app-core/platforms/android", privateCore: "contributions/private-core/platforms/android"}
	script := libraryDependencies(r, plugin, owners)
	if !strings.Contains(script, "app-core/platforms/android/widgets.aar") || strings.Contains(script, "private-core") {
		t.Fatal("implicit core did not use the application selection", script)
	}
	r.Dependencies = append(r.Dependencies, project.Dependency{From: plugin, Name: "@nativescript/core", Directory: privateCore})
	script = libraryDependencies(r, plugin, owners)
	if !strings.Contains(script, "private-core/platforms/android/private-widgets.aar") || strings.Contains(script, "app-core") {
		t.Fatal("explicit installed core selection was replaced", script)
	}
}
