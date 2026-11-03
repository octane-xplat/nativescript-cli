package build

import (
	"archive/zip"
	"context"
	"encoding/binary"
	"errors"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
)

type completed struct{ err error }

func (h completed) Wait() (process.Exit, error) { return process.Exit{Code: 65}, h.err }
func (h completed) Close(context.Context) error { return h.err }

type fakeXcode struct {
	commands             []process.Command
	fail, missing, wrong bool
}

func (f *fakeXcode) Start(_ context.Context, c process.Command) (process.Handle, error) {
	f.commands = append(f.commands, c)
	if c.Executable == "xcrun" {
		c.Output(context.Background(), process.Stdout, []byte("/usr/bin/clang\n"))
		return completed{}, nil
	}
	if f.fail {
		return completed{errors.New("fixture exit")}, nil
	}
	if c.Executable == "/usr/bin/plutil" {
		data, e := os.ReadFile(c.Args[len(c.Args)-1])
		if e != nil {
			return nil, e
		}
		return completed{}, os.WriteFile(c.Args[3], data, 0600)
	}
	if slices.Contains(c.Args, "-exportArchive") {
		var archive, out string
		for i, a := range c.Args {
			if a == "-archivePath" {
				archive = c.Args[i+1]
			}
			if a == "-exportPath" {
				out = c.Args[i+1]
			}
		}
		os.MkdirAll(out, 0700)
		file, e := os.Create(filepath.Join(out, "NativeScriptApp.ipa"))
		if e != nil {
			return nil, e
		}
		z := zip.NewWriter(file)
		for _, name := range []string{"Info.plist", "NativeScriptApp"} {
			data, e := os.ReadFile(filepath.Join(archive, "Products/Applications/NativeScriptApp.app", name))
			if e != nil {
				return nil, e
			}
			w, _ := z.Create("Payload/NativeScriptApp.app/" + name)
			w.Write(data)
		}
		z.Close()
		file.Close()
		return completed{}, nil
	}
	app := ""
	for i, a := range c.Args {
		if strings.HasPrefix(a, "CONFIGURATION_BUILD_DIR=") {
			app = filepath.Join(strings.TrimPrefix(a, "CONFIGURATION_BUILD_DIR="), "NativeScriptApp.app")
		}
		if a == "-archivePath" {
			app = filepath.Join(c.Args[i+1], "Products/Applications/NativeScriptApp.app")
		}
	}
	if !f.missing && app != "" {
		os.MkdirAll(app, 0700)
		platform := "iPhoneSimulator"
		if slices.Contains(c.Args, "iphoneos") {
			platform = "iPhoneOS"
		}
		os.WriteFile(filepath.Join(app, "Info.plist"), []byte(`<plist><dict><key>CFBundleIdentifier</key><string>org.example.app</string><key>CFBundleExecutable</key><string>NativeScriptApp</string><key>CFBundleSupportedPlatforms</key><array><string>`+platform+`</string></array></dict></plist>`), 0600)
		// Minimal executable Mach-O with explicit LC_BUILD_VERSION.
		data := make([]byte, 56)
		fields := []uint32{0xfeedfacf, 0x100000c, 0, 2, 1, 24, 0, 0, 0x32, 24, 7, 0, 0, 0}
		if platform == "iPhoneOS" {
			fields[10] = 2
		}
		if f.wrong {
			fields[10] = 2
		}
		for i, v := range fields {
			binary.LittleEndian.PutUint32(data[i*4:], v)
		}
		os.WriteFile(filepath.Join(app, "NativeScriptApp"), data, 0700)
	}
	return completed{}, nil
}
func setup(t *testing.T) (project.Prepared, project.Bundle, *workspace.Ownership) {
	t.Helper()
	id := project.Identity{Schema: 1, Revision: "source", ProjectDir: t.TempDir(), Target: project.Target{Platform: "ios", DestinationKind: "simulator", DestinationID: "generic", Architecture: "arm64", Configuration: "debug"}}
	l, e := workspace.NewLayout(t.TempDir(), id)
	if e != nil {
		t.Fatal(e)
	}
	lease, e := workspace.Acquire(context.Background(), l)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { lease.Release() })
	p := project.Prepared{Identity: l.Identity, NativeDir: filepath.Join(l.GeneratedRoot, "ios"), BundleDir: filepath.Join(l.GeneratedRoot, "ios/app")}
	os.MkdirAll(p.BundleDir, 0700)
	return p, project.Bundle{Identity: p.Identity, Directory: p.BundleDir, Entry: filepath.Join(p.BundleDir, "app.js")}, lease
}
func TestCommandsArtifactsAndFailures(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("Xcode host")
	}
	for _, mode := range []string{"build", "archive", "export", "failure", "missing", "wrong"} {
		t.Run(mode, func(t *testing.T) {
			p, b, l := setup(t)
			f := &fakeXcode{fail: mode == "failure", missing: mode == "missing", wrong: mode == "wrong"}
			o := Options{SigningMode: "disabled"}
			if mode == "archive" || mode == "export" {
				o.Action = mode
				if mode == "export" {
					o.SigningMode = "manual"
					o.TeamID = "fixture"
					o.Identity = "fixture"
					o.ProvisioningProfile = "fixture"
					o.ExportOptionsPlist = filepath.Join(t.TempDir(), "export.plist")
					os.WriteFile(o.ExportOptionsPlist, []byte("<plist><dict/></plist>"), 0600)
				}
				p.Identity.Target.DestinationKind = "device"
				b.Identity = p.Identity
				l.Release()
				layout, _ := workspace.NewLayout(t.TempDir(), p.Identity)
				l, _ = workspace.Acquire(context.Background(), layout)
				defer l.Release()
			}
			a, e := (Adapter{Options: o, Executor: f}).Compile(context.Background(), p, b, l)
			if mode == "failure" {
				var failure *Failure
				if !errors.As(e, &failure) || failure.ExitCode != 65 {
					t.Fatal(e)
				}
				return
			}
			if mode == "missing" || mode == "wrong" {
				if !errors.Is(e, ErrArtifact) {
					t.Fatal(e)
				}
				return
			}
			if e != nil || len(a) != 1 {
				t.Fatal(a, e)
			}
			args := f.commands[1].Args
			for _, want := range []string{"-destination", "-configuration", "ARCHS=arm64", "ONLY_ACTIVE_ARCH=YES"} {
				if !slices.Contains(args, want) {
					t.Fatal(args)
				}
			}
			if mode == "export" && a[0].Kind != "ipa" {
				t.Fatal(a)
			}
			if mode == "archive" && a[0].Kind != "xcarchive" {
				t.Fatal(a)
			}
		})
	}
}
func TestValidationAndCancellation(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("workspace locking unavailable")
	}
	p, b, l := setup(t)
	for _, o := range []Options{{Action: "bad"}, {Action: "archive"}, {SigningMode: "manual"}, {SigningMode: "disabled", TeamID: "forbidden"}, {Action: "export", SigningMode: "disabled"}} {
		if _, e := (Adapter{Options: o}).Compile(context.Background(), p, b, l); e == nil {
			t.Fatal(o)
		}
	}
	b.Identity.Revision = "stale"
	if _, e := (Adapter{}).Compile(context.Background(), p, b, l); !errors.Is(e, workflow.ErrHandoff) {
		t.Fatal(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := (Adapter{}).Compile(ctx, p, b, l); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
}

func TestExplicitDestinationWorkspaceConfigurationAndSigning(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("Xcode host")
	}
	for _, mode := range []string{"automatic", "manual", "disabled"} {
		t.Run(mode, func(t *testing.T) {
			p, b, l := setup(t)
			p.Identity.Target.DestinationID = "exact-device-id"
			p.Identity.Target.Configuration = "release"
			b.Identity = p.Identity
			l.Release()
			layout, _ := workspace.NewLayout(t.TempDir(), p.Identity)
			l, _ = workspace.Acquire(context.Background(), layout)
			defer l.Release()
			os.MkdirAll(filepath.Join(p.NativeDir, "NativeScriptApp.xcworkspace"), 0700)
			o := Options{SigningMode: mode}
			if mode != "disabled" {
				o.TeamID = "fixture-team"
			}
			if mode == "manual" {
				o.Identity = "fixture-identity"
				o.ProvisioningProfile = "fixture-profile"
			}
			f := &fakeXcode{}
			if _, e := (Adapter{Options: o, Executor: f}).Compile(context.Background(), p, b, l); e != nil {
				t.Fatal(e)
			}
			args := f.commands[1].Args
			for _, want := range []string{"-workspace", "Release", "platform=iOS Simulator,id=exact-device-id", "NS_LD=/usr/bin/clang"} {
				if !slices.Contains(args, want) {
					t.Fatal(args)
				}
			}
			if slices.Contains(args, "-allowProvisioningUpdates") {
				t.Fatal("implicit signing mutation")
			}
			if mode == "manual" && !slices.Contains(args, "PROVISIONING_PROFILE_SPECIFIER=fixture-profile") {
				t.Fatal(args)
			}
		})
	}
}

