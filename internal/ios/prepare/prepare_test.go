package prepare

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

type tool struct {
	started chan process.Command
	release chan struct{}
	failure error
}
type handle struct {
	ctx  context.Context
	tool *tool
}

func (p *tool) Start(ctx context.Context, c process.Command) (process.Handle, error) {
	p.started <- c
	return handle{ctx, p}, nil
}
func (h handle) Wait() (process.Exit, error) {
	if h.tool.release != nil {
		<-h.tool.release
	}
	return process.Exit{}, h.tool.failure
}
func (h handle) Close(context.Context) error { return nil }
func TestDependencyToolRetainsLeaseUntilRetirement(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("Darwin dependency tools only")
	}
	root := t.TempDir()
	native := filepath.Join(root, "Podfile")
	os.WriteFile(native, []byte("# component fixture"), 0600)
	pkg, _ := filepath.Abs("testdata/runtime")
	assets, _ := filepath.Abs("../../../assets")
	r := project.Resolved{Directory: root, Revision: "fixture", ApplicationID: "org.example.fixture", Packages: []project.Package{{Name: "@nativescript/ios", Version: "8.9.0", Directory: pkg}}, Contributions: []project.Contribution{{Platform: "ios", Kind: "pods", Path: native}}}
	layout, err := workspace.NewLayout(t.TempDir(), project.Identity{Schema: 1, ProjectDir: root, Revision: r.Revision, Target: project.Target{Platform: "ios", DestinationKind: "simulator", Architecture: "arm64", Configuration: "debug"}})
	if err != nil {
		t.Fatal(err)
	}
	r.Directory = layout.Identity.ProjectDir
	lease, err := workspace.Acquire(context.Background(), layout)
	if err != nil {
		t.Fatal(err)
	}
	p := &tool{started: make(chan process.Command, 1), release: make(chan struct{}), failure: errors.New("dependency failure")}
	a := Adapter{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS(assets)}, CacheDir: t.TempDir()}, Executor: p}
	done := make(chan error, 1)
	go func() { _, err := a.Prepare(context.Background(), r, lease); done <- err }()
	select {
	case c := <-p.started:
		if c.Executable != "pod" || len(c.Args) != 1 || c.Args[0] != "install" || c.Dir != filepath.Join(layout.GeneratedRoot, "ios") {
			t.Fatal(c)
		}
	case err := <-done:
		t.Fatal("preparation failed before tool start", err)
	case <-time.After(10 * time.Second):
		t.Fatal("tool did not start")
	}
	released := make(chan error, 1)
	go func() { released <- lease.Release() }()
	select {
	case <-released:
		t.Fatal("released while dependency tool owns files")
	case <-time.After(50 * time.Millisecond):
	}
	close(p.release)
	if err := <-done; !errors.Is(err, p.failure) {
		t.Fatal(err)
	}
	if err := <-released; err != nil {
		t.Fatal(err)
	}
	replacement, err := workspace.Acquire(context.Background(), layout)
	if err != nil {
		t.Fatal(err)
	}
	replacement.Release()
}
