package prepare

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
)

func TestCopyRejectsSymlinksAndCancellation(t *testing.T) {
	src, dst := t.TempDir(), t.TempDir()
	if e := os.WriteFile(filepath.Join(src, "input"), []byte("owned"), 0600); e != nil {
		t.Fatal(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if e := copyTree(ctx, src, dst); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	if e := os.Symlink(filepath.Join(src, "input"), filepath.Join(src, "link")); e != nil {
		t.Skip(e)
	}
	if e := copyTree(context.Background(), src, dst); !errors.Is(e, workflow.ErrUnavailable) {
		t.Fatal(e)
	}
}
func TestRejectsMissingLeaseAndRuntime(t *testing.T) {
	a := Adapter{}
	if _, e := a.Prepare(context.Background(), project.Resolved{}, nil); !errors.Is(e, workflow.ErrHandoff) {
		t.Fatal(e)
	}
	if e := a.Validate(project.Resolved{}, project.Target{Platform: "android"}); !errors.Is(e, workflow.ErrUnavailable) {
		t.Fatal(e)
	}
}
