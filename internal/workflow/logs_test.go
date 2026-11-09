package workflow

import (
	"context"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"testing"
)

// The observer sees each append in capture order and the bounded snapshot is unaffected.
func TestLogBufferObserverOrder(t *testing.T) {
	var b LogBuffer
	var seen []Log
	b.Observe(func(l Log) { seen = append(seen, l) })
	for i, text := range []string{"one", "two", "three"} {
		if err := b.Append(context.Background(), process.Stdout, []byte(text)); err != nil {
			t.Fatal(i, err)
		}
	}
	if len(seen) != 3 || seen[0].Text != "one" || seen[1].Text != "two" || seen[2].Text != "three" {
		t.Fatal("observer order", seen)
	}
	if got := b.Logs(); len(got) != 3 || got[2].Text != "three" {
		t.Fatal("snapshot diverged", got)
	}
	// Clearing the observer stops callbacks; buffered entries stay.
	b.Observe(nil)
	if err := b.Append(context.Background(), process.Stderr, []byte("four")); err != nil {
		t.Fatal(err)
	}
	if len(seen) != 3 || len(b.Logs()) != 4 {
		t.Fatal("observer survived teardown")
	}
}

func TestLogObserverReplaysStartupBeforeLiveOutput(t *testing.T) {
	var b LogBuffer
	b.Append(context.Background(), process.Stdout, []byte("startup"))
	var seen []string
	b.Observe(func(l Log) {
		// Snapshot reads must remain safe inside an observer.
		_ = b.Logs()
		seen = append(seen, l.Text)
	})
	b.Append(context.Background(), process.Stdout, []byte("live"))
	b.Observe(nil)
	if len(seen) != 2 || seen[0] != "startup" || seen[1] != "live" {
		t.Fatal(seen)
	}
}
