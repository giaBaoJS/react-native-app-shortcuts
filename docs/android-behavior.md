# Android behavior

Android integration is **zero-config** for apps based on the standard React Native template — the module is autolinked and hooks into the activity lifecycle itself. This document describes exactly what it does so you can verify assumptions in a customized app.

## Requirements

| Requirement | Why | RN template default |
| --- | --- | --- |
| API 25+ (Android 7.1) at runtime | `ShortcutManager` exists since API 25 | min SDK is usually 24; the library no-ops below 25 (see below) |
| `android:launchMode="singleTask"` on `MainActivity` | Warm presses must arrive as `onNewIntent` on the existing activity instead of relaunching it | ✅ already set |
| Autolinking | Registers `AppShortcutsPackage` | ✅ |

## Behavior below API 25

All methods are safe no-ops with resolved promises:

- `setShortcuts(...)` → resolves, does nothing (documented behavior).
- `clearShortcuts()` → resolves.
- `getShortcuts()` → resolves `[]`.
- `getInitialShortcut()` → resolves `null` (shortcuts can't exist).

## How shortcuts are built

Each `ShortcutItem` becomes a `ShortcutInfo` with:

- `shortLabel` = `title`
- `longLabel` = `subtitle`, falling back to `title`
- icon = `Icon.createWithResource` using a resource looked up **by name in the host app** — first in `drawable`, then in `mipmap`. A missing resource is skipped gracefully (text-only shortcut, no crash).
- intent =
  - `action` = `"com.appshortcuts.SHORTCUT"`
  - component = the app's main (launcher) activity
  - flags = `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TOP`
  - a **single string extra** `"com.appshortcuts.ITEM"` containing the full item encoded as JSON: `{"id","title","subtitle?","iconName?","data?"}`. This is the documented payload format (data is not flattened into individual extras).

`setShortcuts` calls `ShortcutManager.setDynamicShortcuts`, replacing all previous dynamic shortcuts. Registering more than `getMaxShortcutCountPerActivity()` (typically 4–5) makes the promise reject with code `set_shortcuts_failed`. Static shortcuts from `shortcuts.xml` are not touched.

## How presses are delivered

When the user taps a shortcut, the launcher starts the main activity with the intent above. The module inspects intents in three places:

1. **Module initialization** — if the current activity's intent carries an unconsumed shortcut press, it is handled (cold-start path).
2. **`onNewIntent`** (via `ActivityEventListener`) — warm press on the living activity (`singleTask`).
3. **`onHostResume`** — covers the corner case where the process was alive but the activity had been destroyed: the launcher then starts a *new* activity (no `onNewIntent`), and the press is found on its intent at resume.

Routing rule (mirrors iOS):

- If **no JS listener has ever attached in this process** and no initial shortcut is recorded yet, the press is stored as the **initial shortcut** — served by `getInitialShortcut()`, not emitted as an event.
- Otherwise it is a **warm press**: emitted as the `AppShortcuts:shortcutPressed` event if a listener is attached, or **buffered** and flushed as soon as the first listener attaches (so presses during startup/reload are never lost).

### Consumed intents

After a press is read, the library marks the intent with a `"com.appshortcuts.CONSUMED"` extra. Because Android re-delivers the same intent when an activity is recreated (rotation, dark-mode switch, ...), this guard ensures a press is handled exactly once. The recorded initial shortcut itself is process-wide state, so `getInitialShortcut()` keeps returning the same item across JS reloads until the process dies.

## `getShortcuts()` round-trip

Items are reconstructed from the JSON extra on each `ShortcutInfo`'s intent, so everything (including `iconName` and `data`) round-trips for shortcuts set by this library. Dynamic shortcuts registered by other code are reported best-effort as `{ id, title, subtitle? }`.

## Icons

Put a drawable in your app, e.g. `android/app/src/main/res/drawable/ic_compose.xml` (vector drawables recommended, as in the [example app](../example/android/app/src/main/res/drawable)), and pass `iconName: 'ic_compose'`. Adaptive-icon guidance from Google applies; simple single-color vectors look best on most launchers.
