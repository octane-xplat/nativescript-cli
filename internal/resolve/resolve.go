// Package resolve consumes the embedded helper without installing dependencies.
package resolve

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
)

// Diagnostic contains only resolver-authored remediation, never dependency output.
type Diagnostic struct {
	Message string
	Kind    error
}

func (e *Diagnostic) Error() string { return e.Message }
func (e *Diagnostic) Unwrap() error { return e.Kind }

type Resolver struct{ Host jsbridge.Host }

func (r Resolver) Resolve(ctx context.Context, dir string) (project.Resolved, error) {
	if err := ctx.Err(); err != nil {
		return project.Resolved{}, err
	}
	if stat, err := os.Stat(dir); err != nil || !stat.IsDir() {
		return project.Resolved{}, fmt.Errorf("project directory must exist: %w", workflow.ErrInvalid)
	}
	host := r.Host
	host.ProjectDir = dir
	if host.CacheDir == "" {
		cache, err := os.UserCacheDir()
		if err != nil {
			return project.Resolved{}, err
		}
		host.CacheDir = filepath.Join(cache, "octane-xplat", "nativescript-cli", "helper")
	}
	payload, _ := json.Marshal(struct {
		ProjectDir string `json:"projectDir"`
	}{dir})
	frame, err := host.Call(ctx, jsbridge.Request{Version: jsbridge.ProtocolVersion, ID: "resolve", Feature: "resolve", Operation: "project", Payload: payload}, nil)
	if err != nil {
		var remote *jsbridge.RemoteError
		if errors.As(err, &remote) {
			kind := workflow.ErrInvalid
			if remote.Failure.Code == "unavailable" {
				kind = workflow.ErrUnavailable
			}
			return project.Resolved{}, &Diagnostic{Message: remote.Failure.Message, Kind: kind}
		}
		return project.Resolved{}, err
	}
	var result project.Resolved
	if json.Unmarshal(frame.Payload, &result) != nil || result.Directory != dir || len(result.Sources) == 0 || !filepath.IsAbs(result.Config.AppPath) || !filepath.IsAbs(result.Config.AppResourcesPath) {
		return project.Resolved{}, workflow.ErrHandoff
	}
	return result, nil
}
