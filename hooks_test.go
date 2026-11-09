//go:build darwin || linux

package nativescript_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
)

func TestRegisteredProjectHooksPrepareSourceAndNativeOutputs(t *testing.T) {
	root, _, q := prepareApp(t, false)
	client, _ := ns.New(ns.Options{Environment: map[string]string{"HOOK_TEST_INPUT": "caller-value"}})
	order := filepath.Join(root, "hook-order.txt")
	for _, name := range []string{"before-prepare", "before-prepareNativeApp", "after-prepareNativeApp", "after-prepare"} {
		body := fmt.Sprintf(`const fs=require('node:fs'),path=require('node:path'); fs.appendFileSync(%q,%q);`, order, name+"\n")
		if name == "before-prepare" {
			body += `fs.mkdirSync(path.join(hookArgs.projectDir,'App_Resources/iOS'),{recursive:true});fs.writeFileSync(path.join(hookArgs.projectDir,'App_Resources/iOS/build.xcconfig'),'HOOK_GENERATED = YES\n');`
		}
		if name == "after-prepare" {
			body += `if(process.env.HOOK_TEST_INPUT!=='caller-value')throw Error('environment missing');if(fs.realpathSync(path.join($projectData.platformsDir,'ios'))!==hookArgs.nativeDir)throw Error('wrong platform alias');fs.writeFileSync(path.join(hookArgs.nativeDir,'hook-output.txt'),'registered');`
		}
		resolutionFile(t, root, "hooks/"+name+"/first.cjs", "module.exports=function(hookArgs,$projectData){"+body+"}")
	}
	p, err := client.Prepare(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	view, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || len(view.Hooks) != 4 {
		t.Fatal("active hook metadata missing", view.Hooks, err)
	}
	for _, h := range view.Hooks {
		if !filepath.IsAbs(h.Script) || len(h.Digest) != 64 {
			t.Fatal(h)
		}
	}
	got, err := os.ReadFile(order)
	if err != nil || string(got) != "before-prepare\nbefore-prepareNativeApp\nafter-prepareNativeApp\nafter-prepare\n" {
		t.Fatal(string(got), err)
	}
	config, err := os.ReadFile(filepath.Join(p.NativeDir, "plugins-debug.xcconfig"))
	if err != nil || !strings.Contains(string(config), "HOOK_GENERATED = YES") {
		t.Fatal("before-hook source was not resolved and copied", string(config), err)
	}
	if b, err := os.ReadFile(filepath.Join(p.NativeDir, "hook-output.txt")); err != nil || string(b) != "registered" {
		t.Fatal(string(b), err)
	}
}

func TestPluginHookDeclarationsRemainRegistrationMetadata(t *testing.T) {
	root := resolutionApp(t)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","dependencies":{"plugin":"1"}}`)
	resolutionFile(t, root, "node_modules/plugin/package.json", `{"name":"plugin","version":"1","nativescript":{"hooks":[{"name":"plugin","type":"before-prepare","script":"hooks/before-prepare.cjs","inject":true}]}}`)
	resolutionFile(t, root, "node_modules/plugin/hooks/before-prepare.cjs", `throw Error('plugin declarations must not execute during Resolve')`)
	c, _ := ns.New(ns.Options{})
	first, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil {
		t.Fatal(err)
	}
	resolutionFile(t, root, "node_modules/plugin/hooks/before-prepare.cjs", `throw Error('changed registration source')`)
	second, err := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Hooks) != 0 || len(second.Hooks) != 0 {
		t.Fatal("plugin declarations became active hooks")
	}
	if first.Revision == second.Revision {
		t.Fatal("plugin hook source was not fingerprinted")
	}
}

func TestHookFailureIsNamedPrivateAndReleasesWriter(t *testing.T) {
	root, c, q := prepareApp(t, false)
	good, err := c.Prepare(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		script, hint string
		kind         error
	}{
		{`module.exports=function($injector){require('node:fs').writeFileSync('must-not-run','bad')}`, "unsupported injection $injector", ns.ErrUnavailable},
		{`module.exports=function(hookArgs){throw Object.assign(new Error('SECRET_HOOK_VALUE'),{detail:'SECRET_HOOK_VALUE',code:'unavailable'})}`, "Hook before-prepare (bad.cjs) failed", ns.ErrBuild},
	} {
		resolutionFile(t, root, "hooks/before-prepare/bad.cjs", tc.script)
		_, err := c.Prepare(context.Background(), q)
		if !errors.Is(err, tc.kind) || !strings.Contains(err.Error(), tc.hint) || strings.Contains(err.Error(), "SECRET_HOOK_VALUE") {
			t.Fatal(err)
		}
		if _, err := os.Stat(filepath.Join(good.NativeDir, "NativeScriptApp.xcodeproj")); err != nil {
			t.Fatal("failed hook destroyed prior generation", err)
		}
		if _, err := os.Stat(filepath.Join(root, "must-not-run")); !errors.Is(err, os.ErrNotExist) {
			t.Fatal("unsupported injection executed body", err)
		}
	}
	os.RemoveAll(filepath.Join(root, "hooks"))
	if _, err := c.Prepare(context.Background(), q); err != nil {
		t.Fatal("hook failure retained writer", err)
	}
}

func TestHookCancellationRetiresItsNodeDescendant(t *testing.T) {
	root, c, q := prepareApp(t, false)
	pidFile := filepath.Join(root, "hook-child.pid")
	resolutionFile(t, root, "hooks/before-prepare/wait.cjs", fmt.Sprintf(`module.exports=async function(){const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('node:fs').writeFileSync(%q,String(child.pid));await new Promise(()=>{});}`, pidFile))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { _, err := c.Prepare(ctx, q); done <- err }()
	limit := time.Now().Add(10 * time.Second)
	var data []byte
	for time.Now().Before(limit) {
		data, _ = os.ReadFile(pidFile)
		if len(data) > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if len(data) == 0 {
		t.Fatal("hook child never started")
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) || errors.Is(err, ns.ErrCleanup) {
			t.Fatal(err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("hook cancellation did not finish")
	}
	pid, err := strconv.Atoi(string(data))
	if err != nil {
		t.Fatal(err)
	}
	if err := syscall.Kill(pid, 0); !errors.Is(err, syscall.ESRCH) {
		t.Fatal("hook descendant survived", err)
	}
	os.RemoveAll(filepath.Join(root, "hooks"))
	if _, err := c.Prepare(context.Background(), q); err != nil {
		t.Fatal("cancellation retained writer", err)
	}
}
