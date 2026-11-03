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

// LogBuffer retains at most the latest 1 MiB without calling application code.
type LogBuffer struct {
	mu      sync.Mutex
	entries []Log
	size    int
}

func (b *LogBuffer) Append(_ context.Context, s process.Stream, data []byte) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(data) > 1<<20 {
		data = data[len(data)-(1<<20):]
	}
	b.entries = append(b.entries, Log{Stream: string(s), Text: string(data)})
	b.size += len(data)
	for b.size > 1<<20 {
		b.size -= len(b.entries[0].Text)
		b.entries = b.entries[1:]
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
