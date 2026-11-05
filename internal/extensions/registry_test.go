package extensions

import (
	"context"
	"errors"
	"github.com/octane-xplat/nativescript-cli/extension"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

type fixture struct {
	m     extension.Manifest
	fail  error
	order *[]string
	files []extension.File
}

func (f fixture) Manifest(context.Context) (extension.Manifest, error) { return f.m, nil }
func (f fixture) Invoke(ctx context.Context, in extension.Input) (extension.Result, error) {
	if f.order != nil {
		*f.order = append(*f.order, f.m.ID)
	}
	if f.fail != nil {
		return extension.Result{}, f.fail
	}
	return extension.Result{Files: f.files}, ctx.Err()
}
func manifest(id string) extension.Manifest {
	return extension.Manifest{ID: id, Version: "1.0.0", API: "1", Phases: []extension.Phase{extension.Collect}}
}
func TestOrderValidationOwnershipAndFailures(t *testing.T) {
	ctx := context.Background()
	var order []string
	a, b := manifest("a"), manifest("b")
	a.After = []string{"b"}
	r, e := New(ctx, []extension.Extension{fixture{m: a, order: &order}, fixture{m: b, order: &order}}, "ios")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = r.Invoke(ctx, extension.Input{Phase: extension.Collect}); e != nil || !reflect.DeepEqual(order, []string{"b", "a"}) {
		t.Fatal(order, e)
	}
	for _, change := range []func(*extension.Manifest){func(m *extension.Manifest) { m.API = "2" }, func(m *extension.Manifest) { m.Required = []string{"inject_services"} }, func(m *extension.Manifest) { m.After = []string{"a"} }} {
		m := manifest("a")
		change(&m)
		if _, e = New(ctx, []extension.Extension{fixture{m: m}}, "ios"); e == nil {
			t.Fatal("invalid graph accepted")
		}
	}
	r, _ = New(ctx, []extension.Extension{fixture{m: b, files: []extension.File{{Path: "../../escape"}}}}, "ios")
	if _, e = r.Invoke(ctx, extension.Input{Phase: extension.Collect}); e == nil {
		t.Fatal("path escaped")
	}
	r, _ = New(ctx, []extension.Extension{fixture{m: b, fail: errors.New("async failure")}}, "ios")
	if f, e := r.Invoke(ctx, extension.Input{Phase: extension.Collect}); e == nil || len(f.Files) != 0 || len(f.Native) != 0 {
		t.Fatal(f, e)
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if _, e = r.Invoke(canceled, extension.Input{Phase: extension.Collect}); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	root := t.TempDir()
	if e = Apply(ctx, root, []extension.File{{Path: "b/hello", Content: "hello"}}); e != nil {
		t.Fatal(e)
	}
	if e = Apply(ctx, root, nil); e != nil {
		t.Fatal(e)
	}
	if _, e = os.Stat(filepath.Join(root, ".nativescript-extensions/b/hello")); !os.IsNotExist(e) {
		t.Fatal("stale file", e)
	}
}
