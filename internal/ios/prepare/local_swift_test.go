package prepare

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
)

func TestLocalSwiftEvaluationHandoffRejectsSubstitution(t *testing.T) {
	manifest := "/selected/Package.swift"
	digest := strings.Repeat("a", 64)
	r := project.Resolved{
		Contributions: []project.Contribution{{Platform: "ios", Kind: "spm", Path: manifest, SPM: &project.SwiftPackage{Name: "Selected", Path: "../Selected", Products: []string{"Second", "First"}}}},
		Sources:       []project.Source{{Path: manifest, Digest: digest}},
	}
	fresh := func() []project.LocalSwiftPackageEvaluation {
		return []project.LocalSwiftPackageEvaluation{{Name: "Selected", Path: "../Selected", Manifest: manifest, Products: []string{"First", "Second"}, SourceSHA256: digest, Evaluation: json.RawMessage(`{"products":[{"name":"First","type":{"library":["automatic"]}},{"name":"Second","type":{"library":["automatic"]}}],"targets":[]}`)}}
	}
	if err := validateLocalSwiftPackages(r, fresh()); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name string
		edit func(*project.LocalSwiftPackageEvaluation)
	}{
		{"name", func(e *project.LocalSwiftPackageEvaluation) { e.Name = "Losing" }},
		{"path", func(e *project.LocalSwiftPackageEvaluation) { e.Path = "../Losing" }},
		{"manifest", func(e *project.LocalSwiftPackageEvaluation) { e.Manifest = "/losing/Package.swift" }},
		{"revision", func(e *project.LocalSwiftPackageEvaluation) { e.SourceSHA256 = strings.Repeat("b", 64) }},
		{"products", func(e *project.LocalSwiftPackageEvaluation) { e.Products = []string{"First", "Unused"} }},
		{"null", func(e *project.LocalSwiftPackageEvaluation) { e.Evaluation = json.RawMessage(`null`) }},
		{"array", func(e *project.LocalSwiftPackageEvaluation) { e.Evaluation = json.RawMessage(`[]`) }},
		{"missing-fields", func(e *project.LocalSwiftPackageEvaluation) { e.Evaluation = json.RawMessage(`{}`) }},
		{"missing-product", func(e *project.LocalSwiftPackageEvaluation) {
			e.Evaluation = json.RawMessage(`{"products":[],"targets":[]}`)
		}},
		{"null-products", func(e *project.LocalSwiftPackageEvaluation) {
			e.Evaluation = json.RawMessage(`{"products":null,"targets":[]}`)
		}},
		{"executable", func(e *project.LocalSwiftPackageEvaluation) {
			e.Evaluation = json.RawMessage(`{"products":[{"name":"First","type":{"executable":null}}],"targets":[]}`)
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			evaluations := fresh()
			tc.edit(&evaluations[0])
			if err := validateLocalSwiftPackages(r, evaluations); !errors.Is(err, workflow.ErrHandoff) {
				t.Fatalf("accepted substituted handoff: %v", err)
			}
		})
	}
	for _, evaluations := range [][]project.LocalSwiftPackageEvaluation{nil, append(fresh(), fresh()...)} {
		if err := validateLocalSwiftPackages(r, evaluations); !errors.Is(err, workflow.ErrHandoff) {
			t.Fatalf("accepted missing/duplicate evaluation: %v", err)
		}
	}
	r.Sources = nil
	if err := validateLocalSwiftPackages(r, fresh()); !errors.Is(err, workflow.ErrHandoff) {
		t.Fatal("accepted unleased manifest", err)
	}
	if err := validateLocalSwiftPackages(project.Resolved{}, nil); err != nil {
		t.Fatal("legacy/non-local preparation changed", err)
	}
}
