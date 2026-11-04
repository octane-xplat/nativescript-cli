// Clean-module qualification of public preparation with all extension execution forms.
// Native runtime inputs are fixtures; no native compilation or device assertion.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
	"github.com/octane-xplat/nativescript-cli/extension"
	"github.com/octane-xplat/nativescript-cli/extension/transport"
)

type implementation struct{ mode string }

func (p implementation) Manifest(context.Context) (extension.Manifest, error) {
	api := extension.APIVersion
	if p.mode == "api" {
		api = "unsupported"
	}
	return extension.Manifest{ID: "fixture", Version: "1.0.0", API: api, After: []string{"z-anchor"}, Phases: []extension.Phase{extension.Collect, extension.Prepared}, Required: []string{"generated_files"}}, nil
}
func (p implementation) Invoke(ctx context.Context, in extension.Input) (extension.Result, error) {
	if p.mode == "fail" {
		return extension.Result{}, errors.New("qualification failure")
	}
	if p.mode == "cancel" {
		<-ctx.Done()
		return extension.Result{}, ctx.Err()
	}
	if len(in.Pins) == 0 || in.Project == "" || in.Revision == "" {
		return extension.Result{}, errors.New("missing producer input")
	}
	return extension.Result{Files: []extension.File{{Path: string(in.Phase) + ".txt", Content: in.Platform + ":" + in.Configuration}}}, nil
}

type anchor struct{}

func (anchor) Manifest(context.Context) (extension.Manifest, error) {
	return extension.Manifest{ID: "z-anchor", Version: "1", API: "1", Phases: []extension.Phase{extension.Collect, extension.Prepared}}, nil
}
func (anchor) Invoke(context.Context, extension.Input) (extension.Result, error) {
	return extension.Result{}, nil
}

type observed struct {
	extension.Extension
	order *[]string
	id    string
}

func (p observed) Invoke(ctx context.Context, in extension.Input) (extension.Result, error) {
	*p.order = append(*p.order, p.id+":"+string(in.Phase))
	return p.Extension.Invoke(ctx, in)
}
func check(err error) {
	if err != nil {
		panic(fmt.Sprintf("%+v cause=%+v", err, errors.Unwrap(err)))
	}
}
func require(ok bool, message string) {
	if !ok {
		panic(message)
	}
}
func write(root, name, content string) {
	p := filepath.Join(root, name)
	check(os.MkdirAll(filepath.Dir(p), 0700))
	check(os.WriteFile(p, []byte(content), 0600))
}

const js = `module.exports = {
 manifest:{id:'fixture',version:'1.0.0',api:process.env.QUAL_MODE==='api'?'unsupported':'1',after:['z-anchor'],phases:['collect','prepared'],required:['generated_files']},
 async invoke(input,{signal}) {
  if(process.env.QUAL_MODE==='fail')throw new Error('qualification failure');
  if(process.env.QUAL_MODE==='cancel')await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});});
  if(!input.pins.length||!input.project||!input.revision)throw new Error('missing producer input');
  return {files:[{path:input.phase+'.txt',content:input.platform+':'+input.configuration}]};
 }
};`

