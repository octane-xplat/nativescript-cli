//go:build !darwin && !linux

package process

import "os/exec"

// Refuse launch rather than pretend direct-child killing owns a Windows tree.
// Windows requires a Job Object backend and actual Windows qualification.
func configureTree(*exec.Cmd) error { return &Error{Kind: ErrUnavailable} }
func stopTree(*exec.Cmd) error      { return nil }
