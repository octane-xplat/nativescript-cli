// Command development qualifies full-source host Vite ownership. It never
// invokes native preparation, compilation, installation or guest execution.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/bundle"
	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	resolver "github.com/octane-xplat/nativescript-cli/internal/resolve"
)

// Retain the private typed request for source-only failure diagnosis.
type captureExecutor struct{ file string }

func (c captureExecutor) Start(ctx context.Context, command process.Command) (process.Handle, error) {
	if len(command.Args) == 2 {
		data, err := os.ReadFile(command.Args[1])
		if err != nil {
			return nil, err
		}
		var request jsbridge.Request
		if json.Unmarshal(data, &request) == nil && request.Feature == "vite" {
			if err = os.WriteFile(c.file, data, 0600); err != nil {
				return nil, err
			}
		}
	}
	return (process.Runner{}).Start(ctx, command)
}

// Explicit cancellation is expected; any additional failure remains failed.
func closeError(err error) error {
	if err == nil {
		return nil
	}
	if !errors.Is(err, context.Canceled) {
		return err
	}
	var expected func(error) bool
	expected = func(cause error) bool {
		if cause == nil || cause == context.Canceled {
			return true
		}
		if failure, ok := cause.(*process.Error); ok {
			return failure.Kind == process.ErrExit
		}
		if joined, ok := cause.(interface{ Unwrap() []error }); ok {
			for _, child := range joined.Unwrap() {
				if !expected(child) {
					return false
				}
			}
			return true
		}
		if child := errors.Unwrap(cause); child != nil {
			return expected(child)
		}
		return false
	}
	if expected(err) {
		return nil
	}
	return err
}

type live struct {
	platform string
	dev      *bundle.Development
}

func main() {
	if len(os.Args) != 5 {
		panic("usage: development ABSOLUTE_APP ABSOLUTE_REPOSITORY NEW_ABSOLUTE_CACHE NEW_ABSOLUTE_REPORT")
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
	cwd, _ := os.Getwd()
	environment := os.Environ()
	result := map[string]any{"scope": "actual selected full-source host Vite sessions, initial bundle/module delivery and independent ownership; no native tools, guest execution, runtime HMR or public Run acceptance", "projectDirectory": app, "passed": false}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	err := run(ctx, app, repo, cache, result)
	cancel()
	now, _ := os.Getwd()
	globals := now == cwd && reflect.DeepEqual(environment, os.Environ())
	result["embeddingGlobalsPreserved"] = globals
	if !globals {
		err = errors.Join(err, errors.New("embedding globals changed"))
	}
	result["passed"] = err == nil
	if err != nil {
		result["error"] = err.Error()
	}
	data, errWrite := json.MarshalIndent(result, "", "  ")
	if errWrite != nil {
		panic(errWrite)
	}
	file, errWrite := os.OpenFile(report, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if errWrite != nil {
		panic(errWrite)
	}
	_, errWrite = file.Write(append(data, '\n'))
	errWrite = errors.Join(errWrite, file.Close())
	if errWrite != nil {
		panic(errWrite)
	}
	fmt.Println(string(data))
	if err != nil {
		os.Exit(1)
	}
}

func get(ctx context.Context, url string) (string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	response, err := (&http.Client{Timeout: 10 * time.Second}).Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 16*1024*1024+1))
	if err != nil {
		return "", err
	}
	if response.StatusCode != http.StatusOK || len(body) > 16*1024*1024 {
		return "", errors.New("module response status or size invalid")
	}
	return string(body), nil
}

func run(ctx context.Context, app, repo, cache string, result map[string]any) (outcome error) {
	var sessions []live
	defer func() {
		cleanup, stop := context.WithTimeout(context.Background(), 30*time.Second)
		defer stop()
		for _, session := range sessions {
			outcome = errors.Join(outcome, closeError(session.dev.Session.Close(cleanup)))
		}
	}()
	rows := []map[string]any{}
	result["sessions"] = &rows
	for _, platform := range []string{"ios", "android"} {
		host := jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS(filepath.Join(repo, "assets"))}, CacheDir: filepath.Join(cache, platform, "helper"), Executor: captureExecutor{file: filepath.Join(cache, platform+"-vite-request.json")}, Environment: map[string]string{"VISUAL_CAPTURE_URL": "", "XPLAT_DOCS_DEMOS": ""}}
		resolved, err := (resolver.Resolver{Host: host}).Resolve(ctx, app)
		if err != nil {
			return err
		}
		target := project.Target{Platform: platform, Configuration: "debug", DestinationKind: "simulator", DestinationID: "host-fixture", Architecture: "arm64"}
		dev, err := (bundle.Adapter{Host: host}).StartDevelopment(ctx, resolved, target, bundle.Request{})
		if err != nil {
			return fmt.Errorf("%s start: %w", platform, err)
		}
		sessions = append(sessions, live{platform, dev})
		body, err := get(ctx, dev.Ready.Endpoint.URL+"/ns/entry")
		if err != nil {
			return err
		}
		if !strings.Contains(body, "/ns/entry-rt") {
			return errors.New("installed native entry route missing")
		}
		routeHashes := map[string]string{"entry": fmt.Sprintf("%x", sha256.Sum256([]byte(body)))}
		for _, route := range []string{"hmr/client/hot-context.js", "hmr/frameworks/typescript/client/strategy.js"} {
			body, err = get(ctx, dev.Ready.Endpoint.URL+"/ns/m/node_modules/@nativescript/vite/"+route)
			if err != nil {
				return err
			}
			if !strings.Contains(body, "__xplat") {
				return errors.New("native callback adapter missing")
			}
			routeHashes[route] = fmt.Sprintf("%x", sha256.Sum256([]byte(body)))
		}
		rows = append(rows, map[string]any{"platform": platform, "sourceRevision": resolved.Revision, "initialBundleFiles": len(dev.Ready.Manifest.Files), "routeSHA256": routeHashes, "ready": true})
	}
	if sessions[0].dev.Ready.Endpoint.URL == sessions[1].dev.Ready.Endpoint.URL {
		return errors.New("target endpoints collide")
	}
	result["independentEndpoints"] = true
	for index, session := range sessions {
		cleanup, stop := context.WithTimeout(context.Background(), 30*time.Second)
		err := closeError(session.dev.Session.Close(cleanup))
		err = errors.Join(err, closeError(session.dev.Session.Close(cleanup)))
		stop()
		if err != nil {
			return err
		}
		if _, err = os.Lstat(session.dev.Ready.Manifest.Directory); !os.IsNotExist(err) {
			return errors.New("owned development output survived close")
		}
		if _, err = get(ctx, session.dev.Ready.Endpoint.URL+"/ns/entry"); err == nil {
			return errors.New("owned endpoint survived close")
		}
		rows[index]["repeatedClosePassed"] = true
		rows[index]["outputRetired"] = true
		rows[index]["endpointRetired"] = true
		if index == 0 {
			if _, err = get(ctx, sessions[1].dev.Ready.Endpoint.URL+"/ns/entry"); err != nil {
				return errors.New("closing one target interrupted the other")
			}
			result["secondTargetSurvivedFirstClose"] = true
		}
	}
	return nil
}
