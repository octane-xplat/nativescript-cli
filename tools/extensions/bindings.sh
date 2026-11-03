#!/bin/sh
set -eu
# Requires protoc, protoc-gen-go 1.36.11, protoc-gen-go-grpc 1.6.1 and frozen Bun dependencies.
protoc -I extension/transport/wire --go_out=paths=source_relative:extension/transport/wire --go-grpc_out=paths=source_relative:extension/transport/wire extension/transport/wire/extension.proto
node node_modules/grpc-tools/bin/protoc.js -I extension/transport/wire -I node_modules/grpc-tools/bin --js_out=import_style=commonjs,binary:plugin/generated --grpc_out=grpc_js:plugin/generated extension/transport/wire/extension.proto extension/transport/wire/grpc_controller.proto extension/transport/wire/grpc_stdio.proto extension/transport/wire/grpc_broker.proto
node tools/extensions/generate.mjs
