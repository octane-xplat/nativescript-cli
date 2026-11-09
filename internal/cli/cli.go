// Package cli adapts public library operations to terminal and JSON output.
package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	ns "github.com/octane-xplat/nativescript-cli"
	"github.com/spf13/cobra"
)

type library interface {
	Resolve(context.Context, ns.ResolveRequest) (ns.Project, error)
	Prepare(context.Context, ns.PrepareRequest) (ns.PreparedProject, error)
	Build(context.Context, ns.BuildRequest) (ns.BuildResult, error)
	Devices(context.Context, ns.DeviceQuery) ([]ns.Device, error)
	Run(context.Context, ns.RunRequest) (*ns.Session, error)
	InspectXcode(context.Context, ns.XcodeInspectionRequest) (ns.XcodeInspection, error)
}
type factory func(ns.Options) (library, error)
type failure struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
type response struct {
	Version   int      `json:"version"`
	Operation string   `json:"operation"`
	Result    any      `json:"result,omitempty"`
	Error     *failure `json:"error,omitempty"`
}

// Execute returns an exit status without exiting or installing signal handlers.
// JSON mode emits one versioned terminal response; diagnostics always use stderr.
func Execute(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	return execute(ctx, args, stdout, stderr, func(o ns.Options) (library, error) { return ns.New(o) })
}
func execute(ctx context.Context, args []string, stdout, stderr io.Writer, newClient factory) int {
	var structured bool
	var hmr bool
	var watch bool
	var hmrPort int
	var project, output, platform, kind, id, arch, configuration, file, cache string
	root := &cobra.Command{Use: "xplat-ns", Version: ns.Version, Short: "NativeScript project and device tooling", SilenceErrors: true, SilenceUsage: true, Args: cobra.NoArgs}
	root.RunE = func(cmd *cobra.Command, _ []string) error { return cmd.Help() }
	root.SetOut(stdout)
	root.SetErr(stderr)
	root.SetArgs(args)
	root.CompletionOptions.DisableDefaultCmd = true
	root.PersistentFlags().BoolVar(&structured, "json", false, "Emit one versioned JSON result or error (help remains text)")
	var operation string
	var result any
	var diagnostics sync.Mutex
	client := func() (library, error) {
		return newClient(ns.Options{Sink: func(ctx context.Context, e ns.Event) error {
			if err := ctx.Err(); err != nil {
				return err
			}
			diagnostics.Lock()
			defer diagnostics.Unlock()
			if e.Message == "" {
				_, err := fmt.Fprintf(stderr, "%s: %s %s\n", e.Operation, e.Stage, e.Kind)
				return err
			}
			_, err := fmt.Fprintf(stderr, "%s: %s %s: %s\n", e.Operation, e.Stage, e.Kind, e.Message)
			return err
		}})
	}
	invalid := func(message string) error { return fmt.Errorf("%w: %s", ns.ErrInvalidInput, message) }
	absolute := func(value string) (string, error) {
		if value == "" {
			return "", invalid("path must not be empty")
		}
		return filepath.Abs(value)
	}
	for _, name := range []string{"resolve", "prepare", "build", "devices", "run", "inspect-xcode"} {
		command := &cobra.Command{Use: name, Short: map[string]string{"resolve": "Resolve installed project inputs", "prepare": "Prepare a native project", "build": "Build a native artifact", "devices": "List devices for a platform", "run": "Build and run on an exact device until completion", "inspect-xcode": "Inspect an Xcode project with the embedded Node parser"}[name], Args: cobra.NoArgs}
		if name != "devices" {
			command.Flags().StringVar(&project, "project", ".", "Project directory")
		}
		if name == "devices" || name == "prepare" || name == "build" || name == "run" {
			command.Flags().StringVar(&platform, "platform", "", "Platform: ios or android")
		}
		if name == "prepare" || name == "build" || name == "run" {
			command.Flags().StringVar(&output, "output", "", "Generated output directory (required)")
			command.Flags().StringVar(&kind, "destination", "", "Destination: simulator or device (required)")
			command.Flags().StringVar(&id, "device", "", "Exact destination identifier (required)")
			command.Flags().StringVar(&arch, "arch", "", "Target architecture (required)")
			command.Flags().StringVar(&configuration, "configuration", "debug", "Configuration: debug or release")
		}
		if name == "inspect-xcode" {
			command.Flags().StringVar(&file, "file", "", "Xcode project file (required)")
			command.Flags().StringVar(&cache, "cache", "", "Writable helper cache directory (required)")
		}
		if name == "run" {
			command.Flags().BoolVar(&hmr, "hmr", false, "Use the installed NativeScript Vite HMR engine (debug simulators/emulators)")
			command.Flags().BoolVar(&watch, "watch", false, "Restart-mode dev loop: rebuild and cold-relaunch on source changes")
			command.Flags().IntVar(&hmrPort, "hmr-port", 0, "Strict native HMR server port (zero selects an available port)")
		}
		command.RunE = func(cmd *cobra.Command, _ []string) error {
			operation = cmd.Name()
			if err := ctx.Err(); err != nil {
				return err
			}
			var err error
			if operation != "devices" {
				project, err = absolute(project)
				if err != nil {
					return err
				}
			}
			if operation == "devices" || operation == "prepare" || operation == "build" || operation == "run" {
				if platform != "ios" && platform != "android" {
					return invalid("--platform must be ios or android")
				}
			}
			if operation == "prepare" || operation == "build" || operation == "run" {
				if kind != "" && kind != "simulator" && kind != "device" {
					return invalid("--destination must be simulator or device")
				}
				if configuration != "debug" && configuration != "release" {
					return invalid("--configuration must be debug or release")
				}
				output, err = absolute(output)
				if err != nil {
					return invalid("--output is required")
				}
			}
			if operation == "inspect-xcode" {
				file, err = absolute(file)
				if err != nil {
					return invalid("--file is required")
				}
				cache, err = absolute(cache)
				if err != nil {
					return invalid("--cache is required")
				}
			}
			if operation == "run" && (hmrPort < 0 || hmrPort > 65535 || (!hmr && hmrPort != 0) || (hmr && configuration != "debug") || (hmr && watch) || (watch && hmrPort != 0)) {
				return invalid("--hmr requires debug simulator/emulator output; --watch and --hmr are mutually exclusive; --hmr-port requires --hmr")
			}
			c, err := client()
			if err != nil {
				return err
			}
			// Exact --device always wins. When omitted on run (or a simulator
			// build), select the single running/booted simulator/emulator and
			// fill destination kind and architecture from it; never boot.
			if id == "" && (operation == "run" || (operation == "build" && kind != "device")) {
				devices, derr := c.Devices(ctx, ns.DeviceQuery{Platform: ns.Platform(platform)})
				if derr != nil {
					return derr
				}
				var candidates []ns.Device
				for _, d := range devices {
					if d.Kind == ns.Simulator && (d.State == "Booted" || d.State == "device") {
						candidates = append(candidates, d)
					}
				}
				if len(candidates) != 1 {
					var list strings.Builder
					for _, d := range candidates {
						fmt.Fprintf(&list, " %s (%s, %s)", d.ID, d.Name, d.State)
					}
					return invalid(fmt.Sprintf("--device omitted and %d running simulators/emulators exist:%s", len(candidates), list.String()))
				}
				d := candidates[0]
				id = d.ID
				if kind == "" {
					kind = string(d.Kind)
				}
				if arch == "" {
					arch = d.Architecture
				}
			}
			if operation == "prepare" || operation == "build" || operation == "run" {
				if kind == "" || id == "" || arch == "" {
					return invalid("--destination, --device and --arch are required")
				}
				if operation == "run" && hmr && kind != "simulator" {
					return invalid("--hmr requires simulator/emulator output")
				}
			}
			request := ns.BuildRequest{ProjectDir: project, OutputDir: output, Target: ns.Target{Platform: ns.Platform(platform), Configuration: ns.Configuration(configuration), Destination: ns.Destination{Kind: ns.DestinationKind(kind), ID: id, Architecture: arch}}}
			switch operation {
			case "resolve":
				result, err = c.Resolve(ctx, ns.ResolveRequest{ProjectDir: project})
			case "prepare":
				result, err = c.Prepare(ctx, ns.PrepareRequest{ProjectDir: request.ProjectDir, OutputDir: request.OutputDir, Target: request.Target})
			case "build":
				result, err = c.Build(ctx, request)
			case "devices":
				result, err = c.Devices(ctx, ns.DeviceQuery{Platform: ns.Platform(platform)})
			case "inspect-xcode":
				result, err = c.InspectXcode(ctx, ns.XcodeInspectionRequest{ProjectDir: project, File: file, CacheDir: cache})
			case "run":
				var session *ns.Session
				run := ns.RunRequest{Build: request, DeviceID: id}
				// App output streams to stdout in text mode; the JSON envelope
				// keeps stdout reserved, so it goes to stderr instead.
				logWriter := stdout
				if jsonMode(args) {
					logWriter = stderr
				}
				run.Log = func(l ns.SessionLog) {
					diagnostics.Lock()
					defer diagnostics.Unlock()
					fmt.Fprintln(logWriter, strings.TrimSuffix(l.Text, "\n"))
				}
				if hmr {
					run.Development = &ns.DevelopmentOptions{Port: hmrPort}
				}
				if watch {
					run.Development = &ns.DevelopmentOptions{Mode: ns.Restart}
				}
				session, err = c.Run(ctx, run)
				if err == nil {
					if session == nil {
						return errors.New("library returned no session")
					}
					err = waitSession(ctx, session)
					result = struct {
						Completed bool `json:"completed"`
					}{true}
				}
			}
			return err
		}
		root.AddCommand(command)
	}
	// Parse/usage failures are categorized separately from library failures.
	root.SetFlagErrorFunc(func(_ *cobra.Command, err error) error { return fmt.Errorf("%w: %v", ns.ErrInvalidInput, err) })
	selected, _, findErr := root.Find(args)
	if findErr == nil && selected != nil {
		operation = selected.Name()
	}
	ran := false
	root.PersistentPreRun = func(_ *cobra.Command, _ []string) { ran = true }
	err := root.ExecuteContext(ctx)
	if err != nil {
		structured = jsonMode(args)
	}
	if err != nil && !ran && !errors.Is(err, ns.ErrInvalidInput) {
		err = fmt.Errorf("%w: %v", ns.ErrInvalidInput, err)
	}
	if err == nil && result == nil {
		return 0
	} // Help is Cobra's text output.
	code, label := classify(err)
	if structured {
		r := response{Version: 1, Operation: operation, Result: result}
		if err != nil {
			r.Result = nil
			r.Error = &failure{Code: label, Message: message(err, label)}
		}
		if json.NewEncoder(stdout).Encode(r) != nil {
			return 1
		}
	} else if err != nil {
		fmt.Fprintf(stderr, "xplat-ns: %s\n", message(err, label))
	} else {
		if render(stdout, operation, result) != nil {
			return 1
		}
	}
	return code
}

