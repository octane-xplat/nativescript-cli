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
	write(src, "native/a.txt", "same")
	write(src, "native/b.txt", "old")
	write(src, "native/gone.txt", "x")
	write(src, "contributions/4fba/p.txt", "contrib")
	if err := SyncDir(dst, src, nil); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-time.Hour)
	for _, rel := range []string{"native/a.txt", "native/b.txt", "native/gone.txt"} {
		os.Chtimes(filepath.Join(dst, rel), old, old)
	}
	write(src, "native/b.txt", "new-content")
	if err := os.Remove(filepath.Join(src, "native/gone.txt")); err != nil {
		t.Fatal(err)
	}
	// Tool state in dst must survive even though src lacks it.
	write(dst, "native/.gradle/state.bin", "gradle")
	write(dst, "native/app/build/out.apk", "apk")
	write(dst, "native/app/.cxx/dep.o", "cxx")
	if err := SyncDir(dst, src, nil); err != nil {
		t.Fatal(err)
	}
	if info, _ := os.Stat(filepath.Join(dst, "native/a.txt")); !info.ModTime().Equal(old) {
		t.Fatal("unchanged file lost its mtime")
	}
	if info, _ := os.Stat(filepath.Join(dst, "native/b.txt")); info.ModTime().Equal(old) {
		t.Fatal("changed file kept the old mtime")
	}
	if data, _ := os.ReadFile(filepath.Join(dst, "native/b.txt")); string(data) != "new-content" {
		t.Fatal("changed file not rewritten")
	}
	if _, err := os.Stat(filepath.Join(dst, "native/gone.txt")); !os.IsNotExist(err) {
		t.Fatal("removed file left behind")
	}
	for _, rel := range []string{"native/.gradle/state.bin", "native/app/build/out.apk", "native/app/.cxx/dep.o"} {
		if _, err := os.Stat(filepath.Join(dst, rel)); err != nil {
			t.Fatalf("tool state %s removed: %v", rel, err)
		}
	}
	if _, err := os.Stat(filepath.Join(dst, "contributions/4fba/p.txt")); err != nil {
		t.Fatal("sibling dir not mirrored")
	}
}

func TestSyncDirSymlinksAndDirs(t *testing.T) {
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
	write(src, "contributions/h1/pkg/file.txt", "x")
	write(src, "contributions/h2/pkg/file.txt", "y")
	if err := os.Symlink("../../../contributions/h1/pkg", filepath.Join(src, "native/node_modules/@x/pkg")); err != nil {
		os.MkdirAll(filepath.Join(src, "native/node_modules/@x"), 0700)
		if err := os.Symlink("../../../contributions/h1/pkg", filepath.Join(src, "native/node_modules/@x/pkg")); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Join(src, "native/empty"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := SyncDir(dst, src, nil); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dst, "native/node_modules/@x/pkg")
	if target, err := os.Readlink(link); err != nil || target != "../../../contributions/h1/pkg" {
		t.Fatalf("symlink not preserved: %q %v", target, err)
	}
	if _, err := os.Stat(filepath.Join(link, "file.txt")); err != nil {
		t.Fatal("relative link does not resolve inside the mirror")
	}
	if info, _ := os.Stat(filepath.Join(dst, "native/empty")); !info.IsDir() {
		t.Fatal("empty dir not created")
	}
	// Retarget the link and add a stale one; a deep build/ source dir syncs.
	os.Remove(filepath.Join(src, "native/node_modules/@x/pkg"))
	if err := os.Symlink("../../../contributions/h2/pkg", filepath.Join(src, "native/node_modules/@x/pkg")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("../../../contributions/h9/pkg", filepath.Join(src, "native/stale")); err != nil {
		t.Fatal(err)
	}
	if err := SyncDir(dst, src, nil); err != nil {
		t.Fatal(err)
	}
	os.Remove(filepath.Join(src, "native/stale"))
	write(src, "contributions/x/src/main/java/com/acme/build/Foo.java", "class Foo {}")
	if err := SyncDir(dst, src, nil); err != nil {
		t.Fatal(err)
	}
	if target, _ := os.Readlink(link); target != "../../../contributions/h2/pkg" {
		t.Fatalf("symlink not retargeted: %q", target)
	}
	if _, err := os.Stat(filepath.Join(dst, "contributions/x/src/main/java/com/acme/build/Foo.java")); err != nil {
		t.Fatal("deep build/ source path not synced")
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
