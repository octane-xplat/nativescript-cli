package main

import (
	"context"
	"errors"
	"fmt"
	ns "github.com/octane-xplat/nativescript-cli"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func main() {
	root, err := os.MkdirTemp("", "external helper app ")
	must(err)
	defer os.RemoveAll(root)
	fixture, err := os.ReadFile(os.Args[1])
	must(err)
	file := filepath.Join(root, "project.pbxproj")
	must(os.WriteFile(file, fixture, 0600))
	if ns.Version != os.Args[3] {
		panic("Go module/package version mismatch")
	}
	c, err := ns.New(ns.Options{})
	must(err)
	r := ns.XcodeInspectionRequest{ProjectDir: root, File: file, CacheDir: filepath.Join(root, "cache")}
	result, err := c.InspectXcode(context.Background(), r)
	must(err)
	if !strings.Contains(result.Text, "PBXProject") || !strings.Contains(result.Text, "AAAAAAAAAAAAAAAAAAAAAAAA") {
		panic("missing parsed project")
	}
	must(os.WriteFile(file, []byte(result.Text), 0600))
	_, err = c.InspectXcode(context.Background(), r)
	must(err)
	must(os.WriteFile(file, []byte("not a project"), 0600))
	_, err = c.InspectXcode(context.Background(), r)
	var operationError *ns.OperationError
	if !errors.As(err, &operationError) || operationError.Operation != "inspect-xcode" || !errors.Is(err, ns.ErrBuild) {
		panic("expected structured failure")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = c.InspectXcode(ctx, r)
	if !errors.Is(err, context.Canceled) {
		panic("expected cancellation")
	}
	// Instrument a real helper with a task-owned descendant; the parser itself blocks
	// on a FIFO. The helper payload and public operation remain unmodified.
	marker := filepath.Join(root, "heartbeat")
	preload := filepath.Join(root, "preload.cjs")
	must(os.WriteFile(preload, []byte(`const {spawn}=require('node:child_process');
if ((process.argv[1]||'').endsWith('helper.cjs')) {
 const child=spawn(process.execPath,['-e', 'const fs=require("node:fs"); fs.writeFileSync(process.env.Q1_MARKER+".pid",String(process.pid)); setInterval(()=>fs.appendFileSync(process.env.Q1_MARKER,"x"),10)'],{stdio:'ignore',env:{Q1_MARKER:process.env.Q1_MARKER}});
 require('node:fs').writeFileSync(process.env.Q1_MARKER+'.helper',String(process.pid));
}`), 0600))
	unrelated := exec.Command("node", "-e", "setInterval(()=>{},1000)")
	must(unrelated.Start())
	defer func() { _ = unrelated.Process.Kill(); _ = unrelated.Wait() }()
	owned, err := ns.New(ns.Options{Environment: map[string]string{"NODE_OPTIONS": "--require=" + strconv.Quote(preload), "Q1_MARKER": marker}})
	must(err)
	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() {
		_, err := owned.InspectXcode(ctx, ns.XcodeInspectionRequest{ProjectDir: root, File: os.Args[2], CacheDir: r.CacheDir})
		done <- err
	}()
	deadline := time.Now().Add(5 * time.Second)
	for {
		if b, _ := os.ReadFile(marker); len(b) > 0 {
			break
		}
		if time.Now().After(deadline) {
			panic("descendant did not start")
		}
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			panic(err)
		}
	case <-time.After(5 * time.Second):
		panic("cleanup timed out")
	}
	before, err := os.ReadFile(marker)
	must(err)
	time.Sleep(200 * time.Millisecond)
	after, err := os.ReadFile(marker)
	must(err)
	if string(before) != string(after) {
		panic("owned descendant still writing")
	}
	for _, suffix := range []string{".helper", ".pid"} {
		b, err := os.ReadFile(marker + suffix)
		must(err)
		pid, err := strconv.Atoi(string(b))
		must(err)
		process, err := os.FindProcess(pid)
		must(err)
		if process.Signal(syscall.Signal(0)) == nil {
			panic("owned process still exists")
		}
	}
	must(unrelated.Process.Signal(syscall.Signal(0)))
	fmt.Println("PASS: G1 real extracted helper results, typed errors and owned descendant cancellation; unrelated process survived")
	fmt.Println("PASS: external Go consumer ran extracted embedded editor/parser twice; structured failure and cancellation; no npm CLI or source checkout")
}
func must(err error) {
	if err != nil {
		panic(err)
	}
}
