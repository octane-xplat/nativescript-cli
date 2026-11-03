package project

import "testing"

func TestAndroidSettingsRequireExplicitConflictingOverride(t *testing.T) {
	r := Resolved{Packages: []Package{{Android: AndroidConfig{V8Flags: "a", MarkingMode: "none"}}, {Android: AndroidConfig{V8Flags: "b", MarkingMode: "none"}}}}
	if _, e := AndroidSettings(r); e == nil {
		t.Fatal("accepted conflicting plugin defaults")
	}
	r.Config.Android.V8Flags = "app"
	v, e := AndroidSettings(r)
	if e != nil || v.V8Flags != "app" || v.MarkingMode != "none" {
		t.Fatal(v, e)
	}
}
