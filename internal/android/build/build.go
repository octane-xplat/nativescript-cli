// Package build invokes the prepared runtime wrapper under the workflow lease.
package build

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

var ErrSigning = errors.New("release requires explicit keystore, alias and password environment names")
var ErrArtifact = errors.New("expected exactly one compatible artifact; inspect Gradle output metadata and disable splits or select a single variant")

type Failure struct {
	Stage      string
	ExitCode   int
	Cause      error
	Diagnostic string
}

func (e *Failure) Error() string {
	return "Gradle " + e.Stage + " failed; check Android SDK, JDK and project Gradle configuration"
}
func (e *Failure) Unwrap() error { return e.Cause }

// Password fields name environment variables, never literal credentials.
type Options struct{ Format, Keystore, Alias, StorePasswordEnv, KeyPasswordEnv string }
type Adapter struct {
	Options     Options
	Environment map[string]string
	Executor    process.Executor
}
type metadata struct {
	ApplicationID string `json:"applicationId"`
	VariantName   string `json:"variantName"`
	ArtifactType  struct {
		Type string `json:"type"`
	} `json:"artifactType"`
	Elements []struct {
		OutputFile string `json:"outputFile"`
	} `json:"elements"`
}

func (a Adapter) Compile(ctx context.Context, p project.Prepared, b project.Bundle, l workspace.Lease) ([]project.Artifact, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if l == nil || !p.Identity.Compatible(l.Layout().Identity) || !p.Identity.Compatible(b.Identity) || p.BundleDir != b.Directory || !filepath.IsAbs(p.NativeDir) || !filepath.IsAbs(b.Entry) {
		return nil, workflow.ErrHandoff
	}
	t := p.Identity.Target
	if t.Platform != "android" {
		return nil, workflow.ErrUnavailable
	}
	if runtime.GOOS == "windows" {
		return nil, process.ErrUnavailable
	}
	if (t.Configuration != "debug" && t.Configuration != "release") || (t.DestinationKind != "device" && t.DestinationKind != "simulator") {
		return nil, workflow.ErrInvalid
	}
	switch t.Architecture {
	case "arm64-v8a", "armeabi-v7a", "x86", "x86_64":
	default:
		return nil, workflow.ErrInvalid
	}
	o := a.Options
	if o.Format == "" {
		o.Format = "apk"
	}
	if o.Format != "apk" && o.Format != "aab" || o.Format == "aab" && t.Configuration != "release" {
		return nil, workflow.ErrInvalid
	}
	env := maps.Clone(a.Environment)
	if env == nil {
		env = map[string]string{}
	}
	args := []string{"--no-daemon", "--console=plain", "--max-workers=2"}
	variant := t.Configuration
	task := ":app:assemble" + strings.ToUpper(variant[:1]) + variant[1:]
	if t.Configuration == "release" {
		lookup := func(name string) string {
			if v, ok := env[name]; ok {
				return v
			}
			return os.Getenv(name)
		}
		if !filepath.IsAbs(o.Keystore) || o.Alias == "" || o.StorePasswordEnv == "" || o.KeyPasswordEnv == "" || lookup(o.StorePasswordEnv) == "" || lookup(o.KeyPasswordEnv) == "" {
			return nil, ErrSigning
		}
		if st, e := os.Stat(o.Keystore); e != nil || !st.Mode().IsRegular() {
			return nil, ErrSigning
		}
		// Gradle project properties use scoped child environment, avoiding argv and files.
		env["ORG_GRADLE_PROJECT_ksPath"] = o.Keystore
		env["ORG_GRADLE_PROJECT_alias"] = o.Alias
		env["ORG_GRADLE_PROJECT_ksPassword"] = lookup(o.StorePasswordEnv)
		env["ORG_GRADLE_PROJECT_password"] = lookup(o.KeyPasswordEnv)
		args = append(args, "-Prelease")
	} else if o.Keystore != "" || o.Alias != "" || o.StorePasswordEnv != "" || o.KeyPasswordEnv != "" {
		return nil, ErrSigning
	}
	var pkg struct {
		NativeScript struct {
			ID string `json:"id"`
		} `json:"nativescript"`
	}
	data, err := os.ReadFile(filepath.Join(p.NativeDir, "package.json"))
	if err != nil || json.Unmarshal(data, &pkg) != nil || pkg.NativeScript.ID == "" {
		return nil, workflow.ErrHandoff
	}
	owner, ok := l.(*workspace.Ownership)
	if !ok {
		return nil, workflow.ErrHandoff
	}
	// The published native project is per-generation; Gradle keeps its project
	// state in a stable per-target mirror of the whole generation (sibling
	// contributions keep relative links alive), synced write-if-changed.
	root := filepath.Join(owner.Layout().GeneratedRoot, workspace.MirrorName("android-build", t))
	native := filepath.Join(root, "native")
	if err = os.MkdirAll(native, 0700); err != nil {
		return nil, err
	}
	if err = workspace.SyncDir(root, filepath.Dir(p.NativeDir), nil); err != nil {
		return nil, err
	}
	outputs := filepath.Join(native, "app/build/outputs")
	// Remove only owned compilation output so stale metadata cannot satisfy a new build.
	if err = os.RemoveAll(outputs); err != nil {
		return nil, err
	}
	if o.Format == "aab" {
		task = ":app:xplatBundleMetadata"
		script := filepath.Join(native, "xplat-bundle.init.gradle")
		if err = os.WriteFile(script, []byte(bundleMetadata), 0600); err != nil {
			return nil, err
		}
		args = append(args, "--init-script", script)
	}
	args = append(args, task)
	runner := a.Executor
	if runner == nil {
		runner = process.Runner{}
	}
	var exit process.Exit
	var diagnostic bytes.Buffer
	err = owner.RunHelper(ctx, func(ctx context.Context) error {
		h, e := runner.Start(ctx, process.Command{Executable: filepath.Join(native, "gradlew"), Args: args, Dir: native, Environment: env, Output: func(_ context.Context, _ process.Stream, data []byte) error {
			// Release diagnostics may contain Gradle signing values; never retain them.
			if variant == "debug" && diagnostic.Len() < 1<<20 {
				diagnostic.Write(data[:min(len(data), (1<<20)-diagnostic.Len())])
			}
			return nil
		}})
		if e != nil {
			return e
		}
		exit, e = h.Wait()
		return e
	})
	if err != nil {
		return nil, &Failure{Stage: task, ExitCode: exit.Code, Cause: err, Diagnostic: diagnostic.String()}
	}

	if err = ctx.Err(); err != nil {
		return nil, err
	}
	path, err := discover(outputs, o.Format, variant, pkg.NativeScript.ID, t.Architecture)
	if err != nil {
		return nil, err
	}
	// Report the artifact inside the published generation, as the mirror is
	// internal build state.
	rel, relErr := filepath.Rel(native, path)
	if relErr != nil || rel == "" || strings.HasPrefix(rel, "..") {
		return nil, ErrArtifact
	}
	target := filepath.Join(p.NativeDir, rel)
	if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return nil, err
	}
	in, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer in.Close()
	out, err := os.Create(target)
	if err != nil {
		return nil, err
	}
	_, copyErr := io.Copy(out, in)
	if err := out.Close(); err != nil {
		return nil, err
	}
	if copyErr != nil {
		return nil, copyErr
	}
	return []project.Artifact{{Identity: p.Identity, Path: target, Kind: o.Format, ApplicationID: pkg.NativeScript.ID}}, nil
}

