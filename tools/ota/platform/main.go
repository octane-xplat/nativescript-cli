// Command platform qualifies an independently installed canonical app through public Prepare.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	ns "github.com/octane-xplat/nativescript-cli"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	if len(os.Args) != 3 && len(os.Args) != 4 {
		panic("usage: platform ABSOLUTE_APP ios|android [build]")
	}
	root, platform := os.Args[1], ns.Platform(os.Args[2])
	arch := "arm64"
	boot := "internal/main.m"
	pins := "NativeScriptApp.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
	if platform == ns.Android {
		arch = "arm64-v8a"
		boot = "app/src/main/java/com/tns/NativeScriptApplication.java"
		pins = "app/gradle.lockfile"
	}
	c, err := ns.New(ns.Options{OTAStartup: true})
	if err != nil {
		panic(err)
	}
	q := ns.PrepareRequest{ProjectDir: root, OutputDir: filepath.Join(root, ".xplat-ns"), Target: ns.Target{Platform: platform, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: "generic", Architecture: arch}}}
	if len(os.Args) == 4 {
		result, e := c.Build(context.Background(), ns.BuildRequest{ProjectDir: root, OutputDir: q.OutputDir, Target: q.Target, IOS: ns.IOSBuildOptions{SigningMode: "disabled"}})
		if e != nil {
			panic(e)
		}
		if len(result.Artifacts) != 1 {
			panic("expected one artifact")
		}
		fmt.Printf("PASS native Build %s artifact=%s\n", platform, result.Artifacts[0].Path)
		return
	}
	p, err := c.Prepare(context.Background(), q)
	if err != nil {
		panic(err)
	}
	must := func(name string) []byte {
		b, e := os.ReadFile(filepath.Join(p.NativeDir, name))
		if e != nil {
			panic(e)
		}
		return b
	}
	var stamp struct {
		Hash    string
		Release bool
	}
	b, e := os.ReadFile(filepath.Join(p.BundleDir, "xplat-native.json"))
	if e != nil {
		panic(e)
	}
	if e = json.Unmarshal(b, &stamp); e != nil {
		panic(e)
	}
	if len(stamp.Hash) != 64 || stamp.Release || !strings.Contains(string(must(boot)), stamp.Hash) {
		panic("invalid startup/stamp")
	}
	var record struct {
		Hash    string
		Sources []json.RawMessage
	}
	if e = json.Unmarshal(must(".xplat/fingerprints/"+string(platform)+".json"), &record); e != nil {
		panic(e)
	}
	if record.Hash != stamp.Hash || len(record.Sources) == 0 {
		panic("invalid fingerprint record")
	}
	if len(must(pins)) == 0 {
		panic("missing dependency pins")
	}
	fmt.Printf("PASS public Prepare %s native=%s fingerprint=%s sources=%d pins=%s startup=%s\n", platform, p.NativeDir, stamp.Hash, len(record.Sources), pins, boot)
}
