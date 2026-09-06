package com.donghaeng.app.worker

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.donghaeng.app.DonghaengApp
import com.donghaeng.app.MainActivity
import java.util.concurrent.TimeUnit

/**
 * 완전히 오프라인으로 동작하는 로컬 다짐 알림. 서버 통신이 전혀 없어
 * 네트워크가 끊긴 상황에서도 다짐 문구는 꾸준히 도착한다.
 */
class AffirmationWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    companion object {
        private const val WORK_NAME = "affirmation_reminder"
        private const val NOTIFICATION_ID = 2001

        private val affirmations = listOf(
            "지금 이 순간의 선택이 내일의 나를 만들어요.",
            "충동은 파도처럼 왔다가 지나가요. 잠시만 견뎌봐요.",
            "여기까지 온 것만으로도 이미 잘하고 있어요.",
            "혼자가 아니에요. 동행이 함께 지켜보고 있어요."
        )

        /** intervalHours: 사용자가 설정 화면에서 고른 주기(예: 3시간). 최소 15분(WorkManager 제약). */
        fun schedule(context: Context, intervalHours: Long) {
            val request = PeriodicWorkRequestBuilder<AffirmationWorker>(intervalHours, TimeUnit.HOURS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        }
    }

    override suspend fun doWork(): Result {
        val message = affirmations.random()

        val openAppIntent = PendingIntent.getActivity(
            applicationContext, 0,
            Intent(applicationContext, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(applicationContext, DonghaengApp.CHANNEL_AFFIRMATION)
            .setSmallIcon(android.R.drawable.ic_menu_myplaces)
            .setContentTitle("오늘의 다짐")
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setContentIntent(openAppIntent)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(applicationContext).notify(NOTIFICATION_ID, notification)
        return Result.success()
    }
}
