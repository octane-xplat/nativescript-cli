package main

import (
	"context"
	"encoding/json"
	ns "github.com/octane-xplat/nativescript-cli"
	"os"
	"time"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()
	c, e := ns.New(ns.Options{})
	if e != nil {
		panic(e)
	}
	r, e := c.Build(ctx, ns.BuildRequest{ProjectDir: os.Args[1], OutputDir: os.Args[2], Target: ns.Target{Platform: ns.Android, Configuration: ns.Debug, Destination: ns.Destination{Kind: ns.Simulator, ID: "generic", Architecture: "arm64-v8a"}}})
	if e != nil {
		panic(e)
	}
	json.NewEncoder(os.Stdout).Encode(r)
}
