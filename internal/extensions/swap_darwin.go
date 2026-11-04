//go:build darwin

package extensions

import "golang.org/x/sys/unix"

func swapNative(staged, current string) error {
	return unix.RenamexNp(staged, current, unix.RENAME_SWAP)
}
