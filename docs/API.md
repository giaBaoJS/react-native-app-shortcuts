# API reference

```ts
import {
  setShortcuts,
  clearShortcuts,
  getShortcuts,
  getInitialShortcut,
  addShortcutListener,
  useShortcutPress,
  shortcutKey,
  SHORTCUT_PRESSED_EVENT,
  type ShortcutItem,
} from 'react-native-app-shortcuts';
```

## `ShortcutItem`

```ts
type ShortcutItem = {
  id: string; // unique, returned on press
  title: string;
  subtitle?: string; // iOS only visually; used as longLabel on Android
  iconName?: string; // iOS: SF Symbol name; Android: host-app drawable name
  data?: { [key: string]: string }; // arbitrary payload returned on press
};
```

| Field | iOS mapping | Android mapping |
| --- | --- | --- |
| `id` | `UIApplicationShortcutItem.type` | `ShortcutInfo` id |
| `title` | `localizedTitle` | `shortLabel` |
| `subtitle` | `localizedSubtitle` | `longLabel` (falls back to `title`) |
| `iconName` | `UIApplicationShortcutIcon iconWithSystemImageName:` | `Icon.createWithResource` (looked up in `drawable`, then `mipmap`; skipped when missing) |
| `data` | `userInfo` (under a reserved key) | JSON string extra on the launch intent |

## `setShortcuts(shortcuts: ShortcutItem[]): Promise<void>`

Replaces **all** of the app's dynamic shortcuts with the given list (pass `[]` to remove all — equivalent to `clearShortcuts()`).

Validation happens in JS before any native call; the returned promise **rejects** with a `TypeError` when:

- `shortcuts` is not an array,
- any item has a missing / empty / non-string `id` or `title`,
- two items share the same `id`,
- any `data` value is not a string.

Platform notes:

- **iOS**: assigned to `UIApplication.shortcutItems` on the main thread. iOS displays at most 4 dynamic items.
- **Android**: assigned via `ShortcutManager.setDynamicShortcuts`. Exceeding `getMaxShortcutCountPerActivity()` (typically 4–5) rejects with code `set_shortcuts_failed`. On API < 25 the call resolves without doing anything.

Static shortcuts declared in the platform manifests are untouched.

## `clearShortcuts(): Promise<void>`

Removes all dynamic shortcuts. Never rejects in normal operation (no-op below Android API 25).

## `getShortcuts(): Promise<ShortcutItem[]>`

Returns the dynamic shortcuts currently registered. Items set by this library round-trip completely (including `iconName` and `data`). Dynamic shortcuts registered by other means are reconstructed best-effort (`id`, `title`, `subtitle`). Resolves `[]` below Android API 25.

## `getInitialShortcut(): Promise<ShortcutItem | null>`

The shortcut press that **cold-started** the app, or `null` when the app was launched normally.

- The value is **stable**: repeated calls return the same item until the next process launch (it survives JS reloads).
- iOS: populated by either `setInitialShortcut(launchOptions:)` **or** the first `handleShortcutItem:` that arrives before any JS listener has attached — wiring `performActionForShortcutItem` alone is sufficient as long as `didFinishLaunchingWithOptions` returns `true`. See [ios-setup.md](./ios-setup.md).
- Android: read from the launch activity's intent; the intent is marked consumed so activity re-creation (rotation) does not re-report it.

## `addShortcutListener(cb: (item: ShortcutItem) => void): EventSubscription`

Subscribes to presses that occur while the app process is alive (foreground or background). Returns an `EventSubscription`; call `subscription.remove()` to unsubscribe.

- Presses that arrive **before the first JS listener attaches** (e.g. during startup or a dev reload) are buffered natively and flushed as soon as a listener subscribes — nothing is lost.
- The **cold-start** press is *not* delivered here; it is served by `getInitialShortcut()`. Use `useShortcutPress` to handle both channels uniformly.
- The underlying event name is exported as `SHORTCUT_PRESSED_EVENT` (`"AppShortcuts:shortcutPressed"`).

## `useShortcutPress(cb: (item: ShortcutItem) => void): void`

React hook — the recommended way to consume presses. On mount it:

1. resolves `getInitialShortcut()` and fires `cb` if the app was cold-started by a shortcut,
2. then subscribes to press events (flushing any natively buffered presses).

If a host wiring double-reports the launch press through both channels, the hook de-duplicates it: the **first** incoming event that matches the initial shortcut (same `id` + `data`, compared via `shortcutKey`) within a 3-second window is dropped. Later presses of the same shortcut fire normally.

The callback identity may change freely between renders (it is kept in a ref); the subscription itself lives for the component's lifetime.

## `shortcutKey(item: ShortcutItem): string`

Stable identity key (`id` + sorted `data`) used by the de-duplication logic. Exported mainly for testing and advanced consumers.

## Events before listeners: exact delivery semantics

| Scenario | `getInitialShortcut()` | Listener event |
| --- | --- | --- |
| Cold start via shortcut | resolves the item | not delivered (iOS drops the buffered duplicate; Android stores cold presses only) |
| Press while app alive, listener attached | `null` (unless also cold-started earlier) | delivered immediately |
| Press while app alive, before/without listener | unchanged | buffered, flushed on first `addListener` |
