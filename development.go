package nativescript

import (
	"context"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/bundle"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
)

type developmentState struct {
	mu      sync.Mutex
	address DevelopmentEndpoint
	app     *workflow.Session
	history []workflow.Log
}

func (s *developmentState) endpoint() DevelopmentEndpoint {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.address
}

func trimDevelopmentLogs(logs []workflow.Log) []workflow.Log {
	size := 0
	for i := len(logs) - 1; i >= 0; i-- {
		size += len(logs[i].Text)
		if size > 1<<20 {
			return logs[i+1:]
		}
	}
	return logs
}

func (s *developmentState) logs() []workflow.Log {
	s.mu.Lock()
	defer s.mu.Unlock()
	logs := append([]workflow.Log(nil), s.history...)
	if s.app != nil {
		logs = append(logs, s.app.LogBuffer.Logs()...)
	}
	return trimDevelopmentLogs(logs)
}

func (s *developmentState) use(iteration *developmentIteration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.app != nil {
		s.history = trimDevelopmentLogs(append(s.history, s.app.LogBuffer.Logs()...))
	}
	s.app = nil
	s.address = DevelopmentEndpoint{}
	if iteration != nil {
		s.app = iteration.app
		s.address = DevelopmentEndpoint(iteration.server.Ready.Endpoint)
	}
}

type developmentIteration struct {
	server     *bundle.Development
	app        *workflow.Session
	cancel     context.CancelFunc
	serverDone <-chan error
	appDone    <-chan error
}

// Discard only expected owned shutdown/restart signals. A joined cleanup error
// must still terminate the session rather than silently starting another owner.
func developmentTeardownError(err error) error {
	return filterDevelopmentTeardown(err, errors.Is(err, context.Canceled))
}

func filterDevelopmentTeardown(err error, cancelled bool) error {
	if err == nil || err == context.Canceled || err == bundle.ErrRestart {
		return nil
	}
	// F1 reports the nonzero exit from terminating an owned process alongside
	// cancellation. Preserve output/cleanup failures; the expected exit itself
	// is not an additional teardown failure.
	if failure, ok := err.(*process.Error); ok && cancelled && failure.Kind == process.ErrExit {
		return nil
	}
	if joined, ok := err.(interface{ Unwrap() []error }); ok {
		var retained []error
		for _, cause := range joined.Unwrap() {
			retained = append(retained, filterDevelopmentTeardown(cause, cancelled))
		}
		return errors.Join(retained...)
	}
	if cause := errors.Unwrap(err); cause != nil && filterDevelopmentTeardown(cause, cancelled) == nil {
		return nil
	}
	return err
}

func (i *developmentIteration) close() error {
	i.cancel()
	appErr := i.app.Close(context.Background())
	serverErr := i.server.Session.Close(context.Background())
	return errors.Join(developmentTeardownError(appErr), developmentTeardownError(serverErr))
}

// A dev server owns its own output/cache and can run while Native holds the
// project writer lease. Its completed bootstrap is copied by the Bundler stage.
func (c *Client) startDevelopment(ctx context.Context, request RunRequest, stages workflow.Stages, notify workflow.Notify, device project.Device) (*developmentIteration, error) {
	adapter, ok := stages.Bundler.(bundle.Adapter)
	if !ok {
		return nil, workflow.ErrUnavailable
	}
	resolved, err := workflow.Resolve(ctx, stages, request.Build.ProjectDir, notify)
	if err != nil {
		return nil, err
	}
	for _, pkg := range resolved.Packages {
		if pkg.Name == "@nativescript/"+string(request.Build.Target.Platform) && !project.RuntimeSatisfies(pkg.Version, "9.1.0") {
			return nil, workflow.ErrUnavailable
		}
	}
	iterationCtx, cancel := context.WithCancel(ctx)
	server, err := adapter.StartDevelopment(iterationCtx, resolved, internalTarget(request.Build.Target), bundle.Request{Port: request.Development.Port})
	if err != nil {
		cancel()
		return nil, err
	}
	serverDone := make(chan error, 1)
	go func() {
		serverDone <- server.Session.Wait()
		cancel() // A failed server also cancels native tools or a running app.
	}()
	fail := func(err error) (*developmentIteration, error) {
		// The server sends its failure before cancelling compilation. Prefer
		// that initiating failure over the compiler's induced cancellation.
		select {
		case serverErr := <-serverDone:
			if serverErr != nil {
				err = serverErr
			}
		default:
		}
		cancel()
		serverErr := server.Session.Close(context.Background())
		if ctx.Err() != nil {
			return nil, errors.Join(ctx.Err(), developmentTeardownError(serverErr))
		}
		if errors.Is(serverErr, bundle.ErrRestart) && developmentTeardownError(serverErr) == nil {
			return nil, bundle.ErrRestart
		}
		cause := errors.Join(err, developmentTeardownError(serverErr))
		if cause == nil {
			cause = err
		}
		if cause == nil {
			cause = workflow.ErrHandoff
		}
		return nil, cause
	}
	stages.Bundler = server
	if launcher, ok := stages.Launcher.(platformDevices); ok && request.Build.Target.Platform == Android {
		endpoint, err := url.Parse(server.Ready.Endpoint.URL)
		if err != nil {
			return fail(workflow.ErrHandoff)
		}
		port, err := strconv.Atoi(endpoint.Port())
		if err != nil {
			return fail(workflow.ErrHandoff)
		}
		for _, reverse := range launcher.reverse {
			if reverse.DevicePort == port {
				return fail(workflow.ErrInvalid)
			}
		}
		launcher.reverse = append(append([]AndroidReverse(nil), launcher.reverse...), AndroidReverse{DevicePort: port, HostPort: port})
		stages.Launcher = launcher
	}
	result, err := c.build(iterationCtx, request.Build, stages, notify)
	if err != nil {
		return fail(err)
	}
	var artifacts []project.Artifact
	for _, v := range result.Artifacts {
		artifacts = append(artifacts, project.Artifact{Identity: project.Identity{Schema: v.Identity.Schema, Revision: v.Identity.Revision, ProjectDir: v.Identity.ProjectDir, Target: internalTarget(v.Identity.Target)}, Path: v.Path, Kind: v.Kind, ApplicationID: v.ApplicationID})
	}
	app, err := workflow.Launch(iterationCtx, stages, artifacts, device, notify)
	if err != nil {
		return fail(err)
	}
	if request.Log != nil && app != nil && app.LogBuffer != nil {
		app.LogBuffer.Observer = func(l workflow.Log) { request.Log(SessionLog(l)) }
	}
	appDone := make(chan error, 1)
	go func() { appDone <- app.Wait() }()
	return &developmentIteration{server: server, app: app, cancel: cancel, serverDone: serverDone, appDone: appDone}, nil
}

