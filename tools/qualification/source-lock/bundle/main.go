// Command bundle qualifies the host bundler against an explicit full source
// fixture. Its prepared handoff is a fixture; it never invokes native tools.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/bundle"
	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	resolver "github.com/octane-xplat/nativescript-cli/internal/resolve"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

// Capture the private bundler request for source-only diagnostics. It contains
// paths and source identities, never process environment or emitted app code.
type captureExecutor struct{ file string }

func (c captureExecutor) Start(ctx context.Context, command process.Command) (process.Handle, error) {
	if len(command.Args) == 2 {
		data, err := os.ReadFile(command.Args[1])
		if err != nil {
			return nil, err
		}
		var request jsbridge.Request
		if json.Unmarshal(data, &request) == nil && request.Feature == "vite" {
			if err := os.WriteFile(c.file, data, 0600); err != nil {
				return nil, err
			}
		}
	}
	return (process.Runner{}).Start(ctx, command)
}

func main() {
	if len(os.Args) != 5 {
		panic("usage: bundle PROJECT_DIR REPOSITORY_DIR NEW_CACHE_DIR NEW_REPORT")
	}
	for _, arg := range os.Args[1:] {
		if !filepath.IsAbs(arg) {
			panic("all paths must be absolute")
		}
	}
	app, repo, cache, report := os.Args[1], os.Args[2], os.Args[3], os.Args[4]
	if _, err := os.Lstat(report); !os.IsNotExist(err) {
		panic("report must be new")
	}
	if err := os.Mkdir(cache, 0700); err != nil {
		panic(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	cwd, _ := os.Getwd()
	environment := os.Environ()
	host := jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS(filepath.Join(repo, "assets"))}, CacheDir: filepath.Join(cache, "helper"), Environment: map[string]string{"VISUAL_CAPTURE_URL": "", "XPLAT_DOCS_DEMOS": ""}, Executor: captureExecutor{file: filepath.Join(cache, "vite-request.json")}}
	result := map[string]any{"scope": "actual selected source host bundle through internal production resolver/bundler and fixture prepared handoff; no native Prepare/compiler, device or public Build acceptance", "passed": false, "projectDirectory": app}
	resolved, err := (resolver.Resolver{Host: host}).Resolve(ctx, app)
	if err == nil {
		result["resolvedPackages"] = len(resolved.Packages)
		result["resolvedSources"] = len(resolved.Sources)
		result["revision"] = resolved.Revision
		target := project.Target{Platform: "ios", Configuration: "debug", DestinationKind: "simulator", DestinationID: "host-fixture", Architecture: "arm64"}
		var layout workspace.Layout
		layout, err = workspace.NewLayout(filepath.Join(cache, "state"), project.Identity{Schema: 1, Revision: resolved.Revision, ProjectDir: resolved.Directory, Target: target})
		if err == nil {
			var lease *workspace.Ownership
			lease, err = workspace.Acquire(ctx, layout)
			if err == nil {
				prepared := project.Prepared{Identity: layout.Identity, NativeDir: layout.GeneratedRoot, BundleDir: filepath.Join(layout.GeneratedRoot, "app")}
				var emitted project.Bundle
				emitted, err = (bundle.Adapter{Host: host}).Bundle(ctx, resolved, prepared, lease)
				err = errors.Join(err, lease.Release())
				if err == nil {
					hashes := map[string]string{}
					for _, file := range emitted.Files {
						var data []byte
						data, err = os.ReadFile(file)
						if err != nil {
							break
						}
						relative, _ := filepath.Rel(emitted.Directory, file)
						hashes[relative] = fmt.Sprintf("%x", sha256.Sum256(data))
					}
					if err == nil {
						result["passed"] = true
						result["filesSHA256"] = hashes
						result["entry"] = filepath.Base(emitted.Entry)
						result["files"] = len(emitted.Files)
					}
				}
			}
		}
	}
	if err != nil {
		result["error"] = err.Error()
	}
	now, _ := os.Getwd()
	result["embeddingGlobalsPreserved"] = now == cwd && reflect.DeepEqual(environment, os.Environ())
	if result["embeddingGlobalsPreserved"] != true {
		err = errors.Join(err, errors.New("embedding globals changed"))
		result["passed"] = false
		result["error"] = err.Error()
	}
	data, encodeErr := json.MarshalIndent(result, "", "  ")
	if encodeErr != nil {
		panic(encodeErr)
	}
	file, openErr := os.OpenFile(report, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if openErr != nil {
		panic(openErr)
	}
	if _, writeErr := file.Write(append(data, '\n')); writeErr != nil {
		panic(writeErr)
	}
	if closeErr := file.Close(); closeErr != nil {
		panic(closeErr)
	}
	fmt.Println(string(data))
	if err != nil {
		os.Exit(1)
	}
}