type session interface {
	Wait() error
	Close(context.Context) error
}

func waitSession(ctx context.Context, s session) error {
	done := make(chan error, 1)
	go func() { done <- s.Wait() }()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		// Wait for owned cleanup; a second signal never authorizes unrelated kills.
		err := s.Close(context.Background())
		waitErr := <-done
		return errors.Join(ctx.Err(), err, waitErr)
	}
}
func classify(err error) (int, string) {
	switch {
	case err == nil:
		return 0, ""
	case errors.Is(err, context.Canceled):
		return 130, "cancelled"
	case errors.Is(err, context.DeadlineExceeded):
		return 124, "deadline_exceeded"
	case errors.Is(err, ns.ErrInvalidInput):
		return 2, "invalid_input"
	case errors.Is(err, ns.ErrUnavailable):
		return 3, "unavailable"
	case errors.Is(err, ns.ErrUnsupportedHost):
		return 3, "unsupported_host"
	case errors.Is(err, ns.ErrToolchain):
		return 3, "toolchain_unavailable"
	case errors.Is(err, ns.ErrContention):
		return 4, "contention"
	case errors.Is(err, ns.ErrSink):
		return 1, "diagnostic_failed"
	default:
		return 1, "operation_failed"
	}
}
func message(err error, label string) string {
	// Only adapter validation and explicitly safe resolver advice are displayed.
	var op *ns.OperationError
	if errors.As(err, &op) && op.Advice != "" {
		return op.Advice
	}
	if label == "invalid_input" && !errors.As(err, &op) {
		return err.Error()
	}
	return map[string]string{"cancelled": "operation cancelled", "deadline_exceeded": "operation deadline exceeded", "invalid_input": "invalid operation inputs", "unavailable": "operation unavailable; required producer is not implemented", "unsupported_host": "operation unsupported on this host", "toolchain_unavailable": "required toolchain unavailable", "contention": "workspace is busy", "diagnostic_failed": "diagnostic output failed", "operation_failed": "operation failed"}[label]
}
func render(w io.Writer, operation string, value any) error {
	switch v := value.(type) {
	case ns.Project:
		_, err := fmt.Fprintf(w, "Project: %s\nApplication: %s\nRevision: %s\n", v.Directory, v.ApplicationID, v.Revision)
		return err
	case ns.PreparedProject:
		_, err := fmt.Fprintf(w, "Native project: %s\nBundle: %s\n", v.NativeDir, v.BundleDir)
		return err
	case ns.BuildResult:
		for _, a := range v.Artifacts {
			if _, err := fmt.Fprintf(w, "%s: %s\n", a.Kind, a.Path); err != nil {
				return err
			}
		}
		return nil
	case []ns.Device:
		if len(v) == 0 {
			_, err := fmt.Fprintln(w, "No devices found.")
			return err
		}
		for _, d := range v {
			if _, err := fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", d.ID, d.Name, d.Kind, d.State); err != nil {
				return err
			}
		}
		return nil
	case ns.XcodeInspection:
		_, err := io.WriteString(w, v.Text)
		return err
	default:
		_, err := fmt.Fprintf(w, "%s completed.\n", operation)
		return err
	}
}

// Preserve the requested error format even if parsing stops at an earlier flag.
func jsonMode(args []string) bool {
	mode := false
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			break
		}
		name, value, hasValue := strings.Cut(arg, "=")
		if name == "--json" {
			if !hasValue {
				mode = true
			} else if b, err := strconv.ParseBool(value); err == nil {
				mode = b
			}
			continue
		}
		switch name {
		case "--project", "--output", "--platform", "--destination", "--device", "--arch", "--configuration", "--file", "--cache", "--hmr-port":
			if !hasValue {
				i++
			}
		}
	}
	return mode
}
