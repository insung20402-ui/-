package com.donghaeng.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

// 채도 높은 빨강/검정/네온 계열은 팔레트 자체에 존재하지 않는다.
private val DonghaengLightColors = lightColorScheme(
    primary = SkyBlueDeep,
    onPrimary = InkPrimary,
    primaryContainer = SkyBlueSoft,
    secondary = SproutGreenDeep,
    onSecondary = BackgroundWhite,
    secondaryContainer = SproutGreenSoft,
    tertiary = WarmYellowDeep,
    tertiaryContainer = WarmYellowSoft,
    background = BackgroundWhite,
    surface = SoftWhite,
    surfaceVariant = CardWhite,
    onSurface = InkPrimary,
    onSurfaceVariant = InkSecondary,
    error = GentleErrorDeep,
    errorContainer = GentleError
)

// 야간에도 눈부심 없이 같은 정서를 유지하도록 명도만 낮추고 색상 관계는 유지한다.
private val DonghaengDarkColors = darkColorScheme(
    primary = SkyBlueDeep,
    onPrimary = NightOnColor,
    primaryContainer = NightPrimaryContainer,
    secondary = SproutGreenSoft,
    onSecondary = NightOnColor,
    secondaryContainer = NightSecondaryContainer,
    tertiary = WarmYellowSoft,
    tertiaryContainer = NightTertiaryContainer,
    background = NightBackground,
    surface = NightSurface,
    surfaceVariant = NightSurfaceVariant,
    onSurface = NightTextPrimary,
    onSurfaceVariant = NightTextSecondary,
    error = GentleError,
    errorContainer = NightErrorContainer
)

@Composable
fun DonghaengTheme(darkTheme: Boolean = false, content: @Composable () -> Unit) {
    val colors = if (darkTheme) DonghaengDarkColors else DonghaengLightColors
    MaterialTheme(
        colorScheme = colors,
        typography = DonghaengTypography,
        content = content
    )
}
