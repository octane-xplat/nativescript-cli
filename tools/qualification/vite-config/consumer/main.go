// Command consumer qualifies selected Vite config through actual public Build.
// Native compilation is separate from device/runtime and framework qualification.
package main

import (
	"context"
	"crypto/sha256"
	"debug/macho"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
)

func hash(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }
func save(file string, data []byte) error {
	f, err := os.OpenFile(file, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, err = f.Write(data)
	return errors.Join(err, f.Close())
}
func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() (result error) {
	if len(os.Args) != 4 {
		return errors.New("usage: consumer APP_ROOT NEW_EVIDENCE_PREFIX debug|release")
	}
	app, prefix, configuration := os.Args[1], os.Args[2], ns.Configuration(os.Args[3])
	if !filepath.IsAbs(app) || !filepath.IsAbs(prefix) || (configuration != ns.Debug && configuration != ns.Release) {
		return errors.New("invalid arguments")
	}
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	environment := os.Environ()
	defer func() {
		after, err := os.Getwd()
		if err != nil || after != cwd || !reflect.DeepEqual(environment, os.Environ()) {
			result = errors.Join(result, errors.New("embedding globals changed"))
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()
	client, err := ns.New(ns.Options{Environment: map[string]string{"DEBUG": "caller-debug"}})
	if err != nil {
		return err
	}
	resolved, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: app})
	if err != nil {
		return err
	}
	if resolved.Config.BundlerConfigPath == "" || resolved.Config.PackageManager != "bun" {
		return errors.New("selected project config metadata missing")
	}
	built, err := client.Build(ctx, ns.BuildRequest{ProjectDir: app, OutputDir: filepath.Join(app, "state"), Target: ns.Target{Platform: ns.IOS, Configuration: configuration, Destination: ns.Destination{Kind: ns.Simulator, ID: "generic", Architecture: "arm64"}}, IOS: ns.IOSBuildOptions{SigningMode: "disabled"}})
	if err != nil {
		return err
	}
	if len(built.Artifacts) != 1 || built.Artifacts[0].Kind != "app" || built.Artifacts[0].Identity.Target.Configuration != configuration {
		return errors.New("unexpected native artifact")
	}
	artifact := built.Artifacts[0]
	executable := filepath.Join(artifact.Path, "NativeScriptApp")
	f, err := macho.Open(executable)
	if err != nil {
		return err
	}
	valid := f.Cpu == macho.CpuArm64 && f.Type == macho.TypeExec
	err = f.Close()
	if err != nil {
		return err
	}
	if !valid {
		return errors.New("expected arm64 native executable")
	}
	content := filepath.Join(artifact.Path, "app")
	manifest, err := os.ReadFile(filepath.Join(content, "package.json"))
	if err != nil {
		return err
	}
	var runtime struct{ Main, ID string }
	if json.Unmarshal(manifest, &runtime) != nil || runtime.Main != "bundle.mjs" || runtime.ID != resolved.ApplicationID {
		return errors.New("compiled runtime manifest differs")
	}
	proof, err := os.ReadFile(filepath.Join(content, "project-config.json"))
	if err != nil {
		return err
	}
	var data struct {
		Mode, Command, Value string
		Debug                *string
		BundlerEnv           struct{ IOS, HMR, Production bool }
	}
	if json.Unmarshal(proof, &data) != nil || data.Command != "build" || data.Value != "PROJECT_VITE_NATIVE_20261105" || !data.BundlerEnv.IOS || data.BundlerEnv.HMR {
		return errors.New("compiled config proof differs")
	}
	if configuration == ns.Release && (data.Mode != "production" || !data.BundlerEnv.Production || data.Debug != nil) {
		return errors.New("release config inherited debug or wrong mode")
	}
	if configuration == ns.Debug && (data.Mode != "development" || data.BundlerEnv.Production) {
		return errors.New("debug config mode differs")
	}
	files := map[string]string{}
	var combined strings.Builder
	err = filepath.WalkDir(content, func(file string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		if !strings.HasSuffix(file, ".mjs") {
			return nil
		}
		bytes, err := os.ReadFile(file)
		if err != nil {
			return err
		}
		relative, _ := filepath.Rel(content, file)
		files[relative] = hash(bytes)
		combined.Write(bytes)
		return nil
	})
	if err != nil {
		return err
	}
	if !strings.Contains(combined.String(), data.Value) {
		return errors.New("project define missing from compiled app JavaScript")
	}
	binary, err := os.ReadFile(executable)
	if err != nil {
		return err
	}
	for suffix, bytes := range map[string][]byte{".macho": binary, ".project-config.json": proof, ".package.json": manifest} {
		if err := save(prefix+suffix, bytes); err != nil {
			return err
		}
	}
	evidence := map[string]any{"project": resolved, "build": built, "executableSHA256": hash(binary), "bundledModules": files, "proofSHA256": hash(proof), "runtimeManifestSHA256": hash(manifest), "retainedPrefix": prefix, "scope": "actual unsigned arm64 simulator native build; no guest startup, physical signing, OTA installer or original Octane/Bamboo preset claim"}
	encoded, err := json.MarshalIndent(evidence, "", "  ")
	if err != nil {
		return err
	}
	if err := save(prefix+".json", append(encoded, '\n')); err != nil {
		return err
	}
	fmt.Printf("PASS actual public selected-config iOS %s build, compiled bundle/manifest/plugin proof, native arm64 artifact and embedding globals\n", configuration)
	return nil
}
