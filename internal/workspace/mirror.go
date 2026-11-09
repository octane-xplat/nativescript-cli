package workspace

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/octane-xplat/nativescript-cli/internal/project"
)

// MirrorName derives the stable per-target build namespace under
// GeneratedRoot. Distinct targets never share a namespace; the workspace lease
// serializes builds for one target.
func MirrorName(prefix string, t project.Target) string {
	key := t.Platform + "|" + t.DestinationKind + "|" + t.DestinationID + "|" + t.Architecture + "|" + t.Configuration
	sum := sha256.Sum256([]byte(key))
	return prefix + "-" + hex.EncodeToString(sum[:8])
}

// toolStatePath reports whether rel (a path inside the mirrored generation
// root) is build-tool state that must survive a sync unchanged. Only the
// tool-owned Gradle locations are excluded — a deep source path containing a
// "build" segment, e.g. contributions/x/src/main/java/com/acme/build/, still
// syncs.
func toolStatePath(rel string) bool {
	segs := strings.Split(filepath.ToSlash(rel), "/")
	if len(segs) < 2 || segs[0] != "native" {
		return false
	}
	if segs[1] == ".gradle" || segs[1] == ".kotlin" || segs[1] == "build" {
		return true
	}
	if len(segs) >= 3 && (segs[2] == "build" || segs[2] == ".cxx") {
		return true
	}
	return false
}

// SyncDir mirrors the whole published generation src into dst, preserving the
// relative layout: symlinks are recreated as symlinks (retargeted only when
// they differ, never followed), directories are created (including empty
// ones), regular files are byte-compared and replaced via temp+rename only
// when changed (unchanged keeps its dst mtime), and dst entries absent from
// src are removed — except paths under keep (build-tool state).
func SyncDir(dst, src string, keep func(string) bool) error {
	if keep == nil {
		keep = toolStatePath
	}
	seen := map[string]bool{}
	err := filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return filepath.SkipDir
		}
		if keep(rel) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		to := filepath.Join(dst, rel)
		mode := info.Mode()
		switch {
		case mode&os.ModeSymlink != 0:
			target, err := os.Readlink(path)
			if err != nil {
				return err
			}
			seen[rel] = true
			if cur, err := os.Readlink(to); err == nil && cur == target {
				return nil
			}
			os.Remove(to)
			return os.Symlink(target, to)
		case info.IsDir():
			seen[rel] = true
			return os.MkdirAll(to, 0700)
		case mode.IsRegular():
			seen[rel] = true
			if sameBytes(path, to) {
				return nil
			}
			if err := os.MkdirAll(filepath.Dir(to), 0700); err != nil {
				return err
			}
			in, err := os.Open(path)
			if err != nil {
				return err
			}
			defer in.Close()
			tmp, err := os.CreateTemp(filepath.Dir(to), ".sync-")
			if err != nil {
				return err
			}
			if _, err := io.Copy(tmp, in); err != nil {
				tmp.Close()
				os.Remove(tmp.Name())
				return err
			}
			if err := tmp.Close(); err != nil {
				os.Remove(tmp.Name())
				return err
			}
			os.Chmod(tmp.Name(), mode.Perm())
			return os.Rename(tmp.Name(), to)
		default:
			return nil
		}
	})
	if err != nil {
		return err
	}
	var dirs []string
	err = filepath.Walk(dst, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil {
			return err
		}
		rel, err := filepath.Rel(dst, path)
		if err != nil || rel == "." {
			return err
		}
		if keep(rel) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if info.IsDir() {
			if !seen[rel] {
				dirs = append(dirs, path)
			}
			return nil
		}
		if !seen[rel] {
			return os.Remove(path)
		}
		return nil
	})
	if err != nil {
		return err
	}
	for i := len(dirs) - 1; i >= 0; i-- {
		os.Remove(dirs[i])
	}
	return nil
}

func sameBytes(a, b string) bool {
	ai, e := os.Stat(a)
	if e != nil || ai.IsDir() {
		return false
	}
	bi, e := os.Stat(b)
	if e != nil || bi.IsDir() || ai.Size() != bi.Size() {
		return false
	}
	fa, err := os.Open(a)
	if err != nil {
		return false
	}
	defer fa.Close()
	fb, err := os.Open(b)
	if err != nil {
		return false
	}
	defer fb.Close()
	ba, bb := make([]byte, 8192), make([]byte, 8192)
	for {
		na, ea := fa.Read(ba)
		nb, eb := fb.Read(bb)
		if na != nb || !bytes.Equal(ba[:na], bb[:nb]) {
			return false
		}
		if ea == io.EOF && eb == io.EOF {
			return true
		}
		if ea != nil || eb != nil {
			return false
		}
	}
}