type cancelledHandle struct {
	ctx     context.Context
	retired chan struct{}
}

func (h cancelledHandle) Wait() (process.Exit, error) {
	<-h.ctx.Done()
	close(h.retired)
	return process.Exit{}, h.ctx.Err()
}
func (h cancelledHandle) Close(context.Context) error { return nil }

type cancellableXcode struct{ started, retired chan struct{} }

func (f cancellableXcode) Start(ctx context.Context, c process.Command) (process.Handle, error) {
	if c.Executable == "xcrun" {
		c.Output(ctx, process.Stdout, []byte("/usr/bin/clang"))
		return completed{}, nil
	}
	close(f.started)
	return cancelledHandle{ctx, f.retired}, nil
}
func TestCancellationRetiresBeforeReturn(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("Xcode host")
	}
	p, b, l := setup(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	f := cancellableXcode{make(chan struct{}), make(chan struct{})}
	done := make(chan error, 1)
	go func() {
		a, e := (Adapter{Executor: f}).Compile(ctx, p, b, l)
		if len(a) != 0 {
			done <- errors.New("cancelled artifact returned")
		} else {
			done <- e
		}
	}()
	<-f.started
	cancel()
	if e := <-done; !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	select {
	case <-f.retired:
	default:
		t.Fatal("returned before process retirement")
	}
	if e := l.Release(); e != nil {
		t.Fatal(e)
	}
}
