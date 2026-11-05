package main

import (
	"github.com/octane-xplat/nativescript-cli/extension/transport"
	"github.com/octane-xplat/nativescript-cli/tools/extensions/development/fixture"
	"os"
)

func main() {
	transport.Serve(fixture.Extension{Control: os.Getenv("NS_DEV_EXTENSION_CONTROL"), Trace: os.Getenv("NS_DEV_EXTENSION_TRACE")})
}
