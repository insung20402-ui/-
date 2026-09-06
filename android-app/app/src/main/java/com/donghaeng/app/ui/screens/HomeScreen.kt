package com.donghaeng.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.donghaeng.app.ui.components.HealingBackground
import com.donghaeng.app.ui.theme.*

data class HomeUiState(
    val nickname: String = "은수",
    val stableDays: Int = 12,
    val weeklyGoalProgress: Float = 0.7f, // 0f..1f
    val monitoringActive: Boolean = true,
    val affirmation: String = "오늘도 스스로를 지켜낸 하루였어요. 잘하고 있어요."
)

@Composable
fun HomeScreen(state: HomeUiState = HomeUiState()) {
    HealingBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp)
                .padding(top = 56.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            MonitoringStatusChip(active = state.monitoringActive)

            Text(
                text = "${state.nickname}님, 오늘도 함께해요",
                style = MaterialTheme.typography.headlineMedium,
                color = InkPrimary
            )

            ProgressCard(stableDays = state.stableDays, progress = state.weeklyGoalProgress)

            AffirmationCard(message = state.affirmation)

            SharedAccessCard()
        }
    }
}

/** 숨김 모드 없이 항상 보이는 모니터링 상태 표시 — 상태바 알림과 동일한 문구를 화면에도 노출한다. */
@Composable
private fun MonitoringStatusChip(active: Boolean) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .clip(RoundedCornerShape(100))
            .background(CardWhite.copy(alpha = 0.85f))
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(RoundedCornerShape(50))
                .background(if (active) SproutGreenDeep else InkSecondary)
        )
        Text(
            text = if (active) "동행 · 모니터링 실행 중" else "모니터링 꺼짐",
            style = MaterialTheme.typography.labelLarge,
            color = InkSecondary
        )
    }
}

@Composable
private fun ProgressCard(stableDays: Int, progress: Float) {
    ElevatedCard(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = CardWhite)
    ) {
        Column(modifier = Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("안정 기록", style = MaterialTheme.typography.titleMedium, color = InkSecondary)
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    "$stableDays",
                    style = MaterialTheme.typography.headlineMedium,
                    color = SproutGreenDeep,
                    fontWeight = FontWeight.Bold
                )
                Text("일째 유지 중", style = MaterialTheme.typography.bodyLarge, color = InkPrimary,
                    modifier = Modifier.padding(bottom = 4.dp))
            }
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(10.dp)
                    .clip(RoundedCornerShape(100)),
                color = SproutGreenDeep,
                trackColor = SproutGreenSoft.copy(alpha = 0.4f)
            )
            Text("이번 주 목표의 ${(progress * 100).toInt()}%를 지켜냈어요", style = MaterialTheme.typography.bodyMedium, color = InkSecondary)
        }
    }
}

@Composable
private fun AffirmationCard(message: String) {
    ElevatedCard(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = WarmYellowSoft)
    ) {
        Column(modifier = Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("오늘의 응원", style = MaterialTheme.typography.titleMedium, color = InkPrimary)
            Text(message, style = MaterialTheme.typography.bodyLarge, color = InkPrimary)
        }
    }
}

/** 정보 열람권의 평등: 본인이 보는 화면과 보호자 대시보드가 같은 데이터를 보여준다는 점을 명시. */
@Composable
private fun SharedAccessCard() {
    ElevatedCard(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = SkyBlueSoft)
    ) {
        Column(modifier = Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("같이 보는 기록", style = MaterialTheme.typography.titleMedium, color = InkPrimary)
            Text(
                "이 화면의 기록은 보호자 대시보드에서도 동일하게 보여요. 서로 숨기는 정보는 없어요.",
                style = MaterialTheme.typography.bodyMedium,
                color = InkSecondary
            )
        }
    }
}
