package nativescript_test

import (
	"context"
	"fmt"
	ns "github.com/octane-xplat/nativescript-cli"
	"github.com/octane-xplat/nativescript-cli/extension"
	"os"
	"path/filepath"
	"testing"
)

type registered struct {
	bad   bool
	calls *[]extension.Phase
}

func (f registered) Manifest(context.Context) (extension.Manifest, error) {
	m := extension.Manifest{ID: "example", API: "1", Version: "1.0.0", Phases: []extension.Phase{extension.Collect, extension.Prepared}}
	if f.bad {
		m.Required = []string{"ota_fingerprint"}
	}
	return m, nil
}
func (f registered) Invoke(_ context.Context, in extension.Input) (extension.Result, error) {
	*f.calls = append(*f.calls, in.Phase)
	if len(in.Pins) == 0 {
		return extension.Result{}, fmt.Errorf("missing native pins")
	}
	return extension.Result{Files: []extension.File{{Path: string(in.Phase) + ".txt", Content: in.Platform}}}, nil
}
func TestExtensionRealResolveAndPreparationProducers(t *testing.T) {
	for _, platform := range []string{"ios", "android"} {
		t.Run(platform, func(t *testing.T) {
			var q ns.PrepareRequest
			if platform == "ios" {
				_, _, q = prepareApp(t, false)
			} else {
				_, _, q = androidApp(t, false)
			}
			var calls []extension.Phase
			c, _ := ns.New(ns.Options{Extensions: []extension.Extension{registered{calls: &calls}}})
			p, e := c.Prepare(context.Background(), q)
			if e != nil {
				t.Fatal(e)
			}
			for _, phase := range []string{"collect", "prepared"} {
				b, e := os.ReadFile(filepath.Join(p.NativeDir, ".nativescript-extensions/example", phase+".txt"))
				if e != nil || string(b) != platform {
					t.Fatal(string(b), e)
				}
			}
			if _, e = c.Prepare(context.Background(), q); e != nil {
				t.Fatal("idempotence", e)
			}
			q.OutputDir = filepath.Join(t.TempDir(), "absent")
			c, _ = ns.New(ns.Options{Extensions: []extension.Extension{registered{bad: true, calls: &calls}}})
			if _, e = c.Prepare(context.Background(), q); e == nil {
				t.Fatal("required unsupported accepted")
			}
			if _, e = os.Stat(q.OutputDir); !os.IsNotExist(e) {
				t.Fatal("partial mutation", e)
			}
		})
	}
}
