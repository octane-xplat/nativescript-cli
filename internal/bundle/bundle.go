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

var ErrBackpressure = errors.New("bundle event buffer exhausted")
var ErrRestart = errors.New("bundle inputs require re-resolution")
var ErrServer = errors.New("bundle server stopped")

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
	CacheDirectory string                 `json:"cacheDirectory,omitempty"`
	NativeInputs   []string               `json:"nativeInputs,omitempty"`
	Platform       string                 `json:"platform,omitempty"`
	AppPath        string                 `json:"appPath,omitempty"`
	Configuration  string                 `json:"configuration,omitempty"`
	Android        *project.AndroidConfig `json:"android,omitempty"`
	ApplicationID  string                 `json:"applicationID,omitempty"`
	ProjectDir     string                 `json:"projectDir"`
	Directory      string                 `json:"directory"`
	Entry          string                 `json:"entry"`
	Mode           string                 `json:"mode"`
	Port           int                    `json:"port"`
	HMRHost        string                 `json:"hmrHost"`
	HMRPort        int                    `json:"hmrPort"`
	CallerEndpoint *Endpoint              `json:"callerEndpoint,omitempty"`
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
	// The supported bootstrap is the app package's explicit main, or app.js.
	entry := "app.js"
	b, err := os.ReadFile(filepath.Join(r.Config.AppPath, "package.json"))
	if err == nil {
		var pkg struct{ Main string }
		if json.Unmarshal(b, &pkg) != nil {
			return Request{}, workflow.ErrInvalid
		}
		if pkg.Main != "" {
			entry = pkg.Main
		}
	}
	entry = filepath.Join(r.Config.AppPath, entry)
	rel, err := filepath.Rel(r.Config.AppPath, entry)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return Request{}, workflow.ErrInvalid
	}
	q := Request{ProjectDir: r.Directory, Directory: p.BundleDir, Entry: entry, Mode: "bundle", Platform: p.Identity.Target.Platform, AppPath: r.Config.AppPath, Configuration: p.Identity.Target.Configuration}
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

// Watch runs under a caller-retained lease until all children retire. Events are
// delivered through a bounded channel, never callbacks under workspace ownership.
// ready follows initial disk emission and listening; errors terminate the session.
// CallerEndpoint is borrowed: no probing, closing or forwarding is performed.
func (a Adapter) Watch(ctx context.Context, r project.Resolved, p project.Prepared, lease workspace.Lease, settings Request) (*workflow.Session, <-chan Event, error) {
	q, err := request(r, p, lease)
	if err != nil {
		return nil, nil, err
	}
	q.Mode = "watch"
	q.Port = settings.Port
	q.HMRHost = settings.HMRHost
	q.HMRPort = settings.HMRPort
	if settings.CallerEndpoint != nil {
		endpoint := *settings.CallerEndpoint
		q.CallerEndpoint = &endpoint
	}
	if q.Port < 0 || q.Port > 65535 || q.HMRPort < 0 || q.HMRPort > 65535 {
		return nil, nil, workflow.ErrInvalid
	}
	events := make(chan Event, 32)
	owner, ok := lease.(interface {
		RunHelper(context.Context, func(context.Context) error) error
	})
	if !ok {
		return nil, nil, workflow.ErrHandoff
	}
	s := workflow.StartSession(ctx, func(ctx context.Context) error {
		defer close(events)
		err := owner.RunHelper(ctx, func(ctx context.Context) error {
			_, err := a.call(ctx, q, func(f jsbridge.Frame) error {
				var e Event
				if json.Unmarshal(f.Payload, &e) != nil {
					return workflow.ErrHandoff
				}
				if e.Type == "" {
					return nil
				}
				if !validManifest(e.Manifest, q.Directory) {
					return workflow.ErrHandoff
				}
				select {
				case events <- e:
					return nil
				default:
					return ErrBackpressure
				}
			})
			return err
		})
		return err
	})
	return s, events, nil
}
