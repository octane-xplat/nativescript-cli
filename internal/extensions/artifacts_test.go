package extensions

import (
	"context"
	"errors"
	"testing"

	"github.com/octane-xplat/nativescript-cli/extension"
)

type contextFixture struct {
	m      extension.Manifest
	invoke func(extension.Input) error
}

func (f contextFixture) Manifest(context.Context) (extension.Manifest, error) { return f.m, nil }
func (f contextFixture) Invoke(_ context.Context, in extension.Input) (extension.Result, error) {
	return extension.Result{}, f.invoke(in)
}

func TestArtifactCapabilityAndInputIsolation(t *testing.T) {
	ctx := context.Background()
	m := manifest("a")
	m.Required = []string{"build_artifacts"}
	if _, err := New(ctx, []extension.Extension{contextFixture{m: m}}, "ios"); err == nil {
		t.Fatal("capability accepted without post_build")
	}
	m.Phases = []extension.Phase{extension.PostBuild}
	n := m
	n.ID = "b"
	n.After = []string{"a"}
	calls := 0
	r, err := New(ctx, []extension.Extension{
		contextFixture{m: m, invoke: func(in extension.Input) error {
			calls++
			in.Artifacts[0].Path = "mutated"
			in.Pins[0].Name = "mutated"
			return nil
		}},
		contextFixture{m: n, invoke: func(in extension.Input) error {
			calls++
			if in.Artifacts[0].Path != "/owned/artifact" || in.Pins[0].Name != "runtime" {
				return errors.New("another handler contaminated input")
			}
			return nil
		}},
	}, "ios")
	if err != nil {
		t.Fatal(err)
	}
	in := extension.Input{Phase: extension.PostBuild, Artifacts: []extension.Artifact{{Path: "/owned/artifact"}}, Pins: []extension.Pin{{Name: "runtime"}}}
	if _, err = r.Invoke(ctx, in); err != nil {
		t.Fatal(err)
	}
	if calls != 2 || in.Artifacts[0].Path != "/owned/artifact" || in.Pins[0].Name != "runtime" {
		t.Fatal("caller input changed", in, calls)
	}
	in.Phase = extension.Collect
	if _, err = r.Invoke(ctx, in); err == nil || calls != 2 {
		t.Fatal("artifact context escaped post_build", err, calls)
	}
}
