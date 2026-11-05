package prepare

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
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

func TestInstalledRuntimeControlsPackageMinimum(t *testing.T) {
	dir, e := filepath.Abs("testdata/runtime")
	if e != nil {
		t.Fatal(e)
	}
	for _, tc := range []struct {
		version, minimum string
		supported        bool
	}{
		{"8.9.0", "8", true}, {"8.9.0", "9.1.0", false}, {"9.1.0", "9.1.0", true},
		{"9.1.0", "9.1.1", false}, {"9.1.1", "9", false},
	} {
		r := project.Resolved{Packages: []project.Package{{Name: "@nativescript/ios", Version: tc.version, Directory: dir}, {Name: "plugin", IOSRequirement: tc.minimum}}}
		e := (Adapter{}).Validate(r, project.Target{Platform: "ios"})
		if (e == nil) != tc.supported {
			t.Fatalf("%+v: %v", tc, e)
		}
	}
}

func TestLocalSwiftEvaluationSurvivesRealHelperPreparation(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("actual Swift manifest evaluation requires Darwin qualification")
	}
	root := t.TempDir()
	app, local := filepath.Join(root, "app"), filepath.Join(root, "Local")
	for _, dir := range []string{app, filepath.Join(local, "Sources")} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	manifest := filepath.Join(local, "Package.swift")
	body := []byte("// swift-tools-version: 5.7\nimport PackageDescription\nlet package = Package(name: \"Evaluated\", products: [.library(name: \"Selected\", targets: [\"Selected\"])], targets: [.target(name: \"Selected\", path: \"Sources\")])\n")
	if err := os.WriteFile(manifest, body, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(local, "Sources/Value.swift"), []byte("public let value = 111\n"), 0600); err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(body)
	digest := hex.EncodeToString(hash[:])
	pkg, _ := filepath.Abs("testdata/runtime")
	assets, _ := filepath.Abs("../../../assets")
	r := project.Resolved{Directory: app, Revision: "evaluation-fixture", ApplicationID: "org.example.evaluation", Packages: []project.Package{{Name: "@nativescript/ios", Version: "8.9.0", Directory: pkg}}, Contributions: []project.Contribution{{Platform: "ios", Kind: "spm", Path: manifest, SPM: &project.SwiftPackage{Name: "Declared", Path: "../Local", Products: []string{"Selected"}}}}, Sources: []project.Source{{Path: manifest, Digest: digest}}}
	layout, err := workspace.NewLayout(filepath.Join(root, "state"), project.Identity{Schema: 1, ProjectDir: app, Revision: r.Revision, Target: project.Target{Platform: "ios", DestinationKind: "simulator", Architecture: "arm64", Configuration: "debug"}})
	if err != nil {
		t.Fatal(err)
	}
	r.Directory = layout.Identity.ProjectDir
	lease, err := workspace.Acquire(context.Background(), layout)
	if err != nil {
		t.Fatal(err)
	}
	defer lease.Release()
	tools := &tool{started: make(chan process.Command, 1)}
	a := Adapter{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS(assets)}, CacheDir: filepath.Join(root, "helper")}, Executor: tools}
	prepared, err := a.Prepare(context.Background(), r, lease)
	if err != nil {
		t.Fatal(err)
	}
	if len(prepared.LocalSwiftPackages) != 1 {
		t.Fatal("missing evaluated manifest")
	}
	e := prepared.LocalSwiftPackages[0]
	var evaluated struct {
		Name     string `json:"name"`
		Products []struct {
			Name string `json:"name"`
		} `json:"products"`
	}
	if err := json.Unmarshal(e.Evaluation, &evaluated); err != nil || evaluated.Name != "Evaluated" || len(evaluated.Products) != 1 || evaluated.Products[0].Name != "Selected" || e.Name != "Declared" || e.Manifest != manifest || e.SourceSHA256 != digest {
		t.Fatalf("evaluation lost or substituted: %v", err)
	}
	if command := <-tools.started; command.Executable != "xcodebuild" {
		t.Fatal("dependency resolution adapter not exercised")
	}
	// The manifest evaluator is real; dependency resolution above is a fixture.
	// A stale source identity must prevent a new prepared handoff and tool start.
	r.Sources[0].Digest = strings.Repeat("0", 64)
	if _, err = a.Prepare(context.Background(), r, lease); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("stale manifest accepted: %v", err)
	}
	if len(tools.started) != 0 {
		t.Fatal("dependency tool started after stale input rejection")
	}
}
