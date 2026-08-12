# iOS setup

Quick action presses are delivered by iOS to **your app's AppDelegate** — a library cannot intercept them automatically. You must forward them to `AppShortcuts`.

## Wiring

### Swift (default React Native template)

```swift
import AppShortcuts

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    AppShortcuts.setInitialShortcut(launchOptions: launchOptions)

    // ... existing React Native setup ...
    return true
  }

  func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    completionHandler(AppShortcuts.handleShortcutItem(shortcutItem))
  }
}
```

The pod defines a Clang module, so plain `import AppShortcuts` works with the default static-library CocoaPods setup — no bridging header required. (If your project cannot use modules, add `#import <AppShortcuts/AppShortcuts.h>` to your bridging header instead.)

### Objective-C

```objc
#import <AppShortcuts/AppShortcuts.h>

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  [AppShortcuts setInitialShortcutFromLaunchOptions:launchOptions];

  // ... existing React Native setup ...
  return YES;
}

- (void)application:(UIApplication *)application
    performActionForShortcutItem:(UIApplicationShortcutItem *)shortcutItem
               completionHandler:(void (^)(BOOL))completionHandler
{
  completionHandler([AppShortcuts handleShortcutItem:shortcutItem]);
}
```

## The cold-start contract (what iOS actually does)

Apple's documented behavior for a quick action that **launches** (rather than resumes) the app:

1. The shortcut item is passed in the launch options dictionary under `UIApplicationLaunchOptionsShortcutItemKey`, available in `application:willFinishLaunchingWithOptions:` and `application:didFinishLaunchingWithOptions:`.
2. If both launching methods return `true`/`YES` (the React Native default), iOS **also** calls `application:performActionForShortcutItem:completionHandler:` for that same press after launch.
3. If you return `false`/`NO` from either launching method, iOS treats the press as already handled and does **not** call `performActionForShortcutItem:` for it.

`react-native-app-shortcuts` is correct under either wiring:

- **Only `handleShortcutItem:` wired** (and `didFinishLaunching` returns `true`): the cold-start press arrives via `performActionForShortcutItem:` before any JS listener has attached in the process — the library records it as the initial shortcut, so `getInitialShortcut()` works.
- **Both calls wired** (recommended): `setInitialShortcut(launchOptions:)` records the item first; when `handleShortcutItem:` then reports the same press, the library recognizes the duplicate while flushing its buffer and drops it, so the press is delivered exactly once (via `getInitialShortcut()` / `useShortcutPress`).
- **`didFinishLaunching` returns `false`** (unusual): `performActionForShortcutItem:` is skipped for cold starts, so `setInitialShortcut(launchOptions:)` is then *required* for `getInitialShortcut()` to work.

## Press delivery timing

- **Warm press** (app in background): iOS activates the app and calls `performActionForShortcutItem:`. JS listeners are attached, so the event `AppShortcuts:shortcutPressed` is emitted immediately.
- **Press before JS is ready** (cold start, or during a reload): the item is buffered natively and flushed when the first JS listener attaches — presses are never lost.

## Icons

`iconName` must be an SF Symbol name (`"star.fill"`, `"magnifyingglass"`, ...). Browse names with Apple's [SF Symbols app](https://developer.apple.com/sf-symbols/). Invalid names simply render no icon.

## Limits

iOS shows at most **4** dynamic quick actions (plus any static ones from `Info.plist`'s `UIApplicationShortcutItems`, which this library does not manage).
