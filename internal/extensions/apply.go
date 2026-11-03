package extensions

import (
	"context"
	"fmt"
	"github.com/octane-xplat/nativescript-cli/extension"
	"os"
	"path/filepath"
)

// Apply replaces only our reserved output directory. Validation and asynchronous
// handlers have completed before staging begins. Caller must hold the F2 lease.
func Apply(ctx context.Context, root string, files []extension.File) error {
	if len(files) == 0 {
		if _, e := os.Lstat(filepath.Join(root, ".nativescript-extensions")); os.IsNotExist(e) {
			return nil
		}
	}
	info, e := os.Lstat(root)
	if e != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("invalid extension output root")
	}

	stage, e := os.MkdirTemp(root, ".extension-stage-")
	if e != nil {
		return e
	}
	defer os.RemoveAll(stage)
	seen := map[string]bool{}
	for _, f := range files {
		if seen[f.Path] {
			return fmt.Errorf("duplicate extension output %s", f.Path)
		}
		seen[f.Path] = true
		if e := ctx.Err(); e != nil {
			return e
		}
		p := filepath.Join(stage, filepath.FromSlash(f.Path))
		if e = os.MkdirAll(filepath.Dir(p), 0700); e != nil {
			return e
		}
		if e = os.WriteFile(p, []byte(f.Content), 0600); e != nil {
			return e
		}
	}
	if e := ctx.Err(); e != nil {
		return e
	}
	dest := filepath.Join(root, ".nativescript-extensions")
	backup := stage + "-previous"
	if _, e = os.Lstat(dest); e == nil {
		if e = os.Rename(dest, backup); e != nil {
			return e
		}
		defer os.RemoveAll(backup)
	} else if !os.IsNotExist(e) {
		return e
	}
	if e = os.Rename(stage, dest); e != nil {
		_ = os.Rename(backup, dest)
		return e
	}
	return nil
}
