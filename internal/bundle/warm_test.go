package bundle

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type warmServer struct {
	origin   string
	modules  map[string]string
	requests map[string]int
	failing  map[string]bool
	delay    map[string]time.Duration
	inFlight atomic.Int32
	maxSeen  atomic.Int32
	order    []string
	mu       sync.Mutex
	srv      *httptest.Server
}

func newWarmServer(t *testing.T, modules map[string]string) *warmServer {
	t.Helper()
	w := &warmServer{modules: modules, requests: map[string]int{}, failing: map[string]bool{}, delay: map[string]time.Duration{}}
	w.srv = httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		w.mu.Lock()
		w.requests[r.URL.String()]++
		w.order = append(w.order, r.URL.String())
		w.mu.Unlock()
		n := w.inFlight.Add(1)
		for {
			m := w.maxSeen.Load()
			if n <= m || w.maxSeen.CompareAndSwap(m, n) {
				break
			}
		}
		defer w.inFlight.Add(-1)
		if w.delay[r.URL.Path] > 0 {
			select {
			case <-time.After(w.delay[r.URL.Path]):
			case <-r.Context().Done():
				return
			}
		}
		if w.failing[r.URL.Path] {
			rw.WriteHeader(http.StatusNotFound)
			return
		}
		body, ok := w.modules[r.URL.Path]
		if !ok {
			rw.WriteHeader(http.StatusNotFound)
			return
		}
		rw.Header().Set("Content-Type", "application/javascript")
		fmt.Fprint(rw, body)
	}))
	w.origin = w.srv.URL
	t.Cleanup(w.srv.Close)
	return w
}

func warmLimitsForTests() warmLimits {
	return warmLimits{Concurrency: 4, Request: 300 * time.Millisecond, Total: 5 * time.Second, MaxModules: 100}
}

func TestWarmCrawlGraph(t *testing.T) {
	w := newWarmServer(t, map[string]string{
		"/ns/entry": `import "./a.js"; import("http://example.invalid/x.js");`,
		"/ns/a.js":  `import { x } from "./c.js"; import "pkg";`,
		"/ns/c.js":  `export { y } from "./a.js"; import "./b.js";`,
		"/ns/b.js":  `import("./a.js");`,
	})
	r := warm(context.Background(), &http.Client{Transport: &http.Transport{Proxy: nil}}, w.origin, []string{w.origin + "/ns/entry"}, warmLimitsForTests())
	if !r.Complete || r.Failures != 0 || r.Modules != 4 {
		t.Fatalf("result %+v", r)
	}
	for _, u := range []string{"/ns/entry", "/ns/a.js", "/ns/b.js", "/ns/c.js"} {
		if w.requests[u] != 1 {
			t.Fatalf("%s fetched %d times", u, w.requests[u])
		}
	}
	if strings.Contains(fmt.Sprint(w.requests), "example.invalid") || w.requests["/pkg"] != 0 {
		t.Fatalf("out-of-scope requests: %v", w.requests)
	}
}

func TestWarmFollowsEntryWrapper(t *testing.T) {
	w := newWarmServer(t, map[string]string{
		"/ns/entry":          `let origin = "x"; const main = "/src/index.ts"; const __ns_graph_ver = "7";` + "\n" + `const __entryRtUrl = '/ns/entry-rt?v=' + String(__ns_graph_ver);`,
		"/ns/entry-rt":       `export default async function start() {}`,
		"/ns/m/src/index.ts": `import "/ns/m/src/app.ts";`,
		"/ns/m/src/app.ts":   `export const app = 1;`,
	})
	r := warm(context.Background(), &http.Client{Transport: &http.Transport{Proxy: nil}}, w.origin, []string{w.origin + "/ns/entry"}, warmLimitsForTests())
	if !r.Complete || r.Failures != 0 || r.Modules != 4 || w.requests["/ns/entry-rt?v=7"] != 1 || w.requests["/ns/m/src/app.ts"] != 1 {
		t.Fatalf("result %+v requests %v", r, w.requests)
	}
}

func TestWarmFailuresCounted(t *testing.T) {
	w := newWarmServer(t, map[string]string{
		"/ns/entry": `import "./missing.js"; import "./slow.js"; import "./ok.js";`,
		"/ns/ok.js": `export const ok = 1;`,
	})
	w.failing["/ns/missing.js"] = true
	w.delay["/ns/slow.js"] = 2 * time.Second // past Request (300ms)
	r := warm(context.Background(), &http.Client{Transport: &http.Transport{Proxy: nil}}, w.origin, []string{w.origin + "/ns/entry"}, warmLimitsForTests())
	if !r.Complete || r.Failures != 2 || r.Modules != 4 {
		t.Fatalf("result %+v", r)
	}
	if w.requests["/ns/ok.js"] != 1 {
		t.Fatalf("crawl did not continue past failures")
	}
}

func TestWarmTotalDeadline(t *testing.T) {
	w := newWarmServer(t, map[string]string{
		"/ns/entry": `import "./a.js";`,
		"/ns/a.js":  `import "./b.js";`,
	})
	w.delay["/ns/a.js"] = 3 * time.Second
	limits := warmLimitsForTests()
	limits.Total = 500 * time.Millisecond
	limits.Request = 3 * time.Second
	start := time.Now()
	r := warm(context.Background(), &http.Client{Transport: &http.Transport{Proxy: nil}}, w.origin, []string{w.origin + "/ns/entry"}, limits)
	if r.Complete {
		t.Fatalf("crawl reported complete past the deadline")
	}
	if el := time.Since(start); el > limits.Total+1500*time.Millisecond {
		t.Fatalf("warm outlasted its deadline by %v", el-limits.Total)
	}
}

