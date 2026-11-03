package nativescript

import (
	"context"
	"embed"

	"io/fs"
	"path/filepath"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
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
		return XcodeInspection{}, operationError("inspect-xcode", err)
	}
	if !filepath.IsAbs(r.ProjectDir) || !filepath.IsAbs(r.File) || !filepath.IsAbs(r.CacheDir) {
		return XcodeInspection{}, operationError("inspect-xcode", workflow.ErrInvalid)
	}
	files, _ := fs.Sub(helperFiles, "assets")
	host := jsbridge.Host{Payload: jsbridge.Payload{Files: files}, CacheDir: r.CacheDir, ProjectDir: r.ProjectDir, Environment: c.options.Environment}
	n := c.notify("inspect-xcode")
	if err := n(ctx, true, "helper"); err != nil {
		return XcodeInspection{}, operationError("inspect-xcode", err)
	}
	text, err := workflow.InspectXcode(ctx, host, r.File)
	if err != nil {
		return XcodeInspection{}, operationError("inspect-xcode", err)
	}
	if err = n(ctx, false, "helper"); err != nil {
		return XcodeInspection{}, operationError("inspect-xcode", err)
	}
	return XcodeInspection{Text: text}, nil
}
