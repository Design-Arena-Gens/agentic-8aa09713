"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import type { AnalysisResult } from "./VideoAnalyzer";

interface HawkEyeViewerProps {
  delivery: AnalysisResult | null;
  keyFrameIndex: number;
}

const Pitch = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <planeGeometry args={[20.12, 3.05]} />
    <meshStandardMaterial color="#1f3d7a" />
  </mesh>
);

const Crease = () => (
  <group position={[0, 0.01, 0]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.02, 3.05]} />
      <meshBasicMaterial color="#f7f9ff" />
    </mesh>
    <mesh position={[0.05, 0.2, 0.05]}>
      <boxGeometry args={[0.02, 0.4, 0.02]} />
      <meshStandardMaterial color="#dfe5ff" />
    </mesh>
    <mesh position={[-0.05, 0.2, 0.05]}>
      <boxGeometry args={[0.02, 0.4, 0.02]} />
      <meshStandardMaterial color="#dfe5ff" />
    </mesh>
  </group>
);

const Trajectory = ({ points }: { points: [number, number, number][] }) => {
  const curve = useMemo(() => {
    if (!points.length) return null;
    const curvePoints = points.map((pt) => [pt[0], pt[1] + 0.09, -pt[2]] as [
      number,
      number,
      number
    ]);
    return curvePoints;
  }, [points]);

  if (!curve) return null;

  return (
    <mesh>
      <tubeGeometry
        args={[
          new THREE.CatmullRomCurve3(curve.map((pt) => new THREE.Vector3(...pt))),
          Math.max(curve.length * 4, 32),
          0.06,
          8,
          false
        ]}
      />
      <meshStandardMaterial color="#ff8d5c" emissive="#ff5400" emissiveIntensity={0.4} />
    </mesh>
  );
};

const BallMarker = ({
  point,
  active
}: {
  point: [number, number, number];
  active: boolean;
}) => (
  <mesh position={[point[0], point[1] + 0.09, -point[2]]}>
    <sphereGeometry args={[0.14, 32, 32]} />
    <meshStandardMaterial
      color={active ? "#ffcf64" : "#ff6f61"}
      emissive={active ? "#ffcf64" : "#441711"}
      emissiveIntensity={active ? 1.2 : 0.2}
      metalness={0.45}
      roughness={0.3}
    />
  </mesh>
);

const FrameAnnotator = ({
  delivery,
  keyFrameIndex
}: {
  delivery: AnalysisResult;
  keyFrameIndex: number;
}) => {
  const frame = delivery.frames[keyFrameIndex] ?? delivery.frames[0];
  return (
    <group>
      <BallMarker point={frame.ballPosition} active />
      <directionalLight
        position={[frame.ballPosition[0] + 4, 5, -frame.ballPosition[2] - 3]}
        intensity={0.7}
      />
    </group>
  );
};

const Lights = () => (
  <group>
    <ambientLight intensity={0.45} />
    <directionalLight position={[4, 6, 5]} intensity={0.7} />
    <directionalLight position={[-6, 5, -5]} intensity={0.45} />
  </group>
);

const HawkEyeViewer = ({ delivery, keyFrameIndex }: HawkEyeViewerProps) => {
  const trajectoryPoints = delivery?.trajectory ?? [];

  return (
    <Canvas shadows camera={{ position: [6, 6, 10], fov: 42 }}>
      <Suspense fallback={null}>
        <PerspectiveCamera makeDefault position={[5, 4, 10]} />
        <OrbitControls
          enablePan
          enableZoom
          minDistance={4}
          maxDistance={30}
          minPolarAngle={0.3}
          maxPolarAngle={Math.PI / 2.1}
        />
        <Lights />
        <Pitch />
        <Crease />
        {trajectoryPoints.length > 1 && <Trajectory points={trajectoryPoints} />}
        {delivery && <FrameAnnotator delivery={delivery} keyFrameIndex={keyFrameIndex} />}
      </Suspense>
    </Canvas>
  );
};

export default HawkEyeViewer;
