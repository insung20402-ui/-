package com.donghaeng.app.service

import android.app.Notification
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.donghaeng.app.DonghaengApp
import com.donghaeng.app.MainActivity
import android.app.PendingIntent

/**
 * 숨김 모드를 두지 않는다: 이 서비스가 살아있는 한 상태바 알림은 항상 떠 있고,
 * 사용자가 직접 스와이프로 없앨 수 없다(ongoing = true).
 * 모니터링을 끄는 유일한 방법은 앱 내 "모니터링 해제" 버튼이며, 해제 시 서비스가 stopSelf() 된다.
 */
class MonitoringForegroundService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 1001
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildStatusNotification())
        return START_STICKY
    }

    private fun buildStatusNotification(): Notification {
        val openAppIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, DonghaengApp.CHANNEL_MONITORING)
            .setSmallIcon(android.R.drawable.ic_menu_compass) // 실제 배포 시 전용 아이콘으로 교체
            .setContentTitle("동행 · 모니터링 실행 중")
            .setContentText("탭하면 내 기록을 바로 확인할 수 있어요")
            .setOngoing(true) // 스와이프로 제거 불가 — 투명성 원칙
            .setContentIntent(openAppIntent)
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
