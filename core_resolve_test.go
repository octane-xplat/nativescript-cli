package nativescript_test

import (
	"context"
	ns "github.com/octane-xplat/nativescript-cli"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstalledCoreNativeContract(t *testing.T) {
	root := os.Getenv("CORE_CONSUMER_DIR")
	if root == "" {
		t.Skip("requires independently installed core9.1.3 consumer")
	}
	root, e := filepath.Abs(root)
	if e != nil {
		t.Fatal(e)
	}
	c, e := ns.New(ns.Options{})
	if e != nil {
		t.Fatal(e)
	}
	p, e := c.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if e != nil {
		t.Fatal(e)
	}
	found := false
	modulemap := false
	androidAAR := false
	for _, v := range p.Packages {
		if v.Name == "@nativescript/core" && v.Version == "9.1.3" {
			found = true
		}
	}
	for _, v := range p.Contributions {
		if strings.Contains(v.Path, "/typings/") || strings.HasSuffix(v.Path, "native-api-usage.json") {
			t.Fatal("inventory emitted as runtime input", v)
		}
		if strings.HasSuffix(v.Path, "/src/module.modulemap") && v.Kind == "configuration" {
			modulemap = true
		}
		if strings.HasSuffix(v.Path, "/winter_tc-release.aar") {
			androidAAR = true
		}
	}
	if !found || !modulemap || !androidAAR {
		t.Fatalf("incomplete core handoff: core=%v map=%v aar=%v", found, modulemap, androidAAR)
	}
}
