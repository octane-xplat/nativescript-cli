#import <Foundation/Foundation.h>
__attribute__((visibility("default"),used)) void P91StartApplication(NSString *nonce);

__attribute__((visibility("default"),used)) BOOL P91WriteState(NSString *name, NSString *value);
__attribute__((visibility("default"),used)) NSString *P91ReadState(NSString *name);
__attribute__((visibility("default"),used)) BOOL P91ExistsState(NSString *name);
__attribute__((visibility("default"),used)) BOOL P91RemoveState(NSString *name);
__attribute__((visibility("default"),used)) BOOL P91ConsumeRollbackCommand(void);
