package com.appshortcuts

import com.facebook.react.bridge.ReactApplicationContext

class AppShortcutsModule(reactContext: ReactApplicationContext) :
  NativeAppShortcutsSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeAppShortcutsSpec.NAME
  }
}
