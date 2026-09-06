package com.donghaeng.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.drawscope.DrawScope
import com.donghaeng.app.ui.theme.BackgroundWhite
import com.donghaeng.app.ui.theme.SkyBlueDeep
import com.donghaeng.app.ui.theme.SkyBlueSoft
import com.donghaeng.app.ui.theme.SproutGreenSoft

/**
 * 스카이블루에서 화이트로 떨어지는 배경 위에 구름·새싹을 저투명도로 흩뿌린다.
 * 실제 이미지 에셋 대신 벡터 도형으로 그려 별도 리소스 없이도 톤을 유지한다.
 */
@Composable
fun HealingBackground(content: @Composable () -> Unit) {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(SkyBlueDeep, SkyBlueSoft, BackgroundWhite),
                    startY = 0f,
                    endY = 1400f
                )
            )
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawCloud(Offset(size.width * 0.15f, size.height * 0.08f), 70f)
            drawCloud(Offset(size.width * 0.75f, size.height * 0.14f), 55f)
            drawSprout(Offset(size.width * 0.85f, size.height * 0.92f), 90f)
            drawSprout(Offset(size.width * 0.1f, size.height * 0.97f), 60f)
        }
        content()
    }
}

private fun DrawScope.drawCloud(center: Offset, radius: Float) {
    val alpha = 0.16f
    drawCircle(color = BackgroundWhite, radius = radius, center = center, alpha = alpha)
    drawCircle(color = BackgroundWhite, radius = radius * 0.7f, center = center.copy(x = center.x + radius * 0.8f), alpha = alpha)
    drawCircle(color = BackgroundWhite, radius = radius * 0.6f, center = center.copy(x = center.x - radius * 0.75f), alpha = alpha)
}

private fun DrawScope.drawSprout(base: Offset, height: Float) {
    val alpha = 0.14f
    drawLine(
        color = SproutGreenSoft,
        start = base,
        end = base.copy(y = base.y - height),
        strokeWidth = 8f,
        alpha = alpha
    )
    drawCircle(color = SproutGreenSoft, radius = height * 0.22f, center = base.copy(y = base.y - height, x = base.x - height * 0.18f), alpha = alpha)
    drawCircle(color = SproutGreenSoft, radius = height * 0.22f, center = base.copy(y = base.y - height * 0.9f, x = base.x + height * 0.18f), alpha = alpha)
}
