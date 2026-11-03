package extension

import "context"

const APIVersion = "1"

type Phase string

const (
	Collect   Phase = "collect"
	Prepared  Phase = "prepared"
	PostBuild Phase = "post_build"
)

type Manifest struct {
	ID        string   `json:"id"`
	Version   string   `json:"version"`
	API       string   `json:"api"`
	Phases    []Phase  `json:"phases"`
	After     []string `json:"after"`
	Platforms []string `json:"platforms"`
	Required  []string `json:"required"`
}
type Pin struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}
type Input struct {
	Phase         Phase  `json:"phase"`
	Project       string `json:"project"`
	Platform      string `json:"platform"`
	Configuration string `json:"configuration"`
	Revision      string `json:"revision"`
	Pins          []Pin  `json:"pins"`
}

// Files are declarative writes below a host-owned extension directory, never arbitrary paths.
type File struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}
type Result struct {
	Files       []File   `json:"files"`
	Diagnostics []string `json:"diagnostics"`
}

// Implementations must observe context cancellation and must not mutate project files.
// A caller may invoke independent operations concurrently.
type Extension interface {
	Manifest(context.Context) (Manifest, error)
	Invoke(context.Context, Input) (Result, error)
}
