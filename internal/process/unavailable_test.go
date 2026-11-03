//go:build !darwin && !linux

package process

import (
	"context"
	"errors"
	"os"
	"testing"
)

func TestOwnedTreeUnavailable(t *testing.T) {
	dir, e := os.Getwd()
	if e != nil {
		t.Fatal(e)
	}
	if h, e := (Runner{}).Start(context.Background(), Command{Executable: "must-not-launch", Dir: dir}); h != nil || !errors.Is(e, ErrUnavailable) {
		t.Fatal(h, e)
	}
}
