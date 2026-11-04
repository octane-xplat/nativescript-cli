package nativescript

import (
	"context"
	"errors"
	"github.com/octane-xplat/nativescript-cli/extension"
	"github.com/octane-xplat/nativescript-cli/internal/extensions"
	"io/fs"
	"maps"
	"path/filepath"

	androidbuild "github.com/octane-xplat/nativescript-cli/internal/android/build"
	androiddevice "github.com/octane-xplat/nativescript-cli/internal/android/device"
	androidprepare "github.com/octane-xplat/nativescript-cli/internal/android/prepare"
	"github.com/octane-xplat/nativescript-cli/internal/bundle"
	iosbuild "github.com/octane-xplat/nativescript-cli/internal/ios/build"
	iosdevice "github.com/octane-xplat/nativescript-cli/internal/ios/device"
	iosprepare "github.com/octane-xplat/nativescript-cli/internal/ios/prepare"
	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	resolver "github.com/octane-xplat/nativescript-cli/internal/resolve"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

// Client is safe for concurrent calls with immutable requests. Construction is
// lazy and has no process-global effects. Missing producers return ErrUnavailable.
type Client struct {
	options Options
	engine  workflow.Engine
}

func New(options Options) (*Client, error) {
	options.Environment = maps.Clone(options.Environment)
	options.Extensions = append([]extension.Extension(nil), options.Extensions...)
	files, _ := fs.Sub(helperFiles, "assets")
	engine := workflow.Engine{Factory: func(env map[string]string) workflow.Stages {
		var ota interface {
			Apply(context.Context, project.Resolved, project.Prepared, workspace.Lease) error
		}
		if options.OTAStartup {
			ota = extensions.OTAStartup{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: files}, Environment: env}}
		}
		return workflow.Stages{OTA: ota, Extensions: options.Extensions, Devices: platformDevices{env: env}, Launcher: platformDevices{env: env}, Preparer: platformPreparer{ios: iosprepare.Adapter{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: files}, Environment: env}}}, Bundler: bundle.Adapter{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: files}, Environment: env}}, Resolver: resolver.Resolver{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: files}, Environment: env}}}
	}}
	return &Client{options: options, engine: engine}, nil
}
func operationError(op string, err error) error {
	if err == nil {
		return nil
	}
	kind := ErrBuild
	switch {
	case errors.Is(err, ErrSink):
		return err
	case errors.Is(err, context.Canceled):
		kind = context.Canceled
	case errors.Is(err, context.DeadlineExceeded):
		kind = context.DeadlineExceeded
	case errors.Is(err, workflow.ErrInvalid), errors.Is(err, workspace.ErrInvalid), errors.Is(err, process.ErrInvalid):
		kind = ErrInvalidInput
	case errors.Is(err, workflow.ErrUnavailable), errors.Is(err, extensions.ErrOTAUnavailable):
		kind = ErrUnavailable
	case errors.Is(err, process.ErrUnavailable), errors.Is(err, workspace.ErrUnavailable):
		kind = ErrUnsupportedHost
	case errors.Is(err, workspace.ErrBusy):
		kind = ErrContention
	case errors.Is(err, iosbuild.ErrSigning), errors.Is(err, androidbuild.ErrSigning):
		kind = ErrSigning
	case errors.Is(err, process.ErrStart):
		kind = ErrToolchain
	}
	cause := err
	var native *iosbuild.Failure
	if errors.As(err, &native) {
		cause = &BuildError{Stage: native.Stage, ExitCode: native.ExitCode, Cause: err}
	}
	var android *androidbuild.Failure
	if errors.As(err, &android) {
		cause = &BuildError{Stage: android.Stage, ExitCode: android.ExitCode, Cause: err}
	}
	result := &OperationError{Operation: op, Kind: kind, Cause: cause}
	if errors.Is(err, androidbuild.ErrArtifact) {
		result.Advice = androidbuild.ErrArtifact.Error()
	}
	if errors.Is(err, androidbuild.ErrSigning) {
		result.Advice = androidbuild.ErrSigning.Error()
	}
	var diagnostic *resolver.Diagnostic
	if errors.As(err, &diagnostic) {
		result.Advice = diagnostic.Message
	}
	return result
}
func (c *Client) notify(op string) workflow.Notify {
	e := &emitter{sink: c.options.Sink, operation: op}
	return func(ctx context.Context, start bool, stage string) error {
		kind := StageCompleted
		if start {
			kind = StageStarted
		}
		return e.emit(ctx, kind, stage)
	}
}
func (c *Client) stages() workflow.Stages { return c.engine.Stages(maps.Clone(c.options.Environment)) }
func (c *Client) Resolve(ctx context.Context, r ResolveRequest) (Project, error) {
	if err := ctx.Err(); err != nil {
		return Project{}, operationError("resolve", err)
	}
	if !filepath.IsAbs(r.ProjectDir) {
		return Project{}, operationError("resolve", workflow.ErrInvalid)
	}
	p, err := workflow.Resolve(ctx, c.stages(), r.ProjectDir, c.notify("resolve"))
	if err != nil {
		return Project{}, operationError("resolve", err)
	}
	result := Project{Directory: p.Directory, Revision: p.Revision, ApplicationID: p.ApplicationID,
		Config: ProjectConfig{AppPath: p.Config.AppPath, AppResourcesPath: p.Config.AppResourcesPath, Android: AndroidRuntimeConfig(p.Config.Android)}}
	for _, v := range p.Packages {
		result.Packages = append(result.Packages, InstalledPackage{Name: v.Name, Version: v.Version, Directory: v.Directory, Native: v.Native, IOSRequirement: v.IOSRequirement, AndroidRequirement: v.AndroidRequirement, Android: AndroidRuntimeConfig(v.Android)})
	}
	for _, v := range p.Dependencies {
		result.Dependencies = append(result.Dependencies, InstalledDependency(v))
	}
	for _, v := range p.Contributions {
		result.Contributions = append(result.Contributions, NativeContribution(v))
	}
	for _, v := range p.Sources {
		result.Sources = append(result.Sources, ProjectSource(v))
	}
	return result, nil
}
func internalRequest(r BuildRequest) workflow.Request {
	return workflow.Request{ProjectDir: r.ProjectDir, OutputDir: r.OutputDir, Target: internalTarget(r.Target)}
}
func prepared(p project.Prepared) PreparedProject {
	return PreparedProject{Identity: publicIdentity(p.Identity), NativeDir: p.NativeDir, BundleDir: p.BundleDir}
}
func (c *Client) Prepare(ctx context.Context, r PrepareRequest) (PreparedProject, error) {
	q := BuildRequest{ProjectDir: r.ProjectDir, OutputDir: r.OutputDir, Target: r.Target}
	if err := ctx.Err(); err != nil {
		return PreparedProject{}, operationError("prepare", err)
	}
	if !validBuild(q) {
		return PreparedProject{}, operationError("prepare", workflow.ErrInvalid)
	}
	s, n := c.stages(), c.notify("prepare")
	resolved, err := workflow.Resolve(ctx, s, q.ProjectDir, n)
	if err != nil {
		return PreparedProject{}, operationError("prepare", err)
	}
	p, _, err := c.engine.Native(ctx, s, resolved, internalRequest(q), false, n)
	if err != nil {
		return PreparedProject{}, operationError("prepare", err)
	}
	return prepared(p), nil
}
func (c *Client) build(ctx context.Context, r BuildRequest, s workflow.Stages, n workflow.Notify) (BuildResult, error) {
	if r.Target.Platform == IOS && s.Compiler == nil {
		s.Compiler = iosbuild.Adapter{Environment: maps.Clone(c.options.Environment), Options: iosbuild.Options{Action: r.IOS.Action, SigningMode: r.IOS.SigningMode, TeamID: r.IOS.TeamID, Identity: r.IOS.Identity, ProvisioningProfile: r.IOS.ProvisioningProfile, ExportOptionsPlist: r.IOS.ExportOptionsPlist}}
	}
	if r.Target.Platform == Android && s.Compiler == nil {
		s.Compiler = androidbuild.Adapter{Environment: maps.Clone(c.options.Environment), Options: androidbuild.Options{Format: r.Android.Format, Keystore: r.Android.Keystore, Alias: r.Android.Alias, StorePasswordEnv: r.Android.StorePasswordEnv, KeyPasswordEnv: r.Android.KeyPasswordEnv}}
	}
	resolved, err := workflow.Resolve(ctx, s, r.ProjectDir, n)
	if err != nil {
		return BuildResult{}, err
	}
	p, a, err := c.engine.Native(ctx, s, resolved, internalRequest(r), true, n)
	if err != nil {
		return BuildResult{}, err
	}
	result := BuildResult{Prepared: prepared(p)}
	for _, v := range a {
		result.Artifacts = append(result.Artifacts, Artifact{Identity: publicIdentity(v.Identity), Path: v.Path, Kind: v.Kind, ApplicationID: v.ApplicationID})
	}
	return result, nil
}
func (c *Client) Build(ctx context.Context, r BuildRequest) (BuildResult, error) {
	if err := ctx.Err(); err != nil {
		return BuildResult{}, operationError("build", err)
	}
	if !validBuild(r) {
		return BuildResult{}, operationError("build", workflow.ErrInvalid)
	}
	result, err := c.build(ctx, r, c.stages(), c.notify("build"))
	return result, operationError("build", err)
}
func (c *Client) Devices(ctx context.Context, q DeviceQuery) ([]Device, error) {
	if err := ctx.Err(); err != nil {
		return nil, operationError("devices", err)
	}
	if q.Platform != IOS && q.Platform != Android {
		return nil, operationError("devices", workflow.ErrInvalid)
	}
	d, err := workflow.Discover(ctx, c.stages(), string(q.Platform), c.notify("devices"))
	if err != nil {
		return nil, operationError("devices", err)
	}
	var result []Device
	for _, v := range d {
		result = append(result, Device{ID: v.ID, Name: v.Name, Platform: Platform(v.Platform), Kind: DestinationKind(v.Kind), Architecture: v.Architecture, State: v.State})
	}
	return result, nil
}
func (c *Client) Run(ctx context.Context, r RunRequest) (*Session, error) {
	if err := ctx.Err(); err != nil {
		return nil, operationError("run", err)
	}
	if !validBuild(r.Build) || r.DeviceID == "" || r.DeviceID != r.Build.Target.Destination.ID {
		return nil, operationError("run", workflow.ErrInvalid)
	}
	s, n := c.stages(), c.notify("run")
	if _, ok := s.Launcher.(platformDevices); ok {
		s.Launcher = platformDevices{env: maps.Clone(c.options.Environment), boot: r.AllowBoot, physical: r.AllowPhysicalDevice, reverse: r.AndroidReverse}
	}
	if _, ok := s.Launcher.(iosdevice.Adapter); ok {
		s.Launcher = iosdevice.Adapter{Environment: maps.Clone(c.options.Environment), AllowBoot: r.AllowBoot, AllowPhysicalDevice: r.AllowPhysicalDevice}
	}
	// Exact selection is validated before a costly build or installation.
	devices, err := workflow.Discover(ctx, s, string(r.Build.Target.Platform), n)
	if err != nil {
		return nil, operationError("run", err)
	}
	var selected *project.Device
	for i := range devices {
		d := &devices[i]
		t := r.Build.Target
		if d.ID == r.DeviceID && d.Kind == string(t.Destination.Kind) && d.Architecture == t.Destination.Architecture {
			selected = d
		}
	}
	if selected == nil {
		return nil, operationError("run", workflow.ErrInvalid)
	}
	if s.Launcher == nil {
		return nil, operationError("run", workflow.ErrUnavailable)
	}
	var result BuildResult
	if r.Artifact != nil {
		result.Artifacts = []Artifact{*r.Artifact}
	} else {
		result, err = c.build(ctx, r.Build, s, n)
	}
	if err != nil {
		return nil, operationError("run", err)
	}
	var a []project.Artifact
	for _, v := range result.Artifacts {
		a = append(a, project.Artifact{Identity: project.Identity{Schema: v.Identity.Schema, Revision: v.Identity.Revision, ProjectDir: v.Identity.ProjectDir, Target: internalTarget(v.Identity.Target)}, Path: v.Path, Kind: v.Kind, ApplicationID: v.ApplicationID})
	}
	owned, err := workflow.Launch(ctx, s, a, *selected, n)
	if err != nil {
		return nil, operationError("run", err)
	}
	return &Session{owned: owned}, nil
}
func validBuild(r BuildRequest) bool {
	t := r.Target
	return filepath.IsAbs(r.ProjectDir) && filepath.IsAbs(r.OutputDir) && (t.Platform == IOS || t.Platform == Android) && (t.Configuration == Debug || t.Configuration == Release) && (t.Destination.Kind == Simulator || t.Destination.Kind == PhysicalDevice) && t.Destination.ID != "" && t.Destination.Architecture != ""
}
func internalTarget(t Target) project.Target {
	return project.Target{Platform: string(t.Platform), DestinationKind: string(t.Destination.Kind), DestinationID: t.Destination.ID, Architecture: t.Destination.Architecture, Configuration: string(t.Configuration)}
}
func publicIdentity(i project.Identity) Identity {
	return Identity{Schema: i.Schema, Revision: i.Revision, ProjectDir: i.ProjectDir, Target: Target{Platform: Platform(i.Target.Platform), Configuration: Configuration(i.Target.Configuration), Destination: Destination{Kind: DestinationKind(i.Target.DestinationKind), ID: i.Target.DestinationID, Architecture: i.Target.Architecture}}}
}

