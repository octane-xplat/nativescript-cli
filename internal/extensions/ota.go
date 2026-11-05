package extensions

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

// ErrOTAUnavailable identifies missing or incompatible installed prerequisites.
var ErrOTAUnavailable = errors.New("canonical OTA prerequisites unavailable")

// OTAStartup preserves the installed canonical producer's fingerprint and boot
// contract. All outputs replace one owned native directory after helper retirement.
type OTAStartup struct{ Host jsbridge.Host }
type otaRequest struct {
	ProjectDir         string                                `json:"projectDir"`
	NativeDir          string                                `json:"nativeDir"`
	BundleDir          string                                `json:"bundleDir"`
	StageDir           string                                `json:"stageDir"`
	Platform           string                                `json:"platform"`
	Configuration      string                                `json:"configuration"`
	NativeConfig       json.RawMessage                       `json:"nativeConfig"`
	Architecture       string                                `json:"architecture"`
	DestinationKind    string                                `json:"destinationKind"`
	ExtensionNative    []project.ExtensionNativeInput        `json:"extensionNative,omitempty"`
	ProjectStateDir    string                                `json:"projectStateDir"`
	SourceFiles        map[string]string                     `json:"sourceFiles,omitempty"`
	LocalSwiftPackages []project.LocalSwiftPackageEvaluation `json:"localSwiftPackages,omitempty"`
	NativeSourceGroups []project.NativeSourceGroup           `json:"nativeSourceGroups,omitempty"`
}

func (a OTAStartup) Apply(ctx context.Context, r project.Resolved, p project.Prepared, l workspace.Lease) error {
	if l == nil || !p.Identity.Compatible(l.Layout().Identity) || r.Revision != p.Identity.Revision || len(r.Config.NativeConfig) == 0 {
		return fmt.Errorf("invalid OTA handoff")
	}
	if p.Identity.Target.Platform == "ios" {
		if err := project.ValidateLocalSwiftPackages(r, p.LocalSwiftPackages); err != nil {
			return errors.Join(ErrOTAUnavailable, err)
		}
	}
	owner, ok := l.(interface {
		RunHelper(context.Context, func(context.Context) error) error
	})
	if !ok {
		return fmt.Errorf("OTA requires workspace ownership")
	}
	rel, err := filepath.Rel(l.Layout().GeneratedRoot, p.NativeDir)
	if err != nil || rel == ".." || filepath.IsAbs(rel) || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return fmt.Errorf("invalid OTA native output")
	}
	h := a.Host
	h.ProjectDir = r.Directory
	if h.CacheDir == "" {
		cache, e := os.UserCacheDir()
		if e != nil {
			return e
		}
		h.CacheDir = filepath.Join(cache, "octane-xplat", "nativescript-cli", "helper")
	}
	return owner.RunHelper(ctx, func(ctx context.Context) error {
		stage, e := os.MkdirTemp(filepath.Dir(p.NativeDir), ".ota-")
		if e != nil {
			return e
		}
		retained := false
		defer func() {
			if !retained {
				_ = os.RemoveAll(stage)
			}
		}()
		payload, e := json.Marshal(otaRequest{
			ProjectDir: r.Directory, NativeDir: p.NativeDir, BundleDir: p.BundleDir, StageDir: stage,
			Platform: p.Identity.Target.Platform, Configuration: p.Identity.Target.Configuration,
			NativeConfig: r.Config.NativeConfig, Architecture: p.Identity.Target.Architecture,
			DestinationKind: p.Identity.Target.DestinationKind, ExtensionNative: r.ExtensionNative,
			ProjectStateDir:    filepath.Dir(filepath.Dir(l.Layout().GeneratedRoot)),
			LocalSwiftPackages: p.LocalSwiftPackages,
			NativeSourceGroups: r.NativeSourceGroups,
			SourceFiles: func() map[string]string {
				files := make(map[string]string, len(r.Sources))
				for _, source := range r.Sources {
					files[source.Path] = source.Digest
				}
				return files
			}(),
		})
		if e != nil {
			return e
		}
		f, e := h.Call(ctx, jsbridge.Request{Version: jsbridge.ProtocolVersion, ID: "ota", Feature: "extensions", Operation: "otaStartup", Payload: payload}, nil)
		if e != nil {
			retained = errors.Is(e, process.ErrCleanup)
			var remote *jsbridge.RemoteError
			if errors.As(e, &remote) && remote.Failure.Code == "unavailable" {
				return errors.Join(ErrOTAUnavailable, e)
			}
			return e
		}
		var out struct {
			Hash    string
			Format  string
			Release bool
		}
		if json.Unmarshal(f.Payload, &out) != nil || len(out.Hash) != 64 || out.Format != "octane-xplat.native-fingerprint.v1" || out.Release != (p.Identity.Target.Configuration == "release") {
			return fmt.Errorf("invalid canonical OTA result")
		}
		if e = ctx.Err(); e != nil {
			return e
		}
		// Atomic directory exchange keeps the complete old generation available
		// even if this process stops during publication. The staged path then owns it.
		if e = swapNative(filepath.Join(stage, "native"), p.NativeDir); e != nil {
			return e
		}
		return nil
	})
}
