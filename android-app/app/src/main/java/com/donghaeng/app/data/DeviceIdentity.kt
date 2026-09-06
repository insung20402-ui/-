package com.donghaeng.app.data

import android.content.Context
import android.provider.Settings
import java.security.MessageDigest

/**
 * 서버에는 Android ID 원본이 아니라 해시값만 전달한다.
 * 솔트는 로컬 보관용으로만 쓰이며 서버로 전송되지 않는다.
 */
object DeviceIdentity {

    private const val LOCAL_SALT = "donghaeng-v1-local-salt"

    fun hash(context: Context): String {
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        val digest = MessageDigest.getInstance("SHA-256")
        val bytes = digest.digest((androidId + LOCAL_SALT).toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
