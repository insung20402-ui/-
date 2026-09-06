package com.donghaeng.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class DonghaengApp : Application() {

    companion object {
        const val CHANNEL_MONITORING = "monitoring_status"
        const val CHANNEL_AFFIRMATION = "daily_affirmation"
        const val CHANNEL_URGENT = "urgent_alert"
    }

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_MONITORING,
                    "모니터링 실행 상태",
                    NotificationManager.IMPORTANCE_LOW // 상시 표시되지만 소리는 울리지 않음
                ).apply { description = "동행이 실행 중임을 항상 알려주는 채널입니다." }
            )

            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_AFFIRMATION,
                    "다짐 알림",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply { description = "설정한 주기마다 오는 다짐 문구 알림입니다." }
            )

            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_URGENT,
                    "긴급 알림",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply { description = "위험도 임계치 초과 시 본인·보호자에게 동시에 전달됩니다." }
            )
        }
    }
}
