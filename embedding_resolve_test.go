package nativescript_test

import (
	"context"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	ns "github.com/octane-xplat/nativescript-cli"
)

type resolveDepth struct{}
type resolveOutcome struct {
	project ns.Project
	err     error
}

func embeddingProject(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for _, name := range []string{"app", "App_Resources"} {
		if err := os.Mkdir(filepath.Join(root, name), 0700); err != nil {
			t.Fatal(err)
		}
	}
	files := map[string]string{
		"package.json":            `{"name":"embedding-resolve","version":"1.0.0"}`,
		"app/app.js":              "export const value=1;\n",
		"nativescript.config.cjs": `const fs=require('node:fs'),path=require('node:path');fs.appendFileSync(path.join(__dirname,'config-evaluated'),process.env.EMBED_CLIENT_ID+'\n');module.exports={id:process.env.EMBED_CLIENT_ID,appPath:'app',appResourcesPath:'App_Resources'};`,
	}
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(root, name), []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

// Public real-helper calls: per-client backpressure, independent environment
// copies and bounded same-client helper reentry, without native tools/devices.
func TestPublicResolveIndependentClientsAndSameClientReentry(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("owned helper execution unavailable")
	}
	cwd, _ := os.Getwd()
	environment := os.Environ()
	writer, flags, prefix := log.Writer(), log.Flags(), log.Prefix()
	structured := slog.Default()
	defer func() {
		after, _ := os.Getwd()
		if after != cwd || !reflect.DeepEqual(environment, os.Environ()) || log.Writer() != writer || log.Flags() != flags || log.Prefix() != prefix || slog.Default() != structured {
			t.Error("embedding globals changed")
		}
	}()
	first, second := embeddingProject(t), embeddingProject(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	entered, release := make(chan struct{}), make(chan struct{})
	defer func() {
		select {
		case <-release:
		default:
			close(release)
		}
	}()
	var client *ns.Client
	var outer, nested []uint64
	nestedID := ""
	sink := func(ctx context.Context, event ns.Event) error {
		if event.Operation != "resolve" {
			return fmt.Errorf("unexpected operation %s", event.Operation)
		}
		depth, _ := ctx.Value(resolveDepth{}).(int)
		if depth == 1 {
			nested = append(nested, event.Sequence)
			return nil
		}
		outer = append(outer, event.Sequence)
		if event.Kind == ns.StageStarted {
			close(entered)
			select {
			case <-release:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		if event.Kind == ns.StageCompleted {
			project, err := client.Resolve(context.WithValue(ctx, resolveDepth{}, 1), ns.ResolveRequest{ProjectDir: first})
			if err != nil {
				return err
			}
			nestedID = project.ApplicationID
		}
		return nil
	}
	firstEnv := map[string]string{"EMBED_CLIENT_ID": "org.example.embedone"}
	var err error
	client, err = ns.New(ns.Options{Environment: firstEnv, Sink: sink})
	if err != nil {
		t.Fatal(err)
	}
	secondEnv := map[string]string{"EMBED_CLIENT_ID": "org.example.embedtwo"}
	other, err := ns.New(ns.Options{Environment: secondEnv})
	if err != nil {
		t.Fatal(err)
	}
	firstEnv["EMBED_CLIENT_ID"] = "org.example.mutated"
	secondEnv["EMBED_CLIENT_ID"] = "org.example.mutated"
	done := make(chan resolveOutcome, 1)
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		project, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: first})
		done <- resolveOutcome{project, err}
	}()
	defer func() {
		cancel()
		select {
		case <-finished:
		case <-time.After(5 * time.Second):
			t.Error("owned resolve worker did not retire")
		}
	}()
	select {
	case <-entered:
	case <-ctx.Done():
		t.Fatal("first caller did not enter sink")
	}
	if _, err = os.Stat(filepath.Join(first, "config-evaluated")); !os.IsNotExist(err) {
		t.Fatal("helper advanced through blocked sink")
	}
	result, err := other.Resolve(ctx, ns.ResolveRequest{ProjectDir: second})
	if err != nil {
		t.Fatal(err)
	}
	if result.ApplicationID != "org.example.embedtwo" {
		t.Fatalf("second caller environment differs: %s", result.ApplicationID)
	}
	if _, err = os.Stat(filepath.Join(first, "config-evaluated")); !os.IsNotExist(err) {
		t.Fatal("another caller released first caller backpressure")
	}
	close(release)
	var outcome resolveOutcome
	select {
	case outcome = <-done:
	case <-ctx.Done():
		t.Fatal("same-client helper reentry did not complete")
	}
	if outcome.err != nil {
		t.Fatal(outcome.err)
	}
	if outcome.project.ApplicationID != "org.example.embedone" || nestedID != outcome.project.ApplicationID {
		t.Fatal("reentrant helper observed another caller's environment")
	}
	if !reflect.DeepEqual(outer, []uint64{1, 2}) || !reflect.DeepEqual(nested, []uint64{1, 2}) {
		t.Fatalf("operation sequences leaked across reentry: outer=%v nested=%v", outer, nested)
	}
	for _, check := range []struct {
		dir, id string
		count   int
	}{{first, "org.example.embedone", 2}, {second, "org.example.embedtwo", 1}} {
		body, err := os.ReadFile(filepath.Join(check.dir, "config-evaluated"))
		if err != nil || string(body) != strings.Repeat(check.id+"\n", check.count) {
			t.Fatal("actual configuration execution did not preserve caller identity")
		}
	}
}

