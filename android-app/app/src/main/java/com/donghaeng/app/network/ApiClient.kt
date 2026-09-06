package com.donghaeng.app.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/**
 * 서버로는 항상 "집계된 지표"만 전송한다. 알림 원문이나 계좌 정보를 담는 필드는
 * 이 클라이언트 어디에도 존재하지 않는다 — 애초에 호출부(PaymentNotificationListenerService)가
 * 그런 값을 만들어내지 않는다.
 */
object ApiClient {

    // 실제 배포 시 BuildConfig 또는 암호화된 로컬 설정으로 이전할 것.
    private const val BASE_URL = "https://your-server.example.com/api"

    suspend fun submitPaymentEvent(
        deviceHash: String,
        appCategory: String,
        amount: Int,
        occurredAtIso: String
    ): Boolean = post(
        "$BASE_URL/submit_log.php",
        JSONObject().apply {
            put("device_hash", deviceHash)
            put("type", "payment")
            put("app_category", appCategory)
            put("amount", amount)
            put("occurred_at", occurredAtIso)
        }
    )

    suspend fun submitUsageLog(
        deviceHash: String,
        logDate: String,
        nightScreenMinutes: Int,
        targetAppSessions: Int
    ): Boolean = post(
        "$BASE_URL/submit_log.php",
        JSONObject().apply {
            put("device_hash", deviceHash)
            put("type", "usage")
            put("log_date", logDate)
            put("night_screen_minutes", nightScreenMinutes)
            put("target_app_sessions", targetAppSessions)
        }
    )

    private suspend fun post(urlString: String, body: JSONObject): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val connection = URL(urlString).openConnection() as HttpsURLConnection
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.connectTimeout = 8000
                connection.readTimeout = 8000

                OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use {
                    it.write(body.toString())
                }

                val ok = connection.responseCode in 200..299
                connection.disconnect()
                ok
            } catch (e: Exception) {
                // 네트워크 실패 시 조용히 실패하고 다음 주기에 재시도한다 (당사자에게 오류를 노출하지 않음).
                false
            }
        }
}
