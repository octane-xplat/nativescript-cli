//go:build darwin || linux

package process

import (
	"errors"
	"fmt"
	"os/exec"
	"syscall"
	"time"
)

func configureTree(cmd *exec.Cmd) error {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return nil
}
func stopTree(cmd *exec.Cmd) error {
	return stopGroup(cmd.Process.Pid, syscall.Kill)
}

// A signal failure can race with group retirement. Only observed absence proves
// cleanup; retain errors if the group remains present or cannot be inspected.
func stopGroup(pid int, signal func(int, syscall.Signal) error) error {
	// ESRCH is already clean. Never fall back to a caller's process group.
	err := signal(-pid, syscall.SIGTERM)
	if errors.Is(err, syscall.ESRCH) {
		return nil
	}
	timer := time.NewTimer(150 * time.Millisecond)
	defer timer.Stop()
	<-timer.C
	killErr := signal(-pid, syscall.SIGKILL)
	if errors.Is(killErr, syscall.ESRCH) {
		return nil
	}
	deadline := time.Now().Add(time.Second)
	for {
		probe := signal(-pid, 0)
		if errors.Is(probe, syscall.ESRCH) {
			return nil
		}
		if time.Now().After(deadline) {
			return errors.Join(err, killErr, probe, fmt.Errorf("owned process group did not retire before cleanup deadline"))
		}
		time.Sleep(10 * time.Millisecond)
	}
}
