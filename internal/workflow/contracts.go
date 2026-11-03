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
	Bundle(context.Context, project.Resolved, project.Prepared) (project.Bundle, error)
}
type Compiler interface {
	Compile(context.Context, project.Prepared, project.Bundle) ([]project.Artifact, error)
}
type Devices interface {
	Discover(context.Context, string) ([]project.Device, error)
}
type Launcher interface {
	Launch(context.Context, project.Artifact, project.Device) (*Session, error)
}
