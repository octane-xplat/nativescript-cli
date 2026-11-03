package nativescript

import (
	"errors"
	androidbuild "github.com/octane-xplat/nativescript-cli/internal/android/build"
	"strings"
	"testing"
)

func TestAndroidPublicBuildErrors(t *testing.T) {
	signing := operationError("build", androidbuild.ErrSigning)
	if !errors.Is(signing, ErrSigning) || !strings.Contains(signing.Error(), "keystore") {
		t.Fatal(signing)
	}
	artifact := operationError("build", androidbuild.ErrArtifact)
	if !errors.Is(artifact, ErrBuild) || !strings.Contains(artifact.Error(), "output metadata") {
		t.Fatal(artifact)
	}
	failure := operationError("build", &androidbuild.Failure{Stage: ":app:assembleDebug", ExitCode: 23, Cause: errors.New("fixture"), Diagnostic: "secret fixture diagnostic"})
	var typed *BuildError
	if !errors.As(failure, &typed) || typed.ExitCode != 23 || strings.Contains(failure.Error(), "secret") {
		t.Fatal(failure)
	}
}
