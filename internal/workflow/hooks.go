package workflow

import (
	"context"
	"errors"

	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

// SourceHooks runs the source-generating part of prepare before taking the final
// source snapshot. Development invokes it before starting Vite, then marks the
// per-iteration Stages so Native does not run the same scripts a second time.
func (e Engine) SourceHooks(ctx context.Context, s Stages, r project.Resolved, q Request, notify Notify) (project.Resolved, error) {
	hasBefore := false
	for _, h := range r.Hooks {
		if h.Name == "before-prepare" || h.Name == "before-prepareNativeApp" {
			hasBefore = true
		}
	}
	if !hasBefore {
		return r, nil
	}
	if s.Hooks == nil || s.Resolver == nil {
		return project.Resolved{}, ErrUnavailable
	}
	validate := func(r project.Resolved) error {
		if v, ok := s.Preparer.(interface {
			Validate(project.Resolved, project.Target) error
		}); ok {
			return v.Validate(r, q.Target)
		}
		return nil
	}
	err := stage(ctx, notify, "hooks", func() (err error) {
		if err = validate(r); err != nil {
			return err
		}
		layout, err := workspace.NewLayout(q.OutputDir, project.Identity{Schema: 1, Revision: r.Revision, ProjectDir: r.Directory, Target: q.Target})
		if err != nil {
			return err
		}
		locker := e.Locker
		if locker == nil {
			locker = workspace.Manager{}
		}
		lease, err := locker.Acquire(ctx, layout)
		if err != nil {
			return err
		}
		defer func() { err = errors.Join(err, lease.Release()) }()
		for _, name := range []string{"before-prepare", "before-prepareNativeApp"} {
			if _, err = s.Hooks.Run(ctx, HookInvocation{Name: name, Project: r, Target: q.Target}, lease); err != nil {
				return err
			}
		}
		r, err = Resolve(ctx, s, q.ProjectDir, nil)
		if err != nil {
			return err
		}
		return validate(r)
	})
	if err != nil {
		return project.Resolved{}, err
	}
	return r, nil
}
