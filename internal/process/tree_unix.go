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
	pid := cmd.Process.Pid
	signal := func(sig syscall.Signal) error {
		err := syscall.Kill(-pid, sig)
		if errors.Is(err, syscall.ESRCH) {
			return nil
		}
		return err
	}
	// ESRCH is already clean. Never fall back to a caller's process group.
	err := syscall.Kill(-pid, syscall.SIGTERM)
	if errors.Is(err, syscall.ESRCH) {
		return nil
	}
	timer := time.NewTimer(150 * time.Millisecond)
	defer timer.Stop()
	<-timer.C
	killErr := signal(syscall.SIGKILL)
	if killErr != nil {
		return errors.Join(err, killErr)
	}
	deadline := time.Now().Add(time.Second)
	for {
		probe := syscall.Kill(-pid, 0)
		if errors.Is(probe, syscall.ESRCH) {
			return err
		}
		if probe != nil {
			return errors.Join(err, probe)
		}
		if time.Now().After(deadline) {
			return errors.Join(err, fmt.Errorf("owned process group did not retire before cleanup deadline"))
		}
		time.Sleep(10 * time.Millisecond)
	}
}
