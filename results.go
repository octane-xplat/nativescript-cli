package nativescript

// Identity ties a handoff to the exact source revision and schema.
type Identity struct {
	Schema     int
	Revision   string
	ProjectDir string
	Target     Target
}

// ProjectHook is one active registered lifecycle script, pinned by SHA-256.
type ProjectHook struct {
	Name   string
	Script string
	Digest string
}
type Project struct {
	Hooks         []ProjectHook
	Config        ProjectConfig
	Packages      []InstalledPackage
	Dependencies  []InstalledDependency
	Contributions []NativeContribution
	Sources       []ProjectSource
	Directory     string
	Revision      string
	ApplicationID string
}
type PreparedProject struct {
	Identity  Identity
	NativeDir string
	BundleDir string
}
type Artifact struct {
	Identity      Identity
	Path          string
	Kind          string
	ApplicationID string
}
type BuildResult struct {
	Prepared  PreparedProject
	Artifacts []Artifact
}
type Device struct {
	ID           string
	Name         string
	Platform     Platform
	Kind         DestinationKind
	Architecture string
	State        string
}

// ProjectConfig contains normalized absolute app/resource directories.
type ProjectConfig struct {
	AppPath          string
	AppResourcesPath string
	// BundlerConfigPath is the selected absolute Vite configuration file, if any.
	BundlerConfigPath string
	// PackageManager records the app preference; operations never install packages.
	PackageManager string
	Android        AndroidRuntimeConfig
	// VisionOS retains an inactive platform declaration, never applied to iOS.
	VisionOS *VisionOSConfig
	// TVOS retains an inactive platform declaration, never applied to iOS.
	TVOS *TVOSConfig
}

// VisionOSConfig preserves declaration metadata. visionOS operations are unavailable.
type VisionOSConfig struct {
	DiscardUncaughtJSExceptions *bool
	SPMPackages                 []SwiftPackage
}

// TVOSConfig preserves declaration metadata. tvOS operations are unavailable.
type TVOSConfig struct {
	DiscardUncaughtJSExceptions *bool
	SPMPackages                 []SwiftPackage
}
type AndroidRuntimeConfig struct {
	V8Flags     string
	MarkingMode string
}

// InstalledPackage identifies one physical installation, including linked workspaces.
type InstalledPackage struct {
	IOSRequirement     string
	AndroidRequirement string
	// WindowsRequirement retains metadata only; Windows execution is unavailable.
	WindowsRequirement string
	VisionOS           *VisionOSConfig
	TVOS               *TVOSConfig
	Android            AndroidRuntimeConfig
	Name               string
	Version            string
	Directory          string
	Native             bool
}

// InstalledDependency retains both the lookup location and canonical target.
type InstalledDependency struct {
	From      string
	Name      string
	Directory string
	Location  string
}

// NativeContribution is an input for preparation, not proof of a native build.
// Kind is source, framework, pods, spm, spm-remote, configuration, resource or library.
type NativeContribution struct {
	PackageDirectory string
	Platform         string
	Kind             string
	Path             string
	// SPM is present for explicit declarations. Path identifies Package.swift
	// for local spm, or the declaring config file for spm-remote.
	SPM *SwiftPackage
}

// SwiftPackage describes a declared local or remote dependency. Local Path
// retains the app-relative or absolute declaration; the contribution Path is
// its canonical manifest. Remote dependencies use RepositoryURL and Version.
// Resolution does not fetch dependencies; preparation owns tool resolution.
// Inactive platform declarations retain local paths without resolving them.
type SwiftPackage struct {
	Name          string
	Path          string
	RepositoryURL string
	Version       string
	Products      []string
}

// ProjectSource records SHA-256 of a read config, manifest or native file.
type ProjectSource struct {
	Path   string
	Digest string
}
