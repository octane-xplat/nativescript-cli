package workflow

import (
	"context"
	"errors"
	"github.com/octane-xplat/nativescript-cli/extension"
	"github.com/octane-xplat/nativescript-cli/internal/extensions"
	"path/filepath"

	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

var (
	ErrUnavailable = errors.New("stage not implemented")
	ErrInvalid     = errors.New("invalid workflow input")
	ErrHandoff     = errors.New("incompatible stage output")
)

// PackageRequirement is safe remediation naming the first native package whose
// declared platform requirement the installed runtime cannot satisfy.
type PackageRequirement struct {
	Package, Platform, Requirement, Installed string
}

func (e *PackageRequirement) Error() string {
	return "package " + e.Package + " requires " + e.Platform + " " + e.Requirement + " but the project has " + e.Installed
}
func (e *PackageRequirement) Unwrap() error { return ErrUnavailable }

type Request struct {
	ProjectDir, OutputDir string
	Target                project.Target
}

// Stages is a per-operation set of adapters. Factory receives a private copy of
// environment overrides; adapters must never mutate process-global state.
type Stages struct {
	OTA interface {
		Apply(context.Context, project.Resolved, project.Prepared, workspace.Lease) error
	}
	Extensions []extension.Extension
	Resolver   Resolver
	Preparer   Preparer
	Bundler    Bundler
	Compiler   Compiler
	Devices    Devices
	Launcher   Launcher
}
type Engine struct {
	Factory func(map[string]string) Stages
	Locker  workspace.Locker
}

func (e Engine) Stages(env map[string]string) Stages {
	if e.Factory == nil {
		return Stages{}
	}
	return e.Factory(env)
}

// Notify runs only outside leases. Mutating stages form one transaction and
// expose one native stage; no user callback interrupts its writer ownership.
type Notify func(context.Context, bool, string) error

func stage(ctx context.Context, notify Notify, name string, work func() error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if notify != nil {
		if err := notify(ctx, true, name); err != nil {
			return err
		}
	}
	if err := work(); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if notify != nil {
		return notify(ctx, false, name)
	}
	return nil
}
func Resolve(ctx context.Context, s Stages, dir string, notify Notify) (r project.Resolved, err error) {
	err = stage(ctx, notify, "resolve", func() error {
		if !filepath.IsAbs(dir) {
			return ErrInvalid
		}
		if s.Resolver == nil {
			return ErrUnavailable
		}
		var err error
		r, err = s.Resolver.Resolve(ctx, dir)
		if err != nil {
			return err
		}
		if r.Directory != dir || r.Revision == "" || r.ApplicationID == "" {
			return ErrHandoff
		}
		return nil
	})
	if err != nil {
		r = project.Resolved{}
	}
	return
}

// Native keeps a single F2 lease through preparation, bundle and compilation.
// Adapters receive the lease explicitly and must retire children before return.
func (e Engine) Native(ctx context.Context, s Stages, r project.Resolved, q Request, build bool, notify Notify) (project.Prepared, []project.Artifact, error) {
	p, _, a, err := e.native(ctx, s, r, q, build, false, notify)
	return p, a, err
}

// Bundle prepares and bundles without invoking a native compiler. The caller
// must establish that the installed native inputs have not changed.
func (e Engine) Bundle(ctx context.Context, s Stages, r project.Resolved, q Request, notify Notify) (project.Prepared, project.Bundle, error) {
	p, b, _, err := e.native(ctx, s, r, q, true, true, notify)
	return p, b, err
}

func (e Engine) native(ctx context.Context, s Stages, r project.Resolved, q Request, build, bundleOnly bool, notify Notify) (p project.Prepared, b project.Bundle, a []project.Artifact, err error) {
	name := "native"
	if bundleOnly {
		name = "bundle"
	}
	err = stage(ctx, notify, name, func() (err error) {
		if s.Preparer == nil || (build && (s.Bundler == nil || (!bundleOnly && s.Compiler == nil))) {
			return ErrUnavailable
		}
		if validator, ok := s.Preparer.(interface {
			Validate(project.Resolved, project.Target) error
		}); ok {
			if err := validator.Validate(r, q.Target); err != nil {
				return err
			}
		}
		registry, err := extensions.New(ctx, s.Extensions, q.Target.Platform)
		if err != nil {
			return err
		}
		input := extension.Input{Phase: extension.Collect, Project: r.Directory, Platform: q.Target.Platform, Configuration: q.Target.Configuration, Revision: r.Revision}
		for _, p := range r.Packages {
			if p.Native {
				input.Pins = append(input.Pins, extension.Pin{Name: p.Name, Version: p.Version})
			}
		}
		collected, err := registry.Invoke(ctx, input)
		if err != nil {
			return err
		}
		nativeInputs, err := extensions.NormalizeNative(collected.Native, q.Target.Platform)
		if err != nil {
			return err
		}
		if len(nativeInputs) > 0 {
			r.SourceRevision = r.Revision
			r.Revision = extensions.NativeRevision(r.Revision, nativeInputs)
			input.Revision = r.Revision
		}
		l, err := workspace.NewLayout(q.OutputDir, project.Identity{Schema: 1, Revision: r.Revision, ProjectDir: r.Directory, Target: q.Target})
		if err != nil {
			return err
		}
		locker := e.Locker
		if locker == nil {
			locker = workspace.Manager{}
		}
		lease, err := locker.Acquire(ctx, l)
		if err != nil {
			return err
		}
		defer func() { err = errors.Join(err, lease.Release()) }()
		// Resolution follows the caller path; native identities use the canonical path.
		r.Directory = l.Identity.ProjectDir
		r, err = extensions.MaterializeNative(ctx, r, lease, nativeInputs)
		if err != nil {
			return err
		}
		p, err = s.Preparer.Prepare(ctx, r, lease)
		if err != nil {
			return err
		}
		if !p.Identity.Compatible(l.Identity) || !filepath.IsAbs(p.NativeDir) || !filepath.IsAbs(p.BundleDir) {
			return ErrHandoff
		}
		if s.OTA != nil && !build {
			if err = s.OTA.Apply(ctx, r, p, lease); err != nil {
				return err
			}
		}
		input.Phase = extension.Prepared
		preparedFiles, err := registry.Invoke(ctx, input)
		if err != nil {
			return err
		}
		if err = extensions.Apply(ctx, p.NativeDir, append(collected.Files, preparedFiles.Files...)); err != nil {
			return err
		}
		if err = ctx.Err(); err != nil || !build {
			return err
		}
		b, err = s.Bundler.Bundle(ctx, r, p, lease)
		if err != nil {
			return err
		}
		if !b.Identity.Compatible(p.Identity) || b.Directory != p.BundleDir || !filepath.IsAbs(b.Entry) {
			return ErrHandoff
		}
		if err = ctx.Err(); err != nil {
			return err
		}
		if bundleOnly {
			return nil
		}
		if s.OTA != nil {
			if err = s.OTA.Apply(ctx, r, p, lease); err != nil {
				return err
			}
		}
		a, err = s.Compiler.Compile(ctx, p, b, lease)
		if err != nil {
			return err
		}
		if len(a) == 0 {
			return ErrHandoff
		}
		for _, v := range a {
			if !v.Identity.Compatible(p.Identity) || !filepath.IsAbs(v.Path) || v.Kind == "" || v.ApplicationID != r.ApplicationID {
				return ErrHandoff
			}
		}
		input.Phase = extension.PostBuild
		for _, artifact := range a {
			input.Artifacts = append(input.Artifacts, extension.Artifact{Path: artifact.Path, Kind: artifact.Kind, ApplicationID: artifact.ApplicationID})
		}
		postFiles, err := registry.Invoke(ctx, input)
		if err != nil {
			return err
		}
		if err = extensions.Apply(ctx, p.NativeDir, append(append(collected.Files, preparedFiles.Files...), postFiles.Files...)); err != nil {
			return err
		}
		return ctx.Err()
	})
	if err != nil {
		p = project.Prepared{}
		b = project.Bundle{}
		a = nil
	}
	return
}
func Discover(ctx context.Context, s Stages, platform string, notify Notify) (devices []project.Device, err error) {
	err = stage(ctx, notify, "devices", func() error {
		if s.Devices == nil {
			return ErrUnavailable
		}
		var err error
		devices, err = s.Devices.Discover(ctx, platform)
		if err != nil {
			return err
		}
		seen := map[string]bool{}
		for _, d := range devices {
			if d.ID == "" || d.Platform != platform || seen[d.ID] {
				return ErrHandoff
			}
			seen[d.ID] = true
		}
		return nil
	})
	if err != nil {
		devices = nil
	}
	return
}
func Launch(ctx context.Context, s Stages, a []project.Artifact, d project.Device, notify Notify) (session *Session, err error) {
	err = stage(ctx, notify, "launch", func() error {
		if s.Launcher == nil {
			return ErrUnavailable
		}
		for _, v := range a {
			t := v.Identity.Target
			if t.Platform == d.Platform && (t.DestinationID == d.ID || t.DestinationID == "generic") && t.DestinationKind == d.Kind && t.Architecture == d.Architecture {
				var err error
				session, err = s.Launcher.Launch(ctx, v, d)
				if err == nil && session == nil {
					return ErrHandoff
				}
				return err
			}
		}
		return ErrHandoff
	})
	if err != nil && session != nil {
		err = errors.Join(err, session.Close(context.Background()))
		session = nil
	}
	return
}
