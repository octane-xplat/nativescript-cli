package jsbridge

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestEnvelope(t *testing.T) {
	r := Request{Version: ProtocolVersion, ID: "fixture-request-1", Feature: "resolve", Operation: "project", Payload: json.RawMessage(`{"projectDir":"/fixture apps/My App"}`)}
	b, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	var decoded Request
	if err = json.Unmarshal(b, &decoded); err != nil {
		t.Fatal(err)
	}
	if err = decoded.Validate(); err != nil {
		t.Fatal(err)
	}
	decoded.Version++
	if !errors.Is(decoded.Validate(), ErrVersion) {
		t.Fatal("version mismatch accepted")
	}
	decoded = r
	decoded.ID = ""
	if decoded.Validate() == nil {
		t.Fatal("missing correlation accepted")
	}
	frame := Frame{Version: ProtocolVersion, ID: r.ID, Kind: "error", Error: &Failure{Code: "unavailable", Message: "fixture handler unavailable"}}
	b, err = json.Marshal(frame)
	if err != nil {
		t.Fatal(err)
	}
	var got Frame
	if err = json.Unmarshal(b, &got); err != nil || got.Error.Code != "unavailable" || got.ID != r.ID {
		t.Fatal(string(b), err)
	}
}
