package prepare

import (
	"encoding/hex"
	"encoding/json"
	"slices"

	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
)

// Validate before dependency tools run: a helper result cannot substitute a
// different package, manifest revision or product selection in the handoff.
func validateLocalSwiftPackages(r project.Resolved, evaluations []project.LocalSwiftPackageEvaluation) error {
	selected := make(map[string]project.Contribution)
	for _, c := range r.Contributions {
		if c.Platform == "ios" && c.Kind == "spm" && c.SPM != nil && c.SPM.Path != "" {
			if _, exists := selected[c.Path]; exists {
				return workflow.ErrHandoff
			}
			selected[c.Path] = c
		}
	}
	if len(selected) != len(evaluations) {
		return workflow.ErrHandoff
	}
	sources := make(map[string]string, len(r.Sources))
	for _, source := range r.Sources {
		sources[source.Path] = source.Digest
	}
	for _, evaluation := range evaluations {
		c, exists := selected[evaluation.Manifest]
		if !exists || evaluation.Name != c.SPM.Name || evaluation.Path != c.SPM.Path || evaluation.SourceSHA256 != sources[c.Path] {
			return workflow.ErrHandoff
		}
		digest, err := hex.DecodeString(evaluation.SourceSHA256)
		if err != nil || len(digest) != 32 || hex.EncodeToString(digest) != evaluation.SourceSHA256 {
			return workflow.ErrHandoff
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
			return workflow.ErrHandoff
		}
		libraries := make(map[string]bool)
		for _, product := range manifest.Products {
			if _, duplicate := libraries[product.Name]; duplicate {
				return workflow.ErrHandoff
			}
			libraries[product.Name] = len(product.Type["library"]) > 0 && string(product.Type["library"]) != "null"
		}
		for _, product := range expected {
			if !libraries[product] {
				return workflow.ErrHandoff
			}
		}
		delete(selected, evaluation.Manifest)
	}
	return nil
}
