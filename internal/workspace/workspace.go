package workspace

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
)

var (
	ErrInvalid     = errors.New("invalid workspace input")
	ErrReleased    = errors.New("workspace lease released")
	ErrIncomplete  = errors.New("workspace state incomplete")
	ErrStale       = errors.New("workspace inputs changed")
	ErrBusy        = errors.New("workspace has active mutations")
	ErrUnavailable = errors.New("workspace locking unavailable on this host")
)

func digest(v any) string {
	b, _ := json.Marshal(v)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

// NewLayout canonicalizes the existing project and creates the explicit state
// root. Revision is excluded from paths so regeneration can retain resolution
// pins; complete identity and input fingerprints are checked on reuse.
func NewLayout(stateRoot string, id project.Identity) (Layout, error) {
	if !filepath.IsAbs(stateRoot) || !filepath.IsAbs(id.ProjectDir) || id.Schema <= 0 || id.Revision == "" {
		return Layout{}, ErrInvalid
	}
	t := id.Target
	if (t.Platform != "ios" && t.Platform != "android") || (t.DestinationKind != "simulator" && t.DestinationKind != "device") || t.Configuration == "" || t.Architecture == "" {
		return Layout{}, ErrInvalid
	}
	p, err := filepath.EvalSymlinks(id.ProjectDir)
	if err != nil {
		return Layout{}, err
	}
	info, err := os.Stat(p)
	if err != nil {
		return Layout{}, err
	}
	if !info.IsDir() {
		return Layout{}, ErrInvalid
	}
	id.ProjectDir = p
	if err = os.MkdirAll(stateRoot, 0700); err != nil {
		return Layout{}, err
	}
	root, err := filepath.EvalSymlinks(stateRoot)
	if err != nil {
		return Layout{}, err
	}
	root = filepath.Join(root, digest(p), digest(t), "generated")
	return Layout{Identity: id, GeneratedRoot: root, BundleStaging: filepath.Join(root, ".staging")}, nil
}

type Manager struct{}

func (Manager) Acquire(ctx context.Context, l Layout) (Lease, error) { return Acquire(ctx, l) }

var _ Locker = Manager{}

// Ownership serializes all destinations of a canonical project, even across
// state roots and processes. Do not unlink the persistent OS lock file.
type Ownership struct {
	layout   Layout
	file     *os.File
	mu       sync.Mutex
	cond     *sync.Cond
	active   int
	closing  bool
	released bool
	cleanup  error
	stage    bool
}

func Acquire(ctx context.Context, l Layout) (*Ownership, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if !filepath.IsAbs(l.GeneratedRoot) || l.BundleStaging != filepath.Join(l.GeneratedRoot, ".staging") || !filepath.IsAbs(l.Identity.ProjectDir) {
		return nil, ErrInvalid
	}
	p, err := filepath.EvalSymlinks(l.Identity.ProjectDir)
	if err != nil {
		return nil, err
	}
	if p != l.Identity.ProjectDir {
		return nil, ErrInvalid
	}
	// Reject forged layouts: target and project components must match NewLayout.
	if filepath.Base(l.GeneratedRoot) != "generated" || filepath.Base(filepath.Dir(l.GeneratedRoot)) != digest(l.Identity.Target) || filepath.Base(filepath.Dir(filepath.Dir(l.GeneratedRoot))) != digest(p) || l.Identity.Schema <= 0 || l.Identity.Revision == "" {
		return nil, ErrInvalid
	}
	dir := filepath.Join(p, ".xplat-ns")
	if err = os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(dir, "workspace.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = lock(ctx, f); err != nil {
		f.Close()
		return nil, err
	}
	if err = os.MkdirAll(l.GeneratedRoot, 0700); err != nil {
		unlock(f)
		f.Close()
		return nil, err
	}
	o := &Ownership{layout: l, file: f}
	o.cond = sync.NewCond(&o.mu)
	return o, nil
}
func (o *Ownership) Layout() Layout { return o.layout }

// Release waits for every Run, including descendant retirement. ErrCleanup
// fails closed: ownership stays held because file users may still be alive.
func (o *Ownership) Release() error {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.closing = true
	for o.active > 0 {
		o.cond.Wait()
	}
	if o.cleanup != nil {
		return o.cleanup
	}
	if o.released {
		return nil
	}
	if err := unlock(o.file); err != nil {
		return err
	}
	o.released = true
	return o.file.Close()
}

// Run is the mutating-tool handoff. Output callbacks are rejected because
// application sinks must run outside leases. Diagnostics may be emitted after
// Release. The trusted executor must honor process.Handle's retirement contract.
func (o *Ownership) Run(ctx context.Context, executor process.Executor, cmd process.Command) (process.Exit, error) {
	if executor == nil || cmd.Output != nil {
		return process.Exit{}, ErrInvalid
	}
	o.mu.Lock()
	if o.closing {
		o.mu.Unlock()
		return process.Exit{}, ErrReleased
	}
	if o.active > 0 {
		o.mu.Unlock()
		return process.Exit{}, ErrBusy
	}
	o.active++
	o.mu.Unlock()
	h, err := executor.Start(ctx, cmd)
	var exit process.Exit
	if err == nil {
		exit, err = h.Wait()
	}
	o.mu.Lock()
	if errors.Is(err, process.ErrCleanup) {
		o.cleanup = err
	}
	o.active--
	o.cond.Broadcast()
	o.mu.Unlock()
	return exit, err
}

// State is published last. Its directories are immutable generation paths.
// Inputs must fingerprint all resolved config, dependencies, tool/helper
// versions and environment that affect output; callers own that inventory.
type State struct {
	Identity   project.Identity
	Inputs     string
	Generation string
	NativeDir  string
	BundleDir  string
}

func (o *Ownership) read() (State, error) {
	var s State
	b, err := os.ReadFile(filepath.Join(o.layout.GeneratedRoot, "state.json"))
	if errors.Is(err, os.ErrNotExist) {
		return s, ErrIncomplete
	}
	if err != nil {
		return s, err
	}
	if json.Unmarshal(b, &s) != nil || !strings.HasPrefix(s.Generation, "gen-") || filepath.Base(s.Generation) != s.Generation {
		return s, ErrIncomplete
	}
	base := filepath.Join(o.layout.GeneratedRoot, s.Generation)
	if s.NativeDir != filepath.Join(base, "native") || s.BundleDir != filepath.Join(base, "bundle") || s.Inputs == "" {
		return s, ErrIncomplete
	}
	for _, p := range []string{base, s.NativeDir, s.BundleDir} {
		info, e := os.Lstat(p)
		if e != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return s, ErrIncomplete
		}
	}
	return s, nil
}
func (o *Ownership) Inspect(inputs string) (State, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.closing {
		return State{}, ErrReleased
	}
	s, err := o.read()
	if err != nil {
		return s, err
	}
	entries, err := os.ReadDir(o.layout.BundleStaging)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return s, err
	}
	if len(entries) > 0 {
		return s, ErrIncomplete
	}
	if !s.Identity.Compatible(o.layout.Identity) || s.Inputs != inputs {
		return s, ErrStale
	}
	return s, nil
}

