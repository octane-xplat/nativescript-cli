package nativescript

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/hooks"
	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

// Real owned Node hooks around fixture native stages; not native build evidence.
func TestBuildHooksOrderAndPostBuildFailure(t *testing.T) {
	for _, platform := range []Platform{IOS, Android} {
		for _, fail := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s-fail-%v", platform, fail), func(t *testing.T) {
				c, f, r := fixture(t)
				r.Target.Platform = platform
				buildName := "buildIOS"
				if platform == Android {
					buildName = "buildAndroid"
				}
				names := []string{"before-prepare", "before-prepareNativeApp", "after-prepareNativeApp", "after-prepare", "before-" + buildName, "after-" + buildName}
				order := filepath.Join(r.ProjectDir, "order")
				resolved := project.Resolved{Directory: r.ProjectDir, Revision: "source", ApplicationID: "org.test.app", Config: project.Config{NativeConfig: json.RawMessage(`{}`)}}
				for _, name := range names {
					file := filepath.Join(r.ProjectDir, name+".cjs")
					source := fmt.Sprintf(`module.exports=function(hookArgs){require('node:fs').appendFileSync(%q,%q);`, order, name+"\n")
					if name == "after-prepare" {
						source += `if(!require('node:fs').existsSync(require('node:path').join(hookArgs.bundleDir,'bundle-ready')))throw Error('after-prepare ran before bundle');`
					}
					if fail && name == "after-"+buildName {
						source += `throw Error('SECRET_POST_BUILD');`
					}
					source += "}"
					if err := os.WriteFile(file, []byte(source), 0600); err != nil {
						t.Fatal(err)
					}
					resolved.Hooks = append(resolved.Hooks, project.Hook{Name: name, Script: file, Digest: fmt.Sprintf("%x", sha256.Sum256([]byte(source)))})
				}
				f.resolved = resolved
				files, _ := fs.Sub(helperFiles, "assets")
				c.engine.Factory = func(map[string]string) workflow.Stages {
					adapter := &hooks.Adapter{Resolver: f, Host: jsbridge.Host{Payload: jsbridge.Payload{Files: files}}}
					return workflow.Stages{Resolver: adapter, Hooks: adapter, Preparer: f, Bundler: hookOutputBundler{f}, Compiler: f}
				}
				result, err := c.Build(context.Background(), r)
				if fail {
					if err == nil || len(result.Artifacts) != 0 || strings.Contains(err.Error(), "SECRET_POST_BUILD") {
						t.Fatal(result, err)
					}
				} else if err != nil {
					t.Fatal(err)
				}
				got, e := os.ReadFile(order)
				if e != nil || string(got) != strings.Join(names, "\n")+"\n" {
					t.Fatal(string(got), e)
				}
				if f.held.Load() {
					t.Fatal("hook retained writer")
				}
			})
		}
	}
}

func (l trackedLease) RunHelper(ctx context.Context, work func(context.Context) error) error {
	owner, ok := l.Lease.(interface {
		RunHelper(context.Context, func(context.Context) error) error
	})
	if !ok {
		return workspace.ErrInvalid
	}
	return owner.RunHelper(ctx, work)
}

type hookOutputBundler struct{ f *stages }

func (a hookOutputBundler) Bundle(ctx context.Context, r project.Resolved, p project.Prepared, l workspace.Lease) (project.Bundle, error) {
	b, err := a.f.Bundle(ctx, r, p, l)
	if err != nil {
		return b, err
	}
	if err = os.MkdirAll(b.Directory, 0700); err != nil {
		return b, err
	}
	err = os.WriteFile(filepath.Join(b.Directory, "bundle-ready"), []byte("fixture"), 0600)
	return b, err
}
