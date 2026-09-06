package com.donghaeng.app.ui.urgesurfing

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.unit.dp
import com.donghaeng.app.ui.theme.DonghaengTheme
import com.donghaeng.app.ui.theme.InkPrimary
import com.donghaeng.app.ui.theme.SkyBlueDeep
import com.donghaeng.app.ui.theme.SkyBlueSoft

/**
 * 지정 결제 앱에서 짧은 시간에 반복 결제가 감지될 때만 노출되는 화면.
 * 다른 앱 위에 그리는 오버레이(SYSTEM_ALERT_WINDOW)가 아니라 독립된 전체화면 Activity로 구현해,
 * 악용 소지가 큰 오버레이 권한을 애초에 요청하지 않는다.
 */
class UrgeSurfingActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            DonghaengTheme {
                UrgeSurfingScreen(onDone = { finish() })
            }
        }
    }
}

@Composable
private fun UrgeSurfingScreen(onDone: () -> Unit) {
    val transition = rememberInfiniteTransition(label = "breathing")
    val scale by transition.animateFloat(
        initialValue = 0.8f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 4000),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SkyBlueSoft),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            "잠깐, 4초만 함께 숨을 쉬어봐요",
            style = MaterialTheme.typography.titleLarge,
            color = InkPrimary
        )
        Spacer(Modifier.height(40.dp))
        Box(
            modifier = Modifier
                .size(160.dp)
                .scale(scale)
                .clip(CircleShape)
                .background(SkyBlueDeep)
        )
        Spacer(Modifier.height(40.dp))
        Text(
            "지금의 충동은 몇 분 안에 지나갈 거예요.\n숨을 고르는 동안 잠시 기다려봐요.",
            style = MaterialTheme.typography.bodyLarge,
            color = InkPrimary
        )
        Spacer(Modifier.height(48.dp))
        Button(
            onClick = onDone,
            colors = ButtonDefaults.buttonColors(containerColor = SkyBlueDeep)
        ) {
            Text("괜찮아요, 이제 넘어갈게요")
        }
    }
}
