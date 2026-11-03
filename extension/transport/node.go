package transport

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"fmt"
	"github.com/octane-xplat/nativescript-cli/extension"
	"io"
	"os"
	"path/filepath"
)

//go:embed runner.cjs
var nodeRunner []byte

// OpenNode extracts a self-contained, content-addressed runner. module must be an
// explicit absolute JS module path; resolution never scans arbitrary packages.
func OpenNode(ctx context.Context, node, module, cache, dir string, env []string, logs io.Writer) (extension.Extension, func(), error) {
	if !filepath.IsAbs(module) || !filepath.IsAbs(cache) {
		return nil, nil, fmt.Errorf("absolute module and cache required")
	}
	if e := ctx.Err(); e != nil {
		return nil, nil, e
	}
	if e := os.MkdirAll(cache, 0700); e != nil {
		return nil, nil, e
	}
	name := filepath.Join(cache, fmt.Sprintf("extension-%x.cjs", sha256.Sum256(nodeRunner)))
	// Atomic replacement prevents incomplete content being executed by another host.
	f, e := os.CreateTemp(cache, ".extension-")
	if e != nil {
		return nil, nil, e
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if _, e = f.Write(nodeRunner); e != nil {
		f.Close()
		return nil, nil, e
	}
	if e = f.Close(); e != nil {
		return nil, nil, e
	}
	if e = os.Rename(tmp, name); e != nil {
		return nil, nil, e
	}
	return Open(ctx, node, []string{name, module}, dir, env, logs)
}
