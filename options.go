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
type BuildRequest struct {
	ProjectDir string
	OutputDir  string
	Target     Target
}
type DeviceQuery struct{ Platform Platform }
type RunRequest struct {
	Build    BuildRequest
	DeviceID string
}
