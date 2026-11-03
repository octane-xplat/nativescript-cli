// Package transport adapts the domain SDK to hashicorp/go-plugin gRPC.
// Direct registrations do not import this package.
package transport

import (
	"context"
	"encoding/json"
	"io"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"fmt"
	"github.com/hashicorp/go-hclog"
	plugin "github.com/hashicorp/go-plugin"
	"github.com/octane-xplat/nativescript-cli/extension"
	"github.com/octane-xplat/nativescript-cli/extension/transport/wire"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var handshake = plugin.HandshakeConfig{ProtocolVersion: 1, MagicCookieKey: "NATIVESCRIPT_EXTENSION", MagicCookieValue: "1"}

type adapter struct {
	plugin.NetRPCUnsupportedPlugin
	impl extension.Extension
}

func (a *adapter) GRPCServer(_ *plugin.GRPCBroker, s *grpc.Server) error {
	wire.RegisterExtensionServer(s, &server{impl: a.impl})
	return nil
}
func (a *adapter) GRPCClient(_ context.Context, _ *plugin.GRPCBroker, c *grpc.ClientConn) (interface{}, error) {
	return &remote{wire.NewExtensionClient(c)}, nil
}

type server struct {
	wire.UnimplementedExtensionServer
	impl extension.Extension
}

// Conversion uses generated JSON field names only; the wire protocol is typed protobuf.
func convert(a, b interface{}) error {
	v, e := json.Marshal(a)
	if e != nil {
		return e
	}
	return json.Unmarshal(v, b)
}
func (s *server) Describe(ctx context.Context, _ *wire.Empty) (*wire.Manifest, error) {
	v, e := s.impl.Manifest(ctx)
	if e != nil {
		return nil, rpcError(e)
	}
	r := new(wire.Manifest)
	e = convert(v, r)
	return r, e
}
func (s *server) Invoke(ctx context.Context, v *wire.Input) (*wire.Result, error) {
	var in extension.Input
	if e := convert(v, &in); e != nil {
		return nil, e
	}
	out, e := s.impl.Invoke(ctx, in)
	if e != nil {
		return nil, rpcError(e)
	}
	r := new(wire.Result)
	e = convert(out, r)
	return r, e
}
func rpcError(e error) error {
	if e == context.Canceled {
		return status.Error(codes.Canceled, "extension canceled")
	}
	if e == context.DeadlineExceeded {
		return status.Error(codes.DeadlineExceeded, "extension deadline")
	}
	return status.Error(codes.Internal, e.Error())
}

type remote struct{ client wire.ExtensionClient }

func (r *remote) Manifest(ctx context.Context) (extension.Manifest, error) {
	v, e := r.client.Describe(ctx, &wire.Empty{})
	var out extension.Manifest
	if e == nil {
		e = convert(v, &out)
	}
	if ctx.Err() != nil {
		e = ctx.Err()
	} else if status.Code(e) == codes.DeadlineExceeded {
		e = context.DeadlineExceeded
	} else if status.Code(e) == codes.Canceled {
		e = context.Canceled
	}
	return out, e
}
func (r *remote) Invoke(ctx context.Context, in extension.Input) (extension.Result, error) {
	v := new(wire.Input)
	if e := convert(in, v); e != nil {
		return extension.Result{}, e
	}
	out, e := r.client.Invoke(ctx, v)
	var result extension.Result
	if e == nil {
		e = convert(out, &result)
	}
	if ctx.Err() != nil {
		e = ctx.Err()
	} else if status.Code(e) == codes.DeadlineExceeded {
		e = context.DeadlineExceeded
	} else if status.Code(e) == codes.Canceled {
		e = context.Canceled
	}
	return result, e
}

// Serve is an executable entry point; it owns go-plugin's process lifecycle.
func Serve(impl extension.Extension) {
	plugin.Serve(&plugin.ServeConfig{HandshakeConfig: handshake, Plugins: map[string]plugin.Plugin{"extension": &adapter{impl: impl}}, GRPCServer: plugin.DefaultGRPCServer, Logger: hclog.NewNullLogger()})
}

// Open starts an explicitly selected executable. Close must be called; no discovery,
// downloading or compilation occurs. Logs are separate from handshake stdout.
// Windows execution is unavailable pending process ownership qualification.
func Open(ctx context.Context, executable string, args []string, dir string, env []string, logs io.Writer) (extension.Extension, func(), error) {
	if runtime.GOOS == "windows" {
		return nil, nil, fmt.Errorf("external extensions unavailable on Windows")
	}
	if e := ctx.Err(); e != nil {
		return nil, nil, e
	}
	if logs == nil {
		logs = io.Discard
	}
	cmd := exec.CommandContext(ctx, executable, args...)
	configure(cmd)
	cmd.Dir = dir
	cmd.Env = env
	c := plugin.NewClient(&plugin.ClientConfig{HandshakeConfig: handshake, Plugins: map[string]plugin.Plugin{"extension": &adapter{}}, Cmd: cmd, AllowedProtocols: []plugin.Protocol{plugin.ProtocolGRPC}, StartTimeout: 10 * time.Second, SyncStdout: logs, SyncStderr: logs, Stderr: logs, Logger: hclog.NewNullLogger(), SkipHostEnv: true})
	var once sync.Once
	done := make(chan struct{})
	close := func() { once.Do(func() { retire(cmd); c.Kill(); closeDone(done) }) }
	go func() {
		select {
		case <-ctx.Done():
			close()
		case <-done:
		}
	}()
	rpc, e := c.Client()
	if e != nil {
		close()
		return nil, nil, e
	}
	v, e := rpc.Dispense("extension")
	if e != nil {
		close()
		return nil, nil, e
	}
	return v.(extension.Extension), close, nil
}

func closeDone(done chan struct{}) { close(done) }
