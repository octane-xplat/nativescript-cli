package extensions

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/octane-xplat/nativescript-cli/extension"
	"github.com/octane-xplat/nativescript-cli/internal/project"
	"github.com/octane-xplat/nativescript-cli/internal/workspace"
)

var ErrNativeInput = errors.New("invalid extension native input")

func validateNative(f extension.NativeFile, platform string) error {
	if f.Platform != platform || (platform != "ios" && platform != "android") || f.Path == "" || path.IsAbs(f.Path) || path.Clean(f.Path) != f.Path || f.Path == ".." || strings.HasPrefix(f.Path, "../") || strings.ContainsAny(f.Path, "\\:\x00") {
		return ErrNativeInput
	}
	for _, part := range strings.Split(f.Path, "/") {
		for _, suffix := range []string{".framework", ".xcframework", ".xcassets", ".bundle"} {
			if strings.HasSuffix(strings.ToLower(part), suffix) {
				return fmt.Errorf("%w: directory bundles require installed package contributions", ErrNativeInput)
			}
		}
	}
	ext := strings.ToLower(path.Ext(f.Path))
	if platform == "android" && (f.Kind == "source" || f.Kind == "library") && path.Ext(f.Path) != ext {
		return fmt.Errorf("%w: Android compiler/library suffix must be lowercase", ErrNativeInput)
	}
	allowed := false
	if platform == "ios" {
		switch f.Kind {
		case "source":
			allowed = contains([]string{".swift", ".m", ".mm", ".h", ".c", ".cpp"}, ext)
		case "resource":
			allowed = contains([]string{".json", ".strings", ".storyboard", ".xib", ".png", ".jpg", ".jpeg"}, ext)
		case "configuration":
			allowed = contains([]string{".plist", ".xcconfig", ".entitlements", ".modulemap"}, ext)
		case "framework":
			allowed = ext == ".a"
		}
	} else {
		switch f.Kind {
		case "source":
			allowed = ext == ".java" || ext == ".kt"
		case "library":
			allowed = contains([]string{".aar", ".jar", ".so"}, ext)
		case "configuration":
			allowed = ext == ".gradle" || ext == ".properties" || ext == ".mdg" || path.Base(f.Path) == "AndroidManifest.xml"
		case "resource":
			allowed = strings.HasPrefix(f.Path, "res/") || strings.HasPrefix(f.Path, "assets/") || strings.HasPrefix(f.Path, "src/main/res/") || strings.HasPrefix(f.Path, "src/main/assets/")
		}
	}
	if !allowed {
		return fmt.Errorf("%w: unsupported native kind/file combination", ErrNativeInput)
	}
	return nil
}
func contains(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}