func TestPublicResolveReentrantSinkFailureReturnsNoProject(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("owned helper execution unavailable")
	}
	root := embeddingProject(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cause := errors.New("nested sink rejected")
	var client *ns.Client
	var outer, nested []uint64
	sink := func(ctx context.Context, event ns.Event) error {
		depth, _ := ctx.Value(resolveDepth{}).(int)
		if depth == 1 {
			nested = append(nested, event.Sequence)
			return cause
		}
		outer = append(outer, event.Sequence)
		if event.Kind == ns.StageCompleted {
			_, err := client.Resolve(context.WithValue(ctx, resolveDepth{}, 1), ns.ResolveRequest{ProjectDir: root})
			return err
		}
		return nil
	}
	var err error
	client, err = ns.New(ns.Options{Environment: map[string]string{"EMBED_CLIENT_ID": "org.example.reentryfailure"}, Sink: sink})
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
	if !errors.Is(err, ns.ErrSink) || !errors.Is(err, cause) || !reflect.DeepEqual(result, ns.Project{}) {
		t.Fatalf("sink failure returned project or lost cause: %v", err)
	}
	if !reflect.DeepEqual(outer, []uint64{1, 2}) || !reflect.DeepEqual(nested, []uint64{1}) {
		t.Fatalf("unexpected failure delivery: outer=%v nested=%v", outer, nested)
	}
	body, readErr := os.ReadFile(filepath.Join(root, "config-evaluated"))
	if readErr != nil || string(body) != "org.example.reentryfailure\n" {
		t.Fatal("outer helper did not run before completion sink rejection")
	}
}

func TestPublicResolveCancellationWhileSinkBlocksDoesNotEvaluateConfig(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("owned helper execution unavailable")
	}
	root := embeddingProject(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	entered := make(chan struct{})
	calls := 0
	client, err := ns.New(ns.Options{Environment: map[string]string{"EMBED_CLIENT_ID": "org.example.cancelled"}, Sink: func(ctx context.Context, event ns.Event) error {
		calls++
		if event.Operation != "resolve" || event.Sequence != 1 || event.Kind != ns.StageStarted {
			return errors.New("unexpected event before cancellation")
		}
		close(entered)
		<-ctx.Done()
		return ctx.Err()
	}})
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan resolveOutcome, 1)
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		project, err := client.Resolve(ctx, ns.ResolveRequest{ProjectDir: root})
		done <- resolveOutcome{project, err}
	}()
	defer func() {
		cancel()
		select {
		case <-finished:
		case <-time.After(5 * time.Second):
			t.Error("cancelled resolve worker survived")
		}
	}()
	select {
	case <-entered:
	case <-ctx.Done():
		t.Fatal("sink did not block")
	}
	cancel()
	var outcome resolveOutcome
	select {
	case outcome = <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("sink cancellation did not return")
	}
	if !errors.Is(outcome.err, context.Canceled) || !errors.Is(outcome.err, ns.ErrSink) || !reflect.DeepEqual(outcome.project, ns.Project{}) || calls != 1 {
		t.Fatalf("unexpected cancelled result: %v", outcome.err)
	}
	if _, err = os.Stat(filepath.Join(root, "config-evaluated")); !os.IsNotExist(err) {
		t.Fatal("configuration executed through cancelled sink")
	}
}
