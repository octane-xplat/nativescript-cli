package nativescript

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func fixture(t *testing.T) (BuildRequest, project.Prepared) {
	t.Helper()
	data, err := os.ReadFile("internal/project/testdata/stages.json")
	if err != nil {
		t.Fatal(err)
	}
	var stages []project.Prepared
	if err = json.Unmarshal(data, &stages); err != nil {
		t.Fatal(err)
	}
	p := stages[0]
	root := t.TempDir()
	p.Identity.ProjectDir = filepath.Join(root, "My App")
	p.NativeDir = filepath.Join(root, "native outputs", "App.xcodeproj")
	p.BundleDir = filepath.Join(root, "bundle outputs")
	return BuildRequest{ProjectDir: p.Identity.ProjectDir, OutputDir: filepath.Join(root, "outputs"), Target: publicIdentity(p.Identity).Target}, p
}
func TestFixtureBuildBoundary(t *testing.T) {
	r, p := fixture(t)
	env := map[string]string{"FIXTURE": "original"}
	var seq []uint64
	c, _ := New(Options{Environment: env, Sink: func(_ context.Context, e Event) error { seq = append(seq, e.Sequence); return nil }})
	env["FIXTURE"] = "changed"
	c.build = func(_ context.Context, got BuildRequest, environment map[string]string) (project.Prepared, []project.Artifact, error) {
		if !reflect.DeepEqual(got, r) || environment["FIXTURE"] != "original" {
			t.Fatal("request/environment ownership")
		}
		environment["FIXTURE"] = "backend mutation"
		return p, []project.Artifact{{Identity: p.Identity, Path: filepath.Join(r.OutputDir, "My App.app"), Kind: "app"}}, nil
	}
	for range 2 {
		result, err := c.Build(context.Background(), r)
		if err != nil || result.Artifacts[0].Identity != result.Prepared.Identity {
			t.Fatalf("%+v %v", result, err)
		}
	}
	if !reflect.DeepEqual(seq, []uint64{1, 2, 1, 2}) {
		t.Fatal(seq)
	}
	c.build = func(context.Context, BuildRequest, map[string]string) (project.Prepared, []project.Artifact, error) {
		a := project.Artifact{Identity: p.Identity, Path: filepath.Join(r.OutputDir, "stale.app")}
		a.Identity.Target.DestinationID = "other"
		return p, []project.Artifact{a}, nil
	}
	if _, err := c.Build(context.Background(), r); !errors.Is(err, ErrBuild) {
		t.Fatal(err)
	}
}
func TestSinkBackpressureFailureReentry(t *testing.T) {
	r, p := fixture(t)
	entered, release, advanced := make(chan struct{}), make(chan struct{}), make(chan struct{}, 1)
	c, _ := New(Options{Sink: func(context.Context, Event) error { close(entered); <-release; return nil }})
	c.build = func(context.Context, BuildRequest, map[string]string) (project.Prepared, []project.Artifact, error) {
		advanced <- struct{}{}
		return p, nil, nil
	}
	done := make(chan struct{})
	go func() { defer close(done); _, _ = c.Build(context.Background(), r) }()
	<-entered
	select {
	case <-advanced:
		t.Fatal("advanced before sink returned")
	default:
	}
	close(release)
	<-done
	cause := errors.New("sink fixture failure")
	count := 0
	c.options.Sink = func(ctx context.Context, e Event) error {
		count++
		_, err := c.Resolve(ctx, ResolveRequest{})
		if !errors.Is(err, ErrUnavailable) {
			t.Fatal(err)
		}
		return cause
	}
	_, err := c.Build(context.Background(), r)
	if !errors.Is(err, ErrSink) || !errors.Is(err, cause) || count != 1 {
		t.Fatal(err, count)
	}
	// Reenter the same operation with a bounded callback, proving no callback mutex.
	c.build = func(context.Context, BuildRequest, map[string]string) (project.Prepared, []project.Artifact, error) {
		return p, nil, nil
	}
	c.options.Sink = nil
	depth := 0
	c.options.Sink = func(ctx context.Context, e Event) error {
		if depth == 0 {
			depth++
			_, _ = c.Build(ctx, r)
			depth--
		}
		return nil
	}
	timeout := time.AfterFunc(5*time.Second, func() { panic("callback reentry deadlock") })
	defer timeout.Stop()
	_, _ = c.Build(context.Background(), r)
}
func TestUnavailableAndCancellation(t *testing.T) {
	c, _ := New(Options{})
	ctx := context.Background()
	r, _ := fixture(t)
	_, err := c.Build(ctx, r)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatal(err)
	}
	_, err = c.Resolve(ctx, ResolveRequest{})
	if !errors.Is(err, ErrUnavailable) {
		t.Fatal(err)
	}
	_, err = c.Prepare(ctx, PrepareRequest{})
	if !errors.Is(err, ErrUnavailable) {
		t.Fatal(err)
	}
	_, err = c.Devices(ctx, DeviceQuery{})
	if !errors.Is(err, ErrUnavailable) {
		t.Fatal(err)
	}
	s, err := c.Run(ctx, RunRequest{})
	if s != nil || !errors.Is(err, ErrUnavailable) {
		t.Fatal(s, err)
	}
	ctx, cancel := context.WithCancel(ctx)
	cancel()
	_, err = c.Build(ctx, r)
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	_, err = c.Build(context.Background(), BuildRequest{})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatal(err)
	}
}

func TestBuildFailureAndTerminalSinkFailure(t *testing.T) {
	r, p := fixture(t)
	cause := errors.New("fixture failure")
	var kinds []EventKind
	c, _ := New(Options{Sink: func(_ context.Context, e Event) error { kinds = append(kinds, e.Kind); return nil }})
	c.build = func(context.Context, BuildRequest, map[string]string) (project.Prepared, []project.Artifact, error) {
		return project.Prepared{}, nil, cause
	}
	if _, err := c.Build(context.Background(), r); !errors.Is(err, ErrBuild) || !errors.Is(err, cause) {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(kinds, []EventKind{StageStarted}) {
		t.Fatal(kinds)
	}
	c.build = func(context.Context, BuildRequest, map[string]string) (project.Prepared, []project.Artifact, error) {
		return p, []project.Artifact{{Identity: p.Identity, Path: filepath.Join(r.OutputDir, "My App.app")}}, nil
	}
	c.options.Sink = func(_ context.Context, e Event) error {
		if e.Kind == StageCompleted {
			return cause
		}
		return nil
	}
	result, err := c.Build(context.Background(), r)
	if !errors.Is(err, ErrSink) || !errors.Is(err, cause) || len(result.Artifacts) != 0 {
		t.Fatal(result, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	c.options.Sink = func(context.Context, Event) error { cancel(); return nil }
	if _, err = c.Build(ctx, r); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}
