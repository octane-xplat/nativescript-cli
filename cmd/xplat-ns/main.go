// Command xplat-ns owns process signals and exit status.
package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/octane-xplat/nativescript-cli/internal/cli"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	code := cli.Execute(ctx, os.Args[1:], os.Stdout, os.Stderr)
	stop()
	os.Exit(code)
}
