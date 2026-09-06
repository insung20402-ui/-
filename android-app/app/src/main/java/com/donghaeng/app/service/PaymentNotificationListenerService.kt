package com.donghaeng.app.service

import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.donghaeng.app.data.DeviceIdentity
import com.donghaeng.app.network.ApiClient
import com.donghaeng.app.ui.urgesurfing.UrgeSurfingActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

/**
 * 사용자가 온보딩에서 직접 지정한 은행/페이 앱의 알림만 받는다.
 * 알림 텍스트(원문)는 이 클래스 밖으로 절대 전달되지 않는다:
 *   1) onNotificationPosted에서 즉시 정규식으로 금액만 추출
 *   2) 원문 변수(text)는 로컬 변수로만 존재하다가 함수 종료와 함께 폐기
 *   3) 서버로는 amount(정수)와 appCategory만 전송
 */
class PaymentNotificationListenerService : NotificationListenerService() {

    // 사용자가 설정 화면에서 직접 고른 화이트리스트. (여기서는 대표적인 3개만 예시로 표기)
    private val watchedPackages = mapOf(
        "viva.republica.toss" to AppCategory.PAY,
        "com.kakaopay.app" to AppCategory.PAY,
        "com.kbstar.kbbank" to AppCategory.BANK
    )

    // "12,000원 송금 완료" / "150,000원 결제되었습니다" 등에서 금액만 뽑아낸다.
    private val amountRegex = Regex("""([0-9][0-9,]*)\s*원""")

    private val scope = CoroutineScope(Dispatchers.Default)
    private val recentEventTimestamps = mutableListOf<Long>()

    enum class AppCategory { BANK, PAY, OTHER }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val category = watchedPackages[sbn.packageName] ?: return

        val extras = sbn.notification.extras
        val rawText = (extras.getCharSequence("android.text")?.toString() ?: "") +
            " " + (extras.getCharSequence("android.bigText")?.toString() ?: "")

        val amount = extractAmount(rawText) ?: return
        // rawText는 이 지점 이후로 참조되지 않는다 — 로컬 스코프를 벗어나며 폐기됨.

        val occurredAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(Date())
        val categoryLabel = if (category == AppCategory.BANK) "bank" else "pay"

        registerEventForFrequencyCheck()

        scope.launch {
            val deviceHash = DeviceIdentity.hash(applicationContext)
            ApiClient.submitPaymentEvent(deviceHash, categoryLabel, amount, occurredAt)
        }

        maybeTriggerUrgeSurfing()
    }

    private fun extractAmount(text: String): Int? {
        val match = amountRegex.find(text) ?: return null
        return match.groupValues[1].replace(",", "").toIntOrNull()
    }

    /** 시간당 송금 빈도 계산을 위해 최근 이벤트 시각만 메모리에 유지한다(영구 저장 없음). */
    private fun registerEventForFrequencyCheck() {
        val now = System.currentTimeMillis()
        recentEventTimestamps.add(now)
        recentEventTimestamps.removeAll { now - it > 60 * 60 * 1000 } // 1시간 초과분 제거
    }

    /** 1시간 내 결제 이벤트가 급증하면(예: 3회 이상) 충동 지연 화면을 띄운다. */
    private fun maybeTriggerUrgeSurfing() {
        if (recentEventTimestamps.size < 3) return
        val intent = Intent(this, UrgeSurfingActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intent)
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        // 리스너 연결 상태는 MonitoringForegroundService의 상시 알림 문구에 반영된다.
    }
}
