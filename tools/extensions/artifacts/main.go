// Qualifies read-only post-build artifact inspection through the public API.
package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
	"github.com/octane-xplat/nativescript-cli/extension"
	"github.com/octane-xplat/nativescript-cli/extension/transport"
)

type record struct {
	Path          string `json:"path"`
	Kind          string `json:"kind"`
	ApplicationID string `json:"applicationId"`
	SHA256        string `json:"sha256"`
}
type inspector struct{ id string }

var generatedClasses = []string{"FromDirect", "FromExecutable", "FromJavascript"}

func verifyClasses(apk string, present bool) error {
	archive, err := zip.OpenReader(apk)
	if err != nil {
		return err
	}
	defer archive.Close()
	found := map[string]bool{}
	for _, file := range archive.File {
		if !strings.HasPrefix(file.Name, "classes") || !strings.HasSuffix(file.Name, ".dex") {
			continue
		}
		reader, err := file.Open()
		if err != nil {
			return err
		}
		data, err := io.ReadAll(io.LimitReader(reader, 64<<20))
		reader.Close()
		if err != nil {
			return err
		}
		for _, name := range generatedClasses {
			found[name] = found[name] || bytes.Contains(data, []byte("Lorg/example/generated/"+name+";"))
		}
	}
	for _, name := range generatedClasses {
		if found[name] != present {
			return fmt.Errorf("generated DEX class %s presence=%t expected=%t", name, found[name], present)
		}
	}
	return nil
}
func retainAPK(source, destination string) error {
	from, err := os.Open(source)
	if err != nil {
		return err
	}
	defer from.Close()
	to, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, err = io.Copy(to, from)
	return errors.Join(err, to.Close())
}

