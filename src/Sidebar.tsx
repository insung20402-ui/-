import { useEffect, useMemo, useRef, useState } from "react";
import { useKeycapStore, makeDefaultTransform, DEFAULT_KEYCAP_COLOR } from "./store";
import {
  computeAutoEnhance,
  composeKeycapCanvas,
  fileToDataUrl,
  loadImage,
  ImageTransform,
} from "./imageProcessing";
import { buildKeyboard } from "./keyboardLayout";
import { GAP, UNIT } from "./Keycap";

const BODY_COLORS = ["#2b2d33", "#ececec", "#1c1e22", "#c0392b", "#2d6cdf", "#1e8f5f", "#e8b53a", "#7b5ea7"];

function useKeySpecLookup() {
  return useMemo(() => {
    const { keys } = buildKeyboard();
    const map = new Map(keys.map((k) => [k.id, k]));
    return map;
  }, []);
}

interface PreviewProps {
  src: string;
  transform: ImageTransform;
  aspect: number;
  onPan: (dx: number, dy: number) => void;
  onZoom: (delta: number) => void;
}

function PhotoPreview({ src, transform, aspect, onPan, onZoom }: PreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadImage(src).then((img) => {
      if (cancelled) return;
      const canvas = composeKeycapCanvas(img, { aspect, transform, resolution: 420 });
      const target = canvasRef.current;
      if (!target) return;
      target.width = canvas.width;
      target.height = canvas.height;
      const ctx = target.getContext("2d")!;
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(canvas, 0, 0);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, JSON.stringify(transform), aspect]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragging.current = { x: e.clientX, y: e.clientY };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - dragging.current.x) / rect.width;
    const dy = (e.clientY - dragging.current.y) / rect.height;
    dragging.current = { x: e.clientX, y: e.clientY };
    onPan(dx, dy);
  };
  const handlePointerUp = () => {
    dragging.current = null;
  };
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    onZoom(e.deltaY > 0 ? -0.05 : 0.05);
  };

  return (
    <canvas
      ref={canvasRef}
      className="photo-preview"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    />
  );
}