func main() {
	if len(os.Args) > 2 && os.Args[1] == "--plugin" {
		transport.Serve(implementation{os.Args[2]})
		return
	}
	require(len(os.Args) == 2, "usage: extension-consumer IOS_RUNTIME_FIXTURE")
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	work, err := os.MkdirTemp("", "extension consumer ")
	check(err)
	defer os.RemoveAll(work)
	cwd, err := os.Getwd()
	check(err)
	env := os.Environ()
	self, err := os.Executable()
	check(err)
	node, err := exec.LookPath("node")
	check(err)
	for _, language := range []string{"direct", "go", "node"} {
		for _, mode := range []string{"ok", "api", "fail", "cancel"} {
			dir := filepath.Join(work, language, mode)
			check(os.MkdirAll(dir, 0700))
			write(dir, "package.json", `{"name":"app","version":"1.0.0","dependencies":{"native-plugin":"1.0.0"},"devDependencies":{"@nativescript/ios":"8.9.0"}}`)
			write(dir, "node_modules/native-plugin/package.json", `{"name":"native-plugin","version":"1.0.0","nativescript":{"platforms":{"ios":"8"}}}`)
			write(dir, "node_modules/native-plugin/platforms/ios/Binding.swift", "class Binding {}")
			write(dir, "nativescript.config.cjs", `module.exports={id:'org.example.extensions',appPath:'app',appResourcesPath:'App_Resources'}`)
			check(os.MkdirAll(filepath.Join(dir, "app"), 0700))
			check(os.MkdirAll(filepath.Join(dir, "App_Resources"), 0700))
			runtime := filepath.Join(dir, "node_modules/@nativescript/ios")
			check(os.CopyFS(runtime, os.DirFS(os.Args[1])))
			write(runtime, "package.json", `{"name":"@nativescript/ios","version":"8.9.0"}`)
			impl := extension.Extension(implementation{mode})
			close := func() {}
			if language == "go" {
				impl, close, err = transport.Open(ctx, self, []string{"--plugin", mode}, dir, env, io.Discard)
				check(err)
			}
			if language == "node" {
				write(dir, "plugin.cjs", js)
				impl, close, err = transport.OpenNode(ctx, node, filepath.Join(dir, "plugin.cjs"), filepath.Join(work, "cache"), dir, append(append([]string{}, env...), "QUAL_MODE="+mode), io.Discard)
				check(err)
			}
			func() {
				defer close()
				var order []string
				client, e := ns.New(ns.Options{Extensions: []extension.Extension{observed{impl, &order, "fixture"}, observed{anchor{}, &order, "z-anchor"}}})
				check(e)
				q := ns.PrepareRequest{ProjectDir: dir, OutputDir: filepath.Join(dir, "output"), Target: ns.Target{Platform: ns.IOS, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: "fixture", Architecture: "arm64"}}}
				callCtx := ctx
				stop := func() {}
				if mode == "cancel" {
					callCtx, stop = context.WithTimeout(ctx, 2*time.Second)
				}
				defer stop()
				p, e := client.Prepare(callCtx, q)
				if mode != "ok" {
					require(e != nil, "invalid extension succeeded")
					if mode == "api" {
						require(len(order) == 0, "API rejection invoked handlers")
					} else {
						require(reflect.DeepEqual(order, []string{"z-anchor:collect", "fixture:collect"}), "failure did not reach extension collect")
					}
					if mode == "cancel" {
						require(errors.Is(e, context.DeadlineExceeded), fmt.Sprintf("cancellation identity: %v", e))
					}
					_, stat := os.Stat(q.OutputDir)
					require(os.IsNotExist(stat), "failed collect/manifest mutated output")
					return
				}
				check(e)
				want := []string{"z-anchor:collect", "fixture:collect", "z-anchor:prepared", "fixture:prepared"}
				require(reflect.DeepEqual(order, want), fmt.Sprintf("ordering: %v", order))
				for _, phase := range []string{"collect", "prepared"} {
					b, e := os.ReadFile(filepath.Join(p.NativeDir, ".nativescript-extensions/fixture", phase+".txt"))
					check(e)
					require(string(b) == "ios:debug", "lost typed input/output")
				}
				_, e = client.Prepare(ctx, q)
				check(e)
				plain, e := ns.New(ns.Options{})
				check(e)
				_, e = plain.Prepare(ctx, q)
				check(e)
				_, e = os.Stat(filepath.Join(p.NativeDir, ".nativescript-extensions/fixture/collect.txt"))
				require(os.IsNotExist(e), "removed extension retained output")
				// Authored modules remain caller-owned when generated extension files are removed.
				_, e = os.Stat(filepath.Join(dir, "plugin.cjs"))
				if language == "node" {
					check(e)
				}
			}()
			close() // Explicitly qualify repeated close of externally owned processes.
		}
	}
	now, e := os.Getwd()
	check(e)
	require(now == cwd && reflect.DeepEqual(env, os.Environ()), "consumer globals changed")
	fmt.Println("PASS: isolated module direct Go/executable Go/embedded Node extension public Prepare, dependency ordering, typed pins, ownership/removal, repeat, API rejection, failure, cancellation, repeated close; native templates are fixtures")
}
