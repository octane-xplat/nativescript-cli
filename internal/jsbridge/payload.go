package jsbridge

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

const PayloadVersion = "0.1.0"

var ErrPayload = errors.New("invalid embedded helper payload")

// Payload contains a committed, self-contained helper and third-party notices.
// Extraction is lazy, content-addressed and serialized with F2. No application
// project is used as the cache identity or modified during extraction.
type Payload struct{ Files fs.FS }

func (p Payload) Extract(ctx context.Context, cache string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if !filepath.IsAbs(cache) {
		return "", ErrPayload
	}
	names := []string{"helper.cjs", "NOTICES.txt"}
	content := make([][]byte, len(names))
	h := sha256.New()
	for i, name := range names {
		b, err := fs.ReadFile(p.Files, name)
		if err != nil {
			return "", err
		}
		content[i] = b
		h.Write([]byte(name))
		h.Write([]byte{0})
		h.Write(b)
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	digest := hex.EncodeToString(h.Sum(nil))
	root := filepath.Join(cache, "helper-"+digest)
	if err := os.MkdirAll(root, 0700); err != nil {
		return "", err
	}
	l, err := workspace.NewLayout(root, project.Identity{Schema: 1, Revision: PayloadVersion, ProjectDir: root, Target: project.Target{Platform: "ios", DestinationKind: "simulator", DestinationID: "helper", Architecture: "node", Configuration: "payload"}})
	if err != nil {
		return "", err
	}
	o, err := workspace.Acquire(ctx, l)
	if err != nil {
		return "", err
	}
	defer o.Release()
	if err := o.QuarantineInterrupted(ctx); err != nil {
		return "", err
	}
	s, err := o.Inspect(digest)
	if err == nil {
		for i, name := range names {
			info, statErr := os.Lstat(filepath.Join(s.NativeDir, name))
			if statErr != nil || !info.Mode().IsRegular() {
				return "", ErrPayload
			}
			b, e := os.ReadFile(filepath.Join(s.NativeDir, name))
			if e != nil || string(b) != string(content[i]) {
				return "", ErrPayload
			}
		}
		return filepath.Join(s.NativeDir, "helper.cjs"), nil
	}
	if !errors.Is(err, workspace.ErrIncomplete) {
		return "", err
	}
	stage, err := o.Begin(ctx, digest, nil)
	if err != nil {
		return "", err
	}
	defer stage.Abort()
	for i, name := range names {
		if err = os.WriteFile(filepath.Join(stage.State.NativeDir, name), content[i], 0600); err != nil {
			return "", err
		}
	}
	s, err = stage.Commit(ctx)
	if err != nil {
		return "", err
	}
	return filepath.Join(s.NativeDir, "helper.cjs"), nil
}
