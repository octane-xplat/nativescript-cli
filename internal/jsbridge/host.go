package jsbridge

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/octane-xplat/nativescript-cli/internal/process"
)

var ErrFraming = errors.New("invalid helper framing")

// RemoteError preserves the structured code without printing dependency diagnostics.
type RemoteError struct{ Failure Failure }

func (e *RemoteError) Error() string { return "helper operation failed: " + e.Failure.Code }
func (e *RemoteError) Is(target error) bool {
	return target == ErrVersion && e.Failure.Code == "version"
}

// Host is immutable and supports concurrent calls. Each call owns a fresh Node
// tree; cancellation retires that tree through F1 before returning. No long-lived
// shared helper or stdin channel is required. Request files are private and removed
// after retirement. Callers must emit application events outside workspace leases.
type Host struct {
	Payload     Payload
	CacheDir    string
	ProjectDir  string
	Node        string
	Environment map[string]string
	Executor    process.Executor
}

func (h Host) Call(ctx context.Context, r Request, sink func(Frame) error) (Frame, error) {
	if err := ctx.Err(); err != nil {
		return Frame{}, err
	}
	if err := r.Validate(); err != nil {
		return Frame{}, err
	}
	if r.PayloadVersion != "" && r.PayloadVersion != PayloadVersion {
		return Frame{}, ErrVersion
	}
	r.PayloadVersion = PayloadVersion
	if !filepath.IsAbs(h.ProjectDir) {
		return Frame{}, ErrPayload
	}
	helper, err := h.Payload.Extract(ctx, h.CacheDir)
	if err != nil {
		return Frame{}, err
	}
	f, err := os.CreateTemp(h.CacheDir, "request-*.json")
	if err != nil {
		return Frame{}, err
	}
	defer os.Remove(f.Name())
	b, err := json.Marshal(r)
	if err == nil {
		_, err = f.Write(b)
	}
	err = errors.Join(err, f.Close())
	if err != nil {
		return Frame{}, err
	}
	node := h.Node
	if node == "" {
		node = "node"
	}
	executor := h.Executor
	if executor == nil {
		executor = process.Runner{}
	}
	var pending string
	var terminal Frame
	var sequence uint64
	output := func(ctx context.Context, stream process.Stream, b []byte) error {
		if stream != process.Stdout {
			return nil
		} // diagnostics are deliberately not forwarded
		pending += string(b)
		if len(pending) > 16<<20 {
			return ErrFraming
		}
		for {
			i := strings.IndexByte(pending, '\n')
			if i < 0 {
				break
			}
			line := pending[:i]
			pending = pending[i+1:]
			var frame Frame
			if json.Unmarshal([]byte(line), &frame) != nil {
				return ErrFraming
			}
			if frame.Version != ProtocolVersion || frame.PayloadVersion != PayloadVersion {
				return ErrVersion
			}
			if frame.ID != r.ID || terminal.Kind != "" {
				return ErrFraming
			}
			switch frame.Kind {
			case "event":
				if frame.Sequence != sequence+1 || frame.Error != nil {
					return ErrFraming
				}
				sequence = frame.Sequence
				if sink != nil {
					if err := sink(frame); err != nil {
						return err
					}
				}
			case "result", "error":
				if (frame.Kind == "error") != (frame.Error != nil) {
					return ErrFraming
				}
				terminal = frame
			default:
				return ErrFraming
			}
		}
		return nil
	}
	handle, err := executor.Start(ctx, process.Command{Executable: node, Args: []string{helper, f.Name()}, Dir: h.ProjectDir, Environment: h.Environment, Output: output})
	if err != nil {
		return Frame{}, err
	}
	_, err = handle.Wait()
	if err != nil {
		return Frame{}, err
	}
	if pending != "" || terminal.Kind == "" {
		return Frame{}, ErrFraming
	}
	if terminal.Error != nil {
		return terminal, &RemoteError{Failure: *terminal.Error}
	}
	return terminal, nil
}