func (c *Client) runDevelopment(ctx context.Context, request RunRequest, stages workflow.Stages, notify workflow.Notify, device project.Device) (*Session, error) {
	runCtx, cancel := context.WithCancel(ctx)
	// Copy caller-owned options before background rebuilds retain the request.
	settings := *request.Development
	request.Development = &settings
	request.AndroidReverse = append([]AndroidReverse(nil), request.AndroidReverse...)
	var current *developmentIteration
	start := func(ctx context.Context) error {
		for {
			var err error
			current, err = c.startDevelopment(ctx, request, stages, notify, device)
			if err == nil && current == nil {
				err = workflow.ErrHandoff
			}
			if ctx.Err() != nil {
				if current != nil {
					err = errors.Join(err, current.close())
					current = nil
				}
				return errors.Join(ctx.Err(), err)
			}
			if !errors.Is(err, bundle.ErrRestart) || developmentTeardownError(err) != nil {
				return err
			}
		}
	}
	if err := start(runCtx); err != nil {
		cancel()
		return nil, operationError("run", err)
	}
	state := &developmentState{}
	state.use(current)
	owned := workflow.StartSession(runCtx, func(ctx context.Context) (err error) {
		defer cancel()
		defer func() { err = operationError("run", err) }()
		defer func() {
			if current != nil {
				err = errors.Join(err, current.close())
			}
			state.use(nil)
		}()
		for {
			var serverErr error
			select {
			case <-ctx.Done():
				return ctx.Err()
			case serverErr = <-current.serverDone:
			case appErr := <-current.appDone:
				// Server failure cancels the app. Preserve that server's actual
				// restart/failure rather than reporting only induced cancellation.
				select {
				case serverErr = <-current.serverDone:
				default:
					return appErr
				}
			}
			if !errors.Is(serverErr, bundle.ErrRestart) || developmentTeardownError(serverErr) != nil {
				return serverErr
			}
			if closeErr := current.close(); closeErr != nil {
				return closeErr
			}
			state.use(nil)
			current = nil
			if err := start(ctx); err != nil {
				return err
			}
			state.use(current)
		}
	})
	return &Session{owned: owned, development: state}, nil
}

// restartMarks fingerprints the resolved source set (and native-input roots) by
// mtime+size so a change triggers a cold restart without a dev server.
func restartMarks(resolved project.Resolved) map[string]int64 {
	marks := map[string]int64{}
	add := func(path string) {
		if info, err := os.Stat(path); err == nil {
			marks[path] = info.ModTime().UnixNano() + info.Size()
		}
	}
	for _, s := range resolved.Sources {
		add(s.Path)
	}
	for _, name := range []string{"package.json", "nativescript.config.cjs", "nativescript.config.js", "nativescript.config.mjs", "nativescript.config.ts"} {
		add(filepath.Join(resolved.Directory, name))
	}
	if resolved.Config.AppResourcesPath != "" {
		filepath.Walk(resolved.Config.AppResourcesPath, func(path string, info os.FileInfo, err error) error {
			if err == nil && info != nil && !info.IsDir() {
				add(path)
			}
			return nil
		})
	}
	return marks
}

func restartMarksSame(a, b map[string]int64) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

