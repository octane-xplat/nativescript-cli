// Package jsbridge defines the private built-in helper protocol, never extensions.
package jsbridge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

const ProtocolVersion = 1

var ErrVersion = errors.New("helper protocol mismatch")

// One request ID scopes all responses/events/cancel frames. Feature owns dispatch
// (resolve/xcode/vite); Operation belongs to that feature. Payload is feature-owned.
type Request struct {
	PayloadVersion string          `json:"payloadVersion"`
	Version        int             `json:"version"`
	ID             string          `json:"id"`
	Feature        string          `json:"feature"`
	Operation      string          `json:"operation"`
	Payload        json.RawMessage `json:"payload,omitempty"`
}
type Failure struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	// Detail is helper-authored, bounded diagnostic text. It is never raw logs,
	// environment values or stack traces; producers bound it before framing.
	Detail string `json:"detail,omitempty"`
}

// Kind is event/result/error/cancel. Events have strictly increasing Sequence;
// exactly one terminal result/error follows events. Logs never use protocol stdout.
// Cancellation must retire the owned request and descendants before completion.
type Frame struct {
	PayloadVersion string          `json:"payloadVersion"`
	Version        int             `json:"version"`
	ID             string          `json:"id"`
	Kind           string          `json:"kind"`
	Sequence       uint64          `json:"sequence,omitempty"`
	Payload        json.RawMessage `json:"payload,omitempty"`
	Error          *Failure        `json:"error,omitempty"`
}

func (r Request) Validate() error {
	if r.Version != ProtocolVersion {
		return ErrVersion
	}
	if r.ID == "" || r.Feature == "" || r.Operation == "" {
		return fmt.Errorf("invalid helper request")
	}
	return nil
}

// Call applies synchronous ordered sink delivery; first sink failure cancels work.
// Helper implementation must reject version mismatch before dispatch or writes.
type Helper interface {
	Call(context.Context, Request, func(Frame) error) (Frame, error)
}
