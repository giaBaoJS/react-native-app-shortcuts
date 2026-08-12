package com.appshortcuts

import android.app.Activity
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.os.Build
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject

class AppShortcutsModule(reactContext: ReactApplicationContext) :
  NativeAppShortcutsSpec(reactContext), ActivityEventListener, LifecycleEventListener {

  /** Press events (as item JSON) waiting for the first JS listener. */
  private val pendingEvents = mutableListOf<String>()
  private var listenerCount = 0

  init {
    reactContext.addActivityEventListener(this)
    reactContext.addLifecycleEventListener(this)
    // The module is created lazily from JS, so an activity usually exists
    // already; capture a possible cold-start shortcut intent right away.
    handleIntentJson(extractItemJson(reactApplicationContext.currentActivity?.intent))
  }

  override fun invalidate() {
    reactApplicationContext.removeActivityEventListener(this)
    reactApplicationContext.removeLifecycleEventListener(this)
    super.invalidate()
  }

  // region Press delivery

  /**
   * Reads and consumes a shortcut press from [intent]. Returns the item JSON,
   * or null when the intent is not an unconsumed shortcut press. Marking the
   * intent consumed prevents re-delivery when the activity is recreated
   * (rotation, theme change) with the same intent.
   */
  private fun extractItemJson(intent: Intent?): String? {
    if (intent == null || intent.action != ACTION_SHORTCUT) {
      return null
    }
    if (intent.getBooleanExtra(EXTRA_CONSUMED, false)) {
      return null
    }
    val json = intent.getStringExtra(EXTRA_ITEM) ?: return null
    intent.putExtra(EXTRA_CONSUMED, true)
    return json
  }

  /**
   * Routes a consumed press: before any JS listener has ever attached in this
   * process it is the cold-start shortcut (served by getInitialShortcut);
   * afterwards it is a warm press and is emitted (or buffered until the
   * current listeners attach).
   */
  private fun handleIntentJson(json: String?) {
    if (json == null) {
      return
    }
    synchronized(Companion) {
      if (!listenersEverAttached && initialShortcutJson == null) {
        initialShortcutJson = json
        return
      }
    }
    emitOrBuffer(json)
  }

  private fun emitOrBuffer(json: String) {
    val emitNow = synchronized(this) {
      if (listenerCount > 0 && reactApplicationContext.hasActiveReactInstance()) {
        true
      } else {
        pendingEvents.add(json)
        false
      }
    }
    if (emitNow) {
      emit(json)
    }
  }

  private fun emit(json: String) {
    reactApplicationContext.emitDeviceEvent(EVENT_NAME, jsonToItemMap(json))
  }

  override fun onNewIntent(intent: Intent) {
    // Warm press: the launcher re-delivered the main activity (singleTask).
    extractItemJson(intent)?.let { emitOrBuffer(it) }
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) = Unit

  override fun onHostResume() {
    // Covers presses that recreated the activity while the process was alive
    // (onNewIntent does not fire in that case) as well as cold starts when
    // the module was created before the activity was attached.
    handleIntentJson(extractItemJson(reactApplicationContext.currentActivity?.intent))
  }

  override fun onHostPause() = Unit

  override fun onHostDestroy() = Unit

  override fun addListener(eventName: String) {
    val toFlush = synchronized(this) {
      listenerCount += 1
      synchronized(Companion) { listenersEverAttached = true }
      if (pendingEvents.isEmpty()) {
        emptyList()
      } else {
        val copy = pendingEvents.toList()
        pendingEvents.clear()
        copy
      }
    }
    toFlush.forEach { emit(it) }
  }

  override fun removeListeners(count: Double) {
    synchronized(this) {
      listenerCount = maxOf(0, listenerCount - count.toInt())
    }
  }

  // endregion

  // region Shortcut management

  private fun shortcutManager(): ShortcutManager? =
    reactApplicationContext.getSystemService(ShortcutManager::class.java)

  override fun setShortcuts(shortcuts: ReadableArray, promise: Promise) {
    if (Build.VERSION.SDK_INT < MIN_API_LEVEL) {
      // Documented no-op below API 25.
      promise.resolve(null)
      return
    }
    val manager = shortcutManager()
    if (manager == null) {
      promise.reject("unavailable", "ShortcutManager is not available")
      return
    }

    try {
      val infos = mutableListOf<ShortcutInfo>()
      for (index in 0 until shortcuts.size()) {
        val item = shortcuts.getMap(index)
          ?: throw IllegalArgumentException("Shortcut at index $index must be an object")
        infos.add(buildShortcutInfo(item, index))
      }
      manager.dynamicShortcuts = infos
      promise.resolve(null)
    } catch (error: IllegalArgumentException) {
      promise.reject("invalid_shortcut", error.message, error)
    } catch (error: Exception) {
      promise.reject("set_shortcuts_failed", error.message, error)
    }
  }

  override fun clearShortcuts(promise: Promise) {
    if (Build.VERSION.SDK_INT >= MIN_API_LEVEL) {
      shortcutManager()?.removeAllDynamicShortcuts()
    }
    promise.resolve(null)
  }

  override fun getShortcuts(promise: Promise) {
    val result = Arguments.createArray()
    if (Build.VERSION.SDK_INT >= MIN_API_LEVEL) {
      shortcutManager()?.dynamicShortcuts?.forEach { info ->
        val json = info.intent?.getStringExtra(EXTRA_ITEM)
        if (json != null) {
          result.pushMap(jsonToItemMap(json))
        } else {
          // Not one of ours (or intent withheld): reconstruct what we can.
          val fallback = Arguments.createMap()
          fallback.putString("id", info.id)
          fallback.putString("title", info.shortLabel?.toString() ?: info.id)
          info.longLabel?.let { fallback.putString("subtitle", it.toString()) }
          result.pushMap(fallback)
        }
      }
    }
    promise.resolve(result)
  }

  override fun getInitialShortcut(promise: Promise) {
    // Lazily capture in case the activity was not attached at module init.
    handleIntentJson(extractItemJson(reactApplicationContext.currentActivity?.intent))
    val json = synchronized(Companion) { initialShortcutJson }
    promise.resolve(json?.let { jsonToItemMap(it) })
  }

  private fun buildShortcutInfo(item: ReadableMap, index: Int): ShortcutInfo {
    val id = item.getString("id")
    val title = item.getString("title")
    if (id.isNullOrBlank() || title.isNullOrBlank()) {
      throw IllegalArgumentException(
        "Shortcut at index $index must have a non-empty string id and title"
      )
    }
    val subtitle = if (item.hasKey("subtitle")) item.getString("subtitle") else null
    val iconName = if (item.hasKey("iconName")) item.getString("iconName") else null

    val context = reactApplicationContext
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: throw IllegalStateException("Could not resolve the app's launch intent")

    val intent = Intent(ACTION_SHORTCUT)
    intent.component = launchIntent.component
    intent.setPackage(context.packageName)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    intent.putExtra(EXTRA_ITEM, itemToJson(item, id, title))

    val builder = ShortcutInfo.Builder(context, id)
      .setShortLabel(title)
      .setLongLabel(if (subtitle.isNullOrBlank()) title else subtitle)
      .setIntent(intent)

    if (!iconName.isNullOrBlank()) {
      val resId = resolveDrawable(iconName)
      if (resId != 0) {
        builder.setIcon(Icon.createWithResource(context, resId))
      }
      // Missing drawables fall back gracefully to a text-only shortcut.
    }

    return builder.build()
  }

  /** Looks up a drawable (then mipmap) resource by name in the host app. */
  private fun resolveDrawable(name: String): Int {
    val context = reactApplicationContext
    val resources = context.resources
    val drawableId = resources.getIdentifier(name, "drawable", context.packageName)
    if (drawableId != 0) {
      return drawableId
    }
    return resources.getIdentifier(name, "mipmap", context.packageName)
  }

  // endregion

  // region Serialization

  private fun itemToJson(item: ReadableMap, id: String, title: String): String {
    val json = JSONObject()
    json.put("id", id)
    json.put("title", title)
    item.getString("subtitle")?.takeIf { item.hasKey("subtitle") }?.let {
      json.put("subtitle", it)
    }
    item.getString("iconName")?.takeIf { item.hasKey("iconName") }?.let {
      json.put("iconName", it)
    }
    if (item.hasKey("data")) {
      item.getMap("data")?.let { data ->
        val dataJson = JSONObject()
        val iterator = data.keySetIterator()
        while (iterator.hasNextKey()) {
          val key = iterator.nextKey()
          dataJson.put(key, data.getString(key) ?: "")
        }
        json.put("data", dataJson)
      }
    }
    return json.toString()
  }

  private fun jsonToItemMap(json: String): WritableMap {
    val map = Arguments.createMap()
    try {
      val parsed = JSONObject(json)
      map.putString("id", parsed.optString("id"))
      map.putString("title", parsed.optString("title"))
      if (parsed.has("subtitle")) {
        map.putString("subtitle", parsed.optString("subtitle"))
      }
      if (parsed.has("iconName")) {
        map.putString("iconName", parsed.optString("iconName"))
      }
      parsed.optJSONObject("data")?.let { data ->
        val dataMap = Arguments.createMap()
        data.keys().forEach { key -> dataMap.putString(key, data.optString(key)) }
        map.putMap("data", dataMap)
      }
    } catch (_: Exception) {
      // Corrupt payloads yield an empty item rather than a crash.
    }
    return map
  }

  // endregion

  companion object {
    const val NAME = NativeAppShortcutsSpec.NAME

    /** Action carried by the intent launched when a shortcut is pressed. */
    const val ACTION_SHORTCUT = "com.appshortcuts.SHORTCUT"

    /** String extra holding the full shortcut item encoded as JSON. */
    const val EXTRA_ITEM = "com.appshortcuts.ITEM"

    private const val EXTRA_CONSUMED = "com.appshortcuts.CONSUMED"
    private const val EVENT_NAME = "AppShortcuts:shortcutPressed"
    private const val MIN_API_LEVEL = 25 // Build.VERSION_CODES.N_MR1

    /** Process-wide: the shortcut that cold-started the app, as item JSON. */
    private var initialShortcutJson: String? = null

    /** Process-wide: whether any JS listener has ever attached. */
    private var listenersEverAttached = false
  }
}
