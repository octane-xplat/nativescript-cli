package main

import (
	"context"
	"fmt"
	"github.com/octane-xplat/nativescript-cli/extension"
	"github.com/octane-xplat/nativescript-cli/extension/transport"
	"os"
)

type impl struct{}

func (impl) Manifest(context.Context) (extension.Manifest, error) {
	fmt.Println("go initialization log")
	return extension.Manifest{ID: "fixture", Version: "1.0.0", API: "1", Phases: []extension.Phase{extension.Collect, extension.PostBuild}, Required: []string{"generated_files", "build_artifacts"}}, nil
}
func (impl) Invoke(ctx context.Context, in extension.Input) (extension.Result, error) {
	if in.Phase == extension.PostBuild {
		if len(in.Artifacts) != 1 {
			return extension.Result{}, fmt.Errorf("missing artifact context")
		}
		a := in.Artifacts[0]
		data, err := os.ReadFile(a.Path)
		if err != nil {
			return extension.Result{}, err
		}
		return extension.Result{Files: []extension.File{{Path: "artifact.txt", Content: a.Path + "\n" + a.Kind + "\n" + a.ApplicationID + "\n" + string(data)}}}, nil
	}
	if in.Revision == "fail" {
		return extension.Result{}, fmt.Errorf("async failure")
	}
	if in.Revision == "cancel" {
		<-ctx.Done()
		return extension.Result{}, ctx.Err()
	}
	return extension.Result{Files: []extension.File{{Path: "hello.txt", Content: in.Platform}}}, nil
}
func main() { transport.Serve(impl{}) }
