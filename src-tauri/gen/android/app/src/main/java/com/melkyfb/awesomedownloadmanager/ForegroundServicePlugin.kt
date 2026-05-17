package com.melkyfb.awesomedownloadmanager

import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@TauriPlugin
class ForegroundServicePlugin(private val activity: android.app.Activity) : Plugin(activity) {

    @Command
    fun start(invoke: Invoke) {
        val args = invoke.parseArgs(ProgressArgs::class.java)
        val intent = Intent(activity, DownloadService::class.java).apply {
            putExtra(DownloadService.EXTRA_TITLE, args.filename ?: "Baixando...")
            putExtra(DownloadService.EXTRA_PROGRESS, args.progress ?: 0)
        }
        activity.startForegroundService(intent)
        invoke.resolve()
    }

    @Command
    fun stop(invoke: Invoke) {
        activity.stopService(Intent(activity, DownloadService::class.java))
        invoke.resolve()
    }

    data class ProgressArgs(val filename: String?, val progress: Int?)
}
