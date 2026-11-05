package nativescript_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	ns "github.com/octane-xplat/nativescript-cli"
	"github.com/octane-xplat/nativescript-cli/extension"
)

type nativeRegistration struct{ value string }

func (nativeRegistration) Manifest(context.Context) (extension.Manifest, error) {
	return extension.Manifest{ID: "native", Version: "1.0.0", API: extension.APIVersion, Phases: []extension.Phase{extension.Collect}, Required: []string{"native_files"}}, nil
}
func (n nativeRegistration) Invoke(_ context.Context, in extension.Input) (extension.Result, error) {
	file := extension.NativeFile{Platform: in.Platform, Kind: "source", Path: "Injected.java", Content: []byte("class Injected { String value = \"" + n.value + "\"; }")}
	if in.Platform == "ios" {
		file.Path = "Injected.swift"
		file.Content = []byte("class Injected { let value = \"" + n.value + "\" }")
	}
	return extension.Result{NativeFiles: []extension.NativeFile{file}}, nil
}
func TestPublicNativeExtensionPreparationAndRemoval(t *testing.T) {
	for _, platform := range []string{"ios", "android"} {
		t.Run(platform, func(t *testing.T) {
			var request ns.PrepareRequest
			if platform == "ios" {
				_, _, request = prepareApp(t, false)
			} else {
				_, _, request = androidApp(t, false)
			}
			ctx := context.Background()
			base, _ := ns.New(ns.Options{})
			resolved, err := base.Resolve(ctx, ns.ResolveRequest{ProjectDir: request.ProjectDir})
			if err != nil {
				t.Fatal(err)
			}
			client, _ := ns.New(ns.Options{Extensions: []extension.Extension{nativeRegistration{"one"}}})
			prepared, err := client.Prepare(ctx, request)
			if err != nil {
				t.Fatal(err)
			}
			if prepared.Identity.Revision == resolved.Revision {
				t.Fatal("native extension not in revision")
			}
			verify := func(p ns.PreparedProject, present bool) {
				t.Helper()
				found := false
				if platform == "ios" {
					data, err := os.ReadFile(filepath.Join(p.NativeDir, "NativeScriptApp.xcodeproj/project.pbxproj"))
					if err != nil {
						t.Fatal(err)
					}
					found = strings.Contains(string(data), "Injected.swift")
				} else {
					if err := filepath.WalkDir(p.NativeDir, func(path string, d os.DirEntry, err error) error {
						if err != nil {
							return err
						}
						found = found || d.Name() == "Injected.java"
						return nil
					}); err != nil {
						t.Fatal(err)
					}
				}
				if found != present {
					t.Fatal("native membership", found, present)
				}
			}
			verify(prepared, true)
			repeated, err := client.Prepare(ctx, request)
			if err != nil || repeated.Identity.Revision != prepared.Identity.Revision {
				t.Fatal("repeat", err)
			}
			changed, _ := ns.New(ns.Options{Extensions: []extension.Extension{nativeRegistration{"two"}}})
			next, err := changed.Prepare(ctx, request)
			if err != nil || next.Identity.Revision == prepared.Identity.Revision {
				t.Fatal("input identity", err)
			}
			removed, err := base.Prepare(ctx, request)
			if err != nil {
				t.Fatal(err)
			}
			verify(removed, false)
			if removed.Identity.Revision != resolved.Revision {
				t.Fatal("removal identity")
			}
			request.OutputDir = filepath.Join(t.TempDir(), "must-remain-absent")
			ota, _ := ns.New(ns.Options{OTAStartup: true, Extensions: []extension.Extension{nativeRegistration{"one"}}})
			if _, err := ota.Prepare(ctx, request); !errors.Is(err, ns.ErrUnavailable) {
				t.Fatal("unsupported OTA combination", err)
			}
			if _, err := os.Stat(request.OutputDir); !os.IsNotExist(err) {
				t.Fatal("OTA guard wrote state", err)
			}
		})
	}
}
