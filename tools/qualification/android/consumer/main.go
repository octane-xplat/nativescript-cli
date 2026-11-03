package main

import (
	"context"
	"encoding/json"
	"fmt"
	ns "github.com/octane-xplat/nativescript-cli"
	"os"
	"reflect"
	"time"
)

func main() {
	cwd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	env := os.Environ()
	defer func() {
		now, err := os.Getwd()
		if err != nil || cwd != now || !reflect.DeepEqual(env, os.Environ()) {
			panic("global cwd/environment changed")
		}
	}()

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
	if len(r.Artifacts) != 1 || r.Artifacts[0].Kind != "apk" || r.Artifacts[0].Identity.Revision == "" {
		panic("invalid artifact identity")
	}
	if err := json.NewEncoder(os.Stdout).Encode(r); err != nil {
		panic(fmt.Errorf("encode build result: %w", err))
	}
}
