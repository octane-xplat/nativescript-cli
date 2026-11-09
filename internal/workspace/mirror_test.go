package workspace

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/project"
)

func TestSyncDirWriteIfChanged(t *testing.T) {
	src := t.TempDir()
	dst := t.TempDir()
	write := func(root, rel, data string) {
		t.Helper()
		p := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write(src, "a.txt", "same")
	write(src, "b.txt", "old")
	write(src, "gone.txt", "x")
	if err := SyncDir(dst, src, nil); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-time.Hour)
	for _, rel := range []string{"a.txt", "b.txt", "gone.txt"} {
		os.Chtimes(filepath.Join(dst, rel), old, old)
	}
	// Unchanged keeps mtime; changed is rewritten; removed is deleted.
	write(src, "b.txt", "new-content")
	if err := os.Remove(filepath.Join(src, "gone.txt")); err != nil {
		t.Fatal(err)
	}
	// Tool state in dst must survive even though src lacks it.
	write(dst, ".gradle/state.bin", "gradle")
	write(dst, "app/build/out.apk", "apk")
	write(src, "local.properties", "sdk.dir=/x")
	if err := SyncDir(dst, src, nil); err != nil {
		t.Fatal(err)
	}
	if info, _ := os.Stat(filepath.Join(dst, "a.txt")); !info.ModTime().Equal(old) {
		t.Fatal("unchanged file lost its mtime")
	}
	if info, _ := os.Stat(filepath.Join(dst, "b.txt")); info.ModTime().Equal(old) {
		t.Fatal("changed file kept the old mtime")
	}
	if data, _ := os.ReadFile(filepath.Join(dst, "b.txt")); string(data) != "new-content" {
		t.Fatal("changed file not rewritten")
	}
	if _, err := os.Stat(filepath.Join(dst, "gone.txt")); !os.IsNotExist(err) {
		t.Fatal("removed file left behind")
	}
	for _, rel := range []string{".gradle/state.bin", "app/build/out.apk", "local.properties"} {
		if _, err := os.Stat(filepath.Join(dst, rel)); err != nil {
			t.Fatalf("tool state %s removed: %v", rel, err)
		}
	}
}

func TestMirrorNameStableAndDistinct(t *testing.T) {
	a := project.Target{Platform: "android", DestinationKind: "simulator", DestinationID: "emu", Architecture: "arm64-v8a", Configuration: "debug"}
	b := project.Target{Platform: "android", DestinationKind: "simulator", DestinationID: "emu2", Architecture: "arm64-v8a", Configuration: "debug"}
	if MirrorName("android-build", a) != MirrorName("android-build", a) {
		t.Fatal("mirror name not stable")
	}
	if MirrorName("android-build", a) == MirrorName("android-build", b) {
		t.Fatal("distinct targets share a mirror")
	}
}
