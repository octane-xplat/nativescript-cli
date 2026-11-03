//go:build !darwin && !linux

package workspace

import (
	"context"
	"os"
)

func lock(context.Context, *os.File) error { return ErrUnavailable }
func unlock(*os.File) error                { return ErrUnavailable }
