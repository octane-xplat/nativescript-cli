package bundle

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// WarmResult reports a dev-server module-graph warm-up. Warm never fails the
// session: fetch errors accumulate in Failures and Complete records whether the
// crawl finished its frontier inside the limits.
type WarmResult struct {
	Modules, Failures int
	Complete          bool
	Elapsed           time.Duration
}

type warmLimits struct {
	Concurrency int
	Request     time.Duration
	Total       time.Duration
	MaxModules  int
}

// The same specifier scan the dev qualification crawler uses: static import and
// export-from clauses plus dynamic import() calls.
var warmImport = regexp.MustCompile(`\b(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)`)

const warmMaxBody = 64 << 20

// Warm fetches the session's native entry and every same-origin module it
// statically or dynamically imports, once, with bounded concurrency. It keeps
// the launch honest on cold servers: the app's synchronous loader retries land
// on warm transform caches instead of stacking timeouts. It runs on loopback
// with no proxy, and never returns an error.
func (d *Development) Warm(ctx context.Context) WarmResult {
	client := &http.Client{Transport: &http.Transport{Proxy: nil}}
	defer client.CloseIdleConnections()
	return warm(ctx, client, d.Ready.Endpoint.URL, d.Ready.Endpoint.URL+"/ns/entry",
		warmLimits{Concurrency: 8, Request: 2 * time.Minute, Total: 10 * time.Minute, MaxModules: 5000})
}

func warm(ctx context.Context, client *http.Client, origin, entry string, limits warmLimits) WarmResult {
	start := time.Now()
	result := WarmResult{Elapsed: -1}
	base, err := url.Parse(origin)
	if err != nil || base.Scheme == "" || base.Host == "" {
		result.Elapsed = time.Since(start)
		return result
	}
	ctx, cancel := context.WithDeadline(ctx, start.Add(limits.Total))
	defer cancel()
	type fetchResult struct {
		url  string
		body []byte
		ok   bool
	}
	seen := map[string]bool{entry: true}
	queue := []string{entry}
	results := make(chan fetchResult, limits.Concurrency)
	inFlight := 0
	for {
		for inFlight < limits.Concurrency && len(queue) > 0 && result.Modules < limits.MaxModules {
			u := queue[0]
			queue = queue[1:]
			inFlight++
			go func(u string) {
				results <- warmFetch(ctx, client, u, limits.Request)
			}(u)
		}
		if inFlight == 0 {
			result.Complete = len(queue) == 0 && result.Modules < limits.MaxModules
			break
		}
		select {
		case r := <-results:
			inFlight--
			result.Modules++
			if !r.ok {
				result.Failures++
				continue
			}
			for _, spec := range warmImport.FindAllSubmatch(r.body, -1) {
				s := ""
				if spec[1] != nil {
					s = string(spec[1])
				} else {
					s = string(spec[2])
				}
				if !strings.HasPrefix(s, "/") && !strings.HasPrefix(s, "./") && !strings.HasPrefix(s, "../") && !strings.HasPrefix(s, "http") {
					continue
				}
				target, err := url.Parse(s)
				if err != nil {
					continue
				}
				from, err := url.Parse(r.url)
				if err != nil {
					continue
				}
				target = from.ResolveReference(target)
				if target.Scheme != base.Scheme || target.Host != base.Host {
					continue
				}
				u := target.String()
				if !seen[u] {
					seen[u] = true
					queue = append(queue, u)
				}
			}
		case <-ctx.Done():
			result.Elapsed = time.Since(start)
			return result
		}
	}
	result.Elapsed = time.Since(start)
	return result
}

func warmFetch(ctx context.Context, client *http.Client, u string, request time.Duration) (r struct {
	url  string
	body []byte
	ok   bool
}) {
	r.url = u
	rctx, cancel := context.WithTimeout(ctx, request)
	defer cancel()
	req, err := http.NewRequestWithContext(rctx, http.MethodGet, u, nil)
	if err != nil {
		return r
	}
	req.Header.Set("Accept", "application/javascript, text/javascript, */*;q=0.1")
	req.Header.Set("Accept-Encoding", "identity")
	req.Header.Set("Cache-Control", "no-cache")
	resp, err := client.Do(req)
	if err != nil {
		return r
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return r
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, warmMaxBody+1))
	if err != nil || len(body) > warmMaxBody {
		return r
	}
	r.body = body
	r.ok = true
	return r
}
