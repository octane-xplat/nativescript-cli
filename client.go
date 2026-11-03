package nativescript

import (
	"context"
	"errors"
	"maps"
	"path/filepath"

	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
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
	return &Client{options: options}, nil
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
	case errors.Is(err, workflow.ErrUnavailable):
		kind = ErrUnavailable
	case errors.Is(err, process.ErrUnavailable), errors.Is(err, workspace.ErrUnavailable):
		kind = ErrUnsupportedHost
	case errors.Is(err, workspace.ErrBusy):
		kind = ErrContention
	case errors.Is(err, process.ErrStart):
		kind = ErrToolchain
	}
	return &OperationError{Operation: op, Kind: kind, Cause: err}
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
	return Project{Directory: p.Directory, Revision: p.Revision, ApplicationID: p.ApplicationID}, nil
}
func internalRequest(r BuildRequest) workflow.Request {
	return workflow.Request{ProjectDir: r.ProjectDir, OutputDir: r.OutputDir, Target: internalTarget(r.Target)}
}
func prepared(p project.Prepared) PreparedProject {
	return PreparedProject{Identity: publicIdentity(p.Identity), NativeDir: p.NativeDir, BundleDir: p.BundleDir}
}
func (c *Client) Prepare(ctx context.Context, r PrepareRequest) (PreparedProject, error) {
	q := BuildRequest(r)
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
	result, err := c.build(ctx, r.Build, s, n)
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
