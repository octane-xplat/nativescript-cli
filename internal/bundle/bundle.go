// Package bundle owns project-local Vite and no native or device operations.
package bundle

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

var ErrRestart = errors.New("bundle inputs require re-resolution")
var ErrServer = errors.New("bundle server stopped")

// Failure is a helper-reported engine failure. Diagnostic is helper-authored
// bounded text, never raw output; the helper redacts paths before framing.
type Failure struct {
	Diagnostic string
	Cause      error
}

func (e *Failure) Error() string { return "bundling failed" }
func (e *Failure) Unwrap() error { return e.Cause }

type Adapter struct{ Host jsbridge.Host }
type Endpoint struct {
	URL    string `json:"url"`
	HMRURL string `json:"hmrURL"`
}
type Manifest struct {
	Directory string   `json:"directory"`
	Entry     string   `json:"entry"`
	Files     []string `json:"files"`
}
type Event struct {
	Type     string   `json:"type"`
	Manifest Manifest `json:"manifest"`
	Endpoint Endpoint `json:"endpoint"`
}
type Request struct {
	BundlerConfigPath   string                      `json:"bundlerConfigPath,omitempty"`
	CacheDirectory      string                      `json:"cacheDirectory,omitempty"`
	NativeInputs        []string                    `json:"nativeInputs,omitempty"`
	InactiveNativeRoots []string                    `json:"inactiveNativeRoots,omitempty"`
	NativeSources       []project.Source            `json:"nativeSources,omitempty"`
	NativeSourceGroups  []project.NativeSourceGroup `json:"nativeSourceGroups,omitempty"`
	Platform            string                      `json:"platform,omitempty"`
	AppPath             string                      `json:"appPath,omitempty"`
	Configuration       string                      `json:"configuration,omitempty"`
	Android             *project.AndroidConfig      `json:"android,omitempty"`
	ApplicationID       string                      `json:"applicationID,omitempty"`
	ProjectDir          string                      `json:"projectDir"`
	Directory           string                      `json:"directory"`
	Entry               string                      `json:"entry"`
	Mode                string                      `json:"mode"`
	Port                int                         `json:"port"`
	HMRHost             string                      `json:"hmrHost"`
}

func (a Adapter) call(ctx context.Context, q Request, sink func(jsbridge.Frame) error) (Manifest, error) {
	h := a.Host
	h.ProjectDir = q.ProjectDir
	if h.CacheDir == "" {
		cache, err := os.UserCacheDir()
		if err != nil {
			return Manifest{}, err
		}
		h.CacheDir = filepath.Join(cache, "octane-xplat", "nativescript-cli", "helper")
	}
	b, _ := json.Marshal(q)
	f, err := h.Call(ctx, jsbridge.Request{Version: jsbridge.ProtocolVersion, ID: "vite", Feature: "vite", Operation: "run", Payload: b}, sink)
	var remote *jsbridge.RemoteError
	if errors.As(err, &remote) {
		switch remote.Failure.Code {
		case "unavailable":
			err = workflow.ErrUnavailable
		case "invalid_input":
			err = workflow.ErrInvalid
		case "EADDRINUSE":
			err = workspace.ErrBusy
		case "restart_required":
			err = ErrRestart
		case "server_closed":
			err = ErrServer
		default:
			// Unmapped engine failures carry the bounded helper diagnostic.
			if remote.Failure.Detail != "" {
				err = &Failure{Diagnostic: remote.Failure.Detail, Cause: err}
			}
		}
	}
	if err != nil {
		return Manifest{}, err
	}
	var m Manifest
	if json.Unmarshal(f.Payload, &m) != nil || !validManifest(m, q.Directory) {
		return Manifest{}, workflow.ErrHandoff
	}
	return m, nil
}
func validManifest(m Manifest, dir string) bool {
	if m.Directory != dir || len(m.Files) == 0 {
		return false
	}
	found := false
	for _, f := range m.Files {
		rel, err := filepath.Rel(dir, f)
		if err != nil || !filepath.IsAbs(f) || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return false
		}
		if f == m.Entry {
			found = true
		}
		if st, err := os.Stat(f); err != nil || !st.Mode().IsRegular() {
			return false
		}
	}
	return found
}
func request(r project.Resolved, p project.Prepared, lease workspace.Lease) (Request, error) {
	if lease == nil || !p.Identity.Compatible(lease.Layout().Identity) || r.Revision != p.Identity.Revision || !filepath.IsAbs(r.Config.AppPath) {
		return Request{}, workflow.ErrHandoff
	}
	canonical, err := filepath.EvalSymlinks(r.Directory)
	if err != nil || canonical != p.Identity.ProjectDir {
		return Request{}, workflow.ErrHandoff
	}
	relBundle, err := filepath.Rel(lease.Layout().GeneratedRoot, p.BundleDir)
	if err != nil || relBundle == ".." || strings.HasPrefix(relBundle, ".."+string(filepath.Separator)) || !filepath.IsAbs(p.BundleDir) {
		return Request{}, workflow.ErrHandoff
	}
	// Build always runs through the project's installed official engine, whose
	// ESM output requires a 9.1+ runtime.
	if !supportedRuntime(r, p.Identity.Target.Platform) {
		return Request{}, workflow.ErrUnavailable
	}
	entry, err := nativeEntry(r)
	if err != nil {
		return Request{}, err
	}
	q := Request{ProjectDir: canonical, Directory: p.BundleDir, Entry: entry, Mode: "native-bundle", Platform: p.Identity.Target.Platform, AppPath: r.Config.AppPath, Configuration: p.Identity.Target.Configuration, BundlerConfigPath: r.Config.BundlerConfigPath, NativeSources: append([]project.Source(nil), r.Sources...), ApplicationID: r.ApplicationID, CacheDirectory: filepath.Join(lease.Layout().GeneratedRoot, "vite-cache")}
	if p.Identity.Target.Platform == "android" {
		config, err := project.AndroidSettings(r)
		if err != nil {
			return Request{}, workflow.ErrInvalid
		}
		q.Android = &config
		q.ApplicationID = r.ApplicationID
	}
	return q, nil
}
func (a Adapter) Bundle(ctx context.Context, r project.Resolved, p project.Prepared, lease workspace.Lease) (project.Bundle, error) {
	q, err := request(r, p, lease)
	if err != nil {
		return project.Bundle{}, err
	}
	var m Manifest
	owner, ok := lease.(interface {
		RunHelper(context.Context, func(context.Context) error) error
	})
	if !ok {
		return project.Bundle{}, workflow.ErrHandoff
	}
	err = owner.RunHelper(ctx, func(ctx context.Context) error { var e error; m, e = a.call(ctx, q, nil); return e })
	if err != nil {
		return project.Bundle{}, err
	}
	return project.Bundle{Identity: p.Identity, Directory: m.Directory, Entry: m.Entry, Files: m.Files}, nil
}

// supportedRuntime reports whether the project pins a runtime new enough to
// execute the installed engine's ESM output. A missing runtime package fails.
func supportedRuntime(r project.Resolved, platform string) bool {
	for _, pkg := range r.Packages {
		if pkg.Name == "@nativescript/"+platform {
			return project.RuntimeSatisfies(pkg.Version, "9.1.0")
		}
	}
	return false
}