func TestWarmContextCancel(t *testing.T) {
	w := newWarmServer(t, map[string]string{"/ns/entry": `import "./a.js";`, "/ns/a.js": `import "./b.js";`})
	w.delay["/ns/a.js"] = 3 * time.Second
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		warm(ctx, &http.Client{Transport: &http.Transport{Proxy: nil}}, w.origin, []string{w.origin + "/ns/entry"}, warmLimitsForTests())
		close(done)
	}()
	time.Sleep(200 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatalf("warm did not stop on ctx cancel")
	}
}

func TestWarmConcurrencyBound(t *testing.T) {
	mods := map[string]string{"/ns/entry": `import "./a.js"; import "./b.js";`}
	for _, n := range []string{"a", "b"} {
		body := ""
		for i := 0; i < 10; i++ {
			body += fmt.Sprintf("import \"./%s%d.js\";", n, i)
		}
		mods["/ns/"+n+".js"] = body
	}
	w := newWarmServer(t, mods)
	w.delay["/ns/entry"] = 0
	for p := range w.modules {
		if p != "/ns/entry" {
			w.delay[p] = 30 * time.Millisecond
		}
	}
	r := warm(context.Background(), &http.Client{Transport: &http.Transport{Proxy: nil}}, w.origin, []string{w.origin + "/ns/entry"}, warmLimitsForTests())
	if !r.Complete || r.Modules != 23 {
		t.Fatalf("result %+v", r)
	}
	if m := w.maxSeen.Load(); m > int32(warmLimitsForTests().Concurrency) {
		t.Fatalf("in-flight peaked at %d, limit %d", m, warmLimitsForTests().Concurrency)
	}
}

func TestWarmQueryDistinct(t *testing.T) {
	w := newWarmServer(t, map[string]string{
		"/ns/entry": `import "./m.js?v=1"; import "./m.js?v=2";`,
		"/ns/m.js":  `export const m = 1;`,
	})
	r := warm(context.Background(), &http.Client{Transport: &http.Transport{Proxy: nil}}, w.origin, []string{w.origin + "/ns/entry"}, warmLimitsForTests())
	if !r.Complete || r.Modules != 3 {
		t.Fatalf("result %+v", r)
	}
	if w.requests["/ns/m.js?v=1"] != 1 || w.requests["/ns/m.js?v=2"] != 1 {
		t.Fatalf("query variants not fetched distinctly: %v", w.requests)
	}
}

func TestWarmSeedsBundleImports(t *testing.T) {
	w := newWarmServer(t, map[string]string{
		"/ns/entry":                          `import "./late.js";`,
		"/ns/late.js":                        `export const late = 1;`,
		"/ns/core/globals":                   `export const globals = 1;`,
		"/ns/core/inspector_modules":         `import "./debugger/webinspector-dom";`,
		"/ns/core/debugger/webinspector-dom": `export const dom = 1;`,
	})
	dir := t.TempDir()
	bundle := filepath.Join(dir, "bundle.mjs")
	contents := `import "` + w.origin + `/ns/core/globals";` +
		`import "` + w.origin + `/ns/core/inspector_modules";` +
		`import "http://other.invalid/x";` +
		`import "./local.mjs";`
	if err := os.WriteFile(bundle, []byte(contents), 0o644); err != nil {
		t.Fatal(err)
	}
	d := &Development{Ready: Event{
		Manifest: Manifest{Directory: dir, Entry: bundle, Files: []string{bundle}},
		Endpoint: Endpoint{URL: w.origin},
	}}
	r := d.Warm(context.Background())
	if !r.Complete || r.Failures != 0 || r.Modules != 5 {
		t.Fatalf("result %+v", r)
	}
	for _, u := range []string{"/ns/core/globals", "/ns/core/inspector_modules", "/ns/core/debugger/webinspector-dom", "/ns/entry", "/ns/late.js"} {
		if w.requests[u] != 1 {
			t.Fatalf("%s fetched %d times", u, w.requests[u])
		}
	}
	if w.requests["/local.mjs"] != 0 || strings.Contains(fmt.Sprint(w.requests), "other.invalid") {
		t.Fatalf("local-file specifiers leaked into requests: %v", w.requests)
	}
	index := func(u string) int {
		for i, o := range w.order {
			if o == u {
				return i
			}
		}
		return -1
	}
	if index("/ns/core/globals") < 0 || index("/ns/core/globals") > index("/ns/late.js") {
		t.Fatalf("bundle seeds did not fetch before the entry's children: %v", w.order)
	}
}

func TestWarmSkipsMissingManifestFile(t *testing.T) {
	w := newWarmServer(t, map[string]string{"/ns/entry": `export const entry = 1;`})
	dir := t.TempDir()
	missing := filepath.Join(dir, "bundle.mjs")
	d := &Development{Ready: Event{
		Manifest: Manifest{Directory: dir, Entry: missing, Files: []string{missing}},
		Endpoint: Endpoint{URL: w.origin},
	}}
	r := d.Warm(context.Background())
	if !r.Complete || r.Failures != 0 || r.Modules != 1 || w.requests["/ns/entry"] != 1 {
		t.Fatalf("result %+v requests %v", r, w.requests)
	}
}

func TestWarmEntry(t *testing.T) {
	d := &Development{Ready: Event{Endpoint: Endpoint{URL: "http://127.0.0.1:1"}}}
	_ = d // keeps the public shape exercised by the crawl tests above
}
