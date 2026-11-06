package nativescript_test

import (
	"context"
	"encoding/json"
	"errors"
	ns "github.com/octane-xplat/nativescript-cli"
	iosbuild "github.com/octane-xplat/nativescript-cli/internal/ios/build"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// This opt-in test requires a native_builds reservation; it never boots a device.
func TestFreshIOSSimulatorBuild(t *testing.T) {
	if os.Getenv("B1_NATIVE_BUILD") != "1" {
		t.Skip("requires explicit runtime/Vite inputs and native build reservation")
	}
	root, _, q := prepareApp(t, true)
	resolutionFile(t, root, "package.json", `{"name":"app","version":"1.0.0","main":"app/app.js","devDependencies":{"@nativescript/ios":"9.1.0","@nativescript/vite":"8.0.21"},"dependencies":{"native-plugin":"1"}}`)
	resolutionFile(t, root, "app/app.js", `console.log("B1 bundled startup"); D1StartApplication();`)
	// Exercise native header metadata and a real UIKit event loop without a framework dependency.
	resolutionFile(t, root, "node_modules/native-plugin/platforms/ios/Session.h", `void D1StartApplication(void);`)
	resolutionFile(t, root, "node_modules/native-plugin/platforms/ios/Session.m", `#import <UIKit/UIKit.h>
#import "Session.h"
@interface D1SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(strong,nonatomic) UIWindow *window;
@end
@implementation D1SceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
 self.window=[[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
 self.window.rootViewController=[UIViewController new];
 [self.window makeKeyAndVisible];
 NSLog(@"D1 scene ready");
}
@end
@interface D1SessionDelegate : UIResponder <UIApplicationDelegate>
@end
@implementation D1SessionDelegate
- (UISceneConfiguration *)application:(UIApplication *)app configurationForConnectingSceneSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
 UISceneConfiguration *config=[[UISceneConfiguration alloc] initWithName:@"D1" sessionRole:session.role];
 config.delegateClass=[D1SceneDelegate class];return config;
}
@end
void D1StartApplication(void) { UIApplicationMain(0,NULL,nil,NSStringFromClass([D1SessionDelegate class])); }
`)
	engine := os.Getenv("NS_NATIVE_VITE_DIR")
	if engine == "" {
		t.Skip("set NS_NATIVE_VITE_DIR to an installed @nativescript/vite8.0.20 or 8.0.21 consumer")
	}
	for _, name := range []string{"vite", "typescript", "@nativescript/core", "@nativescript/vite"} {
		target := filepath.Join(root, "node_modules", name)
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(filepath.Join(engine, "node_modules", name), target); err != nil {
			t.Fatal(err)
		}
	}
	resolutionFile(t, root, "App_Resources/iOS/build.xcconfig", "IPHONEOS_DEPLOYMENT_TARGET = 15.0\n")
	resolutionFile(t, root, "App_Resources/iOS/Info.plist", `<plist version="1.0"><dict><key>UIApplicationSceneManifest</key><dict><key>UIApplicationSupportsMultipleScenes</key><false/><key>UISceneConfigurations</key><dict/></dict></dict></plist>`)
	q.Target.Destination.ID = "generic"
	client, _ := ns.New(ns.Options{})
	result, err := client.Build(context.Background(), ns.BuildRequest{ProjectDir: q.ProjectDir, OutputDir: q.OutputDir, Target: q.Target})
	if err != nil {
		var failure *iosbuild.Failure
		if errors.As(err, &failure) {
			t.Log(failure.Diagnostic)
		}
		t.Fatal(err)
	}
	if len(result.Artifacts) != 1 || result.Artifacts[0].Kind != "app" || result.Artifacts[0].ApplicationID != "org.example.app" {
		t.Fatalf("unexpected artifacts: %+v", result.Artifacts)
	}
	if _, err := os.Stat(filepath.Join(result.Artifacts[0].Path, "app", "bundle.mjs")); err != nil {
		t.Fatal("bundled entry absent from app", err)
	}
	if data, err := os.ReadFile(filepath.Join(result.Artifacts[0].Path, "app", "package.json")); err != nil || !strings.Contains(string(data), `"main":"bundle.mjs"`) {
		t.Fatal("runtime entry manifest absent", err)
	}
	if dest := os.Getenv("B1_ARTIFACT_DIR"); dest != "" {
		if !filepath.IsAbs(dest) {
			t.Fatal("artifact destination must be absolute")
		}
		if err := exec.Command("/usr/bin/ditto", result.Artifacts[0].Path, filepath.Join(dest, "NativeScriptApp.app")).Run(); err != nil {
			t.Fatal(err)
		}
		retained := result.Artifacts[0]
		retained.Path = filepath.Join(dest, "NativeScriptApp.app")
		data, err := json.Marshal(retained)
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(filepath.Join(dest, "artifact.json"), data, 0600); err != nil {
			t.Fatal(err)
		}
		t.Log("retained simulator app and exact B1 identity at", dest)
	}
	t.Logf("fresh simulator app: %+v", result.Artifacts[0])
}
