package nativescript

// Identity ties a handoff to the exact source revision and schema.
type Identity struct {
	Schema     int
	Revision   string
	ProjectDir string
	Target     Target
}
type Project struct {
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
