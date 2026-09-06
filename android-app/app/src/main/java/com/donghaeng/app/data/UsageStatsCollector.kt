package com.donghaeng.app.data

import android.app.usage.UsageStatsManager
import android.content.Context
import java.util.*

/**
 * 심야 시간대(기본 00:00~06:00) 화면 사용 시간과 지정 앱 실행 횟수만 계산한다.
 * 어떤 화면을 봤는지, 무엇을 입력했는지는 이 클래스가 다루는 범위 밖이다.
 */
class UsageStatsCollector(private val context: Context) {

    data class NightlySummary(
        val nightScreenMinutes: Int,
        val targetAppSessions: Int
    )

    // 사용자가 온보딩에서 직접 고른 "심야에 특히 주의하고 싶은 앱" 목록의 예시.
    private val targetPackages = setOf(
        "org.telegram.messenger",
        "com.discord",
        "com.android.chrome"
    )

    fun collectLastNight(nightStartMin: Int = 0, nightEndMin: Int = 360): NightlySummary {
        val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

        val (rangeStart, rangeEnd) = lastNightRange(nightStartMin, nightEndMin)

        val events = manager.queryEvents(rangeStart, rangeEnd)
        var screenOnAt: Long? = null
        var totalScreenMs = 0L
        var targetAppSessions = 0

        val event = android.app.usage.UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            when (event.eventType) {
                android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND -> {
                    if (screenOnAt == null) screenOnAt = event.timeStamp
                    if (event.packageName in targetPackages) targetAppSessions++
                }
                android.app.usage.UsageEvents.Event.MOVE_TO_BACKGROUND -> {
                    screenOnAt?.let { totalScreenMs += (event.timeStamp - it).coerceAtLeast(0) }
                    screenOnAt = null
                }
            }
        }

        return NightlySummary(
            nightScreenMinutes = (totalScreenMs / 60_000).toInt(),
            targetAppSessions = targetAppSessions
        )
    }

    private fun lastNightRange(nightStartMin: Int, nightEndMin: Int): Pair<Long, Long> {
        val calendar = Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, -1)
            set(Calendar.HOUR_OF_DAY, nightStartMin / 60)
            set(Calendar.MINUTE, nightStartMin % 60)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val start = calendar.timeInMillis
        val end = start + (nightEndMin - nightStartMin) * 60_000L
        return start to end
    }
}
