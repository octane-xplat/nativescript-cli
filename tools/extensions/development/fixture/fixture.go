// Package fixture supplies the same controlled hooks to direct and executable
// Go development qualification. Node implements the contract independently.
package fixture

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/octane-xplat/nativescript-cli/extension"
)

type Control struct {
	Version int             `json:"version"`
	Fail    extension.Phase `json:"fail"`
	Block   extension.Phase `json:"block"`
}
type Record struct {
	ProcessID      int             `json:"processId"`
	Version        int             `json:"version"`
	Input          extension.Input `json:"input"`
	ArtifactSHA256 string          `json:"artifactSHA256"`
}
type Extension struct{ Control, Trace string }

func (Extension) Manifest(context.Context) (extension.Manifest, error) {
	return extension.Manifest{ID: "dev-qualification", Version: "1.0.0", API: extension.APIVersion, Phases: []extension.Phase{extension.Collect, extension.Prepared, extension.PostBuild}, Required: []string{"native_files", "generated_files", "build_artifacts"}}, nil
}
func (e Extension) Invoke(ctx context.Context, input extension.Input) (extension.Result, error) {
	data, err := os.ReadFile(e.Control)
	if err != nil {
		return extension.Result{}, err
	}
	var control Control
	if err = json.Unmarshal(data, &control); err != nil {
		return extension.Result{}, err
	}
	record := Record{ProcessID: os.Getpid(), Version: control.Version, Input: input}
	if input.Phase == extension.PostBuild {
		if len(input.Artifacts) != 1 {
			return extension.Result{}, errors.New("expected one completed artifact")
		}
		data, err = os.ReadFile(input.Artifacts[0].Path)
		if err != nil {
			return extension.Result{}, err
		}
		sum := sha256.Sum256(data)
		record.ArtifactSHA256 = hex.EncodeToString(sum[:])
	} else if len(input.Artifacts) != 0 {
		return extension.Result{}, errors.New("artifact exposed before compilation")
	}
	data, err = json.Marshal(record)
	if err != nil {
		return extension.Result{}, err
	}
	trace, err := os.OpenFile(e.Trace, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return extension.Result{}, err
	}
	_, err = trace.Write(append(data, '\n'))
	err = errors.Join(err, trace.Close())
	if err != nil {
		return extension.Result{}, err
	}
	if control.Block == input.Phase {
		<-ctx.Done()
		return extension.Result{}, ctx.Err()
	}
	if control.Fail == input.Phase {
		return extension.Result{}, fmt.Errorf("development hook rejected %s", input.Phase)
	}
	result := extension.Result{Files: []extension.File{{Path: string(input.Phase) + ".json", Content: string(data)}}}
	if input.Phase == extension.Collect {
		result.NativeFiles = []extension.NativeFile{{Platform: input.Platform, Kind: "source", Path: "Development.swift", Content: []byte(fmt.Sprintf("class DevelopmentNative { static let value = %d }", control.Version))}}
	}
	return result, nil
}
