#import <UIKit/UIKit.h>
#import "Health.h"
static NSString *healthNonce;
@interface P91SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(strong,nonatomic) UIWindow *window;
@end
@implementation P91SceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
 self.window=[[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
 self.window.rootViewController=[UIViewController new];
 [self.window makeKeyAndVisible];
 NSString *path=[NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"p91-health.json"];
 __block NSUInteger ticks=0;
 [NSTimer scheduledTimerWithTimeInterval:0.25 repeats:YES block:^(NSTimer *timer) {
   NSDictionary *health=@{@"nonce":healthNonce,@"ticks":@(++ticks),@"pid":@(NSProcessInfo.processInfo.processIdentifier)};
   [[NSJSONSerialization dataWithJSONObject:health options:0 error:nil] writeToFile:path atomically:YES];
 }];
 NSLog(@"P91 scene ready");
}
@end
@interface P91AppDelegate : UIResponder <UIApplicationDelegate>
@end
@implementation P91AppDelegate
- (UISceneConfiguration *)application:(UIApplication *)app configurationForConnectingSceneSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
 UISceneConfiguration *config=[[UISceneConfiguration alloc] initWithName:@"P91" sessionRole:session.role];
 config.delegateClass=[P91SceneDelegate class];return config;
}
@end
void P91StartApplication(NSString *nonce) {
 healthNonce=[nonce copy];
 UIApplicationMain(0,NULL,nil,NSStringFromClass([P91AppDelegate class]));
}

BOOL P91WriteState(NSString *name, NSString *value) {
 if ([name containsString:@"/"] || [name containsString:@".."] ) return NO;
 NSString *root=[NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/xplat-ota"];
 return [value writeToFile:[root stringByAppendingPathComponent:name] atomically:YES encoding:NSUTF8StringEncoding error:nil];
}

static NSString *P91State(NSString *name) { return [[NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/xplat-ota"] stringByAppendingPathComponent:name]; }
NSString *P91ReadState(NSString *name) { return [NSString stringWithContentsOfFile:P91State(name) encoding:NSUTF8StringEncoding error:nil]; }
BOOL P91ExistsState(NSString *name) { return [[NSFileManager defaultManager] fileExistsAtPath:P91State(name)]; }
BOOL P91RemoveState(NSString *name) { return !P91ExistsState(name) || [[NSFileManager defaultManager] removeItemAtPath:P91State(name) error:nil]; }
BOOL P91ConsumeRollbackCommand(void) {
 NSString *file=[NSHomeDirectory() stringByAppendingPathComponent:@"Documents/p91-rollback"];
 if (![[NSFileManager defaultManager] fileExistsAtPath:file]) return NO;
 [[NSFileManager defaultManager] removeItemAtPath:file error:nil];return YES;
}
