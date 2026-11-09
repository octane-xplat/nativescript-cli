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

// toolStatePath reports whether rel is build-tool state that must survive a
// mirror sync unchanged (Gradle/xcodebuild intermediates and local env files).
func toolStatePath(rel string) bool {
	for p := rel; p != "." && p != string(filepath.Separator); p = filepath.Dir(p) {
		base := filepath.Base(p)
		if base == ".gradle" || base == ".cxx" || base == "build" || base == "DerivedData" {
			return true
		}
	}
	return false
}

// SyncDir mirrors src into dst, byte-comparing every file: unchanged files keep
// their existing dst mtime, changed files are replaced via temp+rename, dst
// files absent from src are deleted. Files under keep (build-tool state) are
// never written or deleted.
func SyncDir(dst, src string, keep func(string) bool) error {
	if keep == nil {
		keep = toolStatePath
	}
	seen := map[string]bool{}
	err := filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return err
		}
		if keep(rel) {
			return nil
		}
		seen[rel] = true
		to := filepath.Join(dst, rel)
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
		os.Chmod(tmp.Name(), info.Mode().Perm())
		return os.Rename(tmp.Name(), to)
	})
	if err != nil {
		return err
	}
	return filepath.Walk(dst, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil {
			return err
		}
		rel, err := filepath.Rel(dst, path)
		if err != nil || rel == "." || keep(rel) {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if !seen[rel] {
			return os.Remove(path)
		}
		return nil
	})
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
