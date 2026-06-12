import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// Builds the shield-shaped outline used on the school emblem
function useShieldGeometry() {
  return useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-1, 1.5);
    shape.lineTo(1, 1.5);
    shape.lineTo(1, 0.4);
    shape.bezierCurveTo(1, -0.9, 0.55, -1.6, 0, -1.9);
    shape.bezierCurveTo(-0.55, -1.6, -1, -0.9, -1, 0.4);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.35,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.06,
      bevelSegments: 4,
    });
  }, []);
}

// Canvas texture with the 壽 character, like on the real badge
function useEmblemTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2f5fd0';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 170px "Noto Serif KR", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('壽', 128, 140);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

function MascotModel() {
  const group = useRef();
  const leftArm = useRef();
  const shieldGeo = useShieldGeometry();
  const emblemTexture = useEmblemTexture();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    group.current.rotation.y = Math.sin(t * 0.5) * 0.6;
    group.current.position.y = Math.sin(t * 1.5) * 0.08;
    if (leftArm.current) {
      leftArm.current.rotation.z = Math.sin(t * 4) * 0.5 - 0.6;
    }
  });

  return (
    <group ref={group} position={[0, -0.4, 0]}>
      {/* body: extruded shield */}
      <mesh geometry={shieldGeo} rotation={[0, 0, Math.PI]} position={[0, 0.4, 0]}>
        <meshStandardMaterial color="#3a64d8" metalness={0.2} roughness={0.35} />
      </mesh>

      {/* emblem face with 壽 character */}
      <mesh position={[0, 0.55, 0.21]}>
        <circleGeometry args={[0.7, 32]} />
        <meshStandardMaterial map={emblemTexture} roughness={0.4} />
      </mesh>

      {/* head */}
      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial color="#ffd9a8" roughness={0.6} />
      </mesh>

      {/* eyes */}
      <mesh position={[-0.2, 2.0, 0.48]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial color="#16306e" />
      </mesh>
      <mesh position={[0.2, 2.0, 0.48]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial color="#16306e" />
      </mesh>

      {/* smile */}
      <mesh position={[0, 1.82, 0.5]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.18, 0.03, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#c9512f" />
      </mesh>

      {/* arms */}
      <mesh ref={leftArm} position={[-1.05, 0.6, 0]}>
        <capsuleGeometry args={[0.16, 0.9, 4, 8]} />
        <meshStandardMaterial color="#2f5fd0" roughness={0.4} />
      </mesh>
      <mesh position={[1.05, 0.6, 0]} rotation={[0, 0, -0.3]}>
        <capsuleGeometry args={[0.16, 0.9, 4, 8]} />
        <meshStandardMaterial color="#2f5fd0" roughness={0.4} />
      </mesh>

      {/* legs */}
      <mesh position={[-0.4, -1.4, 0]}>
        <capsuleGeometry args={[0.2, 0.7, 4, 8]} />
        <meshStandardMaterial color="#16306e" roughness={0.4} />
      </mesh>
      <mesh position={[0.4, -1.4, 0]}>
        <capsuleGeometry args={[0.2, 0.7, 4, 8]} />
        <meshStandardMaterial color="#16306e" roughness={0.4} />
      </mesh>
    </group>
  );
}

export default function Mascot3D({ height = 360 }) {
  return (
    <div style={{ width: '100%', height }}>
      <Canvas camera={{ position: [0, 0.8, 5], fov: 40 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <directionalLight position={[-3, -2, -4]} intensity={0.3} />
        <MascotModel />
        <OrbitControls enablePan={false} minDistance={3} maxDistance={8} />
      </Canvas>
    </div>
  );
}
