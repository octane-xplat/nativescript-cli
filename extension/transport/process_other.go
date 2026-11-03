//go:build !darwin && !linux

package transport

import "os/exec"

func configure(cmd *exec.Cmd) {}
func retire(cmd *exec.Cmd) {
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}