type Stage struct {
	owner *Ownership
	State State
	path  string
	done  bool
}

// Begin starts fresh trees and copies only explicitly selected resolution pins
// from the previous generation, even when inputs/revision changed. Relative pin
// paths are below native/, e.g. Podfile.lock or App.xcworkspace/xcshareddata/swiftpm/Package.resolved.
// Old generations and interrupted staging are retained, never silently deleted.
func (o *Ownership) Begin(ctx context.Context, inputs string, pins []string) (*Stage, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if o.closing {
		return nil, ErrReleased
	}
	if o.stage || o.active > 0 {
		return nil, ErrBusy
	}
	if inputs == "" {
		return nil, ErrInvalid
	}
	for _, p := range pins {
		if p == "." || filepath.IsAbs(p) || filepath.Clean(p) != p || p == ".." || strings.HasPrefix(p, ".."+string(filepath.Separator)) {
			return nil, ErrInvalid
		}
	}
	if err := os.MkdirAll(o.layout.BundleStaging, 0700); err != nil {
		return nil, err
	}
	path, err := os.MkdirTemp(o.layout.BundleStaging, "stage-")
	if err != nil {
		return nil, err
	}
	s := &Stage{owner: o, path: path, State: State{Identity: o.layout.Identity, Inputs: inputs, NativeDir: filepath.Join(path, "native"), BundleDir: filepath.Join(path, "bundle")}}
	for _, p := range []string{s.State.NativeDir, s.State.BundleDir} {
		if err = os.Mkdir(p, 0700); err != nil {
			return nil, err
		}
	}
	old, err := o.read()
	if err != nil {
		// No previous state is valid only for an initial generation. A corrupt
		// manifest must never silently discard dependency resolution pins.
		if _, statErr := os.Stat(filepath.Join(o.layout.GeneratedRoot, "state.json")); !errors.Is(statErr, os.ErrNotExist) {
			return nil, err
		}
	}
	if err == nil {
		for _, p := range pins {
			if err = copyPin(ctx, old.NativeDir, s.State.NativeDir, p); err != nil {
				return nil, err
			}
		}
	}
	o.stage = true
	return s, nil
}
func copyPin(ctx context.Context, src, dst, rel string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	// Check each ancestor, refusing symlink traversal in resolution inputs.
	p := src
	for _, part := range strings.Split(rel, string(filepath.Separator)) {
		p = filepath.Join(p, part)
		info, err := os.Lstat(p)
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return ErrInvalid
		}
	}
	info, err := os.Stat(p)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return ErrInvalid
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return err
	}
	out := filepath.Join(dst, rel)
	if err = os.MkdirAll(filepath.Dir(out), 0700); err != nil {
		return err
	}
	return os.WriteFile(out, b, 0600)
}
func (s *Stage) Commit(ctx context.Context) (State, error) {
	o := s.owner
	o.mu.Lock()
	defer o.mu.Unlock()
	if s.done || o.closing {
		return State{}, ErrReleased
	}
	if o.active > 0 {
		return State{}, ErrBusy
	}
	if o.cleanup != nil {
		return State{}, o.cleanup
	}
	if err := ctx.Err(); err != nil {
		return State{}, err
	}
	for _, p := range []string{s.path, filepath.Join(s.path, "native"), filepath.Join(s.path, "bundle")} {
		info, err := os.Lstat(p)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return State{}, ErrIncomplete
		}
	}
	generation := "gen-" + filepath.Base(s.path)
	final := filepath.Join(o.layout.GeneratedRoot, generation)
	if err := os.Rename(s.path, final); err != nil {
		return State{}, err
	}
	state := s.State
	state.Generation = generation
	state.NativeDir = filepath.Join(final, "native")
	state.BundleDir = filepath.Join(final, "bundle")
	b, err := json.Marshal(state)
	if err != nil {
		return State{}, err
	}
	f, err := os.CreateTemp(o.layout.GeneratedRoot, ".manifest-")
	if err != nil {
		return State{}, err
	}
	name := f.Name()
	defer os.Remove(name)
	_, err = f.Write(b)
	if err == nil {
		err = f.Sync()
	}
	err = errors.Join(err, f.Close())
	if err != nil {
		return State{}, err
	}
	if err = os.Rename(name, filepath.Join(o.layout.GeneratedRoot, "state.json")); err != nil {
		return State{}, err
	}
	s.done = true
	o.stage = false
	// The new generation is now the last good one; remove prior published
	// generations inside this root (bounded: gen-* names only).
	if entries, e := os.ReadDir(o.layout.GeneratedRoot); e == nil {
		for _, entry := range entries {
			if entry.IsDir() && strings.HasPrefix(entry.Name(), "gen-") && entry.Name() != generation {
				os.RemoveAll(filepath.Join(o.layout.GeneratedRoot, entry.Name()))
			}
		}
	}
	return state, nil
}