func (i inspector) Manifest(context.Context) (extension.Manifest, error) {
	return extension.Manifest{ID: i.id, Version: "1.0.0", API: extension.APIVersion, Phases: []extension.Phase{extension.Collect, extension.PostBuild}, Required: []string{"build_artifacts", "generated_files", "native_files"}}, nil
}
func inspect(ctx context.Context, artifacts []extension.Artifact) ([]record, error) {
	var result []record
	for _, a := range artifacts {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		f, err := os.Open(a.Path)
		if err != nil {
			return nil, err
		}
		h := sha256.New()
		_, err = io.Copy(h, f)
		closeErr := f.Close()
		if err = errors.Join(err, closeErr); err != nil {
			return nil, err
		}
		result = append(result, record{a.Path, a.Kind, a.ApplicationID, hex.EncodeToString(h.Sum(nil))})
	}
	return result, ctx.Err()
}
func (i inspector) Invoke(ctx context.Context, in extension.Input) (extension.Result, error) {
	if in.Phase == extension.Collect {
		name := "FromDirect"
		if i.id == "executable" {
			name = "FromExecutable"
		}
		return extension.Result{NativeFiles: []extension.NativeFile{{Platform: in.Platform, Kind: "source", Path: "org/example/generated/" + name + ".java", Content: []byte("package org.example.generated; public class " + name + " { public static int value() { return 42; } }")}}}, nil
	}
	if in.Phase != extension.PostBuild || len(in.Artifacts) == 0 {
		return extension.Result{}, errors.New("missing completed artifact context")
	}
	r, err := inspect(ctx, in.Artifacts)
	if err != nil {
		return extension.Result{}, err
	}
	data, err := json.Marshal(r)
	return extension.Result{Files: []extension.File{{Path: "artifacts.json", Content: string(data)}}}, err
}
func main() {
	if len(os.Args) == 2 && os.Args[1] == "plugin" {
		transport.Serve(inspector{"executable"})
		return
	}
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() (result error) {
	if len(os.Args) != 4 {
		return errors.New("usage: artifact-consumer APP JS_MODULE EVIDENCE_JSON")
	}
	app, module, saved := os.Args[1], os.Args[2], os.Args[3]
	cwd, _ := os.Getwd()
	env := os.Environ()
	writer, flags, prefix := log.Writer(), log.Flags(), log.Prefix()
	evidence := map[string]any{"boundary": "real Android debug Build and three-form read-only artifact inspection; no device/runtime/release claim"}
	defer func() {
		now, _ := os.Getwd()
		globals := now == cwd && reflect.DeepEqual(env, os.Environ()) && log.Writer() == writer && log.Flags() == flags && log.Prefix() == prefix
		if !globals {
			result = errors.Join(result, errors.New("embedding globals changed"))
		}
		evidence["embeddingGlobalsPreserved"] = globals
		evidence["passed"] = result == nil
		if result != nil {
			evidence["failure"] = result.Error()
		}
		data, _ := json.MarshalIndent(evidence, "", "  ")
		result = errors.Join(result, os.WriteFile(saved, append(data, '\n'), 0600))
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	self, err := os.Executable()
	if err != nil {
		return err
	}
	external, closeGo, err := transport.Open(ctx, self, []string{"plugin"}, app, env, io.Discard)
	if err != nil {
		return err
	}
	defer closeGo()
	cache, err := os.MkdirTemp(filepath.Dir(app), "artifact-runner-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(cache)
	javascript, closeJS, err := transport.OpenNode(ctx, "node", module, cache, app, env, io.Discard)
	if err != nil {
		return err
	}
	defer closeJS()
	client, err := ns.New(ns.Options{Extensions: []extension.Extension{inspector{"direct"}, external, javascript}})
	if err != nil {
		return err
	}
	built, err := client.Build(ctx, ns.BuildRequest{ProjectDir: app, OutputDir: filepath.Join(app, "state"), Target: ns.Target{Platform: ns.Android, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: "generic", Architecture: "arm64-v8a"}}})
	if err != nil {
		return err
	}
	if len(built.Artifacts) != 1 || built.Artifacts[0].Kind != "apk" {
		return errors.New("expected one actual APK")
	}
	var inputs []extension.Artifact
	for _, a := range built.Artifacts {
		inputs = append(inputs, extension.Artifact{Path: a.Path, Kind: a.Kind, ApplicationID: a.ApplicationID})
	}
	want, err := inspect(ctx, inputs)
	if err != nil {
		return err
	}
	for _, id := range []string{"direct", "executable", "javascript"} {
		data, err := os.ReadFile(filepath.Join(built.Prepared.NativeDir, ".nativescript-extensions", id, "artifacts.json"))
		if err != nil {
			return err
		}
		var got []record
		if err = json.Unmarshal(data, &got); err != nil || !reflect.DeepEqual(got, want) {
			return fmt.Errorf("%s artifact inspection differed", id)
		}
	}
	evidence["build"] = built
	evidence["records"] = want
	evidence["forms"] = []string{"direct", "executable", "javascript"}
	if err := verifyClasses(built.Artifacts[0].Path, true); err != nil {
		return err
	}
	if err := retainAPK(built.Artifacts[0].Path, saved+".with-native.apk"); err != nil {
		return err
	}
	plain, err := ns.New(ns.Options{})
	if err != nil {
		return err
	}
	removed, err := plain.Build(ctx, ns.BuildRequest{ProjectDir: app, OutputDir: filepath.Join(app, "state"), Target: ns.Target{Platform: ns.Android, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: "generic", Architecture: "arm64-v8a"}}})
	if err != nil {
		return err
	}
	if len(removed.Artifacts) != 1 || removed.Prepared.Identity.Revision == built.Prepared.Identity.Revision {
		return errors.New("extension removal did not change generation identity")
	}
	if err := verifyClasses(removed.Artifacts[0].Path, false); err != nil {
		return err
	}
	if err := retainAPK(removed.Artifacts[0].Path, saved+".removed.apk"); err != nil {
		return err
	}
	evidence["generatedClasses"] = generatedClasses
	evidence["removedBuild"] = removed
	evidence["nativeClassesRemoved"] = true
	fmt.Println("PASS three-form native Java contribution compilation/DEX membership, post-build inspection and removal")
	return nil
}
