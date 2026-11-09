// Package build owns Xcode compilation and artifact validation, never preparation.
package build

import (
	"archive/zip"
	"bytes"
	"context"
	"debug/macho"
	"encoding/xml"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

var ErrSigning = errors.New("explicit signing inputs required")
var ErrArtifact = errors.New("missing or incompatible Xcode artifact")

// Failure identifies the failed stage. Diagnostic holds the tool's bounded
// captured output; callers must surface only its sanitized error summary.
type Failure struct {
	Stage      string
	ExitCode   int
	Diagnostic string
	Cause      error
}

func (e *Failure) Error() string { return "Xcode " + e.Stage + " failed" }
func (e *Failure) Unwrap() error { return e.Cause }

type Options struct{ Action, SigningMode, TeamID, Identity, ProvisioningProfile, ExportOptionsPlist string }
type Adapter struct {
	Options     Options
	Environment map[string]string
	Executor    process.Executor
}

func (a Adapter) Compile(ctx context.Context, p project.Prepared, b project.Bundle, lease workspace.Lease) ([]project.Artifact, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if lease == nil || !p.Identity.Compatible(b.Identity) || !p.Identity.Compatible(lease.Layout().Identity) || b.Directory != p.BundleDir || !filepath.IsAbs(p.NativeDir) || !filepath.IsAbs(b.Entry) {
		return nil, workflow.ErrHandoff
	}
	t := p.Identity.Target
	if t.Platform != "ios" {
		return nil, workflow.ErrUnavailable
	}
	if t.Configuration != "debug" && t.Configuration != "release" {
		return nil, workflow.ErrInvalid
	}
	if t.Architecture != "arm64" && !(t.Architecture == "x86_64" && t.DestinationKind == "simulator") {
		return nil, workflow.ErrInvalid
	}
	o := a.Options
	if o.Action == "" {
		o.Action = "build"
	}
	if o.Action != "build" && o.Action != "archive" && o.Action != "export" {
		return nil, workflow.ErrInvalid
	}
	if t.DestinationKind != "simulator" && t.DestinationKind != "device" {
		return nil, workflow.ErrInvalid
	}
	if t.DestinationKind == "simulator" && o.Action != "build" {
		return nil, workflow.ErrInvalid
	}
	if o.SigningMode == "" && t.DestinationKind == "simulator" {
		o.SigningMode = "disabled"
	}
	signing := []string{}
	switch o.SigningMode {
	case "disabled":
		if o.TeamID != "" || o.Identity != "" || o.ProvisioningProfile != "" || o.Action == "export" {
			return nil, ErrSigning
		}
		signing = append(signing, "CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO", "CODE_SIGN_IDENTITY=")
	case "automatic":
		if o.TeamID == "" || o.Identity != "" || o.ProvisioningProfile != "" {
			return nil, ErrSigning
		}
		signing = append(signing, "CODE_SIGN_STYLE=Automatic", "DEVELOPMENT_TEAM="+o.TeamID)
	case "manual":
		if o.TeamID == "" || o.Identity == "" || o.ProvisioningProfile == "" {
			return nil, ErrSigning
		}
		signing = append(signing, "CODE_SIGN_STYLE=Manual", "DEVELOPMENT_TEAM="+o.TeamID, "CODE_SIGN_IDENTITY="+o.Identity, "PROVISIONING_PROFILE_SPECIFIER="+o.ProvisioningProfile)
	default:
		return nil, ErrSigning
	}
	if o.Action == "export" {
		if !filepath.IsAbs(o.ExportOptionsPlist) {
			return nil, workflow.ErrInvalid
		}
		if st, e := os.Stat(o.ExportOptionsPlist); e != nil || !st.Mode().IsRegular() {
			return nil, workflow.ErrInvalid
		}
	} else if o.ExportOptionsPlist != "" {
		return nil, workflow.ErrInvalid
	}
	if runtime.GOOS != "darwin" {
		return nil, process.ErrUnavailable
	}
	owner, ok := lease.(interface {
		RunHelper(context.Context, func(context.Context) error) error
	})
	if !ok {
		return nil, workflow.ErrHandoff
	}
	executor := a.Executor
	if executor == nil {
		executor = process.Runner{}
	}
	var lastOutput string
	run := func(stage, tool string, args ...string) error {
		var output bytes.Buffer
		var exit process.Exit
		err := owner.RunHelper(ctx, func(ctx context.Context) error {
			h, err := executor.Start(ctx, process.Command{Executable: tool, Args: args, Dir: p.NativeDir, Environment: a.Environment, Output: func(_ context.Context, _ process.Stream, data []byte) error {
				if output.Len() < 1<<20 {
					output.Write(data[:min(len(data), (1<<20)-output.Len())])
				}
				return nil
			}})
			if err != nil {
				return err
			}
			exit, err = h.Wait()
			return err
		})
		lastOutput = output.String()
		if err != nil {
			return &Failure{Stage: stage, ExitCode: exit.Code, Cause: err, Diagnostic: output.String()}
		}
		return ctx.Err()
	}

	// Runtime 8.9's linker wrapper uses TOOLCHAIN_DIR, which Xcode may set to
	// an auxiliary Metal toolchain. Resolve Apple's selected C compiler explicitly.
	if err := run("toolchain", "xcrun", "--find", "clang"); err != nil {
		return nil, err
	}
	clang := strings.TrimSpace(lastOutput)
	if !filepath.IsAbs(clang) || strings.ContainsAny(clang, "\n\r") {
		return nil, process.ErrStart
	}
	// The published native project lives in a per-generation directory, so a
	// stable per-target mirror keeps the xcodeproj path and DerivedData valid
	// across builds; stale products are removed before each build.
	root := filepath.Join(lease.Layout().GeneratedRoot, workspace.MirrorName("xcode", t))
	if err := os.MkdirAll(root, 0700); err != nil {
		return nil, err
	}
	native := filepath.Join(root, "native")
	if err := workspace.SyncDir(native, p.NativeDir, nil); err != nil {
		return nil, err
	}
	if err := os.RemoveAll(filepath.Join(root, "products")); err != nil {
		return nil, err
	}
	if err := os.RemoveAll(filepath.Join(root, "NativeScriptApp.xcarchive")); err != nil {
		return nil, err
	}
	args := []string{"-scheme", "NativeScriptApp", "-configuration", strings.ToUpper(t.Configuration[:1]) + t.Configuration[1:]}
	selector := "-project"
	container := filepath.Join(native, "NativeScriptApp.xcodeproj")
	if st, e := os.Stat(filepath.Join(native, "NativeScriptApp.xcworkspace")); e == nil && st.IsDir() {
		selector = "-workspace"
		container = filepath.Join(native, "NativeScriptApp.xcworkspace")
	}
	args = append(args, selector, container)
	sdk, platform := "iphoneos", "iOS"
	if t.DestinationKind == "simulator" {
		sdk, platform = "iphonesimulator", "iOS Simulator"
	}
	destination := "generic/platform=" + platform
	if t.DestinationID != "generic" {
		if t.DestinationID == "" || strings.ContainsAny(t.DestinationID, ",\n\r=") {
			return nil, workflow.ErrInvalid
		}
		destination = "platform=" + platform + ",id=" + t.DestinationID
	}
	args = append(args, "-sdk", sdk, "-destination", destination, "-derivedDataPath", filepath.Join(root, "derived"), "ARCHS="+t.Architecture, "ONLY_ACTIVE_ARCH=YES", "NS_LD="+clang)
	args = append(args, signing...)
	products := filepath.Join(root, "products")
	archive := filepath.Join(root, "NativeScriptApp.xcarchive")
	app := filepath.Join(products, "NativeScriptApp.app")
	if o.Action == "build" {
		args = append(args, "CONFIGURATION_BUILD_DIR="+products, "build")
	} else {
		args = append(args, "-archivePath", archive, "archive")
		app = filepath.Join(archive, "Products", "Applications", "NativeScriptApp.app")
	}
	if err := run(o.Action, "xcodebuild", args...); err != nil {
		return nil, err
	}
	// Convert only a copy; Xcode products are not edited during discovery.
	inspect := func(app string) (string, error) {
		out := filepath.Join(root, "artifact.plist")
		if err := run("inspect", "/usr/bin/plutil", "-convert", "xml1", "-o", out, filepath.Join(app, "Info.plist")); err != nil {
			return "", errors.Join(ErrArtifact, err)
		}
		info, err := readInfo(out)
		if err != nil {
			return "", err
		}
		if info.ID == "" || info.Executable == "" || filepath.Base(info.Executable) != info.Executable || info.Platform != sdk {
			return "", ErrArtifact
		}
		if err = checkMachO(filepath.Join(app, info.Executable), t.Architecture, t.DestinationKind); err != nil {
			return "", err
		}
		return info.ID, nil
	}
	id, err := inspect(app)
	if err != nil {
		return nil, err
	}
	artifact := project.Artifact{Identity: p.Identity, Path: app, Kind: "app", ApplicationID: id}
	if o.Action != "build" {
		artifact.Path = archive
		artifact.Kind = "xcarchive"
	}
	if o.Action == "export" {
		export := filepath.Join(root, "export")
		if err = run("export", "xcodebuild", "-exportArchive", "-archivePath", archive, "-exportPath", export, "-exportOptionsPlist", o.ExportOptionsPlist); err != nil {
			return nil, err
		}
		files, err := filepath.Glob(filepath.Join(export, "*.ipa"))
		if err != nil || len(files) != 1 {
			return nil, ErrArtifact
		}
		z, err := zip.OpenReader(files[0])
		if err != nil {
			return nil, ErrArtifact
		}
		defer z.Close()
		unpack := filepath.Join(root, "exported.app")
		if err = os.Mkdir(unpack, 0700); err != nil {
			return nil, err
		}
		// Inspect only the app's identity and executable, with bounded extraction.
		found := 0
		for _, f := range z.File {
			parts := strings.Split(f.Name, "/")
			if len(parts) != 3 || parts[0] != "Payload" || !strings.HasSuffix(parts[1], ".app") {
				continue
			}
			if parts[2] != "Info.plist" && parts[2] != "NativeScriptApp" {
				continue
			}
			if f.UncompressedSize64 > 512<<20 {
				return nil, ErrArtifact
			}
			r, e := f.Open()
			if e != nil {
				return nil, ErrArtifact
			}
			data, e := io.ReadAll(io.LimitReader(r, 512<<20+1))
			r.Close()
			if e != nil || len(data) > 512<<20 {
				return nil, ErrArtifact
			}
			if e = os.WriteFile(filepath.Join(unpack, parts[2]), data, 0600); e != nil {
				return nil, e
			}
			found++
		}
		if found != 2 {
			return nil, ErrArtifact
		}
		exported, e := inspect(unpack)
		if e != nil || exported != id {
			return nil, ErrArtifact
		}
		artifact.Path = files[0]
		artifact.Kind = "ipa"
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	// Successful build: remove legacy random xcode-* namespaces; hash-shaped
	// names are live per-target mirrors and are never touched.
	if entries, e := os.ReadDir(lease.Layout().GeneratedRoot); e == nil {
		for _, entry := range entries {
			name := entry.Name()
			if !entry.IsDir() || !strings.HasPrefix(name, "xcode-") {
				continue
			}
			if len(name) == len("xcode-")+16 {
				hexName := true
				for _, c := range name[len("xcode-"):] {
					if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
						hexName = false
						break
					}
				}
				if hexName {
					continue
				}
			}
			os.RemoveAll(filepath.Join(lease.Layout().GeneratedRoot, name))
		}
	}
	return []project.Artifact{artifact}, nil
}

type appInfo struct{ ID, Executable, Platform string }

func readInfo(file string) (appInfo, error) {
	data, err := os.ReadFile(file)
	if err != nil {
		return appInfo{}, ErrArtifact
	}
	d := xml.NewDecoder(strings.NewReader(string(data)))
	result := appInfo{}
	key := ""
	for {
		token, e := d.Token()
		if e == io.EOF {
			break
		}
		if e != nil {
			return appInfo{}, ErrArtifact
		}
		if start, ok := token.(xml.StartElement); ok {
			if start.Name.Local == "key" {
				if d.DecodeElement(&key, &start) != nil {
					return appInfo{}, ErrArtifact
				}
			}
			if start.Name.Local == "string" {
				var value string
				if d.DecodeElement(&value, &start) != nil {
					return appInfo{}, ErrArtifact
				}
				switch key {
				case "CFBundleIdentifier":
					result.ID = value
				case "CFBundleExecutable":
					result.Executable = value
				case "CFBundleSupportedPlatforms":
					if value == "iPhoneOS" {
						result.Platform = "iphoneos"
					}
					if value == "iPhoneSimulator" {
						result.Platform = "iphonesimulator"
					}
				}
				key = ""
			}
		}
	}
	return result, nil
}
func checkMachO(file, arch, kind string) error {
	check := func(f *macho.File) bool {
		cpu := macho.CpuArm64
		if arch == "x86_64" {
			cpu = macho.CpuAmd64
		}
		if f.Cpu != cpu || f.Type != macho.TypeExec {
			return false
		}
		want := uint32(2)
		if kind == "simulator" {
			want = 7
		}
		for _, l := range f.Loads {
			raw := l.Raw()
			if len(raw) >= 12 && f.ByteOrder.Uint32(raw[:4]) == 0x32 {
				return f.ByteOrder.Uint32(raw[8:12]) == want
			}
		}
		return false
	}
	if f, e := macho.Open(file); e == nil {
		defer f.Close()
		if check(f) {
			return nil
		}
		return ErrArtifact
	}
	if f, e := macho.OpenFat(file); e == nil {
		defer f.Close()
		for _, a := range f.Arches {
			if check(a.File) {
				return nil
			}
		}
	}
	return ErrArtifact
}

// ValidateApplication rechecks an install handoff using a caller-owned XML copy
// of Info.plist. It does not compile, sign or modify the application.
func ValidateApplication(app, plist, applicationID, architecture, kind string) error {
	info, err := readInfo(plist)
	sdk := "iphoneos"
	if kind == "simulator" {
		sdk = "iphonesimulator"
	}
	if err != nil || info.ID != applicationID || info.Executable == "" || filepath.Base(info.Executable) != info.Executable || info.Platform != sdk {
		return ErrArtifact
	}
	return checkMachO(filepath.Join(app, info.Executable), architecture, kind)
}

// ApplicationExecutable reads the validated XML identity for process matching.
func ApplicationExecutable(plist string) (string, error) {
	info, err := readInfo(plist)
	if err != nil || info.Executable == "" || filepath.Base(info.Executable) != info.Executable {
		return "", ErrArtifact
	}
	return info.Executable, nil
}
