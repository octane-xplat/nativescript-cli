// Package extensions validates and schedules declarative extension output.
package extensions

import (
	"context"
	"fmt"
	"github.com/octane-xplat/nativescript-cli/extension"
	"path"
	"sort"
	"strings"
)

type entry struct {
	manifest extension.Manifest
	impl     extension.Extension
}
type Registry struct{ entries []entry }

// New validates the entire graph before any invocation or generated-state mutation.
func New(ctx context.Context, implementations []extension.Extension, platform string) (*Registry, error) {
	entries := map[string]entry{}
	for _, impl := range implementations {
		if impl == nil {
			return nil, fmt.Errorf("nil extension")
		}
		m, e := impl.Manifest(ctx)
		if e != nil {
			return nil, e
		}
		if m.ID == "" || m.Version == "" || m.API != extension.APIVersion || strings.ContainsAny(m.ID, "/\\.") {
			return nil, fmt.Errorf("invalid extension manifest or API: %q", m.ID)
		}
		if _, ok := entries[m.ID]; ok {
			return nil, fmt.Errorf("duplicate extension %s", m.ID)
		}
		if len(m.Platforms) > 0 {
			supported := false
			for _, p := range m.Platforms {
				supported = supported || p == platform
			}
			if !supported {
				return nil, fmt.Errorf("extension %s platform unsupported", m.ID)
			}
		}
		for _, p := range m.Phases {
			if p != extension.Collect && p != extension.Prepared && p != extension.PostBuild {
				return nil, fmt.Errorf("unsupported phase")
			}
		}
		for _, c := range m.Required {
			if c != "generated_files" && c != "build_artifacts" {
				return nil, fmt.Errorf("required unsupported contribution %s", c)
			}
			if c == "build_artifacts" {
				found := false
				for _, phase := range m.Phases {
					found = found || phase == extension.PostBuild
				}
				if !found {
					return nil, fmt.Errorf("build_artifacts requires post_build phase")
				}
			}
		}
		entries[m.ID] = entry{m, impl}
	}
	r := &Registry{}
	state := map[string]int{}
	var visit func(string) error
	visit = func(id string) error {
		if state[id] == 1 {
			return fmt.Errorf("extension dependency cycle")
		}
		if state[id] == 2 {
			return nil
		}
		v, ok := entries[id]
		if !ok {
			return fmt.Errorf("missing extension dependency %s", id)
		}
		state[id] = 1
		deps := append([]string(nil), v.manifest.After...)
		sort.Strings(deps)
		for _, d := range deps {
			if e := visit(d); e != nil {
				return e
			}
		}
		state[id] = 2
		r.entries = append(r.entries, v)
		return nil
	}
	ids := make([]string, 0, len(entries))
	for id := range entries {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if e := visit(id); e != nil {
			return nil, e
		}
	}
	return r, ctx.Err()
}

// Invoke returns all validated files in deterministic ownership namespaces. It
// never applies partial results when a later extension fails.
func (r *Registry) Invoke(ctx context.Context, in extension.Input) ([]extension.File, error) {
	if len(in.Artifacts) > 0 && in.Phase != extension.PostBuild {
		return nil, fmt.Errorf("artifacts are available only in post_build")
	}
	var files []extension.File
	seen := map[string]bool{}
	for _, v := range r.entries {
		enabled := false
		for _, p := range v.manifest.Phases {
			enabled = enabled || p == in.Phase
		}
		if !enabled {
			continue
		}
		if e := ctx.Err(); e != nil {
			return nil, e
		}
		ownedInput := in
		ownedInput.Pins = append([]extension.Pin(nil), in.Pins...)
		ownedInput.Artifacts = append([]extension.Artifact(nil), in.Artifacts...)
		out, e := v.impl.Invoke(ctx, ownedInput)
		if e != nil {
			return nil, e
		}
		for _, f := range out.Files {
			if f.Path == "" || path.IsAbs(f.Path) || path.Clean(f.Path) != f.Path || strings.HasPrefix(f.Path, "../") || strings.Contains(f.Path, "\\") || f.Path == ".." {
				return nil, fmt.Errorf("invalid extension file path")
			}
			f.Path = v.manifest.ID + "/" + f.Path
			if seen[f.Path] {
				return nil, fmt.Errorf("duplicate generated file %s", f.Path)
			}
			seen[f.Path] = true
			files = append(files, f)
		}
	}
	return files, ctx.Err()
}
