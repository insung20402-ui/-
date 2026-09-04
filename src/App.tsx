import { useCallback, useRef } from "react";
import { Scene } from "./Scene";
import { Sidebar } from "./Sidebar";
import "./styles.css";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  }, []);

  const handleScreenshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-custom-keycaps.png";
    a.click();
  };

  return (
    <div className="app">
      <div className="viewport">
        <div className="toolbar">
          <button className="primary" onClick={handleScreenshot}>
            📸 스크린샷 저장
          </button>
        </div>
        <Scene onCanvasReady={handleCanvasReady} />
      </div>
      <Sidebar />
    </div>
  );
}
