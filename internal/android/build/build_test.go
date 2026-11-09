package build

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

type done struct{ err error }

func (d done) Wait() (process.Exit, error) { return process.Exit{Code: 23}, d.err }
func (d done) Close(context.Context) error { return nil }

type tool struct {
	cmd                     process.Command
	missing, multiple, fail bool
	format                  string
}

func (f *tool) Start(ctx context.Context, c process.Command) (process.Handle, error) {
	f.cmd = c
	if f.fail {
		return done{errors.New("compile failed")}, nil
	}
	if f.missing {
		return done{}, nil
	}
	root := filepath.Join(c.Dir, "app/build/outputs/odd layout")
	os.MkdirAll(root, 0700)
	name := "producer-chosen." + f.format
	zf, _ := os.Create(filepath.Join(root, name))
	z := zip.NewWriter(zf)
	prefix := ""
	manifest := "AndroidManifest.xml"
	dex := "classes.dex"
	if f.format == "aab" {
		prefix = "base/"
		manifest = "base/manifest/AndroidManifest.xml"
		dex = "base/dex/classes.dex"
	}
	for _, n := range []string{manifest, dex, prefix + "lib/arm64-v8a/libNativeScript.so"} {
		w, _ := z.Create(n)
		w.Write([]byte("fixture only"))
	}
	z.Close()
	zf.Close()
	variant := "debug"
	if slices.Contains(c.Args, "-Prelease") {
		variant = "release"
	}
	m := map[string]any{"applicationId": "org.example.app", "variantName": variant, "artifactType": map[string]string{"type": strings.ToUpper(f.format)}, "elements": []map[string]string{{"outputFile": name}}}
	if f.multiple {
		m["elements"] = []map[string]string{{"outputFile": name}, {"outputFile": name}}
	}
	b, _ := json.Marshal(m)
	os.WriteFile(filepath.Join(root, "output-metadata.json"), b, 0600)
	return done{}, nil
}
func fixture(t *testing.T) (project.Prepared, project.Bundle, workspace.Lease) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("Windows process/workspace execution unavailable")
	}
	dir := t.TempDir()
	id := project.Identity{Schema: 1, Revision: "fixture-v1", ProjectDir: dir, Target: project.Target{Platform: "android", Configuration: "debug", DestinationKind: "simulator", DestinationID: "generic", Architecture: "arm64-v8a"}}
	layout, e := workspace.NewLayout(filepath.Join(dir, "state"), id)
	if e != nil {
		t.Fatal(e)
	}
	l, e := (workspace.Manager{}).Acquire(context.Background(), layout)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { l.Release() })
	native := filepath.Join(dir, "native with spaces")
	os.MkdirAll(native, 0700)
	os.WriteFile(filepath.Join(native, "package.json"), []byte(`{"nativescript":{"id":"org.example.app"}}`), 0600)
	p := project.Prepared{Identity: l.Layout().Identity, NativeDir: native, BundleDir: filepath.Join(native, "bundle")}
	return p, project.Bundle{Identity: p.Identity, Directory: p.BundleDir, Entry: filepath.Join(p.BundleDir, "bundle.mjs")}, l
}
func TestVariantsSigningMetadataAndFailures(t *testing.T) {
	for _, tc := range []struct {
		name, format                     string
		release, missing, multiple, fail bool
	}{
		{"debug", "apk", false, false, false, false}, {"release", "apk", true, false, false, false}, {"bundle", "aab", true, false, false, false},
		{"missing", "apk", false, true, false, false}, {"multiple", "apk", false, false, true, false}, {"failure", "apk", false, false, false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p, b, l := fixture(t)
			// Use a lease with the release identity, preserving the exact handoff.
			if tc.release {
				l.Release()
				layout := l.Layout()
				layout.Identity.Target.Configuration = "release"
				layout, _ = workspace.NewLayout(filepath.Join(t.TempDir(), "release"), layout.Identity)
				var e error
				l, e = (workspace.Manager{}).Acquire(context.Background(), layout)
				if e != nil {
					t.Fatal(e)
				}
				defer l.Release()
				p.Identity = l.Layout().Identity
				b.Identity = p.Identity
			}
			f := &tool{format: tc.format, missing: tc.missing, multiple: tc.multiple, fail: tc.fail}
			a := Adapter{Executor: f, Options: Options{Format: tc.format}}
			if tc.release {
				key := filepath.Join(t.TempDir(), "caller.keystore")
				os.WriteFile(key, []byte("fixture"), 0600)
				a.Options = Options{Format: tc.format, Keystore: key, Alias: "caller", StorePasswordEnv: "STORE", KeyPasswordEnv: "KEY"}
				a.Environment = map[string]string{"STORE": "secret-store", "KEY": "secret-key"}
			}
			artifacts, e := a.Compile(context.Background(), p, b, l)
			if tc.fail {
				var failure *Failure
				if !errors.As(e, &failure) || failure.ExitCode != 23 {
					t.Fatal(e)
				}
				return
			}
			if tc.missing || tc.multiple {
				if !errors.Is(e, ErrArtifact) {
					t.Fatal(e)
				}
				return
			}
			if e != nil || len(artifacts) != 1 || !strings.Contains(artifacts[0].Path, "producer-chosen") {
				t.Fatal(artifacts, e)
			}
			if filepath.Base(f.cmd.Dir) != "native" || !strings.Contains(f.cmd.Dir, "android-build-") || f.cmd.Executable != filepath.Join(f.cmd.Dir, "gradlew") || !slices.Contains(f.cmd.Args, "--no-daemon") {
				t.Fatal(f.cmd)
			}
			if tc.release && (strings.Contains(strings.Join(f.cmd.Args, " "), "secret") || f.cmd.Environment["ORG_GRADLE_PROJECT_password"] != "secret-key") {
				t.Fatal("signing transport")
			}
			// A successful tool that produces nothing must not reuse old output.
			f.missing = true
			if _, e = a.Compile(context.Background(), p, b, l); !errors.Is(e, ErrArtifact) {
				t.Fatal(e)
			}
		})
	}
}
func TestSigningAndCancellation(t *testing.T) {
	p, b, l := fixture(t)
	a := Adapter{Options: Options{Keystore: "unrequested"}}
	if _, e := a.Compile(context.Background(), p, b, l); !errors.Is(e, ErrSigning) {
		t.Fatal(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := a.Compile(ctx, p, b, l); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	if _, e := a.Compile(context.Background(), p, b, nil); e == nil {
		t.Fatal("missing ownership")
	}
}
func TestMetadataRejectsEscapeAndWrongIdentity(t *testing.T) {
	root := t.TempDir()
	for _, body := range []string{
		`{"applicationId":"wrong","variantName":"debug","artifactType":{"type":"APK"}}`,
		`{"applicationId":"org.example.app","variantName":"debug","artifactType":{"type":"APK"},"elements":[{"outputFile":"../escape.apk"}]}`,
		`not json`,
	} {
		os.WriteFile(filepath.Join(root, "output-metadata.json"), []byte(body), 0600)
		if _, e := discover(root, "apk", "debug", "org.example.app", "arm64-v8a"); !errors.Is(e, ErrArtifact) {
			t.Fatal(e)
		}
	}
}

func TestReleaseRejectsMissingSigningBeforeLaunch(t *testing.T) {
	p, b, l := fixture(t)
	l.Release()
	id := p.Identity
	id.Target.Configuration = "release"
	layout, e := workspace.NewLayout(filepath.Join(t.TempDir(), "release"), id)
	if e != nil {
		t.Fatal(e)
	}
	lease, e := (workspace.Manager{}).Acquire(context.Background(), layout)
	if e != nil {
		t.Fatal(e)
	}
	defer lease.Release()
	p.Identity = layout.Identity
	b.Identity = p.Identity
	f := &tool{format: "apk"}
	if _, e = (Adapter{Executor: f}).Compile(context.Background(), p, b, lease); !errors.Is(e, ErrSigning) {
		t.Fatal(e)
	}
	if f.cmd.Executable != "" {
		t.Fatal("launched without signing")
	}
}

func TestHookTransformsActualGradleArguments(t *testing.T) {
	p, b, l := fixture(t)
	f := &tool{format: "apk"}
	adapter := Adapter{Executor: f, Arguments: func(ctx context.Context, actual project.Prepared, args []string, lease workspace.Lease) ([]string, error) {
		if actual.NativeDir == p.NativeDir || lease != l {
			t.Fatal("wrong build-mirror context")
		}
		return append(args, "--offline"), nil
	}}
	if _, err := adapter.Compile(context.Background(), p, b, l); err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(f.cmd.Args, "--offline") {
		t.Fatal("hook arguments discarded", f.cmd.Args)
	}
}
