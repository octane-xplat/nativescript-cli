package project

import "testing"

func TestRuntimePreparationMatrix(t *testing.T) {
	for _, tc := range []struct {
		platform, version string
		supported         bool
	}{
		{"ios", "8.9.0", true}, {"ios", "9.1.0", true}, {"ios", "9.1.1", false},
		{"android", "9.0.0", true}, {"android", "9.1.1", true}, {"android", "9.1.0", false},
		{"ios", "10.0.0", false}, {"android", "9.2.0", false},
	} {
		if RuntimeSupported(tc.platform, tc.version) != tc.supported {
			t.Fatal(tc)
		}
	}
	for _, tc := range []struct {
		installed, minimum string
		satisfies          bool
	}{
		{"9.1.0", "9.1.0", true}, {"9.1.1", "9.1", true}, {"9.1.1", "9", true},
		{"8.9.0", "9.1.0", false}, {"9.0.0", "9.1.0", false}, {"9.1.1", "9.1.2", false},
		{"9.1.0", "^9", false}, {"9.1.0", "+9", false}, {"9.1.0", "9..0", false},
		{"9.1.0", "9.1.0.0", false}, {"", "9", false},
	} {
		if RuntimeSatisfies(tc.installed, tc.minimum) != tc.satisfies {
			t.Fatal(tc)
		}
	}
}
