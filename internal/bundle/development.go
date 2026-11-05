package bundle

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strings"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

// Development owns an installed NativeScript Vite server and its private output.
// Ready is immutable. Close retires the helper before removing its owned files.
// Unlike Watch, the server never writes into the generated native workspace, so
// compilation can hold that workspace's single-writer lease independently.
type Development struct {
	Session  *workflow.Session
	Ready    Event
	revision string
	project  string
	target   project.Target
}

// The installed engine reads main from the root package, not app/package.json.
func nativeEntry(r project.Resolved) (string, error) {
	var pkg struct{ Main string }
	b, err := os.ReadFile(filepath.Join(r.Directory, "package.json"))
	if err != nil {
		return "", err
	}
	if json.Unmarshal(b, &pkg) != nil || pkg.Main == "" {
		return "", workflow.ErrInvalid
	}
	entry, err := filepath.EvalSymlinks(filepath.Join(r.Directory, pkg.Main))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(r.Config.AppPath, entry)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", workflow.ErrInvalid
	}
	return entry, nil
}

// developmentRequest assembles the dev-session request. The caller owns the
// returned session root and removes it with the session.
func developmentRequest(r project.Resolved, target project.Target, settings Request) (Request, string, error) {
	port := settings.Port
	if port == 0 {
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return Request{}, "", err
		}
		port = listener.Addr().(*net.TCPAddr).Port
		if err := listener.Close(); err != nil {
			return Request{}, "", err
		}
	}
	canonical, err := filepath.EvalSymlinks(r.Directory)
	if err != nil {
		return Request{}, "", err
	}
	entry, err := nativeEntry(r)
	if err != nil {
		return Request{}, "", err
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return Request{}, "", err
	}
	cache = filepath.Join(cache, "octane-xplat", "nativescript-cli", "development")
	if err := os.MkdirAll(cache, 0700); err != nil {
		return Request{}, "", err
	}
	root, err := os.MkdirTemp(cache, "session-")
	if err != nil {
		return Request{}, "", err
	}
	q := Request{ProjectDir: canonical, AppPath: r.Config.AppPath, Entry: entry, Platform: target.Platform,
		BundlerConfigPath: r.Config.BundlerConfigPath,
		Configuration:     target.Configuration, ApplicationID: r.ApplicationID, Mode: "native", Port: port,
		HMRHost: settings.HMRHost, Directory: filepath.Join(root, "bundle"), CacheDirectory: filepath.Join(root, "cache")}
	q.NativeInputs = []string{r.Config.AppResourcesPath}
	if target.Platform == "ios" {
		q.NativeSourceGroups = append([]project.NativeSourceGroup(nil), r.NativeSourceGroups...)
	}
	// This session's platform owns its own resource tree; the other platform's
	// App_Resources subtree and plugin platform roots stay watchable inputs but
	// are filtered out of the restart identity so their edits cannot restart it.
	other := "ios"
	if target.Platform == "ios" {
		other = "android"
	}
	inactive := []string{filepath.Join(r.Config.AppResourcesPath, map[string]string{"ios": "iOS", "android": "Android"}[other])}
	for _, pkg := range r.Packages {
		if pkg.Native {
			inactive = append(inactive, filepath.Join(pkg.Directory, "platforms", other))
		}
	}
	q.InactiveNativeRoots = inactive
	inactivePath := func(file string) bool {
		for _, root := range inactive {
			if rel, err := filepath.Rel(root, file); err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				return true
			}
		}
		return false
	}
	for _, name := range []string{"package.json", "nativescript.config.ts", "nativescript.config.js", "nativescript.config.cjs", "nativescript.config.mjs", "nativescript.config.json"} {
		q.NativeInputs = append(q.NativeInputs, filepath.Join(canonical, name))
	}
	for _, source := range r.Sources {
		if inactivePath(source.Path) {
			continue
		}
		q.NativeSources = append(q.NativeSources, source)
		q.NativeInputs = append(q.NativeInputs, source.Path)
	}
	for _, contribution := range r.Contributions {
		if contribution.Platform == "ios" && contribution.Kind == "spm" && contribution.SPM != nil {
			q.NativeInputs = append(q.NativeInputs, filepath.Dir(contribution.Path))
		}
	}
	for _, pkg := range r.Packages {
		if pkg.Native {
			q.NativeInputs = append(q.NativeInputs, filepath.Join(pkg.Directory, "platforms"))
		}
	}
	if target.Platform == "android" {
		config, err := project.AndroidSettings(r)
		if err != nil {
			os.RemoveAll(root)
			return Request{}, "", workflow.ErrInvalid
		}
		q.Android = &config
	}
	return q, root, nil
}

