package project

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestLocalSwiftEvaluationHandoffRejectsSubstitution(t *testing.T) {
	manifest := "/selected/Package.swift"
	digest := strings.Repeat("a", 64)
	r := Resolved{
		Contributions: []Contribution{{Platform: "ios", Kind: "spm", Path: manifest, SPM: &SwiftPackage{Name: "Selected", Path: "../Selected", Products: []string{"Second", "First"}}}},
		Sources:       []Source{{Path: manifest, Digest: digest}},
	}
	fresh := func() []LocalSwiftPackageEvaluation {
		return []LocalSwiftPackageEvaluation{{Name: "Selected", Path: "../Selected", Manifest: manifest, Products: []string{"First", "Second"}, SourceSHA256: digest, Evaluation: json.RawMessage(`{"products":[{"name":"First","type":{"library":["automatic"]}},{"name":"Second","type":{"library":["automatic"]}}],"targets":[]}`)}}
	}
	if err := ValidateLocalSwiftPackages(r, fresh()); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name string
		edit func(*LocalSwiftPackageEvaluation)
	}{
		{"name", func(e *LocalSwiftPackageEvaluation) { e.Name = "Losing" }},
		{"path", func(e *LocalSwiftPackageEvaluation) { e.Path = "../Losing" }},
		{"manifest", func(e *LocalSwiftPackageEvaluation) { e.Manifest = "/losing/Package.swift" }},
		{"revision", func(e *LocalSwiftPackageEvaluation) { e.SourceSHA256 = strings.Repeat("b", 64) }},
		{"products", func(e *LocalSwiftPackageEvaluation) { e.Products = []string{"First", "Unused"} }},
		{"null", func(e *LocalSwiftPackageEvaluation) { e.Evaluation = json.RawMessage(`null`) }},
		{"array", func(e *LocalSwiftPackageEvaluation) { e.Evaluation = json.RawMessage(`[]`) }},
		{"missing-fields", func(e *LocalSwiftPackageEvaluation) { e.Evaluation = json.RawMessage(`{}`) }},
		{"missing-product", func(e *LocalSwiftPackageEvaluation) {
			e.Evaluation = json.RawMessage(`{"products":[],"targets":[]}`)
		}},
		{"null-products", func(e *LocalSwiftPackageEvaluation) {
			e.Evaluation = json.RawMessage(`{"products":null,"targets":[]}`)
		}},
		{"executable", func(e *LocalSwiftPackageEvaluation) {
			e.Evaluation = json.RawMessage(`{"products":[{"name":"First","type":{"executable":null}}],"targets":[]}`)
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			evaluations := fresh()
			tc.edit(&evaluations[0])
			if err := ValidateLocalSwiftPackages(r, evaluations); !errors.Is(err, ErrLocalSwiftHandoff) {
				t.Fatalf("accepted substituted handoff: %v", err)
			}
		})
	}
	for _, evaluations := range [][]LocalSwiftPackageEvaluation{nil, append(fresh(), fresh()...)} {
		if err := ValidateLocalSwiftPackages(r, evaluations); !errors.Is(err, ErrLocalSwiftHandoff) {
			t.Fatalf("accepted missing/duplicate evaluation: %v", err)
		}
	}
	r.Sources = nil
	if err := ValidateLocalSwiftPackages(r, fresh()); !errors.Is(err, ErrLocalSwiftHandoff) {
		t.Fatal("accepted unleased manifest", err)
	}
	if err := ValidateLocalSwiftPackages(Resolved{}, nil); err != nil {
		t.Fatal("legacy/non-local preparation changed", err)
	}
}
