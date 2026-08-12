#import <UIKit/UIKit.h>
#import <React/RCTEventEmitter.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * TurboModule backing `react-native-app-shortcuts`, plus the static API the
 * host AppDelegate uses to forward Home Screen quick action presses.
 */
@interface AppShortcuts : RCTEventEmitter

/**
 * Forward a quick action press to JS. Call this from
 * `application:performActionForShortcutItem:completionHandler:`.
 *
 * iOS also invokes that delegate method for the press that cold-started the
 * app (as long as `application:didFinishLaunchingWithOptions:` returned YES),
 * so wiring this single method is enough for both cold and warm presses:
 * a press that arrives before JS has attached any listener is recorded as the
 * initial shortcut (served by `getInitialShortcut()`), and other presses are
 * buffered until the first JS listener attaches, then flushed.
 *
 * Returns YES when the item was accepted (pass the result to the
 * completion handler).
 */
+ (BOOL)handleShortcutItem:(UIApplicationShortcutItem *)shortcutItem
    NS_SWIFT_NAME(handleShortcutItem(_:));

/**
 * Optionally record the cold-start shortcut from the launch options
 * (`UIApplicationLaunchOptionsShortcutItemKey`). Call this from
 * `application:didFinishLaunchingWithOptions:` before returning.
 *
 * This is not strictly required when `handleShortcutItem:` is wired and
 * `didFinishLaunching` returns YES, but it makes `getInitialShortcut()`
 * correct even if you return NO from `didFinishLaunching` for shortcut
 * launches (in which case iOS skips the performAction callback).
 */
+ (void)setInitialShortcutFromLaunchOptions:(nullable NSDictionary *)launchOptions
    NS_SWIFT_NAME(setInitialShortcut(launchOptions:));

@end

NS_ASSUME_NONNULL_END
