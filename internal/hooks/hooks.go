// Package hooks adapts registered NativeScript project hooks. It does not
// implement the public extension SDK or run plugin installation metadata.
package hooks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

// Failure contains only adapter-authored labels; hook exceptions/logs are private.
type Failure struct {
	Message string
	Cause   error
}

func (e *Failure) Error() string { return e.Message }
func (e *Failure) Unwrap() error { return e.Cause }

// Adapter is allocated per operation. Resolution retains a private snapshot so
// the following build/install hooks use the same registration set, not globals.
type Adapter struct {
	Resolver workflow.Resolver
	Host     jsbridge.Host
	mu       sync.Mutex
	current  project.Resolved
}

func (a *Adapter) Resolve(ctx context.Context, dir string) (project.Resolved, error) {
	if a.Resolver == nil {
		return project.Resolved{}, workflow.ErrUnavailable
	}
	r, err := a.Resolver.Resolve(ctx, dir)
	if err == nil {
		a.mu.Lock()
		a.current = r
		a.mu.Unlock()
	}
	return r, err
}
func (a *Adapter) Current() project.Resolved {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.current
}

func (a *Adapter) Run(ctx context.Context, q workflow.HookInvocation, lease workspace.Lease) ([]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	matching := false
	for _, h := range q.Project.Hooks {
		if h.Name == q.Name {
			matching = true
			break
		}
	}
	if !matching {
		return append([]string(nil), q.Arguments...), nil
	}
	h := a.Host
	h.ProjectDir = q.Project.Directory
	if h.CacheDir == "" {
		cache, err := os.UserCacheDir()
		if err != nil {
			return nil, err
		}
		h.CacheDir = filepath.Join(cache, "octane-xplat", "nativescript-cli", "helper")
	}
	invoke := func(ctx context.Context) ([]string, error) {
		platforms := ""
		if q.Prepared.NativeDir != "" {
			if lease == nil {
				return nil, workflow.ErrHandoff
			}
			rel, err := filepath.Rel(lease.Layout().GeneratedRoot, q.Prepared.NativeDir)
			if err != nil || rel == ".." || filepath.IsAbs(rel) || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				return nil, workflow.ErrHandoff
			}
			// Upstream hooks address platformsDir/<platform>. This owned alias
			// maps that shape to the generated project without touching the app.
			platforms = filepath.Join(lease.Layout().GeneratedRoot, "hook-platforms")
			if err = os.MkdirAll(platforms, 0700); err != nil {
				return nil, err
			}
			if info, err := os.Lstat(platforms); err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
				return nil, workflow.ErrHandoff
			}
			link := filepath.Join(platforms, q.Target.Platform)
			if info, err := os.Lstat(link); err == nil {
				if info.Mode()&os.ModeSymlink == 0 {
					return nil, workflow.ErrHandoff
				}
				if err = os.Remove(link); err != nil {
					return nil, err
				}
			} else if !errors.Is(err, os.ErrNotExist) {
				return nil, err
			}
			if err = os.Symlink(q.Prepared.NativeDir, link); err != nil {
				return nil, err
			}
		}
		payload, err := json.Marshal(struct {
			ProjectDir   string          `json:"projectDir"`
			ProjectName  string          `json:"projectName"`
			Hooks        []project.Hook  `json:"hooks"`
			Name         string          `json:"name"`
			Target       project.Target  `json:"target"`
			NativeConfig json.RawMessage `json:"nativeConfig"`
			NativeDir    string          `json:"nativeDir,omitempty"`
			BundleDir    string          `json:"bundleDir,omitempty"`
			PlatformsDir string          `json:"platformsDir,omitempty"`
			ArtifactPath string          `json:"artifactPath,omitempty"`
			DeviceID     string          `json:"deviceID,omitempty"`
			Arguments    []string        `json:"arguments"`
		}{q.Project.Directory, "NativeScriptApp", q.Project.Hooks, q.Name, q.Target, q.Project.Config.NativeConfig, q.Prepared.NativeDir, q.Prepared.BundleDir, platforms, q.ArtifactPath, q.DeviceID, q.Arguments})
		if err != nil {
			return nil, err
		}
		frame, err := h.Call(ctx, jsbridge.Request{Version: jsbridge.ProtocolVersion, ID: "hooks", Feature: "hooks", Operation: "invoke", Payload: payload}, nil)
		if err != nil {
			var remote *jsbridge.RemoteError
			if errors.As(err, &remote) {
				kind := error(err)
				if remote.Failure.Code == "unavailable" {
					kind = workflow.ErrUnavailable
				}
				if remote.Failure.Code == "invalid_input" {
					kind = workflow.ErrInvalid
				}
				message := remote.Failure.Detail
				if message == "" {
					message = fmt.Sprintf("Hook %s failed", q.Name)
				}
				return nil, &Failure{Message: message, Cause: kind}
			}
			return nil, err
		}
		var result struct {
			Arguments []string `json:"arguments"`
		}
		if json.Unmarshal(frame.Payload, &result) != nil {
			return nil, workflow.ErrHandoff
		}
		return result.Arguments, nil
	}
	if lease == nil {
		return invoke(ctx)
	}
	owner, ok := lease.(interface {
		RunHelper(context.Context, func(context.Context) error) error
	})
	if !ok {
		return nil, workflow.ErrHandoff
	}
	var args []string
	err := owner.RunHelper(ctx, func(ctx context.Context) error { var err error; args, err = invoke(ctx); return err })
	return args, err
}
