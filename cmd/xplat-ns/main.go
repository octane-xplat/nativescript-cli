// Command xplat-ns is the executable entry point for the NativeScript tooling.
// This scaffold deliberately reports that operational commands are unavailable.
package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "xplat-ns: scaffolding only; commands are not implemented")
	os.Exit(2)
}
