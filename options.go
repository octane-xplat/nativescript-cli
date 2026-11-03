package nativescript

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
type RunRequest struct {
	// Artifact bypasses compilation; only compatible existing app products install.
	Artifact *Artifact
	// AllowBoot permits booting the exact selected shutdown simulator.
	AllowBoot bool
	// AllowPhysicalDevice explicitly authorizes install/launch on the selected trusted phone.
	AllowPhysicalDevice bool
	Build               BuildRequest
	DeviceID            string
}
