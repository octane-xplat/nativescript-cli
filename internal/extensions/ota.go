package extensions

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/octane-xplat/nativescript-cli/extension"
	"github.com/octane-xplat/nativescript-cli/internal/jsbridge"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
	"os"
	"path/filepath"
)

// OTAStartup invokes the explicitly supported installed startup adapter. It does
// not claim native-compatibility fingerprinting, absent from that producer.
type OTAStartup struct{ Host jsbridge.Host }

func (a OTAStartup) Apply(ctx context.Context, r project.Resolved, p project.Prepared, l workspace.Lease) error {
	if p.Identity.Target.Configuration != "release" {
		return nil
	}
	owner, ok := l.(interface {
		RunHelper(context.Context, func(context.Context) error) error
	})
	if !ok {
		return fmt.Errorf("OTA requires workspace ownership")
	}
	h := a.Host
	h.ProjectDir = r.Directory
	if h.CacheDir == "" {
		cache, e := os.UserCacheDir()
		if e != nil {
			return e
		}
		h.CacheDir = filepath.Join(cache, "octane-xplat", "nativescript-cli", "helper")
	}
	payload, _ := json.Marshal(map[string]interface{}{"projectDir": r.Directory, "nativeDir": p.NativeDir, "platform": p.Identity.Target.Platform, "configuration": p.Identity.Target.Configuration, "appResourcesPath": r.Config.AppResourcesPath})
	return owner.RunHelper(ctx, func(ctx context.Context) error {
		f, e := h.Call(ctx, jsbridge.Request{Version: jsbridge.ProtocolVersion, ID: "ota", Feature: "extensions", Operation: "otaStartup", Payload: payload}, nil)
		if e != nil {
			return e
		}
		var out struct{ Files []extension.File }
		if e = json.Unmarshal(f.Payload, &out); e != nil {
			return e
		}
		if len(out.Files) != 1 {
			return fmt.Errorf("invalid OTA result")
		}
		file := out.Files[0]
		expected := "internal/main.m"
		if p.Identity.Target.Platform == "android" {
			expected = "app/src/main/java/com/tns/NativeScriptApplication.java"
		}
		if file.Path != expected {
			return fmt.Errorf("invalid OTA startup path")
		}
		temp, e := os.CreateTemp(filepath.Join(p.NativeDir, filepath.Dir(expected)), ".ota-")
		if e != nil {
			return e
		}
		defer os.Remove(temp.Name())
		if _, e = temp.WriteString(file.Content); e != nil {
			temp.Close()
			return e
		}
		if e = temp.Close(); e != nil {
			return e
		}
		if e = ctx.Err(); e != nil {
			return e
		}
		return os.Rename(temp.Name(), filepath.Join(p.NativeDir, expected))
	})
}
