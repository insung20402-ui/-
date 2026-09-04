// 업로드된 사진을 분석해서 자동으로 밝기/대비/채도를 보정하고,
// 키캡 윗면 비율에 맞춰 예쁘게 잘라 텍스처용 캔버스를 만들어주는 유틸.

export interface ImageTransform {
  zoom: number; // 1.0 = 커버 핏 기본, 값이 커질수록 확대
  panX: number; // -0.5 ~ 0.5, 이미지 기준 상대 이동
  panY: number;
  rotationDeg: number; // -45 ~ 45
  brightness: number; // 0.5 ~ 1.5 (1 = 보정 없음)
  contrast: number; // 0.5 ~ 1.5
  saturate: number; // 0 ~ 2
}

export const DEFAULT_MANUAL_TRANSFORM: Pick<ImageTransform, "zoom" | "panX" | "panY" | "rotationDeg"> = {
  zoom: 1,
  panX: 0,
  panY: 0,
  rotationDeg: 0,
};

// 이미지 평균 밝기를 빠르게 추정해서 자동 밝기/대비/채도 값을 계산합니다.
export function computeAutoEnhance(img: HTMLImageElement): Pick<ImageTransform, "brightness" | "contrast" | "saturate"> {
  const sampleSize = 32;
  const c = document.createElement("canvas");
  c.width = sampleSize;
  c.height = sampleSize;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);

  let sum = 0;
  let sumSq = 0;
  let satSum = 0;
  const n = sampleSize * sampleSize;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += lum;
    sumSq += lum * lum;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max - min;
  }

  const mean = sum / n; // 0~1
  const variance = sumSq / n - mean * mean;
  const stdDev = Math.sqrt(Math.max(variance, 0));
  const avgSat = satSum / n;

  // 어두우면 밝게, 밝으면 살짝 눌러주기
  let brightness = 1 + (0.5 - mean) * 0.6;
  brightness = clamp(brightness, 0.85, 1.35);

  // 대비가 낮은(평평한) 사진일수록 대비를 더 올려줌
  let contrast = 1.15 - stdDev * 0.4;
  contrast = clamp(contrast, 1.0, 1.3);

  // 채도가 낮은 사진은 살짝 화사하게
  let saturate = avgSat < 0.15 ? 1.25 : 1.12;
  saturate = clamp(saturate, 1.0, 1.3);

  return { brightness, contrast, saturate };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface ComposeOptions {
  aspect: number; // width / depth 비율 (키캡 윗면)
  transform: ImageTransform;
  cornerRadiusRatio?: number; // 캔버스 짧은 변 대비 모서리 둥글기 비율
  resolution?: number; // 긴 변 픽셀 수
}

// 사진을 키캡 윗면 모양(둥근 사각형)에 맞춰 합성한 캔버스를 반환합니다.
export function composeKeycapCanvas(img: HTMLImageElement, opts: ComposeOptions): HTMLCanvasElement {
  const { aspect, transform, cornerRadiusRatio = 0.14 } = opts;
  const resolution = opts.resolution ?? 512;

  const w = aspect >= 1 ? resolution : Math.round(resolution * aspect);
  const h = aspect >= 1 ? Math.round(resolution / aspect) : resolution;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // 바탕(사진이 완전히 덮지 못하는 경우 대비)
  ctx.fillStyle = "#1b1b1f";
  ctx.fillRect(0, 0, w, h);

  const radius = Math.min(w, h) * cornerRadiusRatio;
  ctx.save();
  roundedRectPath(ctx, 0, 0, w, h, radius);
  ctx.clip();

  ctx.filter = `brightness(${transform.brightness}) contrast(${transform.contrast}) saturate(${transform.saturate})`;

  // cover 핏 계산 후 zoom/pan/rotation 적용
  const canvasAspect = w / h;
  const imgAspect = img.width / img.height;
  let coverScale: number;
  if (imgAspect > canvasAspect) {
    coverScale = h / img.height;
  } else {
    coverScale = w / img.width;
  }
  const scale = coverScale * transform.zoom;

  ctx.translate(w / 2, h / 2);
  ctx.rotate((transform.rotationDeg * Math.PI) / 180);
  ctx.translate(transform.panX * w, transform.panY * h);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  ctx.restore();
  ctx.filter = "none";

  applyKeycapFinish(ctx, w, h, radius);

  return canvas;
}

// 사진 없이 순정 색상 + 각인 글자만 있는 키캡 윗면 텍스처를 만듭니다.
// (외부 폰트/네트워크 의존 없이 canvas 기본 폰트로 그려서 오프라인에서도 항상 동작합니다.)
export interface LegendOptions {
  aspect: number;
  label: string;
  bodyColor: string;
  legendColor: string;
  cornerRadiusRatio?: number;
  resolution?: number;
}

export function composeLegendCanvas(opts: LegendOptions): HTMLCanvasElement {
  const { aspect, label, bodyColor, legendColor, cornerRadiusRatio = 0.14 } = opts;
  const resolution = opts.resolution ?? 256;
  const w = aspect >= 1 ? resolution : Math.round(resolution * aspect);
  const h = aspect >= 1 ? Math.round(resolution / aspect) : resolution;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const radius = Math.min(w, h) * cornerRadiusRatio;
  ctx.save();
  roundedRectPath(ctx, 0, 0, w, h, radius);
  ctx.clip();
  ctx.fillStyle = bodyColor;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  if (label) {
    ctx.fillStyle = legendColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = Math.min(w, h) * (label.length > 3 ? 0.24 : 0.4);
    ctx.font = `600 ${fontSize}px "Segoe UI", "Pretendard", system-ui, sans-serif`;
    ctx.fillText(label, w / 2, h / 2 + fontSize * 0.06, w * 0.82);
  }

  applyKeycapFinish(ctx, w, h, radius);

  return canvas;
}

function applyKeycapFinish(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number) {
  // 은은한 비네트(가장자리 어둡게)로 입체감 부여
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.save();
  roundedRectPath(ctx, 0, 0, w, h, radius);
  ctx.clip();
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // 상단 하이라이트(키캡 광택 느낌)
  const highlight = ctx.createLinearGradient(0, 0, 0, h);
  highlight.addColorStop(0, "rgba(255,255,255,0.16)");
  highlight.addColorStop(0.35, "rgba(255,255,255,0.03)");
  highlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = highlight;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // 테두리 라인
  ctx.save();
  roundedRectPath(ctx, 1, 1, w - 2, h - 2, radius);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.stroke();
  ctx.restore();
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
