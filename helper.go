package nativescript

import (
	"context"
	"embed"
	"encoding/json"
	"io/fs"
	"path/filepath"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
)

//go:embed assets/helper.cjs assets/NOTICES.txt
var helperFiles embed.FS

// XcodeInspectionRequest explicitly selects the app, input file and writable
// helper cache. The operation reads the file and returns serialized editor output;
// it does not publish changes to the native project.
type XcodeInspectionRequest struct {
	ProjectDir string
	File       string
	CacheDir   string
}
type XcodeInspection struct{ Text string }

// InspectXcode exercises the embedded editor/parser without installing npm tools.
// Node is checked lazily. Native-only operations never extract or launch it.
func (c *Client) InspectXcode(ctx context.Context, r XcodeInspectionRequest) (XcodeInspection, error) {
	if err := ctx.Err(); err != nil {
		return XcodeInspection{}, err
	}
	if !filepath.IsAbs(r.ProjectDir) || !filepath.IsAbs(r.File) || !filepath.IsAbs(r.CacheDir) {
		return XcodeInspection{}, &OperationError{Operation: "inspect-xcode", Kind: ErrInvalidInput}
	}
	files, _ := fs.Sub(helperFiles, "assets")
	payload, _ := json.Marshal(struct {
		File string `json:"file"`
	}{r.File})
	host := jsbridge.Host{Payload: jsbridge.Payload{Files: files}, CacheDir: r.CacheDir, ProjectDir: r.ProjectDir, Environment: c.options.Environment}
	result, err := host.Call(ctx, jsbridge.Request{Version: jsbridge.ProtocolVersion, ID: "inspect", Feature: "editor", Operation: "roundTrip", Payload: payload}, nil)
	if err != nil {
		return XcodeInspection{}, &OperationError{Operation: "inspect-xcode", Kind: ErrBuild, Cause: err}
	}
	var value struct {
		Text string `json:"text"`
	}
	if json.Unmarshal(result.Payload, &value) != nil {
		return XcodeInspection{}, &OperationError{Operation: "inspect-xcode", Kind: ErrBuild}
	}
	return XcodeInspection{Text: value.Text}, nil
}
