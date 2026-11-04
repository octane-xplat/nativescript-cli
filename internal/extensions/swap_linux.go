//go:build linux

package extensions

import "golang.org/x/sys/unix"

func swapNative(staged, current string) error {
	return unix.Renameat2(unix.AT_FDCWD, staged, unix.AT_FDCWD, current, unix.RENAME_EXCHANGE)
}
