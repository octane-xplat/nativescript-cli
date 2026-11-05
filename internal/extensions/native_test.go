package extensions

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

func TestNativeValidationIdentityAndImmutableInputs(t *testing.T) {
	ctx := context.Background()
	input := NativeInput{Owner: "a", Version: "1.0.0", File: extension.NativeFile{Platform: "android", Kind: "source", Path: "Hello.java", Content: []byte("class Hello {}")}}
	for _, file := range []extension.NativeFile{
		{Platform: "android", Kind: "source", Path: "../Hello.java"}, {Platform: "ios", Kind: "source", Path: "Hello.swift"}, {Platform: "android", Kind: "resource", Path: "C:stream"}, {Platform: "android", Kind: "source", Path: "Hello.bin"}, {Platform: "android", Kind: "source", Path: "Hello.JAVA"}, {Platform: "android", Kind: "library", Path: "lib.JAR"},
	} {
		bad := input
		bad.File = file
		if _, err := NormalizeNative([]NativeInput{bad}, "android"); !errors.Is(err, ErrNativeInput) {
			t.Fatal("invalid input accepted", file, err)
		}
	}
	caseCollision := input
	caseCollision.File.Path = "hello.java"
	if _, err := NormalizeNative([]NativeInput{input, caseCollision}, "android"); err == nil {
		t.Fatal("case collision accepted")
	}
	inputs, err := NormalizeNative([]NativeInput{input}, "android")
	if err != nil {
		t.Fatal(err)
	}
	revision := NativeRevision("base", inputs)
	changed := input
	changed.Version = "2.0.0"
	if revision == "base" || revision == NativeRevision("base", []NativeInput{changed}) || NativeRevision("base", nil) != "base" {
		t.Fatal("native identity missing")
	}
	dir := t.TempDir()
	layout, err := workspace.NewLayout(filepath.Join(dir, "state"), project.Identity{Schema: 1, Revision: revision, ProjectDir: dir, Target: project.Target{Platform: "android", Configuration: "debug", DestinationKind: "simulator", DestinationID: "generic", Architecture: "arm64-v8a"}})
	if err != nil {
		t.Fatal(err)
	}
	lease, err := workspace.Acquire(ctx, layout)
	if err != nil {
		t.Fatal(err)
	}
	defer lease.Release()
	r := project.Resolved{Directory: layout.Identity.ProjectDir, Revision: revision, SourceRevision: "base"}
	materialized, err := MaterializeNative(ctx, r, lease, inputs)
	if err != nil {
		t.Fatal(err)
	}
	if len(materialized.Contributions) != 1 || len(materialized.Sources) != 1 || len(materialized.ExtensionNative) != 1 {
		t.Fatal("missing native source handoff", materialized)
	}
	digest := materialized.ExtensionNative[0]
	if digest.Owner != input.Owner || digest.Version != input.Version || digest.Platform != input.File.Platform || digest.Kind != input.File.Kind || digest.Path != input.File.Path || digest.SHA256 != materialized.Sources[0].Digest {
		t.Fatal("canonical native input handoff", digest)
	}
	file := materialized.Contributions[0].Path
	if data, err := os.ReadFile(file); err != nil || string(data) != "class Hello {}" {
		t.Fatal(string(data), err)
	}
	if _, err = MaterializeNative(ctx, r, lease, inputs); err != nil {
		t.Fatal("idempotence", err)
	}
	if err = os.WriteFile(file, []byte("tampered"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = MaterializeNative(ctx, r, lease, inputs); !errors.Is(err, ErrNativeInput) {
		t.Fatal("changed immutable input reused", err)
	}
	if data, _ := os.ReadFile(file); string(data) != "tampered" {
		t.Fatal("unowned change overwritten")
	}
}

type nativeFixture struct {
	m      extension.Manifest
	output extension.Result
}

func (f nativeFixture) Manifest(context.Context) (extension.Manifest, error) { return f.m, nil }
func (f nativeFixture) Invoke(context.Context, extension.Input) (extension.Result, error) {
	return f.output, nil
}
func TestNativeCapabilityPhaseAndFailure(t *testing.T) {
	m := manifest("native")
	output := extension.Result{NativeFiles: []extension.NativeFile{{Platform: "ios", Kind: "source", Path: "Hello.swift", Content: []byte("class Hello {}")}}}
	r, err := New(context.Background(), []extension.Extension{nativeFixture{m, output}}, "ios")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = r.Invoke(context.Background(), extension.Input{Phase: extension.Collect, Platform: "ios"}); err == nil {
		t.Fatal("undeclared native capability accepted")
	}
	m.Required = []string{"native_files"}
	m.Phases = []extension.Phase{extension.Collect, extension.Prepared}
	r, err = New(context.Background(), []extension.Extension{nativeFixture{m, output}}, "ios")
	if err != nil {
		t.Fatal(err)
	}
	if result, err := r.Invoke(context.Background(), extension.Input{Phase: extension.Collect, Platform: "ios"}); err != nil || len(result.Native) != 1 {
		t.Fatal(result, err)
	}
	if _, err = r.Invoke(context.Background(), extension.Input{Phase: extension.Prepared, Platform: "ios"}); err == nil {
		t.Fatal("late native contribution accepted")
	}
}