// runRestart is the Restart-mode session: no dev server; a resolved-source or
// native-input change produces a full official-engine rebuild, install and cold
// relaunch. The new artifact builds while the last good app keeps running; a
// failed rebuild emits a Diagnostic, leaves the current app up, and retries
// only when the fingerprint changes again.
func (c *Client) runRestart(ctx context.Context, request RunRequest, stages workflow.Stages, notify workflow.Notify, device project.Device) (*Session, error) {
	runCtx, cancel := context.WithCancel(ctx)
	settings := *request.Development
	request.Development = &settings
	e := &emitter{sink: c.options.Sink, operation: "run"}
	type iteration struct {
		app      *workflow.Session
		cancel   context.CancelFunc
		resolved project.Resolved
		marks    map[string]int64
		done     chan error
	}
	diagnostic := func(err error) string {
		lines := strings.Split(err.Error(), "\n")
		for i, line := range lines {
			lines[i] = sanitizeDiagnosticLine(line)
		}
		return truncateDiagnostic(strings.Join(lines, "\n"))
	}
	// build resolves inputs and compiles the artifact; it never touches the
	// running iteration.
	build := func(ctx context.Context) (project.Resolved, []project.Artifact, error) {
		resolved, err := workflow.Resolve(ctx, stages, request.Build.ProjectDir, notify)
		if err != nil {
			return project.Resolved{}, nil, err
		}
		for _, pkg := range resolved.Packages {
			if pkg.Name == "@nativescript/"+string(request.Build.Target.Platform) && !project.RuntimeSatisfies(pkg.Version, "9.1.0") {
				return project.Resolved{}, nil, workflow.ErrUnavailable
			}
		}
		result, err := c.build(ctx, request.Build, stages, notify)
		if err != nil {
			return project.Resolved{}, nil, err
		}
		var artifacts []project.Artifact
		for _, v := range result.Artifacts {
			artifacts = append(artifacts, project.Artifact{Identity: project.Identity{Schema: v.Identity.Schema, Revision: v.Identity.Revision, ProjectDir: v.Identity.ProjectDir, Target: internalTarget(v.Identity.Target)}, Path: v.Path, Kind: v.Kind, ApplicationID: v.ApplicationID})
		}
		return resolved, artifacts, nil
	}
	// launch installs and cold-starts a successful build; ownership is identical
	// to the HMR iteration.
	launch := func(ctx context.Context, artifacts []project.Artifact) (*workflow.Session, chan error, context.CancelFunc, error) {
		ictx, icancel := context.WithCancel(ctx)
		app, err := workflow.Launch(ictx, stages, artifacts, device, notify)
		if err != nil {
			icancel()
			return nil, nil, nil, err
		}
		if request.Log != nil && app != nil && app.LogBuffer != nil {
			app.LogBuffer.Observer = func(l workflow.Log) { request.Log(SessionLog(l)) }
		}
		done := make(chan error, 1)
		go func() { done <- app.Wait() }()
		return app, done, icancel, nil
	}
	closeIteration := func(it *iteration) error {
		if it == nil {
			return nil
		}
		it.cancel()
		if it.app != nil && it.app.LogBuffer != nil {
			it.app.LogBuffer.Observer = nil
		}
		return filterDevelopmentTeardown(it.app.Close(context.Background()), true)
	}
	resolved, artifacts, err := build(runCtx)
	if err != nil {
		cancel()
		return nil, operationError("run", err)
	}
	app, done, icancel, err := launch(runCtx, artifacts)
	if err != nil {
		cancel()
		return nil, operationError("run", err)
	}
	current := &iteration{app: app, cancel: icancel, resolved: resolved, marks: restartMarks(resolved), done: done}
	// failed remembers the fingerprint of the last rejected rebuild; pending is
	// the debounce candidate that must survive one tick unchanged.
	var failed, pending map[string]int64
	owned := workflow.StartSession(runCtx, func(ctx context.Context) (err error) {
		defer cancel()
		defer func() {
			if cerr := closeIteration(current); cerr != nil {
				err = errors.Join(err, cerr)
			}
			err = operationError("run", err)
		}()
		tick := time.NewTicker(750 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case appErr := <-current.done:
				return appErr
			case <-tick.C:
				// Ticks only re-stat the captured source set; resolution and the
				// compiler run at most once per confirmed change.
				marks := restartMarks(current.resolved)
				switch {
				case pending != nil && !restartMarksSame(marks, pending):
					pending = marks
				case pending == nil && !restartMarksSame(marks, current.marks):
					pending = marks
				case pending == nil:
					// No change.
				default:
					if failed != nil && restartMarksSame(marks, failed) {
						pending = nil
						continue
					}
					pending = nil
					nextResolved, nextArtifacts, err := build(ctx)
					if err == nil {
						app, done, icancel, err = launch(ctx, nextArtifacts)
					}
					if err != nil {
						failed = marks
						_ = e.emitEvent(ctx, Diagnostic, "restart", diagnostic(err))
						continue
					}
					old := current
					current = &iteration{app: app, cancel: icancel, resolved: nextResolved, marks: marks, done: done}
					failed = nil
					if cerr := closeIteration(old); cerr != nil {
						return cerr
					}
				}
			}
		}
	})
	return &Session{owned: owned}, nil
}
