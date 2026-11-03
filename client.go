package nativescript

import (
	"context"
	"maps"
	"path/filepath"

	"github.com/octane-xplat/nativescript-cli/internal/project"
)

// Client is safe for concurrent calls. Requests must not be mutated during a call.
// It has no global cwd, environment, logging or signal effects. Construction does
// not discover tools or launch processes. Production adapters are not installed yet.
type Client struct {
	options Options
	build   func(context.Context, BuildRequest, map[string]string) (project.Prepared, []project.Artifact, error)
}

func New(options Options) (*Client, error) {
	options.Environment = maps.Clone(options.Environment)
	return &Client{options: options}, nil
}
func unavailable(ctx context.Context, operation string) error {
	if err := ctx.Err(); err != nil {
		return &OperationError{Operation: operation, Kind: err}
	}
	return &OperationError{Operation: operation, Kind: ErrUnavailable}
}
func (c *Client) Resolve(ctx context.Context, request ResolveRequest) (Project, error) {
	return Project{}, unavailable(ctx, "resolve")
}
func (c *Client) Prepare(ctx context.Context, request PrepareRequest) (PreparedProject, error) {
	return PreparedProject{}, unavailable(ctx, "prepare")
}
func (c *Client) Devices(ctx context.Context, query DeviceQuery) ([]Device, error) {
	return nil, unavailable(ctx, "devices")
}
func (c *Client) Run(ctx context.Context, request RunRequest) (*Session, error) {
	return nil, unavailable(ctx, "run")
}
func (c *Client) Build(ctx context.Context, request BuildRequest) (BuildResult, error) {
	if err := ctx.Err(); err != nil {
		return BuildResult{}, &OperationError{Operation: "build", Kind: err}
	}
	if !validBuild(request) {
		return BuildResult{}, &OperationError{Operation: "build", Kind: ErrInvalidInput}
	}
	if c.build == nil {
		return BuildResult{}, unavailable(ctx, "build")
	}
	e := emitter{sink: c.options.Sink, operation: "build"}
	if err := e.emit(ctx, StageStarted, "build"); err != nil {
		return BuildResult{}, err
	}
	p, artifacts, err := c.build(ctx, request, maps.Clone(c.options.Environment))
	if err != nil {
		return BuildResult{}, &OperationError{Operation: "build", Kind: ErrBuild, Cause: err}
	}
	if !p.Identity.Compatible(project.Identity{Schema: p.Identity.Schema, Revision: p.Identity.Revision, ProjectDir: request.ProjectDir, Target: internalTarget(request.Target)}) || len(artifacts) == 0 {
		return BuildResult{}, &OperationError{Operation: "build", Kind: ErrBuild}
	}
	result := BuildResult{Prepared: PreparedProject{Identity: publicIdentity(p.Identity), NativeDir: p.NativeDir, BundleDir: p.BundleDir}}
	for _, a := range artifacts {
		if !a.Identity.Compatible(p.Identity) || !filepath.IsAbs(a.Path) {
			return BuildResult{}, &OperationError{Operation: "build", Kind: ErrBuild}
		}
		result.Artifacts = append(result.Artifacts, Artifact{Identity: publicIdentity(a.Identity), Path: a.Path, Kind: a.Kind, ApplicationID: a.ApplicationID})
	}
	if err := e.emit(ctx, StageCompleted, "build"); err != nil {
		return BuildResult{}, err
	}
	return result, nil
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
