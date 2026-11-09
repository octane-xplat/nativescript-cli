package bundle

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	resolver "github.com/octane-xplat/nativescript-cli/internal/resolve"
	"github.com/octane-xplat/nativescript-cli/internal/workflow"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

// Real installed engine/config loader/plugins; no native compiler or device.
func TestInstalledNativeProjectConfiguration(t *testing.T) {
	cwd, _ := os.Getwd()
	environment := os.Environ()
	defer func() {
		after, _ := os.Getwd()
		if after != cwd || !reflect.DeepEqual(environment, os.Environ()) {
			t.Error("changed embedding globals")
		}
	}()
	installed := os.Getenv("NS_NATIVE_VITE_DIR")
	if installed == "" {
		t.Skip("requires installed @nativescript/vite8.0.20 or 8.0.21/Vite8/core9.1.3")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	for _, name := range []string{"app", "App_Resources"} {
		if err := os.MkdirAll(filepath.Join(dir, name), 0700); err != nil {
			t.Fatal(err)
		}
	}
	write(t, filepath.Join(dir, "package.json"), `{"name":"native-config-fixture","version":"1.0.0","type":"module","main":"app/app.ts","dependencies":{"@nativescript/core":"9.1.3","@nativescript/ios":"9.1.0"}}`)
	write(t, filepath.Join(dir, "nativescript.config.cjs"), `module.exports={id:'org.example.nativeconfig',cli:{packageManager:'bun'},bundler:'vite',bundlerConfigPath:'vite.config.mts'}`)
	write(t, filepath.Join(dir, "app/app.ts"), `console.log('PROJECT_CONFIG_VALUE', __PROJECT_CONFIG_VALUE__);`)
	write(t, filepath.Join(dir, "config-value.mts"), `export const value='config-before';`)
	const config = `import {typescriptConfig} from '@nativescript/vite/typescript';
import {value} from './config-value.mts';
export default async ({mode,command})=>{
 const config=typescriptConfig({mode},{typeCheck:false});
 let resolved;
 return {...config,root:process.cwd()+'/unowned-root',cacheDir:process.cwd()+'/unowned-cache',
 define:{...config.define,__PROJECT_CONFIG_VALUE__:JSON.stringify(value)},
 server:{...config.server,host:'0.0.0.0',port:1,strictPort:false,open:true},
 build:{...config.build,outDir:process.cwd()+'/unowned-output',watch:{}},
 plugins:[...config.plugins,{name:'project-config-proof',configResolved(c){resolved={host:c.server.host,strictPort:c.server.strictPort,mode:c.mode};},configureServer(server){
 server.middlewares.use('/project-config',(_req,res)=>res.end(JSON.stringify({mode,command,value})));
 },generateBundle(){
 this.emitFile({type:'asset',fileName:'project-config.json',source:JSON.stringify({mode,command,value,resolved,bundlerEnv:JSON.parse(process.env.NATIVESCRIPT_BUNDLER_ENV),debug:process.env.DEBUG??null})});
 }}]};
};`
	write(t, filepath.Join(dir, "vite.config.mts"), config)
	if err := os.MkdirAll(filepath.Join(dir, "node_modules/@nativescript"), 0700); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Join(installed, "node_modules"))
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		src := filepath.Join(installed, "node_modules", name)
		if name == "@nativescript" {
			sub, err := os.ReadDir(src)
			if err != nil {
				t.Fatal(err)
			}
			for _, s := range sub {
				if err := os.Symlink(filepath.Join(src, s.Name()), filepath.Join(dir, "node_modules/@nativescript", s.Name())); err != nil {
					t.Fatal(err)
				}
			}
			continue
		}
		if err := os.Symlink(src, filepath.Join(dir, "node_modules", name)); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Join(dir, "node_modules/@nativescript/ios"), 0700); err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(dir, "node_modules/@nativescript/ios/package.json"), `{"name":"@nativescript/ios","version":"9.1.0"}`)
	a := Adapter{Host: jsbridge.Host{Payload: jsbridge.Payload{Files: os.DirFS(filepath.Join(root, "assets"))}, CacheDir: t.TempDir(), Environment: map[string]string{"DEBUG": "caller-debug"}}}
	r, err := (resolver.Resolver{Host: a.Host}).Resolve(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, configuration := range []string{"debug", "release"} {
		target := project.Target{Platform: "ios", Configuration: configuration, DestinationKind: "simulator", DestinationID: "fixture", Architecture: "arm64"}
		layout, err := workspace.NewLayout(t.TempDir(), project.Identity{Schema: 1, Revision: r.Revision, ProjectDir: r.Directory, Target: target})
		if err != nil {
			t.Fatal(err)
		}
		lease, err := workspace.Acquire(ctx, layout)
		if err != nil {
			t.Fatal(err)
		}
		p := project.Prepared{Identity: layout.Identity, NativeDir: layout.GeneratedRoot, BundleDir: filepath.Join(layout.GeneratedRoot, "app")}
		result, err := a.Bundle(ctx, r, p, lease)
		lease.Release()
		if err != nil || filepath.Base(result.Entry) != "bundle.mjs" {
			t.Fatal(configuration, result, err)
		}
		proof, err := os.ReadFile(filepath.Join(result.Directory, "project-config.json"))
		if err != nil || !strings.Contains(string(proof), `"command":"build"`) || !strings.Contains(string(proof), `"hmr":false`) {
			t.Fatal(string(proof), err)
		}
		if !strings.Contains(string(proof), `"host":"127.0.0.1"`) || !strings.Contains(string(proof), `"strictPort":true`) {
			t.Fatal("project config overrode owned server", string(proof))
		}
		if configuration == "release" && (!strings.Contains(string(proof), `"mode":"production"`) || !strings.Contains(string(proof), `"debug":null`)) {
			t.Fatal("release inherited debug mode", string(proof))
		}
		if configuration == "debug" && (!strings.Contains(string(proof), `"mode":"development"`) || !strings.Contains(string(proof), `"debug":"caller-debug"`)) {
			t.Fatal("caller environment not visible to engine config", string(proof))
		}
		var emitted strings.Builder
		for _, file := range result.Files {
			if strings.HasSuffix(file, ".mjs") {
				data, _ := os.ReadFile(file)
				emitted.Write(data)
			}
		}
		if !strings.Contains(emitted.String(), "config-before") {
			t.Fatal("project define did not reach compiled output")
		}
	}
	for _, name := range []string{"unowned-root", "unowned-cache", "unowned-output"} {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Fatal("project config wrote outside owned destinations", name, err)
		}
	}
	target := project.Target{Platform: "ios", Configuration: "debug", DestinationKind: "simulator", DestinationID: "fixture", Architecture: "arm64"}
	dev, err := a.StartDevelopment(ctx, r, target, Request{})
	if err != nil {
		t.Fatal(err)
	}
	defer dev.Session.Close(context.Background())
	response, err := http.Get(dev.Ready.Endpoint.URL + "/project-config")
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != 200 || !strings.Contains(string(body), `"command":"serve"`) {
		t.Fatalf("project serve config: %d %v %s", response.StatusCode, err, body)
	}
	proof, err := os.ReadFile(filepath.Join(dev.Ready.Manifest.Directory, "project-config.json"))
	if err != nil || !strings.Contains(string(proof), `"hmr":true`) {
		t.Fatal(string(proof), err)
	}
	response, err = http.Get(dev.Ready.Endpoint.URL + "/ns/m/app/app")
	if err != nil {
		t.Fatal(err)
	}
	body, err = io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != 200 || !strings.Contains(string(body), "config-before") {
		t.Fatalf("project define not served: %d %v %s", response.StatusCode, err, body)
	}
	write(t, filepath.Join(dir, "config-value.mts"), `export const value='config-after';`)
	done := make(chan error, 1)
	go func() { done <- dev.Session.Wait() }()
	select {
	case err := <-done:
		if !errors.Is(err, ErrRestart) {
			t.Fatal("config dependency did not request re-resolution", err)
		}
	case <-ctx.Done():
		t.Fatal("config dependency did not retire server")
	}
	if _, err := os.Stat(dev.Ready.Manifest.Directory); !os.IsNotExist(err) {
		t.Fatal("private development output survived", err)
	}
	if _, err := http.Get(dev.Ready.Endpoint.URL); err == nil {
		t.Fatal("server survived")
	}
	// Vite normally restarts its own server for env changes. The library must
	// retire instead, including creation of a previously absent mode env file.
	dev, err = a.StartDevelopment(ctx, r, target, Request{})
	if err != nil {
		t.Fatal(err)
	}
	defer dev.Session.Close(context.Background())
	write(t, filepath.Join(dir, ".env.development"), "VITE_CONFIG_TEST=after\n")
	go func() { done <- dev.Session.Wait() }()
	select {
	case err := <-done:
		if !errors.Is(err, ErrRestart) {
			t.Fatal("env creation did not request re-resolution", err)
		}
	case <-ctx.Done():
		t.Fatal("env edit did not retire server")
	}
	write(t, filepath.Join(dir, "vite.config.mts"), config+"\n// edited after resolve\n")
	if _, err := a.StartDevelopment(ctx, r, target, Request{}); !errors.Is(err, ErrRestart) {
		t.Fatal("stale config accepted", err)
	}
	write(t, filepath.Join(dir, "vite.config.mts"), `throw new Error('PRIVATE_CONFIG_ERROR'); export default {};`)
	r, err = (resolver.Resolver{Host: a.Host}).Resolve(ctx, dir)
	if err != nil {
		t.Fatal("resolver executed Vite config", err)
	}
	if _, err := a.StartDevelopment(ctx, r, target, Request{}); err == nil || errors.Is(err, workflow.ErrUnavailable) || strings.Contains(err.Error(), "PRIVATE_CONFIG_ERROR") {
		t.Fatal("invalid config failure or leaked diagnostic", err)
	}
	write(t, filepath.Join(dir, "vite.config.mts"), strings.Replace(config, "plugins:[...config.plugins,", "plugins:[...config.plugins,{name:'conflicting-output',configResolved(c){c.build.outDir=process.cwd()+'/escaped-output';}},", 1))
	r, err = (resolver.Resolver{Host: a.Host}).Resolve(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.StartDevelopment(ctx, r, target, Request{}); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatal("late output override accepted", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "escaped-output")); !os.IsNotExist(err) {
		t.Fatal("conflicting plugin wrote output", err)
	}
}
