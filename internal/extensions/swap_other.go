//go:build !darwin && !linux

package extensions

import "fmt"

func swapNative(staged, current string) error {
	return fmt.Errorf("atomic OTA publication unavailable on this host")
}
