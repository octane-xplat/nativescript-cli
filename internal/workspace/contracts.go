// Package workspace owns generated state and single-writer leases.
package workspace

import (
	"context"
	"github.com/octane-xplat/nativescript-cli/internal/project"
)

// Layout identifies destination/configuration-isolated generated and bundle roots.
// Project-state mutations also require a project-wide lease, across destinations.
type Layout struct {
	Identity      project.Identity
	GeneratedRoot string
	BundleStaging string
}

// Lease is retained until all children using files finish, including cancellation.
// Release is idempotent. Pods/SPM resolution locks remain inside generated state
// across regeneration; Release must not delete them. Sinks run outside leases.
type Lease interface {
	Layout() Layout
	Release() error
}
type Locker interface {
	Acquire(context.Context, Layout) (Lease, error)
}
