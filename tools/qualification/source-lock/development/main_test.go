package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/octane-xplat/nativescript-cli/internal/bundle"
	"os"
	"path/filepath"
	"testing"

	"github.com/octane-xplat/nativescript-cli/internal/process"
)

func TestExplicitCloseKeepsUnexpectedAndCleanupFailures(t *testing.T) {
	canceled := errors.Join(context.Canceled, &process.Error{Kind: process.ErrExit})
	if err := closeError(canceled); err != nil {
		t.Fatalf("expected owned cancellation: %v", err)
	}
	unexpected := errors.New("unexpected failure")
	for _, failure := range []error{unexpected, &process.Error{Kind: process.ErrCleanup, Cause: context.Canceled}, context.DeadlineExceeded} {
		err := closeError(errors.Join(canceled, fmt.Errorf("wrapped: %w", failure)))
		if !errors.Is(err, failure) {
			t.Fatalf("discarded consequential close failure: %v", failure)
		}
	}
	exit := &process.Error{Kind: process.ErrExit}
	if closeError(exit) == nil {
		t.Fatal("non-cancelled process failure was discarded")
	}
}

func TestExpectedRestartDoesNotDiscardCleanupFailure(t *testing.T) {
	if terminalError(errors.Join(bundle.ErrRestart), bundle.ErrRestart) != nil {
		t.Fatal("isolated restart rejected")
	}
	cleanup := &process.Error{Kind: process.ErrCleanup, Cause: bundle.ErrRestart}
	if !errors.Is(terminalError(errors.Join(bundle.ErrRestart, cleanup), bundle.ErrRestart), cleanup) {
		t.Fatal("restart hid cleanup failure")
	}
}

func TestEntryInstrumentationRestoresOnlyOwnedVersions(t *testing.T) {
	root := t.TempDir()
	if err := os.Chmod(root, 0700); err != nil {
		t.Fatal(err)
	}
	workspace := filepath.Join(root, "workspace")
	app := filepath.Join(workspace, "apps", "mobile")
	if err := os.MkdirAll(app, 0700); err != nil {
		t.Fatal(err)
	}
	proof, _ := json.Marshal(map[string]any{"hostOnly": true, "cacheRoot": root})
	for file, body := range map[string][]byte{filepath.Join(workspace, "stage-proof.json"): proof, filepath.Join(app, "package.json"): []byte(`{"main":"main.ts"}`), filepath.Join(app, "main.ts"): []byte("original\n")} {
		if err := os.WriteFile(file, body, 0600); err != nil {
			t.Fatal(err)
		}
	}
	instrument, err := instrumentEntry(app)
	if err != nil {
		t.Fatal(err)
	}
	if err = instrument.restore(); err != nil {
		t.Fatal(err)
	}
	body, _ := os.ReadFile(instrument.file)
	if string(body) != "original\n" {
		t.Fatal("original source not restored")
	}
	instrument, err = instrumentEntry(app)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(instrument.file, []byte("concurrent source change"), 0600); err != nil {
		t.Fatal(err)
	}
	if instrument.restore() == nil {
		t.Fatal("concurrent change was overwritten")
	}
	body, _ = os.ReadFile(instrument.file)
	if string(body) != "concurrent source change" {
		t.Fatal("concurrent source lost")
	}
}

func TestEntryInstrumentationRejectsEscapingParent(t *testing.T) {
	root := t.TempDir()
	if err := os.Chmod(root, 0700); err != nil {
		t.Fatal(err)
	}
	workspace := filepath.Join(root, "workspace")
	app := filepath.Join(workspace, "apps", "mobile")
	outside := filepath.Join(root, "outside")
	for _, dir := range []string{app, outside} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	proof, _ := json.Marshal(map[string]any{"hostOnly": true, "cacheRoot": root})
	for file, body := range map[string][]byte{filepath.Join(workspace, "stage-proof.json"): proof, filepath.Join(app, "package.json"): []byte(`{"main":"sub/main.ts"}`), filepath.Join(outside, "main.ts"): []byte("outside source")} {
		if err := os.WriteFile(file, body, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink(outside, filepath.Join(app, "sub")); err != nil {
		t.Fatal(err)
	}
	if _, err := instrumentEntry(app); err == nil {
		t.Fatal("instrumented source outside the selected app")
	}
	body, _ := os.ReadFile(filepath.Join(outside, "main.ts"))
	if string(body) != "outside source" {
		t.Fatal("outside source changed")
	}
}
