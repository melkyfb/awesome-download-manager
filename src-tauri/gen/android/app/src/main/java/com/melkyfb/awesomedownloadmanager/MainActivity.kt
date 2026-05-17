package com.melkyfb.awesomedownloadmanager

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import app.tauri.plugin.PluginManager

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    PluginManager.load(webView, "foreground-service", ForegroundServicePlugin(this), "{}")
  }
}