// AGP exposes no standard APK-style metadata for bundles. Record the producer's
// declared output, rather than guessing a bundle filename.
const bundleMetadata = `gradle.projectsEvaluated {
 def app = gradle.rootProject.project(':app')
 app.tasks.register('xplatBundleMetadata') {
  dependsOn app.tasks.named('bundleRelease')
  doLast {
   def files = app.tasks.named('signReleaseBundle').get().outputs.files.files.findAll { it.isFile() && it.name.endsWith('.aab') }
   def dst = new File(app.buildDir, 'outputs/xplat-bundle/output-metadata.json')
   dst.parentFile.mkdirs()
   dst.text = groovy.json.JsonOutput.toJson([applicationId: app.android.defaultConfig.applicationId, variantName:'release', artifactType:[type:'AAB'], elements:files.collect { [outputFile:dst.parentFile.toPath().relativize(it.toPath()).toString()] }])
  }
 }
}
`

func discover(root, format, variant, id, abi string) (string, error) {
	canonical, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", ErrArtifact
	}
	root = canonical
	paths := []string{}
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.Name() != "output-metadata.json" || d.IsDir() {
			return nil
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var m metadata
		if json.Unmarshal(raw, &m) != nil {
			return ErrArtifact
		}
		if m.ArtifactType.Type != strings.ToUpper(format) || m.VariantName != variant {
			return nil
		}
		if m.ApplicationID != id {
			return ErrArtifact
		}
		for _, el := range m.Elements {
			candidate := filepath.Join(filepath.Dir(path), el.OutputFile)
			rel, e := filepath.Rel(root, candidate)
			if e != nil || el.OutputFile == "" || filepath.IsAbs(el.OutputFile) || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.Ext(candidate) != "."+format {
				return ErrArtifact
			}
			real, e := filepath.EvalSymlinks(candidate)
			if e != nil || real != candidate {
				return ErrArtifact
			}
			z, e := zip.OpenReader(candidate)
			if e != nil {
				return ErrArtifact
			}
			manifest, dex, native := false, false, false
			for _, f := range z.File {
				if f.Name == "AndroidManifest.xml" || f.Name == "base/manifest/AndroidManifest.xml" {
					manifest = true
				}
				if f.Name == "classes.dex" || f.Name == "base/dex/classes.dex" {
					dex = true
				}
				if f.Name == "lib/"+abi+"/libNativeScript.so" || f.Name == "base/lib/"+abi+"/libNativeScript.so" {
					native = true
				}
			}
			z.Close()
			if !manifest || !dex || !native {
				return fmt.Errorf("artifact missing manifest, dex or requested runtime ABI: %w", ErrArtifact)
			}
			paths = append(paths, candidate)
		}
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrArtifact, err)
	}
	if len(paths) != 1 {
		return "", fmt.Errorf("%w (found %d)", ErrArtifact, len(paths))
	}
	return paths[0], nil
}
