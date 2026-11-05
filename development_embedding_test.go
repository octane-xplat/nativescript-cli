package nativescript

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/bundle"
	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	resolver "github.com/octane-xplat/nativescript-cli/internal/resolve"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

type embeddingNativeFixture struct {
	developmentNativeFixture
	marker, applicationID string
}

func (f *embeddingNativeFixture) Compile(ctx context.Context, p project.Prepared, b project.Bundle, l workspace.Lease) ([]project.Artifact, error) {
	data, err := os.ReadFile(filepath.Join(b.Directory, "embedding-owner.json"))
	var proof struct{ Owner string }
	if err != nil || json.Unmarshal(data, &proof) != nil || proof.Owner != f.marker {
		return nil, errors.New("caller-specific environment proof missing from real bundle output")
	}
	artifacts, err := f.developmentNativeFixture.Compile(ctx, p, b, l)
	for i := range artifacts {
		artifacts[i].ApplicationID = f.applicationID
	}
	return artifacts, err
}

// Public clients, resolution, helper, Vite/config and ownership are real.
// Native preparation/compiler/device/app lifetimes remain explicit fixtures.
func TestTwoEmbeddedDevelopmentCallers(t *testing.T) {
	installed := os.Getenv("NS_NATIVE_VITE_DIR")
	if installed == "" {
		t.Skip("requires installed native Vite engine; native adapters remain fixtures")
	}
	installed, _ = filepath.Abs(installed)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	firstContext, cancelFirst := context.WithCancel(ctx)
	defer cancelFirst()
	contexts := []context.Context{firstContext, ctx}
	cwd, _ := os.Getwd()
	environment, writer, flags, prefix := os.Environ(), log.Writer(), log.Flags(), log.Prefix()
	defer func() {
		after, _ := os.Getwd()
		if after != cwd || !reflect.DeepEqual(environment, os.Environ()) || log.Writer() != writer || log.Flags() != flags || log.Prefix() != prefix {
			t.Error("embedding process cwd/environment/logger changed")
		}
	}()
	dirs := []string{t.TempDir(), t.TempDir()}
	clients := make([]*Client, 2)
	natives := make([]*embeddingNativeFixture, 2)
	sessions := make([]*Session, 2)
	write := func(file, value string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte(value), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for i, dir := range dirs {
		marker := fmt.Sprintf("EMBEDDED_CALLER_%d_20261105", i)
		applicationID := fmt.Sprintf("org.example.embedding%d", i)
		write(filepath.Join(dir, "package.json"), `{"name":"embedding-fixture","version":"1.0.0","main":"app/app.ts","dependencies":{"@nativescript/core":"9.1.3"}}`)
		write(filepath.Join(dir, "app/app.ts"), `globalThis.__embeddingOwner=__EMBEDDING_OWNER__;`)
		write(filepath.Join(dir, "nativescript.config.cjs"), fmt.Sprintf(`module.exports={id:%q,bundlerConfigPath:'vite.config.mts'}`, applicationID))
		write(filepath.Join(dir, "vite.config.mts"), `import {typescriptConfig} from '@nativescript/vite/typescript';
export default ({mode})=>{const config=typescriptConfig({mode},{typeCheck:false}),owner=process.env.EMBEDDING_OWNER;return {...config,
resolve:{...config.resolve,preserveSymlinks:false},define:{...config.define,__EMBEDDING_OWNER__:JSON.stringify(owner)},
plugins:[...config.plugins,{name:'embedding-proof',configureServer(server){server.middlewares.use('/embedding-owner',(_req,res)=>res.end(process.env.EMBEDDING_OWNER));},
generateBundle(){this.emitFile({type:'asset',fileName:'embedding-owner.json',source:JSON.stringify({owner})});}}]};};`)
		write(filepath.Join(dir, "App_Resources/iOS/Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict><key>EmbeddingProbe</key><string>before</string></dict></plist>`)
		if err := os.Symlink(filepath.Join(installed, "node_modules"), filepath.Join(dir, "node_modules")); err != nil {
			t.Fatal(err)
		}
		overrides := map[string]string{"EMBEDDING_OWNER": marker}
		client, err := New(Options{Environment: overrides})
		overrides["EMBEDDING_OWNER"] = "MUTATED_AFTER_CONSTRUCTION"
		if err != nil {
			t.Fatal(err)
		}
		native := &embeddingNativeFixture{marker: marker, applicationID: applicationID}
		host := jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS("assets")}, CacheDir: t.TempDir()}
		client.engine = workflow.Engine{Factory: func(env map[string]string) workflow.Stages {
			h := host
			h.Environment = env
			return workflow.Stages{Resolver: resolver.Resolver{Host: h}, Bundler: bundle.Adapter{Host: h}, Preparer: native, Compiler: native, Devices: native, Launcher: native}
		}}
		clients[i], natives[i] = client, native
	}
	var wg sync.WaitGroup
	errorsByCaller := make([]error, 2)
	for i := range clients {
		wg.Go(func() {
			sessions[i], errorsByCaller[i] = clients[i].Run(contexts[i], RunRequest{Development: &DevelopmentOptions{}, DeviceID: "fixture", Build: BuildRequest{ProjectDir: dirs[i], OutputDir: filepath.Join(dirs[i], ".generated"), Target: Target{Platform: IOS, Configuration: Debug, Destination: Destination{Kind: Simulator, ID: "fixture", Architecture: "arm64"}}}})
		})
	}
	wg.Wait()
	for _, session := range sessions {
		if session != nil {
			defer session.Close(context.Background())
		}
	}
	for i := range sessions {
		if errorsByCaller[i] != nil {
			var operation *OperationError
			if errors.As(errorsByCaller[i], &operation) {
				t.Logf("caller%d fixture cause: %T %v", i, operation.Cause, operation.Cause)
			}
			t.Fatalf("caller%d startup: %v", i, errorsByCaller[i])
		}
	}
	first, second := sessions[0].DevelopmentEndpoint(), sessions[1].DevelopmentEndpoint()
	if first.URL == "" || second.URL == "" || first.URL == second.URL {
		t.Fatal("independent endpoints missing", first, second)
	}
	checkOwner := func(endpoint, expected string) {
		t.Helper()
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"/embedding-owner", nil)
		if err != nil {
			t.Fatal(err)
		}
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(io.LimitReader(response.Body, 256))
		response.Body.Close()
		if err != nil || response.StatusCode != 200 || string(body) != expected {
			t.Fatal("server environment crossed callers", response.StatusCode, string(body), err)
		}
	}
	checkOwner(first.URL, natives[0].marker)
	checkOwner(second.URL, natives[1].marker)
	cancelFirst()
	for range 2 {
		if err := sessions[0].Close(context.Background()); !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	}
	if natives[0].active.Load() != 0 || natives[0].retired.Load() != 1 || natives[1].active.Load() != 1 {
		t.Fatal("closing caller0 crossed caller ownership")
	}
	checkOwner(second.URL, natives[1].marker)
	write(filepath.Join(dirs[1], "App_Resources/iOS/Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict><key>EmbeddingProbe</key><string>after</string></dict></plist>`)
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	for natives[1].launched.Load() < 2 || sessions[1].DevelopmentEndpoint().URL == "" {
		select {
		case <-ctx.Done():
			t.Fatal("surviving caller did not rebuild", ctx.Err())
		case <-ticker.C:
		}
	}
	if natives[1].compiled.Load() != 2 || natives[1].retired.Load() != 1 || natives[0].compiled.Load() != 1 {
		t.Fatal("rebuild crossed callers or lost retirement")
	}
	last := sessions[1].DevelopmentEndpoint()
	if last.URL == second.URL {
		t.Fatal("native-input rebuild reused old endpoint")
	}
	checkOwner(last.URL, natives[1].marker)
	for range 2 {
		if err := sessions[1].Close(context.Background()); !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	}
	if natives[1].active.Load() != 0 || natives[1].retired.Load() != 2 {
		t.Fatal("surviving caller leaked native fixture lifetime")
	}
	for _, endpoint := range []string{first.URL, second.URL, last.URL} {
		u, err := url.Parse(endpoint)
		if err != nil {
			t.Fatal(err)
		}
		connection, err := net.DialTimeout("tcp", u.Host, time.Second)
		if err == nil {
			connection.Close()
			t.Fatal("owned server survived close", endpoint)
		}
	}
}
