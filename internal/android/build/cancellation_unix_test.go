//go:build darwin || linux

package build

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

func TestRealWrapperCancellationRetiresBeforeLeaseRelease(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix wrapper fixture")
	}
	p, b, l := fixture(t)
	pidFile := filepath.Join(l.Layout().GeneratedRoot, workspace.MirrorName("android-build", p.Identity.Target), "native", "child.pid")
	script := "#!/bin/sh\nsleep 60 &\necho $! > child.pid\nwait\n"
	if e := os.WriteFile(filepath.Join(p.NativeDir, "gradlew"), []byte(script), 0700); e != nil {
		t.Fatal(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan error, 1)
	go func() { _, e := (Adapter{}).Compile(ctx, p, b, l); result <- e }()
	deadline := time.Now().Add(5 * time.Second)
	var raw []byte
	for time.Now().Before(deadline) {
		raw, _ = os.ReadFile(pidFile)
		if len(raw) > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if len(raw) == 0 {
		t.Fatal("wrapper did not launch child")
	}
	cancel()
	select {
	case e := <-result:
		if !errors.Is(e, context.Canceled) {
			t.Fatal(e)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("cancellation did not retire")
	}
	pid, _ := strconv.Atoi(strings.TrimSpace(string(raw)))
	if e := syscall.Kill(pid, 0); !errors.Is(e, syscall.ESRCH) {
		t.Fatalf("child still exists: %v", e)
	}
	if e := l.Release(); e != nil {
		t.Fatal(e)
	}
}
