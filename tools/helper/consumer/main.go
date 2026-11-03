package main

import (
	"context"
	"errors"
	"fmt"
	ns "github.com/octane-xplat/nativescript-cli"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	root, err := os.MkdirTemp("", "external helper app ")
	must(err)
	defer os.RemoveAll(root)
	fixture, err := os.ReadFile(os.Args[1])
	must(err)
	file := filepath.Join(root, "project.pbxproj")
	must(os.WriteFile(file, fixture, 0600))
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
	if !errors.Is(err, ns.ErrBuild) {
		panic("expected structured failure")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = c.InspectXcode(ctx, r)
	if !errors.Is(err, context.Canceled) {
		panic("expected cancellation")
	}
	fmt.Println("PASS: external Go consumer ran extracted embedded editor/parser twice; structured failure and cancellation; no npm CLI or source checkout")
}
func must(err error) {
	if err != nil {
		panic(err)
	}
}
