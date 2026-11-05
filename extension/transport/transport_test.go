package transport

import (
	"bytes"
	"context"
	"errors"
	"github.com/octane-xplat/nativescript-cli/extension"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
	"time"
)

func TestRealGoAndNodeEquivalent(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows external process backend unavailable")
	}
	ctx := context.Background()
	root, _ := filepath.Abs("../..")
	binary := filepath.Join(t.TempDir(), "plugin")
	cmd := exec.Command("go", "build", "-o", binary, "./extension/transport/testdata/goplugin")
	cmd.Dir = root
	if out, e := cmd.CombinedOutput(); e != nil {
		t.Fatalf("%s %v", out, e)
	}
	for _, language := range []string{"direct", "go", "node"} {
		t.Run(language, func(t *testing.T) {
			var logs bytes.Buffer
			var impl extension.Extension
			var close func()
			var e error
			if language == "direct" {
				impl = direct{}
				close = func() {}
			} else if language == "go" {
				impl, close, e = Open(ctx, binary, nil, root, os.Environ(), &logs)
			} else {
				node, e2 := exec.LookPath("node")
				if e2 != nil {
					t.Fatal(e2)
				}
				impl, close, e = OpenNode(ctx, node, filepath.Join(root, "extension/transport/testdata/plugin.cjs"), t.TempDir(), root, os.Environ(), &logs)
			}
			if e != nil {
				t.Fatal(e)
			}
			defer close()
			m, e := impl.Manifest(ctx)
			if e != nil || m.ID != "fixture" || m.API != "1" {
				t.Fatal(m, e)
			}
			out, e := impl.Invoke(ctx, extension.Input{Phase: extension.Collect, Platform: "ios"})
			if e != nil || !reflect.DeepEqual(out.Files, []extension.File{{Path: "hello.txt", Content: "ios"}}) {
				t.Fatal(out, e)
			}
			if _, e = impl.Invoke(ctx, extension.Input{Revision: "fail"}); e == nil {
				t.Fatal("async failure lost")
			}
			out, e = impl.Invoke(ctx, extension.Input{Phase: extension.Collect, Platform: "android", Revision: "native"})
			if e != nil || !reflect.DeepEqual(out.NativeFiles, []extension.NativeFile{{Platform: "android", Kind: "resource", Path: "assets/data.bin", Content: []byte{0, 1, 255}}}) {
				t.Fatal("native binary payload", out, e)
			}
			artifactPath := filepath.Join(t.TempDir(), "app with spaces.apk")
			if e = os.WriteFile(artifactPath, []byte("fixture compiler bytes"), 0600); e != nil {
				t.Fatal(e)
			}
			out, e = impl.Invoke(ctx, extension.Input{Phase: extension.PostBuild, Artifacts: []extension.Artifact{{Path: artifactPath, Kind: "apk", ApplicationID: "org.example.artifact"}}})
			want := artifactPath + "\napk\norg.example.artifact\nfixture compiler bytes"
			if e != nil || !reflect.DeepEqual(out.Files, []extension.File{{Path: "artifact.txt", Content: want}}) {
				t.Fatal("artifact context/read", out, e)
			}
			canceled, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
			defer cancel()
			if _, e = impl.Invoke(canceled, extension.Input{Revision: "cancel"}); !errors.Is(e, context.DeadlineExceeded) {
				t.Fatal(e)
			}
			close()
			if language != "direct" && !bytes.Contains(logs.Bytes(), []byte("initialization log")) {
				t.Fatalf("logs lost: %s", logs.String())
			}
		})
	}
}

type direct struct{}

func (direct) Manifest(context.Context) (extension.Manifest, error) {
	return extension.Manifest{ID: "fixture", API: "1", Version: "1.0.0", Phases: []extension.Phase{extension.Collect, extension.PostBuild}, Required: []string{"generated_files", "build_artifacts", "native_files"}}, nil
}
func (direct) Invoke(ctx context.Context, in extension.Input) (extension.Result, error) {
	if in.Revision == "native" {
		return extension.Result{NativeFiles: []extension.NativeFile{{Platform: in.Platform, Kind: "resource", Path: "assets/data.bin", Content: []byte{0, 1, 255}}}}, nil
	}
	if in.Phase == extension.PostBuild {
		a := in.Artifacts[0]
		data, e := os.ReadFile(a.Path)
		return extension.Result{Files: []extension.File{{Path: "artifact.txt", Content: a.Path + "\n" + a.Kind + "\n" + a.ApplicationID + "\n" + string(data)}}}, e
	}
	if in.Revision == "fail" {
		return extension.Result{}, errors.New("async failure")
	}
	if in.Revision == "cancel" {
		<-ctx.Done()
		return extension.Result{}, ctx.Err()
	}
	return extension.Result{Files: []extension.File{{Path: "hello.txt", Content: in.Platform}}}, nil
}
