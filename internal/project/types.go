// Package project owns private stage handoffs; it must never import the facade.
package project

type Target struct {
	Platform        string
	DestinationKind string
	DestinationID   string
	Architecture    string
	Configuration   string
}
type Identity struct {
	Schema     int
	Revision   string
	ProjectDir string
	Target     Target
}
type Resolved struct {
	Config        Config
	Packages      []Package
	Dependencies  []Dependency
	Contributions []Contribution
	Sources       []Source
	Directory     string
	Revision      string
	ApplicationID string
}
type Prepared struct {
	Identity  Identity
	NativeDir string
	BundleDir string
}
type Bundle struct {
	Identity  Identity
	Directory string
	Entry     string
	Files     []string
}
type Artifact struct {
	Identity      Identity
	Path          string
	Kind          string
	ApplicationID string
}
type Device struct {
	ID           string
	Name         string
	Platform     string
	Kind         string
	Architecture string
	State        string
}

// Compatible requires exact source, schema, platform and destination identity.
func (i Identity) Compatible(other Identity) bool {
	return i.Schema > 0 && i.Revision != "" && i.ProjectDir != "" && i == other
}
