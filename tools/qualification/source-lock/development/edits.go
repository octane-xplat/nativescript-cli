package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/octane-xplat/nativescript-cli/internal/bundle"
)

const marker = "\nexport const __xplatHostEntryQualification = \"native-value-before\";\n"

type instrumentation struct {
	file     string
	original []byte
	mode     os.FileMode
}

func (i *instrumentation) receipt() map[string]any {
	return map[string]any{"scope": "temporary export appended to the complete original app entry; source restored after owned sessions retire", "path": i.file, "originalSHA256": fmt.Sprintf("%x", sha256.Sum256(i.original)), "instrumentedSHA256": fmt.Sprintf("%x", sha256.Sum256(append(append([]byte(nil), i.original...), marker...)))}
}
func (i *instrumentation) restore() error {
	current, err := os.ReadFile(i.file)
	if err != nil {
		return err
	}
	for _, token := range []string{"native-value-before", "native-value-after", "native-value-after-next"} {
		expected := string(i.original) + strings.Replace(marker, "native-value-before", token, 1)
		if string(current) == expected {
			return os.WriteFile(i.file, i.original, i.mode)
		}
	}
	return errors.New("entry changed unexpectedly; preserved concurrent bytes instead of overwriting")
}
func within(root, file string) bool {
	relative, err := filepath.Rel(root, file)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}
func instrumentEntry(app string) (*instrumentation, error) {
	canonicalApp, err := filepath.EvalSymlinks(app)
	if err != nil {
		return nil, err
	}
	app = canonicalApp
	root := filepath.Dir(filepath.Dir(app))
	proofBytes, err := os.ReadFile(filepath.Join(root, "stage-proof.json"))
	if err != nil {
		return nil, errors.New("edit mode requires a private host-only staged source fixture")
	}
	var proof struct {
		HostOnly  bool   `json:"hostOnly"`
		CacheRoot string `json:"cacheRoot"`
	}
	if json.Unmarshal(proofBytes, &proof) != nil || !proof.HostOnly || !filepath.IsAbs(proof.CacheRoot) {
		return nil, errors.New("edit mode requires a private host-only staged source fixture")
	}
	cacheRoot, err := filepath.EvalSymlinks(proof.CacheRoot)
	if err != nil || !within(cacheRoot, root) {
		return nil, errors.New("source fixture resolves outside its private host cache")
	}
	info, err := os.Stat(cacheRoot)
	if err != nil || !info.IsDir() || info.Mode().Perm()&0077 != 0 {
		return nil, errors.New("host fixture cache is not private")
	}
	data, err := os.ReadFile(filepath.Join(app, "package.json"))
	if err != nil {
		return nil, err
	}
	var pkg struct{ Main string }
	if json.Unmarshal(data, &pkg) != nil || pkg.Main == "" {
		return nil, errors.New("missing app entry")
	}
	file := filepath.Join(app, pkg.Main)
	if !within(app, file) {
		return nil, errors.New("entry outside owned app")
	}
	info, err = os.Lstat(file)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > 16*1024*1024 {
		return nil, errors.New("entry must be a bounded ordinary source file")
	}
	canonicalFile, err := filepath.EvalSymlinks(file)
	if err != nil || !within(app, canonicalFile) {
		return nil, errors.New("entry resolves outside owned app")
	}
	original, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	if strings.Contains(string(original), "native-value-before") {
		return nil, errors.New("entry already contains qualification marker")
	}
	instrument := &instrumentation{file, original, info.Mode().Perm()}
	if err = os.WriteFile(file, append(append([]byte(nil), original...), marker...), instrument.mode); err != nil {
		return nil, err
	}
	return instrument, nil
}

func qualifyEdits(ctx context.Context, repo, app string, sessions []live, rows []map[string]any, result map[string]any, instrument *instrumentation) (outcome error) {
	relative, err := filepath.Rel(app, instrument.file)
	if err != nil {
		return err
	}
	moduleID := "/" + filepath.ToSlash(relative)
	route := "/ns/m/" + strings.TrimSuffix(filepath.ToSlash(relative), filepath.Ext(relative))
	cmd := exec.CommandContext(ctx, "node", filepath.Join(repo, "tools/qualification/source-lock/development/ws-entry-updates.mjs"), sessions[0].dev.Ready.Endpoint.URL, sessions[1].dev.Ready.Endpoint.URL, instrument.file, route, moduleID)
	output, err := cmd.Output()
	var wire map[string]any
	parsed := json.Unmarshal(output, &wire) == nil
	if parsed {
		result["hostEntryEdits"] = wire
	}
	if err != nil || !parsed || wire["passed"] != true {
		return errors.New("full-app entry wire qualification failed")
	}
	for _, session := range sessions {
		if _, err = get(ctx, session.dev.Ready.Endpoint.URL+"/ns/entry"); err != nil {
			return errors.New("JavaScript edit retired live target")
		}
	}
	result["bothTargetsSurvivedEntryEdits"] = true
	// The original app uses this resources directory; refuse an existing path and
	// remove only bytes written by this qualification after both owners retire.
	resource := filepath.Join(sessions[0].resources, "iOS", "__xplat_host_qualification__.json")
	parent, err := filepath.EvalSymlinks(filepath.Dir(resource))
	if err != nil || !within(filepath.Dir(filepath.Dir(app)), parent) {
		return errors.New("resource edit must stay in the owned fixture")
	}
	file, err := os.OpenFile(resource, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	content := []byte("{}\n")
	defer func() {
		cleanup, stop := context.WithTimeout(context.Background(), 30*time.Second)
		for _, session := range sessions {
			outcome = errors.Join(outcome, terminalError(closeError(session.dev.Session.Close(cleanup)), bundle.ErrRestart))
		}
		stop()
		bytes, err := os.ReadFile(resource)
		if err != nil {
			outcome = errors.Join(outcome, err)
			return
		}
		if string(bytes) != string(content) {
			outcome = errors.Join(outcome, errors.New("native probe changed unexpectedly; preserved concurrent bytes"))
			return
		}
		outcome = errors.Join(outcome, os.Remove(resource))
	}()
	_, err = file.Write(content)
	err = errors.Join(err, file.Close())
	if err != nil {
		return err
	}
	for index, session := range sessions {
		done := make(chan error, 1)
		go func() { done <- session.dev.Session.Wait() }()
		select {
		case err = <-done:
			if !errors.Is(err, bundle.ErrRestart) || terminalError(err, bundle.ErrRestart) != nil {
				return errors.New("native input did not produce an isolated restart outcome")
			}
		case <-time.After(20 * time.Second):
			return errors.New("native restart timed out")
		case <-ctx.Done():
			return ctx.Err()
		}
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		err = terminalError(session.dev.Session.Close(cleanup), bundle.ErrRestart)
		err = errors.Join(err, terminalError(session.dev.Session.Close(cleanup), bundle.ErrRestart))
		stop()
		if err != nil {
			return err
		}
		if _, err = os.Lstat(session.dev.Ready.Manifest.Directory); !os.IsNotExist(err) {
			return errors.New("restart retained output")
		}
		if _, err = get(ctx, session.dev.Ready.Endpoint.URL+"/ns/entry"); err == nil {
			return errors.New("restart retained endpoint")
		}
		rows[index]["nativeRestartObserved"] = true
		rows[index]["repeatedClosePassed"] = true
		rows[index]["outputRetired"] = true
		rows[index]["endpointRetired"] = true
	}
	result["activeNativeInputRestartedBothTargets"] = true
	return nil
}
