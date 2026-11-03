package workflow

import (
	"context"
	"encoding/json"
	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
)

// InspectXcode consumes the real J1 host, whose payload extraction uses F2 and
// whose per-call Node lifetime uses F1. It never publishes native project edits.
func InspectXcode(ctx context.Context, host jsbridge.Host, file string) (string, error) {
	payload, _ := json.Marshal(struct {
		File string `json:"file"`
	}{file})
	result, err := host.Call(ctx, jsbridge.Request{Version: jsbridge.ProtocolVersion, ID: "inspect", Feature: "editor", Operation: "roundTrip", Payload: payload}, nil)
	if err != nil {
		return "", err
	}
	var value struct {
		Text string `json:"text"`
	}
	if json.Unmarshal(result.Payload, &value) != nil || value.Text == "" {
		return "", ErrHandoff
	}
	return value.Text, nil
}
