package workflow

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/octane-xplat/nativescript-cli/extension"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

type artifactInspector struct {
	path   string
	reject bool
	phases *[]extension.Phase
}

func (a artifactInspector) Manifest(context.Context) (extension.Manifest, error) {
	return extension.Manifest{ID: "inspect", Version: "1.0.0", API: extension.APIVersion, Phases: []extension.Phase{extension.Collect, extension.Prepared, extension.PostBuild}, Required: []string{"build_artifacts"}}, nil
}

var inspectionRejected = errors.New("inspection rejected compiler output")

func (a artifactInspector) Invoke(_ context.Context, in extension.Input) (extension.Result, error) {
	*a.phases = append(*a.phases, in.Phase)
	if in.Phase != extension.PostBuild {
		if len(in.Artifacts) != 0 {
			return extension.Result{}, errors.New("artifacts leaked before compile")
		}
		return extension.Result{}, nil
	}
	if len(in.Artifacts) != 1 || in.Artifacts[0].Path != a.path || in.Artifacts[0].Kind != "apk" || in.Artifacts[0].ApplicationID != "org.example.inspection" {
		return extension.Result{}, errors.New("wrong compiled artifact context")
	}
	data, err := os.ReadFile(in.Artifacts[0].Path)
	if err != nil {
		return extension.Result{}, err
	}
	if a.reject {
		return extension.Result{Files: []extension.File{{Path: "partial", Content: "not publishable"}}}, inspectionRejected
	}
	return extension.Result{Files: []extension.File{{Path: "report", Content: string(data)}}}, nil
}

func TestPostBuildArtifactContextAndFailure(t *testing.T) {
	for _, reject := range []bool{false, true} {
		t.Run(map[bool]string{false: "inspect", true: "reject"}[reject], func(t *testing.T) {
			dir := t.TempDir()
			target := project.Target{Platform: "android", Configuration: "debug", DestinationKind: "simulator", DestinationID: "fixture", Architecture: "arm64-v8a"}
			layout, err := workspace.NewLayout(filepath.Join(dir, "state"), project.Identity{Schema: 1, Revision: "fixture", ProjectDir: dir, Target: target})
			if err != nil {
				t.Fatal(err)
			}
			native := filepath.Join(layout.GeneratedRoot, "native")
			app := filepath.Join(native, "app")
			if err = os.MkdirAll(app, 0700); err != nil {
				t.Fatal(err)
			}
			artifact := filepath.Join(dir, "compiled with spaces.apk")
			if err = os.WriteFile(artifact, []byte("fixture compiler output"), 0600); err != nil {
				t.Fatal(err)
			}
			f := fixtureStages{project.Prepared{Identity: layout.Identity, NativeDir: native, BundleDir: app}, project.Bundle{Identity: layout.Identity, Directory: app, Entry: filepath.Join(app, "bundle.js")}, project.Artifact{Identity: layout.Identity, Path: artifact, Kind: "apk", ApplicationID: "org.example.inspection"}}
			var phases []extension.Phase
			stages := Stages{Preparer: f, Bundler: f, Compiler: f, Extensions: []extension.Extension{artifactInspector{artifact, reject, &phases}}}
			_, artifacts, err := (Engine{}).Native(context.Background(), stages, project.Resolved{Directory: layout.Identity.ProjectDir, Revision: "fixture", ApplicationID: "org.example.inspection"}, Request{ProjectDir: dir, OutputDir: filepath.Join(dir, "state"), Target: target}, true, nil)
			if reject {
				if !errors.Is(err, inspectionRejected) || len(artifacts) != 0 {
					t.Fatal("post-build rejection reported success", artifacts, err)
				}
				if _, err := os.Stat(filepath.Join(native, ".nativescript-extensions/inspect/partial")); !os.IsNotExist(err) {
					t.Fatal("failed phase published output", err)
				}
			} else {
				if err != nil || len(artifacts) != 1 {
					t.Fatal(artifacts, err)
				}
				data, err := os.ReadFile(filepath.Join(native, ".nativescript-extensions/inspect/report"))
				if err != nil || string(data) != "fixture compiler output" {
					t.Fatal(string(data), err)
				}
			}
			if len(phases) != 3 || phases[2] != extension.PostBuild {
				t.Fatal(phases)
			}
		})
	}
}
