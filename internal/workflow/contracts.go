// Package workflow coordinates stages. Adapters own only their declared stage.
package workflow

import (
	"context"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

type Resolver interface {
	Resolve(context.Context, string) (project.Resolved, error)
}

// Prepare and Compile return only after their children have stopped writing.
// The coordinator retains Lease through all mutating stages and child cleanup.
type Preparer interface {
	Prepare(context.Context, project.Resolved, workspace.Lease) (project.Prepared, error)
}
type Bundler interface {
	Bundle(context.Context, project.Resolved, project.Prepared, workspace.Lease) (project.Bundle, error)
}
type Compiler interface {
	Compile(context.Context, project.Prepared, project.Bundle, workspace.Lease) ([]project.Artifact, error)
}
type Devices interface {
	Discover(context.Context, string) ([]project.Device, error)
}
type Launcher interface {
	Launch(context.Context, project.Artifact, project.Device) (*Session, error)
}

// HookInvocation exposes only the stage data the compatibility adapter owns.
// Arguments is mutable only at before-build-task-args; other fields are inputs.
type HookInvocation struct {
	Name                   string
	Project                project.Resolved
	Prepared               project.Prepared
	Target                 project.Target
	Arguments              []string
	ArtifactPath, DeviceID string
}
type Hooks interface {
	Current() project.Resolved
	Run(context.Context, HookInvocation, workspace.Lease) ([]string, error)
}