// Abort abandons only this stage after all mutating descendants retire.
func (s *Stage) Abort() error {
	o := s.owner
	o.mu.Lock()
	defer o.mu.Unlock()
	if s.done {
		return nil
	}
	if o.active > 0 {
		return ErrBusy
	}
	if o.cleanup != nil {
		return o.cleanup
	}
	if err := os.RemoveAll(s.path); err != nil {
		return err
	}
	s.done = true
	o.stage = false
	return nil
}

// QuarantineInterrupted retains incomplete trees for diagnosis, outside the
// staging namespace. It does not delete pins or old generations. A coordinator
// must ensure any prior owner's children have retired before recovery (a killed
// owner cannot communicate its process lifetime through a filesystem lock).
func (o *Ownership) QuarantineInterrupted(ctx context.Context) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}
	if o.closing {
		return ErrReleased
	}
	if o.stage || o.active > 0 {
		return ErrBusy
	}
	if o.cleanup != nil {
		return o.cleanup
	}
	entries, err := os.ReadDir(o.layout.BundleStaging)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		return nil
	}
	dir, err := os.MkdirTemp(o.layout.GeneratedRoot, "abandoned-")
	if err != nil {
		return err
	}
	return os.Rename(o.layout.BundleStaging, filepath.Join(dir, "staging"))
}

// RunHelper retains file ownership through a trusted built-in helper operation.
// work may parse private protocol frames into a bounded queue, but must never
// invoke application callbacks. It returns only after owned descendants retire.
func (o *Ownership) RunHelper(ctx context.Context, work func(context.Context) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	o.mu.Lock()
	if o.closing {
		o.mu.Unlock()
		return ErrReleased
	}
	if o.active > 0 {
		o.mu.Unlock()
		return ErrBusy
	}
	o.active++
	o.mu.Unlock()
	err := work(ctx)
	o.mu.Lock()
	if errors.Is(err, process.ErrCleanup) {
		o.cleanup = err
	}
	o.active--
	o.cond.Broadcast()
	o.mu.Unlock()
	return err
}
