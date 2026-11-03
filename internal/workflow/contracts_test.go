package workflow

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

type fixtureLease struct {
	layout    workspace.Layout
	released  atomic.Bool
	childDone *atomic.Bool
}

func (l *fixtureLease) Layout() workspace.Layout { return l.layout }
func (l *fixtureLease) Release() error {
	if !l.childDone.Load() {
		return errors.New("child still owns workspace")
	}
	l.released.Store(true)
	return nil
}

type fixtureStages struct {
	prepared project.Prepared
	bundle   project.Bundle
	artifact project.Artifact
}

func (f fixtureStages) Resolve(_ context.Context, dir string) (project.Resolved, error) {
	return project.Resolved{Directory: dir, Revision: f.prepared.Identity.Revision, ApplicationID: f.artifact.ApplicationID}, nil
}
func (f fixtureStages) Prepare(_ context.Context, r project.Resolved, l workspace.Lease) (project.Prepared, error) {
	if r.Directory != l.Layout().Identity.ProjectDir {
		return project.Prepared{}, errors.New("wrong lease")
	}
	return f.prepared, nil
}
func (f fixtureStages) Bundle(_ context.Context, r project.Resolved, p project.Prepared, _ workspace.Lease) (project.Bundle, error) {
	if r.Revision != p.Identity.Revision {
		return project.Bundle{}, errors.New("stale source")
	}
	return f.bundle, nil
}
func (f fixtureStages) Compile(_ context.Context, p project.Prepared, b project.Bundle, _ workspace.Lease) ([]project.Artifact, error) {
	if !p.Identity.Compatible(b.Identity) {
		return nil, errors.New("incompatible bundle")
	}
	return []project.Artifact{f.artifact}, nil
}

var _ Resolver = fixtureStages{}
var _ Preparer = fixtureStages{}
var _ Bundler = fixtureStages{}
var _ Compiler = fixtureStages{}

func TestStageFixtureHandoffs(t *testing.T) {
	data, err := os.ReadFile("../project/testdata/stages.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []project.Prepared
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	data, err = os.ReadFile("../project/testdata/devices.json")
	if err != nil {
		t.Fatal(err)
	}
	var devices []project.Device
	if err = json.Unmarshal(data, &devices); err != nil {
		t.Fatal(err)
	}
	data, err = os.ReadFile("../project/testdata/outputs.json")
	if err != nil {
		t.Fatal(err)
	}
	var outputs []struct {
		Bundle   project.Bundle
		Artifact project.Artifact
	}
	if err = json.Unmarshal(data, &outputs); err != nil {
		t.Fatal(err)
	}
	if len(fixtures) != 2 || len(outputs) != 2 || len(devices) != 2 {
		t.Fatal("missing fixtures")
	}
	for i, p := range fixtures {
		t.Run(p.Identity.Target.Platform, func(t *testing.T) {
			f := fixtureStages{p, outputs[i].Bundle, outputs[i].Artifact}
			done := &atomic.Bool{}
			done.Store(true)
			lease := &fixtureLease{layout: workspace.Layout{Identity: p.Identity, GeneratedRoot: filepath.Dir(p.NativeDir), BundleStaging: p.BundleDir}, childDone: done}
			ctx := context.Background()
			r, err := f.Resolve(ctx, p.Identity.ProjectDir)
			if err != nil {
				t.Fatal(err)
			}
			prepared, err := f.Prepare(ctx, r, lease)
			if err != nil {
				t.Fatal(err)
			}
			bundle, err := f.Bundle(ctx, r, prepared, lease)
			if err != nil {
				t.Fatal(err)
			}
			artifacts, err := f.Compile(ctx, prepared, bundle, lease)
			if err != nil {
				t.Fatal(err)
			}
			if !artifacts[0].Identity.Compatible(p.Identity) || devices[i].ID != p.Identity.Target.DestinationID {
				t.Fatal("handoff identity lost")
			}
			bundle.Identity.Target.Configuration = "wrong"
			if _, err = f.Compile(ctx, prepared, bundle, lease); err == nil {
				t.Fatal("accepted stale bundle")
			}
			if err = lease.Release(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
func TestSessionOwnsCleanupBeforeCompletion(t *testing.T) {
	childDone := &atomic.Bool{}
	lease := &fixtureLease{childDone: childDone}
	started := make(chan struct{})
	cleanup := make(chan struct{})
	cancelled := make(chan struct{})
	unrelatedStopped := make(chan struct{})
	unrelated := StartSession(context.Background(), func(ctx context.Context) error { <-ctx.Done(); close(unrelatedStopped); return ctx.Err() })
	defer unrelated.Close(context.Background())
	s := StartSession(context.Background(), func(ctx context.Context) error {
		close(started)
		<-ctx.Done()
		close(cancelled)
		<-cleanup
		childDone.Store(true)
		if err := lease.Release(); err != nil {
			return err
		}
		return ctx.Err()
	})
	<-started
	timeout, cancel := context.WithCancel(context.Background())
	cancel()
	if err := s.Close(timeout); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	<-cancelled
	if lease.released.Load() {
		t.Fatal("lease released before owned descendant completion")
	}
	waited := make(chan error, 1)
	go func() { waited <- s.Wait() }()
	select {
	case <-waited:
		t.Fatal("premature completion")
	default:
	}
	close(cleanup)
	if err := <-waited; !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	for range 2 {
		if err := s.Close(context.Background()); !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	}
	select {
	case <-unrelatedStopped:
		t.Fatal("unrelated session stopped")
	default:
	}
	if !lease.released.Load() {
		t.Fatal("ownership violation")
	}
}
func TestSessionParentCancellationAndFailure(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	s := StartSession(ctx, func(ctx context.Context) error { <-ctx.Done(); return ctx.Err() })
	cancel()
	if !errors.Is(s.Wait(), context.Canceled) {
		t.Fatal("lost cancellation")
	}
	cause := errors.New("fixture work failed")
	s = StartSession(context.Background(), func(context.Context) error { return cause })
	if !errors.Is(s.Wait(), cause) || !errors.Is(s.Close(context.Background()), cause) {
		t.Fatal("lost failure")
	}
}

func TestConcurrentSessionClose(t *testing.T) {
	var cleanupCount atomic.Int32
	s := StartSession(context.Background(), func(ctx context.Context) error { <-ctx.Done(); cleanupCount.Add(1); return ctx.Err() })
	results := make(chan error, 8)
	for range 8 {
		go func() { results <- s.Close(context.Background()) }()
	}
	for range 8 {
		if err := <-results; !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	}
	if cleanupCount.Load() != 1 {
		t.Fatal("cleanup repeated")
	}
}