export function Sidebar() {
  const keySpecs = useKeySpecLookup();
  const selectedKeyId = useKeycapStore((s) => s.selectedKeyId);
  const multiSelectIds = useKeycapStore((s) => s.multiSelectIds);
  const keys = useKeycapStore((s) => s.keys);
  const legendColor = useKeycapStore((s) => s.legendColor);
  const setKeyImage = useKeycapStore((s) => s.setKeyImage);
  const updateTransform = useKeycapStore((s) => s.updateTransform);
  const clearKeyImage = useKeycapStore((s) => s.clearKeyImage);
  const setKeyColor = useKeycapStore((s) => s.setKeyColor);
  const applyImageToKeys = useKeycapStore((s) => s.applyImageToKeys);
  const setLegendColor = useKeycapStore((s) => s.setLegendColor);
  const exportDesign = useKeycapStore((s) => s.exportDesign);
  const importDesign = useKeycapStore((s) => s.importDesign);
  const resetAll = useKeycapStore((s) => s.resetAll);

  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const selectedSpec = selectedKeyId ? keySpecs.get(selectedKeyId) : undefined;
  const selectedCustom = selectedKeyId ? keys[selectedKeyId] : undefined;

  const aspect = selectedSpec
    ? (selectedSpec.widthU * UNIT - GAP) / (selectedSpec.depthU * UNIT - GAP)
    : 1;

  const handleFile = async (file: File) => {
    if (!selectedKeyId) return;
    setIsProcessing(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const img = await loadImage(dataUrl);
      const auto = computeAutoEnhance(img);
      const transform: ImageTransform = { ...makeDefaultTransform(), ...auto };
      setKeyImage(selectedKeyId, dataUrl, transform);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReAuto = async () => {
    if (!selectedKeyId || !selectedCustom?.image) return;
    const img = await loadImage(selectedCustom.image.src);
    const auto = computeAutoEnhance(img);
    updateTransform(selectedKeyId, { ...makeDefaultTransform(), ...auto });
  };

  const handleApplyToOthers = () => {
    if (!selectedKeyId) return;
    const others = multiSelectIds.filter((id) => id !== selectedKeyId);
    if (others.length === 0) return;
    applyImageToKeys(selectedKeyId, others);
  };

  const handleColorPick = (color: string) => {
    const targets = multiSelectIds.length > 0 ? multiSelectIds : selectedKeyId ? [selectedKeyId] : [];
    targets.forEach((id) => setKeyColor(id, color));
  };

  const handleExport = () => {
    const json = exportDesign();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custom-keycap-design.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    importDesign(text);
  };

  const filledCount = Object.values(keys).filter((k) => k.image).length;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>커스텀 키캡 스튜디오</h1>
        <p className="subtitle">키를 클릭하고 사진을 올리면 자동으로 예쁘게 다듬어 키캡에 입혀줘요.</p>
      </div>

      <div className="section">
        <div className="section-title">선택된 키</div>
        {selectedSpec ? (
          <div className="selected-key-chip">
            <span className="key-label">{selectedSpec.label || "Space"}</span>
            {multiSelectIds.length > 1 && <span className="multi-badge">+{multiSelectIds.length - 1}개 함께 선택됨</span>}
          </div>
        ) : (
          <div className="hint">3D 키보드에서 키를 클릭해 선택하세요. Shift+클릭으로 여러 키를 함께 선택할 수 있어요.</div>
        )}
      </div>

      {selectedSpec && (
        <>
          <div className="section">
            <div className="section-title">사진 업로드</div>
            <div
              className="dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
            >
              {isProcessing ? "자동 보정 중..." : "클릭하거나 사진을 끌어다 놓으세요"}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </div>

          {selectedCustom?.image && (
            <div className="section">
              <div className="section-title">미리보기 · 드래그로 위치 조정 / 휠로 확대</div>
              <PhotoPreview
                src={selectedCustom.image.src}
                transform={selectedCustom.image.transform}
                aspect={aspect}
                onPan={(dx, dy) =>
                  updateTransform(selectedKeyId!, {
                    panX: selectedCustom.image!.transform.panX + dx,
                    panY: selectedCustom.image!.transform.panY + dy,
                  })
                }
                onZoom={(delta) =>
                  updateTransform(selectedKeyId!, {
                    zoom: clamp(selectedCustom.image!.transform.zoom + delta, 0.6, 3),
                  })
                }
              />

              <div className="slider-row">
                <label>확대</label>
                <input
                  type="range"
                  min={0.6}
                  max={3}
                  step={0.01}
                  value={selectedCustom.image.transform.zoom}
                  onChange={(e) => updateTransform(selectedKeyId!, { zoom: Number(e.target.value) })}
                />
              </div>
              <div className="slider-row">
                <label>회전</label>
                <input
                  type="range"
                  min={-45}
                  max={45}
                  step={1}
                  value={selectedCustom.image.transform.rotationDeg}
                  onChange={(e) => updateTransform(selectedKeyId!, { rotationDeg: Number(e.target.value) })}
                />
              </div>
              <div className="slider-row">
                <label>밝기</label>
                <input
                  type="range"
                  min={0.5}
                  max={1.6}
                  step={0.01}
                  value={selectedCustom.image.transform.brightness}
                  onChange={(e) => updateTransform(selectedKeyId!, { brightness: Number(e.target.value) })}
                />
              </div>
              <div className="slider-row">
                <label>대비</label>
                <input
                  type="range"
                  min={0.5}
                  max={1.6}
                  step={0.01}
                  value={selectedCustom.image.transform.contrast}
                  onChange={(e) => updateTransform(selectedKeyId!, { contrast: Number(e.target.value) })}
                />
              </div>
              <div className="slider-row">
                <label>채도</label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.01}
                  value={selectedCustom.image.transform.saturate}
                  onChange={(e) => updateTransform(selectedKeyId!, { saturate: Number(e.target.value) })}
                />
              </div>

              <div className="button-row">
                <button onClick={handleReAuto}>자동 보정 다시 적용</button>
                <button className="danger" onClick={() => clearKeyImage(selectedKeyId!)}>
                  사진 제거
                </button>
              </div>

              {multiSelectIds.length > 1 && (
                <button className="primary full" onClick={handleApplyToOthers}>
                  선택한 다른 {multiSelectIds.length - 1}개 키에도 같은 사진 적용
                </button>
              )}
            </div>
          )}

          <div className="section">
            <div className="section-title">키캡 색상</div>
            <div className="color-grid">
              {BODY_COLORS.map((color) => (
                <button
                  key={color}
                  className="color-swatch"
                  style={{ background: color }}
                  onClick={() => handleColorPick(color)}
                />
              ))}
              <input
                type="color"
                className="color-custom"
                defaultValue={selectedCustom?.color ?? DEFAULT_KEYCAP_COLOR}
                onChange={(e) => handleColorPick(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      <div className="section">
        <div className="section-title">각인 글자 색상</div>
        <input type="color" value={legendColor} onChange={(e) => setLegendColor(e.target.value)} />
      </div>

      <div className="section">
        <div className="section-title">디자인 관리 ({filledCount}개 키에 사진 적용됨)</div>
        <div className="button-row">
          <button onClick={handleExport}>디자인 저장(JSON)</button>
          <button onClick={() => importInputRef.current?.click()}>불러오기</button>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = "";
          }}
        />
        <button className="danger full" onClick={resetAll}>
          전체 초기화
        </button>
      </div>
    </aside>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
