// Command swift qualifies a generated Swift input through public native builds.
package main

import (
	"context"
	"crypto/sha256"
	"debug/macho"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
	"github.com/octane-xplat/nativescript-cli/extension"
)

const swiftSource = `import Foundation
@objc(H1Generated)
public class H1Generated: NSObject {
    @objc public static func value() -> Int32 { return 42 }
}
`

type generated struct{}

func (generated) Manifest(context.Context) (extension.Manifest, error) {
	return extension.Manifest{ID: "swift-direct", Version: "1.0.0", API: extension.APIVersion, Phases: []extension.Phase{extension.Collect}, Required: []string{"native_files"}}, nil
}
func (generated) Invoke(context.Context, extension.Input) (extension.Result, error) {
	return extension.Result{NativeFiles: []extension.NativeFile{{Platform: "ios", Kind: "source", Path: "H1Generated.swift", Content: []byte(swiftSource)}}}, nil
}

func inspect(built ns.BuildResult, generated bool, saved string, configured bool) (map[string]any, error) {
	if len(built.Artifacts) != 1 || built.Artifacts[0].Kind != "app" {
		return nil, errors.New("expected one actual iOS app")
	}
	executable := filepath.Join(built.Artifacts[0].Path, "NativeScriptApp")
	f, err := macho.Open(executable)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	if f.Cpu != macho.CpuArm64 || f.Type != macho.TypeExec || f.Symtab == nil {
		return nil, errors.New("expected arm64 simulator executable with symbols")
	}
	found := false
	var symbols []string
	for _, symbol := range f.Symtab.Syms {
		if strings.Contains(symbol.Name, "H1Generated") {
			symbols = append(symbols, symbol.Name)
		}
		if symbol.Name == "_OBJC_CLASS_$_H1Generated" && symbol.Sect > 0 {
			found = true
		}
	}
	if found != generated {
		return nil, fmt.Errorf("generated Objective-C class definition presence=%t expected=%t", found, generated)
	}
	record, err := os.ReadFile(filepath.Join(built.Prepared.NativeDir, ".xplat/fingerprints/ios.json"))
	if err != nil {
		return nil, err
	}
	var fingerprint struct {
		Hash    string
		Sources []struct {
			Type, ID, FilePath, Hash string
		}
	}
	if err := json.Unmarshal(record, &fingerprint); err != nil || len(fingerprint.Hash) != 64 {
		return nil, errors.New("invalid canonical record")
	}
	count := 0
	for _, source := range fingerprint.Sources {
		matches := source.Type == "contents" && source.ID == "xplat-ns/extension-native/v1"
		if configured {
			matches = source.Type == "file" && source.FilePath == "native-source/ios/H1Configured/H1Generated.swift"
		}
		if matches {
			if len(source.Hash) != 64 {
				return nil, errors.New("generated native compatibility source excluded")
			}
			count++
		}
	}
	if (count == 1) != generated || count > 1 {
		return nil, errors.New("canonical native source membership differs")
	}
	stamp, err := os.ReadFile(filepath.Join(built.Artifacts[0].Path, "app/xplat-native.json"))
	if err != nil {
		return nil, err
	}
	var baked struct {
		Hash, Format string
		Release      bool
	}
	if json.Unmarshal(stamp, &baked) != nil || baked.Hash != fingerprint.Hash || baked.Format != "octane-xplat.native-fingerprint.v1" || baked.Release {
		return nil, errors.New("compiled canonical debug stamp mismatch")
	}
	binary, err := os.ReadFile(executable)
	if err != nil {
		return nil, err
	}
	for suffix, data := range map[string][]byte{".macho": binary, ".fingerprint.json": record, ".stamp.json": stamp} {
		file, err := os.OpenFile(saved+suffix, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			return nil, err
		}
		_, err = file.Write(data)
		if err = errors.Join(err, file.Close()); err != nil {
			return nil, err
		}
	}
	hash := sha256.Sum256(binary)
	return map[string]any{"build": built, "executableSHA256": hex.EncodeToString(hash[:]), "classDefinitionPresent": found, "classSymbols": symbols, "canonicalHash": fingerprint.Hash, "retainedPrefix": saved}, nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() (result error) {
	if len(os.Args) != 3 && len(os.Args) != 4 {
		return errors.New("usage: swift-consumer ABSOLUTE_APP NEW_EVIDENCE_JSON [configured-with|configured-removed]")
	}
	app, saved := os.Args[1], os.Args[2]
	phase := ""
	if len(os.Args) == 4 {
		phase = os.Args[3]
		if phase != "configured-with" && phase != "configured-removed" {
			return errors.New("unknown configured source phase")
		}
	}
	if !filepath.IsAbs(app) || !filepath.IsAbs(saved) {
		return errors.New("absolute app and evidence paths required")
	}
	if _, err := os.Stat(saved); !errors.Is(err, os.ErrNotExist) {
		return errors.New("evidence path must be new")
	}
	cwd, _ := os.Getwd()
	env := os.Environ()
	writer, flags, prefix := log.Writer(), log.Flags(), log.Prefix()
	evidence := map[string]any{"boundary": "real unsigned iOS simulator debug compilation and generated Swift class removal; no guest, runtime, installer or release claim"}
	if phase != "" {
		evidence["configuredPhase"] = phase
	}
	defer func() {
		now, _ := os.Getwd()
		globals := now == cwd && reflect.DeepEqual(env, os.Environ()) && log.Writer() == writer && log.Flags() == flags && log.Prefix() == prefix
		if !globals {
			result = errors.Join(result, errors.New("embedding globals changed"))
		}
		evidence["embeddingGlobalsPreserved"], evidence["passed"] = globals, result == nil
		if result != nil {
			evidence["failure"] = result.Error()
			var build *ns.BuildError
			if errors.As(result, &build) {
				evidence["failedStage"], evidence["exitCode"] = build.Stage, build.ExitCode
			}
		}
		data, _ := json.MarshalIndent(evidence, "", "  ")
		result = errors.Join(result, os.WriteFile(saved, append(data, '\n'), 0600))
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()
	q := ns.BuildRequest{ProjectDir: app, OutputDir: filepath.Join(app, "state"), Target: ns.Target{Platform: ns.IOS, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: "generic", Architecture: "arm64"}}, IOS: ns.IOSBuildOptions{SigningMode: "disabled"}}
	registrations := []extension.Extension{generated{}}
	if phase != "" {
		registrations = nil
	}
	client, err := ns.New(ns.Options{OTAStartup: true, Extensions: registrations})
	if err != nil {
		return err
	}
	built, err := client.Build(ctx, q)
	if err != nil {
		return err
	}
	evidence["build"] = built
	if phase != "" {
		present := phase == "configured-with"
		inspection, err := inspect(built, present, saved+"."+phase, true)
		if err != nil {
			return err
		}
		key := "removed"
		if present {
			key = "withNative"
		}
		evidence[key] = inspection
		fmt.Println("PASS configured Swift class definition and compiled canonical stamp", phase)
		return nil
	}
	first, err := inspect(built, true, saved+".with-native", false)
	if err != nil {
		return err
	}
	evidence["withNative"] = first
	plain, err := ns.New(ns.Options{OTAStartup: true})
	if err != nil {
		return err
	}
	removed, err := plain.Build(ctx, q)
	if err != nil {
		return err
	}
	second, err := inspect(removed, false, saved+".removed", false)
	if err != nil {
		return err
	}
	if removed.Prepared.Identity.Revision == built.Prepared.Identity.Revision || first["canonicalHash"] == second["canonicalHash"] {
		return errors.New("removal did not change native or canonical identity")
	}
	evidence["removed"] = second
	fmt.Println("PASS generated Swift class definition, compiled canonical stamp and native removal")
	return nil
}
