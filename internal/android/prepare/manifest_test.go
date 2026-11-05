package prepare

import (
	"errors"
	"strings"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/workflow"
)

func TestLibraryManifestPreservesXML(t *testing.T) {
	source := `<?xml version="1.0"?>
<!-- package="comment.keep" -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
 xmlns:tools="http://schemas.android.com/tools" tools:node="merge"
 tools:replace='package="value.keep" >' package = 'com.example&#46;library'>
 <application><activity android:name=".Activity" tools:node="replace"/></application>
</manifest>`
	want := strings.Replace(source, " package = 'com.example&#46;library'", "", 1)
	got, namespace, err := libraryManifest([]byte(source))
	if err != nil || namespace != "com.example.library" || string(got) != want {
		t.Fatalf("namespace=%q err=%v manifest=%s", namespace, err, got)
	}
	withoutPackage := `<manifest xmlns:android="http://schemas.android.com/apk/res/android"/>`
	got, namespace, err = libraryManifest([]byte(withoutPackage))
	if err != nil || namespace != "" || string(got) != withoutPackage {
		t.Fatalf("package-free manifest changed: %q %q %v", got, namespace, err)
	}
}

func TestLibraryManifestRejectsInvalidInput(t *testing.T) {
	for _, source := range []string{
		`<manifest package=""/>`,
		`<manifest package="example..invalid"/>`,
		`<manifest package="example.a'quoted"/>`,
		`<manifest package="example.one" package="example.two"/>`,
		`<manifest package="example.library"><application></manifest>`,
		`<manifest/><manifest/>`,
		`<application/>`,
		`<manifest xmlns="urn:other"/>`,
		`outside<manifest/>`,
	} {
		if _, _, err := libraryManifest([]byte(source)); !errors.Is(err, workflow.ErrInvalid) {
			t.Fatalf("invalid manifest accepted: %s (%v)", source, err)
		}
	}
}
