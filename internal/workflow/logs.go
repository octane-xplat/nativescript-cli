package workflow

import (
	"context"
	"github.com/octane-xplat/nativescript-cli/internal/process"
	"sync"
)

type Log struct {
	Stream string
	Text   string
}

// LogBuffer retains at most the latest 1 MiB. Observe attaches serialized
// delivery, including already captured startup output. Observers must return
// promptly and must not append, replace the observer, or close their session.
type LogBuffer struct {
	dispatch sync.Mutex
	mu       sync.Mutex
	entries  []Log
	size     int
	observer func(Log)
}

func (b *LogBuffer) Append(_ context.Context, s process.Stream, data []byte) error {
	b.dispatch.Lock()
	defer b.dispatch.Unlock()
	b.mu.Lock()
	if len(data) > 1<<20 {
		data = data[len(data)-(1<<20):]
	}
	entry := Log{Stream: string(s), Text: string(data)}
	b.entries = append(b.entries, entry)
	b.size += len(data)
	for b.size > 1<<20 {
		b.size -= len(b.entries[0].Text)
		b.entries = b.entries[1:]
	}
	observer := b.observer
	b.mu.Unlock()
	if observer != nil {
		observer(entry)
	}
	return nil
}
func (b *LogBuffer) Logs() []Log {
	if b == nil {
		return nil
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]Log(nil), b.entries...)
}

// Observe replays retained logs before delivering new appends. Clearing waits
// for any in-flight callback, so teardown cannot return with one still running.
func (b *LogBuffer) Observe(observer func(Log)) {
	if b == nil {
		return
	}
	b.dispatch.Lock()
	defer b.dispatch.Unlock()
	b.mu.Lock()
	b.observer = observer
	entries := append([]Log(nil), b.entries...)
	b.mu.Unlock()
	if observer != nil {
		for _, entry := range entries {
			observer(entry)
		}
	}
}
