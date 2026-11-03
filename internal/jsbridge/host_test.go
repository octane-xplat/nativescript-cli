package jsbridge

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"
)

func host(t *testing.T) Host {
	t.Helper()
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("F1/F2 unavailable")
	}
	if _, e := exec.LookPath("node"); e != nil {
		t.Skip("Node unavailable")
	}
	return Host{Payload: Payload{Files: os.DirFS("../../assets")}, CacheDir: t.TempDir(), ProjectDir: t.TempDir()}
}
func req(feature, op, payload string) Request {
	return Request{Version: ProtocolVersion, ID: "test", Feature: feature, Operation: op, Payload: json.RawMessage(payload)}
}
func TestRealHelperAndErrors(t *testing.T) {
	h := host(t)
	var events int
	f, e := h.Call(context.Background(), req("host", "info", `{}`), func(f Frame) error { events++; return nil })
	if e != nil || !strings.Contains(string(f.Payload), PayloadVersion) || events != 1 {
		t.Fatal(f, e, events)
	}
	_, e = h.Call(context.Background(), req("missing", "operation", `{}`), nil)
	var remote *RemoteError
	if !errors.As(e, &remote) || remote.Failure.Code != "unavailable" {
		t.Fatal(e)
	}
	r := req("host", "info", `{}`)
	r.PayloadVersion = "bad"
	if _, e = h.Call(context.Background(), r, nil); !errors.Is(e, ErrVersion) {
		t.Fatal(e)
	}
	// Resolve from the explicit app, even though the payload lives elsewhere.
	dir := filepath.Join(h.ProjectDir, "node_modules", "selected-dependency")
	os.MkdirAll(dir, 0700)
	os.WriteFile(filepath.Join(dir, "index.js"), []byte("module.exports = 42"), 0600)
	b, _ := json.Marshal(map[string]string{"projectDir": h.ProjectDir, "name": "selected-dependency"})
	f, e = h.Call(context.Background(), req("host", "resolveDependency", string(b)), nil)
	if e != nil || !strings.Contains(string(f.Payload), "selected-dependency") {
		t.Fatal(f, e)
	}
	sentinel := errors.New("sink stopped")
	_, e = h.Call(context.Background(), req("host", "info", `{}`), func(Frame) error { return sentinel })
	if !errors.Is(e, sentinel) {
		t.Fatal(e)
	}
}
func TestExtractionAtomicAndCorruption(t *testing.T) {
	h := host(t)
	var wg sync.WaitGroup
	paths := make(chan string, 8)
	for range 8 {
		wg.Go(func() {
			p, e := h.Payload.Extract(context.Background(), h.CacheDir)
			if e != nil {
				t.Error(e)
			}
			paths <- p
		})
	}
	wg.Wait()
	close(paths)
	var first string
	for p := range paths {
		if first == "" {
			first = p
		}
		if first != p {
			t.Fatal("different generations")
		}
	}
	// Interrupted extraction has no children; the next caller can quarantine it.
	layoutRoot := filepath.Dir(filepath.Dir(filepath.Dir(first)))
	interrupted := filepath.Join(layoutRoot, ".staging", "stage-interrupted")
	if e := os.MkdirAll(interrupted, 0700); e != nil {
		t.Fatal(e)
	}
	if p, e := h.Payload.Extract(context.Background(), h.CacheDir); e != nil || p != first {
		t.Fatal(p, e)
	}
	if _, e := os.Stat(interrupted); !os.IsNotExist(e) {
		t.Fatal("interrupted stage retained in live namespace")
	}
	os.WriteFile(first, []byte("corrupt"), 0600)
	if _, e := h.Payload.Extract(context.Background(), h.CacheDir); !errors.Is(e, ErrPayload) {
		t.Fatal(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	cache := filepath.Join(t.TempDir(), "absent")
	if _, e := h.Payload.Extract(ctx, cache); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	if _, e := os.Stat(cache); !os.IsNotExist(e) {
		t.Fatal("not lazy")
	}
}
func TestNodeVersionRejectedBeforeDispatch(t *testing.T) {
	h := host(t)
	p, e := h.Payload.Extract(context.Background(), h.CacheDir)
	if e != nil {
		t.Fatal(e)
	}
	file := filepath.Join(t.TempDir(), "request")
	os.WriteFile(file, []byte(`{"version":99,"payloadVersion":"bad","id":"test","feature":"editor","operation":"roundTrip","payload":{"file":"missing"}}`), 0600)
	out, e := exec.Command("node", p, file).Output()
	if e != nil || !strings.Contains(string(out), `"code":"version"`) || strings.Contains(string(out), `"kind":"event"`) {
		t.Fatal(string(out), e)
	}
}
func TestFramingAndDescendantCancellation(t *testing.T) {
	for _, body := range []string{`console.log('garbage')`, `console.log(JSON.stringify({version:1,payloadVersion:'0.1.0',id:'wrong',kind:'result'}))`, `console.log(JSON.stringify({version:1,payloadVersion:'0.1.0',id:'test',kind:'event',sequence:2}))`, ``, `console.log(JSON.stringify({version:1,payloadVersion:'0.1.0',id:'test',kind:'result'}));console.log('{}')`} {
		h := host(t)
		h.Payload.Files = fstest.MapFS{"helper.cjs": {Data: []byte(body)}, "NOTICES.txt": {Data: []byte("fixture")}}
		if _, e := h.Call(context.Background(), req("host", "info", `{}`), nil); e == nil {
			t.Fatal("accepted malformed framing", body)
		}
	}
	h := host(t)
	marker := filepath.Join(h.ProjectDir, "child-alive")
	b, _ := json.Marshal(marker)
	childCode := `require('node:fs').appendFileSync(` + string(b) + `,'x');console.log(JSON.stringify({version:1,payloadVersion:'0.1.0',id:'test',kind:'event',sequence:1}));setInterval(()=>require('node:fs').appendFileSync(` + string(b) + `,'x'),20)`
	childJSON, _ := json.Marshal(childCode)
	body := `const {spawn}=require('node:child_process');spawn(process.execPath,['-e',` + string(childJSON) + `],{stdio:'inherit'});setInterval(()=>{},1000);`
	h.Payload.Files = fstest.MapFS{"helper.cjs": {Data: []byte(body)}, "NOTICES.txt": {Data: []byte("fixture")}}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, e := h.Call(ctx, req("host", "info", `{}`), func(Frame) error { cancel(); return nil })
	if !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	before, e := os.ReadFile(marker)
	if e != nil {
		t.Fatal(e)
	}
	time.Sleep(150 * time.Millisecond)
	after, _ := os.ReadFile(marker)
	if string(before) != string(after) {
		t.Fatal("descendant still writing")
	}
}