// Normalize before any generated-state mutation; ordering and duplicate handling
// are independent of the order returned by an extension implementation.
func NormalizeNative(inputs []NativeInput, platform string) ([]NativeInput, error) {
	inputs = append([]NativeInput(nil), inputs...)
	sort.Slice(inputs, func(i, j int) bool {
		a, b := inputs[i], inputs[j]
		if a.Owner != b.Owner {
			return a.Owner < b.Owner
		}
		return a.File.Path < b.File.Path
	})
	seen := map[string]bool{}
	for i, input := range inputs {
		if err := validateNative(input.File, platform); err != nil {
			return nil, err
		}
		key := input.Owner + "/" + strings.ToLower(input.File.Path)
		for other := range seen {
			if key == other || strings.HasPrefix(key, other+"/") || strings.HasPrefix(other, key+"/") {
				return nil, fmt.Errorf("%w: colliding native paths", ErrNativeInput)
			}
		}
		seen[key] = true
		inputs[i].File.Content = append([]byte(nil), input.File.Content...)
	}
	return inputs, nil
}
func NativeRevision(base string, inputs []NativeInput) string {
	if len(inputs) == 0 {
		return base
	}
	data, _ := json.Marshal(struct {
		Base   string
		Inputs []NativeInput
	}{base, inputs})
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// MaterializeNative publishes an immutable, content-identified input tree outside
// the preparer's replaceable output. The caller holds the project writer lease.
func MaterializeNative(ctx context.Context, r project.Resolved, l workspace.Lease, inputs []NativeInput) (project.Resolved, error) {
	if err := ctx.Err(); err != nil {
		return project.Resolved{}, err
	}
	if len(inputs) == 0 {
		return r, nil
	}
	if l == nil || r.Revision != l.Layout().Identity.Revision {
		return project.Resolved{}, ErrNativeInput
	}
	inputs, err := NormalizeNative(inputs, l.Layout().Identity.Target.Platform)
	if err != nil {
		return project.Resolved{}, err
	}
	if r.SourceRevision == "" || NativeRevision(r.SourceRevision, inputs) != r.Revision {
		return project.Resolved{}, ErrNativeInput
	}
	root := l.Layout().GeneratedRoot
	if err := os.MkdirAll(root, 0700); err != nil {
		return project.Resolved{}, err
	}
	canonical, err := filepath.EvalSymlinks(root)
	if err != nil || canonical != root {
		return project.Resolved{}, ErrNativeInput
	}
	dest := filepath.Join(root, "extension-native-"+r.Revision)
	files := map[string][]byte{}
	owners := map[string]string{}
	for _, input := range inputs {
		hash := sha256.Sum256([]byte(input.Owner))
		owner := "extension-" + hex.EncodeToString(hash[:])
		owners[input.Owner] = owner
		metadata, _ := json.Marshal(map[string]string{"name": owner, "version": input.Version})
		files[owner+"/package.json"] = metadata
		files[owner+"/platforms/"+input.File.Platform+"/"+input.File.Path] = input.File.Content
	}
	if _, err := os.Lstat(dest); os.IsNotExist(err) {
		stage, err := os.MkdirTemp(root, ".native-inputs-")
		if err != nil {
			return project.Resolved{}, err
		}
		defer os.RemoveAll(stage)
		for name, data := range files {
			if err := ctx.Err(); err != nil {
				return project.Resolved{}, err
			}
			file := filepath.Join(stage, filepath.FromSlash(name))
			if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
				return project.Resolved{}, err
			}
			f, err := os.OpenFile(file, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
			if err != nil {
				return project.Resolved{}, err
			}
			_, err = f.Write(data)
			err = errors.Join(err, f.Close())
			if err != nil {
				return project.Resolved{}, err
			}
		}
		if err := ctx.Err(); err != nil {
			return project.Resolved{}, err
		}
		if err := os.Rename(stage, dest); err != nil {
			return project.Resolved{}, err
		}
	} else if err != nil {
		return project.Resolved{}, err
	}
	// Never trust a pre-existing content-addressed tree without verifying it.
	count := 0
	err = filepath.WalkDir(dest, func(file string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return ErrNativeInput
		}
		if entry.IsDir() {
			return nil
		}
		if !entry.Type().IsRegular() {
			return ErrNativeInput
		}
		rel, _ := filepath.Rel(dest, file)
		want, ok := files[filepath.ToSlash(rel)]
		data, err := os.ReadFile(file)
		if err != nil {
			return err
		}
		if !ok || !bytes.Equal(data, want) {
			return fmt.Errorf("%w: immutable native input changed", ErrNativeInput)
		}
		count++
		return nil
	})
	if err != nil {
		return project.Resolved{}, err
	}
	if count != len(files) {
		return project.Resolved{}, ErrNativeInput
	}
	r.Contributions = append([]project.Contribution(nil), r.Contributions...)
	r.Sources = append([]project.Source(nil), r.Sources...)
	for _, input := range inputs {
		owner := filepath.Join(dest, owners[input.Owner])
		file := filepath.Join(owner, "platforms", input.File.Platform, filepath.FromSlash(input.File.Path))
		r.Contributions = append(r.Contributions, project.Contribution{PackageDirectory: owner, Platform: input.File.Platform, Kind: input.File.Kind, Path: file})
		hash := sha256.Sum256(input.File.Content)
		r.Sources = append(r.Sources, project.Source{Path: file, Digest: hex.EncodeToString(hash[:])})
	}
	return r, nil
}
