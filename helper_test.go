package nativescript_test

import (
	"context"
	"errors"
	ns "github.com/octane-xplat/nativescript-cli"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestEmbeddedEditorAndLazyNativeDiscovery(t *testing.T) {
	c, e := ns.New(ns.Options{})
	if e != nil {
		t.Fatal(e)
	}
	root := t.TempDir()
	cache := filepath.Join(root, "cache")
	_, e = c.Devices(context.Background(), ns.DeviceQuery{Platform: ns.IOS})
	if !errors.Is(e, ns.ErrUnavailable) {
		t.Fatal(e)
	}
	if _, e = os.Stat(cache); !os.IsNotExist(e) {
		t.Fatal("native-only discovery extracted helper")
	}
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("owned execution unavailable")
	}
	b, e := os.ReadFile("internal/jsbridge/testdata/project.pbxproj")
	if e != nil {
		t.Fatal(e)
	}
	file := filepath.Join(root, "project.pbxproj")
	os.WriteFile(file, b, 0600)
	r, e := c.InspectXcode(context.Background(), ns.XcodeInspectionRequest{ProjectDir: root, File: file, CacheDir: cache})
	if e != nil || !strings.Contains(r.Text, "PBXProject") {
		t.Fatal(r, e)
	}
}
