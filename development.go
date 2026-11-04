package nativescript

import (
	"context"
	"errors"
	"net/url"
	"strconv"
	"sync"

	"github.com/octane-xplat/nativescript-cli/internal/bundle"
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
	if err == nil || err == context.Canceled || err == bundle.ErrRestart {
		return nil
	}
	if joined, ok := err.(interface{ Unwrap() []error }); ok {
		var retained []error
		for _, cause := range joined.Unwrap() {
			retained = append(retained, developmentTeardownError(cause))
		}
		return errors.Join(retained...)
	}
	if cause := errors.Unwrap(err); cause != nil && developmentTeardownError(cause) == nil {
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
		cancel()
		serverErr := server.Session.Close(context.Background())
		if ctx.Err() != nil {
			return nil, errors.Join(ctx.Err(), developmentTeardownError(serverErr))
		}
		if errors.Is(serverErr, bundle.ErrRestart) && developmentTeardownError(serverErr) == nil {
			return nil, bundle.ErrRestart
		}
		return nil, errors.Join(developmentTeardownError(err), developmentTeardownError(serverErr))
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