// platformPreparer selects only the adapter for the explicit target.
type platformPreparer struct{ ios iosprepare.Adapter }

func (p platformPreparer) Validate(r project.Resolved, t project.Target) error {
	if t.Platform == "android" {
		return (androidprepare.Adapter{}).Validate(r, t)
	}
	return p.ios.Validate(r, t)
}
func (p platformPreparer) Prepare(ctx context.Context, r project.Resolved, l workspace.Lease) (project.Prepared, error) {
	if l.Layout().Identity.Target.Platform == "android" {
		return (androidprepare.Adapter{}).Prepare(ctx, r, l)
	}
	return p.ios.Prepare(ctx, r, l)
}

// platformDevices dispatches native-only operations without starting the helper.
type platformDevices struct {
	env            map[string]string
	boot, physical bool
	reverse        []AndroidReverse
}

func (p platformDevices) Discover(ctx context.Context, platform string) ([]project.Device, error) {
	if platform == "android" {
		return (androiddevice.Adapter{Environment: p.env}).Discover(ctx, platform)
	}
	return (iosdevice.Adapter{Environment: p.env}).Discover(ctx, platform)
}
func (p platformDevices) Launch(ctx context.Context, a project.Artifact, d project.Device) (*workflow.Session, error) {
	if d.Platform == "android" {
		var rs []androiddevice.Reverse
		for _, r := range p.reverse {
			rs = append(rs, androiddevice.Reverse{DevicePort: r.DevicePort, HostPort: r.HostPort})
		}
		return (androiddevice.Adapter{Environment: p.env, AllowPhysicalDevice: p.physical, Reverse: rs}).Launch(ctx, a, d)
	}
	return (iosdevice.Adapter{Environment: p.env, AllowBoot: p.boot, AllowPhysicalDevice: p.physical}).Launch(ctx, a, d)
}
