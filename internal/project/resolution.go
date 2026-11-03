package project

// Resolution data is read-only input to platform preparation. A successful
// resolution describes files; it does not assert that they have been prepared.
type Config struct {
	AppPath          string
	AppResourcesPath string
	Android          AndroidConfig
}
type AndroidConfig struct {
	V8Flags     string
	MarkingMode string
}
type Package struct {
	IOSRequirement     string
	AndroidRequirement string
	Android            AndroidConfig
	Name               string
	Version            string
	Directory          string
	Native             bool
}
type Dependency struct {
	From      string
	Name      string
	Directory string
	Location  string
}
type Contribution struct {
	PackageDirectory string
	Platform         string
	Kind             string
	Path             string
}
type Source struct {
	Path   string
	Digest string
}