func (a Adapter) StartDevelopment(ctx context.Context, r project.Resolved, target project.Target, settings Request) (*Development, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if !filepath.IsAbs(r.Directory) || !filepath.IsAbs(r.Config.AppPath) || !filepath.IsAbs(r.Config.AppResourcesPath) || r.Revision == "" ||
		(target.Platform != "ios" && target.Platform != "android") || target.Configuration != "debug" ||
		settings.Port < 0 || settings.Port > 65535 || settings.CallerEndpoint != nil || settings.HMRPort != 0 {
		return nil, workflow.ErrInvalid
	}
	for _, c := range settings.HMRHost {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '.') {
			return nil, workflow.ErrInvalid
		}
	}
	q, root, err := developmentRequest(r, target, settings)
	if err != nil {
		return nil, err
	}
	ready := make(chan Event, 1)
	session := workflow.StartSession(ctx, func(ctx context.Context) error {
		_, err := a.call(ctx, q, func(frame jsbridge.Frame) error {
			var event Event
			if json.Unmarshal(frame.Payload, &event) != nil {
				return workflow.ErrHandoff
			}
			if event.Type == "" {
				return nil
			}
			if event.Type != "ready" || !validManifest(event.Manifest, q.Directory) || event.Endpoint.URL == "" || event.Endpoint.HMRURL == "" {
				return workflow.ErrHandoff
			}
			select {
			case ready <- event:
				return nil
			default:
				return workflow.ErrHandoff
			}
		})
		if errors.Is(err, process.ErrCleanup) {
			return err
		}
		return errors.Join(err, os.RemoveAll(root))
	})
	done := make(chan error, 1)
	go func() { done <- session.Wait() }()
	select {
	case event := <-ready:
		return &Development{Session: session, Ready: event, revision: r.Revision, project: q.ProjectDir, target: target}, nil
	case err := <-done:
		if err == nil {
			err = workflow.ErrHandoff
		}
		return nil, err
	case <-ctx.Done():
		return nil, errors.Join(ctx.Err(), session.Close(context.Background()))
	}
}

// Bundle copies only the initial, completed engine output under the native
// coordinator's lease. Subsequent JavaScript edits travel through native HMR;
// native input edits terminate the server with ErrRestart for re-resolution.
func (d *Development) Bundle(ctx context.Context, r project.Resolved, p project.Prepared, lease workspace.Lease) (project.Bundle, error) {
	baseRevision := r.Revision
	if r.SourceRevision != "" {
		baseRevision = r.SourceRevision
	}
	if lease == nil || !p.Identity.Compatible(lease.Layout().Identity) || p.Identity.Target != d.target ||
		baseRevision != d.revision || r.Directory != d.project || p.Identity.Revision != r.Revision ||
		!filepath.IsAbs(p.BundleDir) || !validManifest(d.Ready.Manifest, d.Ready.Manifest.Directory) {
		return project.Bundle{}, workflow.ErrHandoff
	}
	result := project.Bundle{Identity: p.Identity, Directory: p.BundleDir}
	for _, source := range d.Ready.Manifest.Files {
		if err := ctx.Err(); err != nil {
			return project.Bundle{}, err
		}
		rel, err := filepath.Rel(d.Ready.Manifest.Directory, source)
		if err != nil {
			return project.Bundle{}, err
		}
		destination := filepath.Join(p.BundleDir, rel)
		data, err := os.ReadFile(source)
		if err != nil {
			return project.Bundle{}, err
		}
		if err := os.MkdirAll(filepath.Dir(destination), 0700); err != nil {
			return project.Bundle{}, err
		}
		if err := os.WriteFile(destination, data, 0600); err != nil {
			return project.Bundle{}, err
		}
		result.Files = append(result.Files, destination)
		if source == d.Ready.Manifest.Entry {
			result.Entry = destination
		}
	}
	return result, ctx.Err()
}
