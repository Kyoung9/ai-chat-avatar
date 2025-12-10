'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { EmotionType } from '@/types';

interface AvatarModelProps {
  emotion: EmotionType;
  isSpeaking: boolean;
}

function AvatarModel({ emotion, isSpeaking }: AvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/avatar.glb');
  const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);
  const morphTargetMeshes = useRef<THREE.Mesh[]>([]);

  // GLBモデルの初期化
  useEffect(() => {
    if (scene) {
      // モデルのスケールと位置を調整
      scene.scale.set(1, 1, 1);
      scene.position.set(0, -1, 0);

      // モーフターゲット（表情）を持つメッシュを検索
      const meshes: THREE.Mesh[] = [];
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.morphTargetInfluences && mesh.morphTargetDictionary) {
            meshes.push(mesh);
          }
        }
      });
      morphTargetMeshes.current = meshes;

      // アニメーションミキサーの設定
      const animMixer = new THREE.AnimationMixer(scene);
      setMixer(animMixer);
    }
  }, [scene]);

  // 表情の設定
  useEffect(() => {
    if (morphTargetMeshes.current.length === 0) return;

    morphTargetMeshes.current.forEach((mesh) => {
      if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary) return;

      // すべての表情をリセット
      for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
        mesh.morphTargetInfluences[i] = 0;
      }

      // 感情に応じた表情を設定
      const dict = mesh.morphTargetDictionary;
      switch (emotion) {
        case 'happy':
          if (dict['smile'] !== undefined) mesh.morphTargetInfluences[dict['smile']] = 1;
          if (dict['happy'] !== undefined) mesh.morphTargetInfluences[dict['happy']] = 1;
          break;
        case 'gentle':
          if (dict['smile'] !== undefined) mesh.morphTargetInfluences[dict['smile']] = 0.5;
          break;
        case 'thinking':
          if (dict['blink'] !== undefined) mesh.morphTargetInfluences[dict['blink']] = 0.3;
          break;
        case 'serious':
          if (dict['neutral'] !== undefined) mesh.morphTargetInfluences[dict['neutral']] = 1;
          break;
        default:
          // neutral
          break;
      }
    });
  }, [emotion]);

  // アニメーション（呼吸、リップシンク）
  useFrame((state, delta) => {
    if (mixer) {
      mixer.update(delta);
    }

    if (groupRef.current) {
      // 呼吸のような動き
      const breathingOffset = Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
      groupRef.current.position.y = breathingOffset;

      // 軽い揺れ
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.02;
    }

    // リップシンク（話している時）
    if (isSpeaking && morphTargetMeshes.current.length > 0) {
      morphTargetMeshes.current.forEach((mesh) => {
        if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary) return;

        const dict = mesh.morphTargetDictionary;
        const mouthOpenAmount = Math.abs(Math.sin(state.clock.elapsedTime * 10)) * 0.7;

        // 口の開閉アニメーション
        if (dict['mouthOpen'] !== undefined) {
          mesh.morphTargetInfluences[dict['mouthOpen']] = mouthOpenAmount;
        }
        if (dict['A'] !== undefined) {
          mesh.morphTargetInfluences[dict['A']] = mouthOpenAmount * 0.5;
        }
        if (dict['O'] !== undefined) {
          mesh.morphTargetInfluences[dict['O']] = mouthOpenAmount * 0.3;
        }
      });
    } else if (morphTargetMeshes.current.length > 0) {
      // 話していない時は口を閉じる
      morphTargetMeshes.current.forEach((mesh) => {
        if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary) return;

        const dict = mesh.morphTargetDictionary;
        if (dict['mouthOpen'] !== undefined) {
          mesh.morphTargetInfluences[dict['mouthOpen']] = 0;
        }
        if (dict['A'] !== undefined) {
          mesh.morphTargetInfluences[dict['A']] = 0;
        }
        if (dict['O'] !== undefined) {
          mesh.morphTargetInfluences[dict['O']] = 0;
        }
      });
    }
  });

  return (
    <group ref={groupRef}>
      {/* ライト */}
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
      <directionalLight position={[-5, 3, -5]} intensity={0.5} />
      <pointLight position={[0, 2, 1]} intensity={0.8} />

      {/* GLBモデル */}
      <primitive object={scene} />
    </group>
  );
}

// GLTFモデルのプリロード
useGLTF.preload('/avatar.glb');

interface Avatar3DProps {
  emotion?: EmotionType;
  isSpeaking?: boolean;
}

export default function Avatar3D({ emotion = 'neutral', isSpeaking = false }: Avatar3DProps) {
  return (
    <div className="w-full h-full bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl shadow-yuyama-lg overflow-hidden">
      <Canvas
        camera={{ position: [0, 0, 3], fov: 50 }}
        style={{ width: '100%', height: '100%' }}
      >
        <AvatarModel emotion={emotion} isSpeaking={isSpeaking} />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 1.5}
        />
      </Canvas>
      
      {/* ステータス表示 */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {isSpeaking ? '🔊 発話中' : '待機中'}
            </span>
            <span className="text-xs text-gray-500 capitalize">{emotion}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

