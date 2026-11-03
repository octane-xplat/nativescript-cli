// An ordinary external-package consumer: no CLI, transport or internal imports.
package main

import (
	"context"
	"errors"
	"fmt"
	ns "github.com/octane-xplat/nativescript-cli"
)

func main() {
	ctx := context.Background()
	client, err := ns.New(ns.Options{Sink: func(_ context.Context, e ns.Event) error { _ = e.Sequence; return nil }})
	if err != nil {
		panic(err)
	}
	target := ns.Target{Platform: ns.IOS, Destination: ns.Destination{Kind: ns.Simulator, ID: "fixture-sim-001", Architecture: "arm64"}, Configuration: ns.Debug}
	_, err = client.Build(ctx, ns.BuildRequest{ProjectDir: "/fixture apps/My App", OutputDir: "/fixture outputs", Target: target})
	var operation *ns.OperationError
	if !errors.Is(err, ns.ErrUnavailable) || !errors.As(err, &operation) {
		panic(fmt.Sprint(err))
	}
	_, _ = client.Resolve(ctx, ns.ResolveRequest{ProjectDir: "/fixture apps/My App"})
	_, _ = client.Prepare(ctx, ns.PrepareRequest{ProjectDir: "/fixture apps/My App", OutputDir: "/fixture outputs", Target: target})
	_, _ = client.Devices(ctx, ns.DeviceQuery{Platform: ns.IOS})
	session, err := client.Run(ctx, ns.RunRequest{DeviceID: target.Destination.ID, Build: ns.BuildRequest{Target: target}})
	if !errors.Is(err, ns.ErrUnavailable) || session != nil {
		panic("unavailable run returned success")
	}
	var completed ns.Session
	_ = completed.Close(ctx)
	_ = completed.Wait()
	_ = ns.BuildResult{Artifacts: []ns.Artifact{{Identity: ns.Identity{Schema: 1, Revision: "fixture", Target: target}, Path: "/fixture outputs/App.app", Kind: "app"}}}
	_ = ns.Device{ID: target.Destination.ID, Platform: ns.IOS, Kind: ns.Simulator}
	_ = ns.Project{}
	_ = ns.PreparedProject{}
}
