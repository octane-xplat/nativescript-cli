#import <UIKit/UIKit.h>
#import "Health.h"
static NSString *healthNonce;
@interface G2SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(strong,nonatomic) UIWindow *window;
@end
@implementation G2SceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
 self.window=[[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
 self.window.rootViewController=[UIViewController new];
 [self.window makeKeyAndVisible];
 NSString *path=[NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"g2-health.json"];
 __block NSUInteger ticks=0;
 [NSTimer scheduledTimerWithTimeInterval:0.25 repeats:YES block:^(NSTimer *timer) {
   NSDictionary *health=@{@"nonce":healthNonce,@"ticks":@(++ticks),@"pid":@(NSProcessInfo.processInfo.processIdentifier)};
   [[NSJSONSerialization dataWithJSONObject:health options:0 error:nil] writeToFile:path atomically:YES];
 }];
 NSLog(@"G2 scene ready");
}
@end
@interface G2AppDelegate : UIResponder <UIApplicationDelegate>
@end
@implementation G2AppDelegate
- (UISceneConfiguration *)application:(UIApplication *)app configurationForConnectingSceneSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
 UISceneConfiguration *config=[[UISceneConfiguration alloc] initWithName:@"G2" sessionRole:session.role];
 config.delegateClass=[G2SceneDelegate class];return config;
}
@end
void G2StartApplication(NSString *nonce) {
 healthNonce=[nonce copy];
 UIApplicationMain(0,NULL,nil,NSStringFromClass([G2AppDelegate class]));
}
