package nativescript_test

import (
	"context"
	"errors"
	"fmt"
	ns "github.com/octane-xplat/nativescript-cli"
	"log"
	"os"
	"path/filepath"
	"reflect"
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

func TestIndependentClientsRealHelperHaveNoGlobalEffects(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("owned execution unavailable")
	}
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	environment := os.Environ()
	writer, flags, prefix := log.Writer(), log.Flags(), log.Prefix()
	data, err := os.ReadFile("internal/jsbridge/testdata/project.pbxproj")
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	cache := filepath.Join(root, "shared cache")
	results := make(chan error, 2)
	for i := range 2 {
		dir := filepath.Join(root, fmt.Sprintf("app %d", i))
		if err = os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
		file := filepath.Join(dir, "project.pbxproj")
		if err = os.WriteFile(file, data, 0600); err != nil {
			t.Fatal(err)
		}
		go func() {
			var seq uint64
			client, _ := ns.New(ns.Options{Environment: map[string]string{"W1_CLIENT": dir}, Sink: func(ctx context.Context, e ns.Event) error {
				seq++
				if e.Sequence != seq || e.Operation != "inspect-xcode" {
					return fmt.Errorf("bad event sequence")
				}
				// Reentrant discovery stays lazy and does not share helper ownership.
				other, _ := ns.New(ns.Options{})
				_, err := other.Devices(ctx, ns.DeviceQuery{Platform: ns.IOS})
				if !errors.Is(err, ns.ErrUnavailable) {
					return fmt.Errorf("unexpected discovery: %w", err)
				}
				return nil
			}})
			r, err := client.InspectXcode(context.Background(), ns.XcodeInspectionRequest{ProjectDir: dir, File: file, CacheDir: cache})
			if err == nil && (!strings.Contains(r.Text, "PBXProject") || seq != 2) {
				err = fmt.Errorf("missing helper result/events")
			}
			results <- err
		}()
	}
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	after, err := os.Getwd()
	if err != nil || after != cwd || !reflect.DeepEqual(os.Environ(), environment) || log.Writer() != writer || log.Flags() != flags || log.Prefix() != prefix {
		t.Fatal("embedding globals changed")
	}
}
