// Package prepare owns the fresh iOS runtime project and dependency-tool writes.
package prepare

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

type Adapter struct {
	Host     jsbridge.Host
	Executor process.Executor
}

func (a Adapter) Prepare(ctx context.Context, r project.Resolved, lease workspace.Lease) (project.Prepared, error) {
	if err := ctx.Err(); err != nil {
		return project.Prepared{}, err
	}
	if lease == nil {
		return project.Prepared{}, workflow.ErrHandoff
	}
	l := lease.Layout()
	if l.Identity.Target.Platform != "ios" {
		return project.Prepared{}, workflow.ErrUnavailable
	}
	if r.Directory != l.Identity.ProjectDir || r.Revision != l.Identity.Revision {
		return project.Prepared{}, workflow.ErrHandoff
	}
	owner, ok := lease.(interface {
		RunHelper(context.Context, func(context.Context) error) error
	})
	if !ok {
		return project.Prepared{}, workflow.ErrHandoff
	}
	h := a.Host
	h.ProjectDir = r.Directory
	if h.CacheDir == "" {
		cache, err := os.UserCacheDir()
		if err != nil {
			return project.Prepared{}, err
		}
		h.CacheDir = filepath.Join(cache, "octane-xplat", "nativescript-cli", "helper")
	}
	dir := filepath.Join(l.GeneratedRoot, "ios")
	payload, _ := json.Marshal(struct {
		Resolved  project.Resolved `json:"resolved"`
		Directory string           `json:"directory"`
	}{r, dir})
	var result struct {
		Directory, ProjectFile, Target string
		Pods, SPM                      bool
		LocalSwiftPackages             []project.LocalSwiftPackageEvaluation
	}
	err := owner.RunHelper(ctx, func(ctx context.Context) error {
		f, err := h.Call(ctx, jsbridge.Request{Version: jsbridge.ProtocolVersion, ID: "prepare-ios", Feature: "xcode", Operation: "prepare", Payload: payload}, nil)
		if err != nil {
			var remote *jsbridge.RemoteError
			if errors.As(err, &remote) {
				if remote.Failure.Code == "unavailable" {
					return fmt.Errorf("iOS preparation requires installed @nativescript/ios 8.9.0 or 9.1.0 and supported native inputs/tools: %w", workflow.ErrUnavailable)
				}
				if remote.Failure.Code == "invalid_input" {
					return workflow.ErrInvalid
				}
			}
			return err
		}
		if json.Unmarshal(f.Payload, &result) != nil || result.Directory != dir || result.ProjectFile != filepath.Join(dir, "NativeScriptApp.xcodeproj", "project.pbxproj") || result.Target != "NativeScriptApp" {
			return workflow.ErrHandoff
		}
		if err := project.ValidateLocalSwiftPackages(r, result.LocalSwiftPackages); err != nil {
			return errors.Join(workflow.ErrHandoff, err)
		}
		// Tools retain the same lease; never return while they or descendants write.
		executor := a.Executor
		if executor == nil {
			executor = process.Runner{}
		}
		run := func(tool string, args ...string) error {
			if runtime.GOOS != "darwin" {
				return workflow.ErrUnavailable
			}
			child, err := executor.Start(ctx, process.Command{Executable: tool, Args: args, Dir: dir, Environment: h.Environment})
			if errors.Is(err, process.ErrStart) {
				return fmt.Errorf("iOS dependency tool %s required: %w", tool, workflow.ErrUnavailable)
			}
			if err != nil {
				return err
			}
			_, err = child.Wait()
			if err != nil {
				return fmt.Errorf("iOS dependency tool %s failed: %w", tool, err)
			}
			return nil
		}
		if result.Pods {
			if err = run("pod", "install"); err != nil {
				return err
			}
		}
		if result.SPM {
			args := []string{"-resolvePackageDependencies", "-skipPackageUpdates", "-scheme", result.Target}
			if result.Pods {
				args = append(args, "-workspace", filepath.Join(dir, result.Target+".xcworkspace"))
			} else {
				args = append(args, "-project", filepath.Dir(result.ProjectFile))
			}
			if err = run("xcodebuild", args...); err != nil {
				return err
			}
		}
		return ctx.Err()
	})
	if err != nil {
		return project.Prepared{}, err
	}
	return project.Prepared{Identity: l.Identity, NativeDir: dir, BundleDir: filepath.Join(dir, "app"), LocalSwiftPackages: result.LocalSwiftPackages}, nil
}

// Validate checks lazy prerequisites before the coordinator creates output state.
func (a Adapter) Validate(r project.Resolved, target project.Target) error {
	if target.Platform != "ios" {
		return workflow.ErrUnavailable
	}
	var installed, present string
	for _, p := range r.Packages {
		if p.Name == "@nativescript/ios" {
			present = p.Version
			if project.RuntimeSupported("ios", p.Version) {
				installed = p.Version
			}
		}
	}
	for _, p := range r.Packages {
		if p.IOSRequirement != "" && !project.RuntimeSatisfies(installed, p.IOSRequirement) {
			version := installed
			if version == "" {
				version = present
			}
			if version == "" {
				version = "none"
			}
			return &workflow.PackageRequirement{Package: p.Name, Platform: "ios", Requirement: p.IOSRequirement, Installed: version}
		}
	}
	for _, p := range r.Packages {
		if p.Name == "@nativescript/ios" && project.RuntimeSupported("ios", p.Version) {
			if st, err := os.Stat(filepath.Join(p.Directory, "framework", "__PROJECT_NAME__.xcodeproj", "project.pbxproj")); err == nil && st.Mode().IsRegular() {
				return nil
			}
		}
	}
	return fmt.Errorf("install @nativescript/ios 8.9.0 or 9.1.0 explicitly before preparing: %w", workflow.ErrUnavailable)
}
