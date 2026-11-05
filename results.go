package nativescript

// Identity ties a handoff to the exact source revision and schema.
type Identity struct {
	Schema     int
	Revision   string
	ProjectDir string
	Target     Target
}
type Project struct {
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
	Android          AndroidRuntimeConfig
}
type AndroidRuntimeConfig struct {
	V8Flags     string
	MarkingMode string
}

// InstalledPackage identifies one physical installation, including linked workspaces.
type InstalledPackage struct {
	IOSRequirement     string
	AndroidRequirement string
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
	// SPM is present for spm-remote; Path identifies its declaring config file.
	SPM *SwiftPackage
}

// SwiftPackage describes an explicitly declared remote dependency. Resolution
// does not fetch it; native preparation owns tool resolution and actual pins.
type SwiftPackage struct {
	Name          string
	RepositoryURL string
	Version       string
	Products      []string
}

// ProjectSource records SHA-256 of a read config, manifest or native file.
type ProjectSource struct {
	Path   string
	Digest string
}
