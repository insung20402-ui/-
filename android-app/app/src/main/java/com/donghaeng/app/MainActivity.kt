package com.donghaeng.app

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.content.ContextCompat
import com.donghaeng.app.service.MonitoringForegroundService
import com.donghaeng.app.ui.screens.HomeScreen
import com.donghaeng.app.ui.theme.DonghaengTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 온보딩에서 동의를 마친 뒤부터는 항상 실행되는 포그라운드 서비스로 시작한다.
        // (동의 화면 자체는 이 저장소의 온보딩 플로우에서 별도로 구현)
        val serviceIntent = Intent(this, MonitoringForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(this, serviceIntent)
        } else {
            startService(serviceIntent)
        }

        setContent {
            DonghaengTheme {
                HomeScreen()
            }
        }
    }
}
