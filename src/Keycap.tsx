import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { ThreeEvent } from "@react-three/fiber";
import { buildKeycapGeometry } from "./keycapGeometry";
import { PlacedKey } from "./keyboardLayout";
import { KeyCustomState } from "./store";
import { composeKeycapCanvas, composeLegendCanvas, loadImage } from "./imageProcessing";

export const UNIT = 0.9;
export const GAP = 0.08;
export const HEIGHT = 0.45;

interface KeycapProps {
  keySpec: PlacedKey;
  custom?: KeyCustomState;
  legendColor: string;
  selected: boolean;
  multiSelected: boolean;
  onSelect: (id: string, additive: boolean) => void;
}

export function Keycap({ keySpec, custom, legendColor, selected, multiSelected, onSelect }: KeycapProps) {
  const width = keySpec.widthU * UNIT - GAP;
  const depth = keySpec.depthU * UNIT - GAP;
  const height = HEIGHT * keySpec.heightScale;
  const aspect = width / depth;

  const geometry = useMemo(() => buildKeycapGeometry(width, depth, height, 0.8), [width, depth, height]);
  const outlineGeometry = useMemo(() => buildKeycapGeometry(width, depth, height, 0.8), [width, depth, height]);

  const bodyColor = custom?.color ?? "#2b2d33";
  const imageSrc = custom?.image?.src;
  const transform = custom?.image?.transform;

  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  // 사진이 있으면 사진을, 없으면 색상+각인 텍스트를 캔버스에 그려 텍스처로 사용합니다.
  useEffect(() => {
    let cancelled = false;

    if (imageSrc && transform) {
      loadImage(imageSrc).then((img) => {
        if (cancelled) return;
        const canvas = composeKeycapCanvas(img, { aspect, transform });
        finalize(canvas);
      });
    } else {
      const canvas = composeLegendCanvas({ aspect, label: keySpec.label, bodyColor, legendColor });
      finalize(canvas);
    }

    function finalize(canvas: HTMLCanvasElement) {
      if (cancelled) return;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      setTexture((prev) => {
        prev?.dispose();
        return tex;
      });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc, JSON.stringify(transform), aspect, bodyColor, legendColor, keySpec.label]);

  const topMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: texture ?? undefined,
      color: texture ? "#ffffff" : bodyColor,
      roughness: imageSrc ? 0.6 : 0.75,
      metalness: 0.04,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, bodyColor, imageSrc]);

  const sideMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.85, metalness: 0.04 }),
    [bodyColor]
  );

  const bottomMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#111114", roughness: 0.95 }), []);

  const materials = useMemo(
    () => [topMaterial, bottomMaterial, sideMaterial],
    [topMaterial, bottomMaterial, sideMaterial]
  );

  useEffect(() => {
    return () => {
      topMaterial.dispose();
      sideMaterial.dispose();
      bottomMaterial.dispose();
    };
  }, [topMaterial, sideMaterial, bottomMaterial]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      outlineGeometry.dispose();
    };
  }, [geometry, outlineGeometry]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(keySpec.id, e.shiftKey);
  };

  const yPos = height / 2;

  return (
    <group position={[keySpec.x * UNIT, yPos, keySpec.z * UNIT]}>
      <mesh geometry={geometry} material={materials} onClick={handleClick} castShadow receiveShadow />
      {selected && (
        <mesh geometry={outlineGeometry} scale={1.06}>
          <meshBasicMaterial color={multiSelected ? "#5fd0ff" : "#ffd85f"} wireframe transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}
