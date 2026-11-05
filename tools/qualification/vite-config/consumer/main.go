// Command consumer qualifies selected Vite config through actual public Build.
// Native compilation is separate from device/runtime and framework qualification.
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"debug/macho"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
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
	if len(os.Args) < 4 || len(os.Args) > 6 {
		return errors.New("usage: consumer APP_ROOT NEW_EVIDENCE_PREFIX debug|release [pinned|ota [NEW_OUTPUT_DIR]]")
	}
	pinned := len(os.Args) >= 5 && os.Args[4] == "pinned"
	ota := len(os.Args) >= 5 && os.Args[4] == "ota"
	if len(os.Args) >= 5 && !pinned && !ota {
		return errors.New("unknown profile")
	}
	app, prefix, configuration := os.Args[1], os.Args[2], ns.Configuration(os.Args[3])
	if !filepath.IsAbs(app) || !filepath.IsAbs(prefix) || (configuration != ns.Debug && configuration != ns.Release) {
		return errors.New("invalid arguments")
	}
	output := filepath.Join(app, "state")
	if len(os.Args) == 6 {
		output = os.Args[5]
		if !filepath.IsAbs(output) {
			return errors.New("new output directory must be absolute")
		}
		if _, err := os.Lstat(output); !os.IsNotExist(err) {
			return errors.New("explicit output directory must not exist")
		}
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
	client, err := ns.New(ns.Options{OTAStartup: ota, Environment: map[string]string{"DEBUG": "caller-debug", "VISUAL_CAPTURE_URL": "", "XPLAT_DOCS_DEMOS": ""}})
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
	built, err := client.Build(ctx, ns.BuildRequest{ProjectDir: app, OutputDir: output, Target: ns.Target{Platform: ns.IOS, Configuration: configuration, Destination: ns.Destination{Kind: ns.Simulator, ID: "generic", Architecture: "arm64"}}, IOS: ns.IOSBuildOptions{SigningMode: "disabled"}})
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
	if err != nil && !pinned {
		return err
	}
	var data struct {
		Mode, Command, Value string
		Debug                *string
		BundlerEnv           struct{ IOS, HMR, Production bool }
	}
	if pinned {
		data.Value = "PINNED_PRESET_20261105"
	} else {
		if json.Unmarshal(proof, &data) != nil || data.Command != "build" || data.Value != "PROJECT_VITE_NATIVE_20261105" || !data.BundlerEnv.IOS || data.BundlerEnv.HMR {
			return errors.New("compiled config proof differs")
		}
		if configuration == ns.Release && (data.Mode != "production" || !data.BundlerEnv.Production || data.Debug != nil) {
			return errors.New("release config inherited debug or wrong mode")
		}
		if configuration == ns.Debug && (data.Mode != "development" || data.BundlerEnv.Production) {
			return errors.New("debug config mode differs")
		}
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
	if pinned {
		if !strings.Contains(combined.String(), "--color-primary") || !strings.Contains(combined.String(), "--space-4") {
			return errors.New("Bamboo CSS tokens missing from compiled JavaScript")
		}
		proof, _ = json.Marshal(map[string]any{"inspection": "compiled non-HMR JavaScript contains pinned marker and Bamboo color/spacing tokens", "moduleHashes": files, "profile": "pinned", "nativeCSSApplication": "not exercised"})
	}
	binary, err := os.ReadFile(executable)
	if err != nil {
		return err
	}
	if ota {
		record, err := os.ReadFile(filepath.Join(built.Prepared.NativeDir, ".xplat/fingerprints/ios.json"))
		if err != nil {
			return err
		}
		stamp, err := os.ReadFile(filepath.Join(content, "xplat-native.json"))
		if err != nil {
			return err
		}
		var identity struct {
			Hash    string
			Release bool
		}
		if json.Unmarshal(stamp, &identity) != nil || len(identity.Hash) != 64 || identity.Release != (configuration == ns.Release) || !bytes.Contains(binary, []byte(identity.Hash)) {
			return errors.New("compiled canonical stamp missing or inconsistent")
		}
		var canonical struct{ Hash string }
		if json.Unmarshal(record, &canonical) != nil || canonical.Hash != identity.Hash {
			return errors.New("compiled/persisted canonical hashes differ")
		}
		for suffix, body := range map[string][]byte{".fingerprint.json": record, ".stamp.json": stamp} {
			if err := save(prefix+suffix, body); err != nil {
				return err
			}
		}
		for suffix, file := range map[string]string{".main.m": "internal/main.m", ".pbxproj": "NativeScriptApp.xcodeproj/project.pbxproj"} {
			body, err := os.ReadFile(filepath.Join(built.Prepared.NativeDir, file))
			if err != nil {
				return err
			}
			if err := save(prefix+suffix, body); err != nil {
				return err
			}
		}
		var evaluations []map[string]any
		for _, c := range resolved.Contributions {
			if c.Kind != "spm" || c.SPM == nil || c.SPM.Path == "" {
				continue
			}
			body, err := os.ReadFile(c.Path)
			if err != nil {
				return err
			}
			digest := hash(body)
			matched := false
			for _, s := range resolved.Sources {
				if s.Path == c.Path && s.Digest == digest {
					matched = true
				}
			}
			if !matched {
				return errors.New("manifest changed after resolution")
			}
			command := exec.CommandContext(ctx, "xcrun", "swift", "package", "--package-path", filepath.Dir(c.Path), "dump-package")
			command.Dir = app
			metadata, err := command.Output()
			if err != nil {
				return errors.New("independent selected manifest evaluation failed")
			}
			after, err := os.ReadFile(c.Path)
			if err != nil || hash(after) != digest {
				return errors.New("manifest changed during independent evaluation")
			}
			evaluations = append(evaluations, map[string]any{"manifest": c.Path, "sourceSHA256": digest, "package": c.SPM, "evaluation": json.RawMessage(metadata)})
		}
		body, err := json.MarshalIndent(evaluations, "", "  ")
		if err != nil {
			return err
		}
		if err := save(prefix+".evaluations.json", body); err != nil {
			return err
		}
	}
	proofSuffix := ".project-config.json"
	if pinned {
		proofSuffix = ".inspection.json"
	}
	for suffix, bytes := range map[string][]byte{".macho": binary, proofSuffix: proof, ".package.json": manifest} {
		if err := save(prefix+suffix, bytes); err != nil {
			return err
		}
	}
	evidence := map[string]any{"project": resolved, "build": built, "outputDirectory": output, "freshOutputRequested": len(os.Args) == 6, "executableSHA256": hash(binary), "bundledModules": files, "proofSHA256": hash(proof), "runtimeManifestSHA256": hash(manifest), "retainedPrefix": prefix, "scope": "actual unsigned arm64 simulator native build; no guest startup, physical signing, OTA installer or original Octane/Bamboo preset claim"}
	if ota {
		evidence["scope"] = "actual public OTA-enabled unsigned simulator build, compiled canonical stamp and retained record; no installer, guest, physical signing or original V8 ABI claim"
	}
	if pinned {
		evidence["scope"] = "actual pinned source projection unsigned iOS build, compiled Bamboo tokens; no native CSS application, guest or whole app claim"
	}
	encoded, err := json.MarshalIndent(evidence, "", "  ")
	if err != nil {
		return err
	}
	if err := save(prefix+".json", append(encoded, '\n')); err != nil {
		return err
	}
	if pinned {
		fmt.Printf("PASS actual public pinned-source iOS %s build, compiled marker/Bamboo tokens, native arm64 artifact and embedding globals; CSS application not exercised\n", configuration)
	} else {
		fmt.Printf("PASS actual public selected-config iOS %s build, compiled bundle/manifest/plugin proof, native arm64 artifact and embedding globals\n", configuration)
	}
	return nil
}
