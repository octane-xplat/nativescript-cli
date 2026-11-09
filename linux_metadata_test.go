package nativescript_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	ns "github.com/octane-xplat/nativescript-cli"
)

func TestLinuxRuntimeDeclarationDoesNotBlockMobilePreparation(t *testing.T) {
	root, client, request := prepareApp(t, false)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1","devDependencies":{"@nativescript/ios":"8.9.0"},"dependencies":{"canvas-like":"1"}}`)
	manifest := func(requirement string) {
		resolutionFile(t, root, "node_modules/canvas-like/package.json", `{"name":"canvas-like","version":"1","nativescript":{"platforms":{"ios":"7.0.0","android":"7.0.0","windows":"9.1.0","linux":"`+requirement+`"}}}`)
	}
	manifest("0.1.0-alpha.5")
	resolutionFile(t, root, "node_modules/canvas-like/platforms/ios/Bridge.swift", "class Bridge {}")
	resolutionFile(t, root, "node_modules/canvas-like/platforms/linux/payload.so", "foreign payload, never an iOS contribution")
	p, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, pkg := range p.Packages {
		if pkg.Name == "canvas-like" && pkg.LinuxRequirement == "0.1.0-alpha.5" {
			found = true
		}
	}
	if !found {
		t.Fatal("inactive Linux requirement was lost")
	}
	for _, contribution := range p.Contributions {
		if strings.Contains(contribution.Path, "/platforms/linux/") {
			t.Fatal("foreign native payload became a mobile contribution")
		}
	}
	manifest("99.0.0")
	changed, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
	if err != nil || changed.Revision == p.Revision {
		t.Fatal("Linux declaration mutation did not change source identity", err)
	}
	if _, err := client.Prepare(context.Background(), request); err != nil {
		t.Fatal("inactive Linux floor blocked iOS preparation", err)
	}
	for _, tc := range []struct {
		platforms string
		kind      error
	}{{`{"linux":true}`, ns.ErrInvalidInput}, {`{"freebsd":"1"}`, ns.ErrUnavailable}} {
		resolutionFile(t, root, "node_modules/canvas-like/package.json", `{"name":"canvas-like","version":"1","nativescript":{"platforms":`+tc.platforms+`}}`)
		_, err := client.Resolve(context.Background(), ns.ResolveRequest{ProjectDir: root})
		if !errors.Is(err, tc.kind) {
			t.Fatal("invalid or unknown platform declaration accepted", err)
		}
	}
}
