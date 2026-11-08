// Package project owns private stage handoffs; it must never import the facade.
package project

import "encoding/json"

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
	Config             Config
	Packages           []Package
	Dependencies       []Dependency
	DependencyOrder    []string
	Contributions      []Contribution
	Sources            []Source
	Directory          string
	Revision           string
	ApplicationID      string
	SourceRevision     string
	ExtensionNative    []ExtensionNativeInput
	NativeSourceGroups []NativeSourceGroup
}

// NativeSourceGroup retains a validated selector and concrete membership
// for watcher invalidation; prepared source membership remains Contributions.
type NativeSourceGroup struct {
	Name             string   `json:"name"`
	Path             string   `json:"path"`
	Root             string   `json:"root"`
	Files            []string `json:"files"`
	PackageDirectory string   `json:"packageDirectory,omitempty"`
	Selector         string   `json:"selector,omitempty"`
}

// ExtensionNativeInput is a portable digest of a verified generated native file.
// Canonical OTA collection must not depend on generated-state or host paths.
type ExtensionNativeInput struct {
	Owner    string `json:"owner"`
	Version  string `json:"version"`
	Platform string `json:"platform"`
	Kind     string `json:"kind"`
	Path     string `json:"path"`
	SHA256   string `json:"sha256"`
}
type Prepared struct {
	Identity           Identity
	NativeDir          string
	BundleDir          string
	LocalSwiftPackages []LocalSwiftPackageEvaluation
}

// LocalSwiftPackageEvaluation retains the exact manifest evaluation used to
// select linked products. It is private stage data, not a persisted OTA stamp.
// SourceSHA256 binds it to resolution; consumers must also recheck leased files.
type LocalSwiftPackageEvaluation struct {
	Name         string          `json:"name"`
	Path         string          `json:"path"`
	Products     []string        `json:"products"`
	Manifest     string          `json:"manifest"`
	SourceSHA256 string          `json:"sourceSHA256"`
	Evaluation   json.RawMessage `json:"evaluation"`
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
