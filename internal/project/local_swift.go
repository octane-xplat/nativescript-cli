package project

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"slices"
)

var ErrLocalSwiftHandoff = errors.New("local Swift evaluation differs from resolved inputs")

// ValidateLocalSwiftPackages binds evaluations to the selected contributions and
// manifest source identities. Native preparation and OTA share this boundary.
func ValidateLocalSwiftPackages(r Resolved, evaluations []LocalSwiftPackageEvaluation) error {
	selected := make(map[string]Contribution)
	for _, c := range r.Contributions {
		if c.Platform == "ios" && c.Kind == "spm" && c.SPM != nil && c.SPM.Path != "" {
			if _, exists := selected[c.Path]; exists {
				return ErrLocalSwiftHandoff
			}
			selected[c.Path] = c
		}
	}
	if len(selected) != len(evaluations) {
		return ErrLocalSwiftHandoff
	}
	sources := make(map[string]string, len(r.Sources))
	for _, source := range r.Sources {
		sources[source.Path] = source.Digest
	}
	for _, evaluation := range evaluations {
		c, exists := selected[evaluation.Manifest]
		if !exists || evaluation.Name != c.SPM.Name || evaluation.Path != c.SPM.Path || evaluation.SourceSHA256 != sources[c.Path] {
			return ErrLocalSwiftHandoff
		}
		digest, err := hex.DecodeString(evaluation.SourceSHA256)
		if err != nil || len(digest) != 32 || hex.EncodeToString(digest) != evaluation.SourceSHA256 {
			return ErrLocalSwiftHandoff
		}
		actual, expected := slices.Clone(evaluation.Products), slices.Clone(c.SPM.Products)
		slices.Sort(actual)
		slices.Sort(expected)
		var manifest struct {
			Products []struct {
				Name string                     `json:"name"`
				Type map[string]json.RawMessage `json:"type"`
			} `json:"products"`
			Targets []json.RawMessage `json:"targets"`
		}
		if !slices.Equal(actual, expected) || len(actual) == 0 || json.Unmarshal(evaluation.Evaluation, &manifest) != nil || manifest.Products == nil || manifest.Targets == nil {
			return ErrLocalSwiftHandoff
		}
		libraries := make(map[string]bool)
		for _, product := range manifest.Products {
			if _, duplicate := libraries[product.Name]; duplicate {
				return ErrLocalSwiftHandoff
			}
			libraries[product.Name] = len(product.Type["library"]) > 0 && string(product.Type["library"]) != "null"
		}
		for _, product := range expected {
			if !libraries[product] {
				return ErrLocalSwiftHandoff
			}
		}
		delete(selected, evaluation.Manifest)
	}
	return nil
}
