package nativescript

import "github.com/octane-xplat/nativescript-cli/extension"

// Platform selects the native toolchain.
type Platform string

const (
	IOS     Platform = "ios"
	Android Platform = "android"
)

type DestinationKind string

const (
	Simulator      DestinationKind = "simulator"
	PhysicalDevice DestinationKind = "device"
)

type Configuration string

const (
	Debug   Configuration = "debug"
	Release Configuration = "release"
)

type Destination struct {
	Kind         DestinationKind
	ID           string
	Architecture string
}

// Target identifies incompatible generated state. ID is an exact device identifier.
type Target struct {
	Platform      Platform
	Destination   Destination
	Configuration Configuration
}

// Options are copied at construction. No tools are discovered until an operation.
// Sink may be called concurrently by independent operations.
type Options struct {
	// OTAStartup opts into installed canonical @octane-xplat/updates and fingerprint 0.19.0 preparation.
	// Requires the exact supported producer packages and resolved native dependency locks.
	OTAStartup bool
	// Extensions are explicit registrations; IDs must be unique across all execution forms.
	Extensions  []extension.Extension
	Environment map[string]string
	Sink        EventSink
}
type ResolveRequest struct{ ProjectDir string }
type PrepareRequest struct {
	ProjectDir string
	OutputDir  string
	Target     Target
}

// IOSBuildOptions selects compilation (empty Action or "build"), "archive", or
// "export" (archive then IPA export). ExportOptionsPlist is caller-owned.
// SigningMode is "disabled", "automatic", or "manual". Device signing must
// be explicit; no provisioning updates or credentials are requested.
type IOSBuildOptions struct {
	Action              string
	SigningMode         string
	TeamID              string
	Identity            string
	ProvisioningProfile string
	ExportOptionsPlist  string
}

// AndroidBuildOptions selects apk (default) or release aab. Release always
// requires caller-owned signing inputs; password fields name environment variables.
type AndroidBuildOptions struct {
	Format           string
	Keystore         string
	Alias            string
	StorePasswordEnv string
	KeyPasswordEnv   string
}
type BuildRequest struct {
	Android    AndroidBuildOptions
	IOS        IOSBuildOptions
	ProjectDir string
	OutputDir  string
	Target     Target
}
type DeviceQuery struct{ Platform Platform }

// AndroidReverse reserves a device TCP port for a caller-owned host service.
type AndroidReverse struct{ DevicePort, HostPort int }

// DevelopmentOptions enables the installed NativeScript Vite HMR engine for a
// debug simulator/emulator session. Port zero selects an available loopback port.
// The project supplies @nativescript/vite 8.0.21 and Vite 8; no tools are installed.
type DevelopmentMode string

const (
	// HotReload runs the installed Vite dev server and hot-swaps modules.
	HotReload DevelopmentMode = "hmr"
	// Restart rebuilds through the official engine and cold-relaunches on change.
	Restart DevelopmentMode = "restart"
)

type DevelopmentOptions struct {
	// Port is the strict HMR port for HotReload; nonzero with Restart is invalid.
	Port int
	// Mode selects the development loop; the zero value behaves as HotReload.
	Mode DevelopmentMode
}

type RunRequest struct {
	Development    *DevelopmentOptions
	AndroidReverse []AndroidReverse
	// Log receives application console output in capture order, in addition to
	// the bounded Logs snapshot. It runs on a library goroutine, must return
	// promptly, must not Wait/Close the same session, and is never called after
	// Wait returns.
	Log func(SessionLog)
	// Artifact bypasses compilation; only compatible existing app products install.
	Artifact *Artifact
	// AllowBoot permits booting the exact selected shutdown simulator.
	AllowBoot bool
	// AllowPhysicalDevice explicitly authorizes install/launch on the selected trusted phone.
	AllowPhysicalDevice bool
	Build               BuildRequest
	DeviceID            string
}
