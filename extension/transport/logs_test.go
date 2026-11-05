package transport

import (
	"bytes"
	"sync"
	"testing"
	"time"
)

type blockedLog struct {
	entered, release chan struct{}
	bytes.Buffer
}

func (w *blockedLog) Write(data []byte) (int, error) {
	close(w.entered)
	<-w.release
	return w.Buffer.Write(data)
}

func TestLogOutputRetiresCallerWriter(t *testing.T) {
	w := &blockedLog{entered: make(chan struct{}), release: make(chan struct{})}
	output := &logOutput{writer: w}
	written := make(chan struct{})
	go func() { _, _ = output.Write([]byte("accepted")); close(written) }()
	<-w.entered
	closed := make(chan struct{})
	go func() { output.close(); close(closed) }()
	select {
	case <-closed:
		t.Fatal("close returned while caller writer was running")
	case <-time.After(20 * time.Millisecond):
	}
	close(w.release)
	<-written
	<-closed
	// Late delivery may overlap caller inspection after retirement. It must not
	// reach the old buffer, even when stdout/stderr deliveries run concurrently.
	var deliveries sync.WaitGroup
	for range 8 {
		deliveries.Go(func() {
			for range 100 {
				if n, err := output.Write([]byte("late")); err != nil || n != 4 {
					t.Errorf("late transport write: %d %v", n, err)
				}
			}
		})
	}
	if w.String() != "accepted" {
		t.Fatal("caller writer changed after close")
	}
	deliveries.Wait()
	output.close()
}
