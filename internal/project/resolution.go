package project

import (
	"encoding/json"
	"fmt"
)

// Resolution data is read-only input to platform preparation. A successful
// resolution describes files; it does not assert that they have been prepared.
type Config struct {
	NativeConfig      json.RawMessage
	AppPath           string
	AppResourcesPath  string
	BundlerConfigPath string
	PackageManager    string
	Android           AndroidConfig
	VisionOS          *VisionOSConfig
}

// VisionOSConfig is declaration metadata only; no visionOS backend is provided.
type VisionOSConfig struct {
	DiscardUncaughtJSExceptions *bool          `json:"discardUncaughtJsExceptions,omitempty"`
	SPMPackages                 []SwiftPackage `json:"spmPackages,omitempty"`
}
type AndroidConfig struct {
	V8Flags     string `json:"v8Flags,omitempty"`
	MarkingMode string `json:"markingMode,omitempty"`
}
type Package struct {
	IOSRequirement     string
	AndroidRequirement string
	WindowsRequirement string
	VisionOS           *VisionOSConfig
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
	SPM              *SwiftPackage `json:"spm,omitempty"`
}
type SwiftPackage struct {
	Name          string   `json:"name"`
	Path          string   `json:"path,omitempty"`
	RepositoryURL string   `json:"repositoryURL"`
	Version       string   `json:"version"`
	Products      []string `json:"products"`
}
type Source struct {
	Path   string
	Digest string
}

// AndroidSettings applies app overrides to plugin defaults. Conflicting plugin
// defaults require an explicit app choice rather than package-order precedence.
func AndroidSettings(r Resolved) (AndroidConfig, error) {
	config := r.Config.Android
	for _, p := range r.Packages {
		if r.Config.Android.V8Flags == "" && p.Android.V8Flags != "" {
			if config.V8Flags != "" && config.V8Flags != p.Android.V8Flags {
				return AndroidConfig{}, fmt.Errorf("conflicting plugin v8Flags; set app android.v8Flags")
			}
			config.V8Flags = p.Android.V8Flags
		}
		if r.Config.Android.MarkingMode == "" && p.Android.MarkingMode != "" {
			if config.MarkingMode != "" && config.MarkingMode != p.Android.MarkingMode {
				return AndroidConfig{}, fmt.Errorf("conflicting plugin markingMode; set app android.markingMode")
			}
			config.MarkingMode = p.Android.MarkingMode
		}
	}
	return config, nil
}
