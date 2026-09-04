import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { buildKeyboard } from "./keyboardLayout";
import { Keycap, UNIT } from "./Keycap";
import { useKeycapStore } from "./store";

interface SceneProps {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export function Scene({ onCanvasReady }: SceneProps) {
  const { keys: layoutKeys, totalWidthU, totalDepthU } = useMemo(() => buildKeyboard(), []);
  const keys = useKeycapStore((s) => s.keys);
  const selectedKeyId = useKeycapStore((s) => s.selectedKeyId);
  const multiSelectIds = useKeycapStore((s) => s.multiSelectIds);
  const legendColor = useKeycapStore((s) => s.legendColor);
  const selectKey = useKeycapStore((s) => s.selectKey);
  const clearSelection = useKeycapStore((s) => s.clearSelection);

  const caseWidth = totalWidthU * UNIT + 0.7;
  const caseDepth = totalDepthU * UNIT + 0.7;

  return (
    <Canvas
      shadows
      gl={{ preserveDrawingBuffer: true }}
      camera={{ position: [0, 10.5, 15.5], fov: 40 }}
      onPointerMissed={() => clearSelection()}
      onCreated={(state) => onCanvasReady?.(state.gl.domElement)}
    >
      <color attach="background" args={["#0c0d11"]} />
      <fog attach="fog" args={["#0c0d11", 12, 26]} />
      <hemisphereLight args={["#dbe4ff", "#0a0a0d", 1.4]} />
      <ambientLight intensity={0.9} />
      <directionalLight
        position={[5, 10, 6]}
        intensity={1.9}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
      />
      <directionalLight position={[-6, 5, -4]} intensity={0.7} />

      <mesh position={[0, -0.16, 0]} receiveShadow castShadow>
        <boxGeometry args={[caseWidth, 0.32, caseDepth]} />
        <meshStandardMaterial color="#191a1f" roughness={0.85} />
      </mesh>

      {layoutKeys.map((k) => (
        <Keycap
          key={k.id}
          keySpec={k}
          custom={keys[k.id]}
          legendColor={legendColor}
          selected={selectedKeyId === k.id || multiSelectIds.includes(k.id)}
          multiSelected={multiSelectIds.includes(k.id) && multiSelectIds.length > 1}
          onSelect={selectKey}
        />
      ))}

      <ContactShadows position={[0, -0.33, 0]} opacity={0.55} scale={20} blur={2.2} far={4} />
      <OrbitControls
        enablePan={false}
        minDistance={7}
        maxDistance={28}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
