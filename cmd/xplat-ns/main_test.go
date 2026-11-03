//go:build darwin || linux

package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func init() {
	if os.Getenv("XPLAT_NS_ENTRY_TEST") == "1" {
		main()
	}
}
func TestSignalCancellation(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("Node not installed")
	}
	for _, sig := range []syscall.Signal{syscall.SIGINT, syscall.SIGTERM} {
		t.Run(sig.String(), func(t *testing.T) {
			dir := t.TempDir()
			fifo := filepath.Join(dir, "blocked.pbxproj")
			if err := syscall.Mkfifo(fifo, 0600); err != nil {
				t.Fatal(err)
			}
			unrelated := exec.Command("node", "-e", "setTimeout(()=>{},60000)")
			if err := unrelated.Start(); err != nil {
				t.Fatal(err)
			}
			defer func() { _ = unrelated.Process.Kill(); _ = unrelated.Wait() }()
			executable, err := os.Executable()
			if err != nil {
				t.Fatal(err)
			}
			cmd := exec.Command(executable, "inspect-xcode", "--project", dir, "--file", fifo, "--cache", filepath.Join(dir, "cache"), "--json")
			cmd.Env = append(os.Environ(), "XPLAT_NS_ENTRY_TEST=1")
			var out bytes.Buffer
			cmd.Stdout = &out
			cmd.Stderr = io.Discard
			if err := cmd.Start(); err != nil {
				t.Fatal(err)
			}
			defer func() { _ = cmd.Process.Kill() }()
			child := 0
			deadline := time.Now().Add(10 * time.Second)
			for time.Now().Before(deadline) {
				b, _ := exec.Command("ps", "-o", "pid=", "-p", strconv.Itoa(cmd.Process.Pid)).Output()
				if len(b) == 0 {
					t.Fatal("CLI exited before helper")
				}
				b, _ = exec.Command("pgrep", "-P", strconv.Itoa(cmd.Process.Pid)).Output()
				ids := strings.Fields(string(b))
				if len(ids) > 0 {
					child, _ = strconv.Atoi(ids[0])
					break
				}
				time.Sleep(20 * time.Millisecond)
			}
			if child == 0 {
				t.Fatal("Node helper did not start")
			}
			if err := cmd.Process.Signal(sig); err != nil {
				t.Fatal(err)
			}
			done := make(chan error, 1)
			go func() { done <- cmd.Wait() }()
			select {
			case err := <-done:
				var exit *exec.ExitError
				if !errors.As(err, &exit) || exit.ExitCode() != 130 {
					t.Fatalf("exit %v output %s", err, &out)
				}
			case <-time.After(10 * time.Second):
				t.Fatal("signal cleanup timed out")
			}
			var r struct{ Error struct{ Code string } }
			if json.Unmarshal(out.Bytes(), &r) != nil || r.Error.Code != "cancelled" {
				t.Fatalf("invalid stdout: %s", &out)
			}
			if err := syscall.Kill(child, 0); err != syscall.ESRCH {
				t.Fatalf("owned Node %d still exists: %v", child, err)
			}
			if err := syscall.Kill(unrelated.Process.Pid, 0); err != nil {
				t.Fatalf("unrelated process affected: %v", err)
			}
		})
	}
}
