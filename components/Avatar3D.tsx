'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';
import { EmotionType } from '@/types';

interface VRMAvatarModelProps {
  emotion: EmotionType;
  isSpeaking: boolean;
  onLoadComplete?: () => void;
  onLoadProgress?: (progress: number) => void;
}

function VRMAvatarModel({ emotion, isSpeaking, onLoadComplete, onLoadProgress }: VRMAvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // VRMモデルの読み込み
  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      '/BOC.vrm',
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;
        if (vrm) {
          vrmRef.current = vrm;

          // モデルのサイズ調整（参考記事の方法）
          const bbox = new THREE.Box3().setFromObject(vrm.scene);
          const modelHeight = bbox.max.y - bbox.min.y;
          const targetHeight = 1.5;
          const scale = targetHeight / modelHeight;
          vrm.scene.scale.set(scale, scale, scale);

          // モデルの位置調整（足が地面に着くように）
          const offset = -bbox.min.y * scale;
          vrm.scene.position.y = offset - 0.2;
          // シーンの設定
          // - background: 背景色（0xf0f0f0 = 明るいグレー）
          // - 必要に応じて背景色を変更可能
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0xf0f0f0);


          // // 環境光の設定
          // // - 色: 0xffffff（白色光）
          // // - 強度: 3.0（値を大きくすると明るく、小さくすると暗くなる）
          // const light = new THREE.AmbientLight(0xffffff, 3);
          // scene.add(light);
          
          // ポーズの設定（腕を自然な位置に）
          if (vrm.humanoid) {
            // 利用可能なボーンをログ出力（デバッグ用）
            console.log('Available humanoid bones:', vrm.humanoid.humanBones);

            // VRM 1.0 形式でボーンにアクセス
            const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
            const rightLowerArm = vrm.humanoid.getRawBoneNode('rightLowerArm');
            const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
            const leftLowerArm = vrm.humanoid.getRawBoneNode('leftLowerArm');

            console.log('rightUpperArm:', rightUpperArm);
            console.log('leftUpperArm:', leftUpperArm);

            if (rightUpperArm && rightLowerArm) {
              // Z軸回転: 正の値で体に近づく、負の値で離れる
              rightUpperArm.rotation.z = 1.3;  // 少し体に近づける
              rightUpperArm.rotation.x = -0.1;
              rightLowerArm.rotation.x = -0.5;
            }
            if (leftUpperArm && leftLowerArm) {
              leftUpperArm.rotation.z = -1.3;  // 少し体に近づける（左右対称）
              leftUpperArm.rotation.x = -0.1;
              leftLowerArm.rotation.x = 0.5;
            }
          }

          if (groupRef.current) {
            groupRef.current.add(vrm.scene);
          }

          setIsLoaded(true);
          onLoadComplete?.();  // ロード完了を通知
          console.log('VRM loaded successfully:', vrm);

          // 利用可能な表情をログ出力（デバッグ用）
          if (vrm.expressionManager) {
            console.log('Available expressions:',
              vrm.expressionManager.expressions.map(e => e.expressionName));
          }
        }
      },
      (progress) => {
        const percent = (progress.loaded / progress.total) * 100;
        console.log('Loading VRM...', percent, '%');
        onLoadProgress?.(percent);  // 進捗を通知
      },
      (error) => {
        console.error('Error loading VRM:', error);
      }
    );

    return () => {
      if (vrmRef.current) {
        vrmRef.current.scene.removeFromParent();
        vrmRef.current = null;
      }
    };
  }, []);

  // 感情に応じた表情設定（文字列を使用 - 参考記事の方法）
  const setEmotion = useCallback((vrm: VRM, emotionType: EmotionType) => {
    if (!vrm.expressionManager) return;

    // すべての表情をリセット
    const expressions = ['happy', 'angry', 'sad', 'relaxed', 'neutral', 'surprised'];
    expressions.forEach(expr => {
      vrm.expressionManager?.setValue(expr, 0);
    });
    vrm.expressionManager.update();

    // 感情に応じた表情を設定
    switch (emotionType) {
      case 'happy':
        vrm.expressionManager.setValue('happy', 1.0);
        break;
      case 'gentle':
        vrm.expressionManager.setValue('relaxed', 0.7);
        break;
      case 'thinking':
        // 考え中は少し目を細める
        vrm.expressionManager.setValue('relaxed', 0.3);
        break;
      case 'serious':
        // 真剣な表情
        vrm.expressionManager.setValue('angry', 0.2);
        break;
      default:
        // neutral - デフォルト表情
        break;
    }
    vrm.expressionManager.update();
  }, []);

  // アニメーションループ（参考記事の瞬き方法を採用）
  useFrame((state, delta) => {
    const vrm = vrmRef.current;
    if (!vrm || !vrm.expressionManager) return;

    const time = state.clock.elapsedTime;

    // ===== 待機モーション（上下の揺れ） =====
    if (vrm.scene) {
      vrm.scene.position.y = -0.2 + Math.sin(time * 1.5) * 0.001;
      vrm.scene.rotation.y = Math.sin(time * 0.5) * 0.01;
    }

    // ===== 瞬きアニメーション（参考記事の方法） =====
    // 確率的に瞬き発生（約0.15%の確率で毎フレーム）
    if (Math.random() < 0.0015) {
      const blink = async () => {
        // まぶたを閉じる
        vrm.expressionManager?.setValue('blinkLeft', 1.0);
        vrm.expressionManager?.setValue('blinkRight', 1.0);
        vrm.expressionManager?.update();

        await new Promise(resolve => setTimeout(resolve, 50));

        // まぶたを徐々に開く
        for (let i = 1.0; i >= 0; i -= 0.1) {
          vrm.expressionManager?.setValue('blinkLeft', i);
          vrm.expressionManager?.setValue('blinkRight', i);
          vrm.expressionManager?.update();
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      };
      blink();
    }

    // ===== 口パクアニメーション（発話中） =====
    if (isSpeaking) {
      // 複数の母音形状を組み合わせてリアルな口パク
      const mouthSpeed = 12;
      const aaValue = Math.max(0, Math.sin(time * mouthSpeed) * 0.6);
      const iiValue = Math.max(0, Math.sin(time * mouthSpeed + 1) * 0.3);
      const ouValue = Math.max(0, Math.sin(time * mouthSpeed + 2) * 0.4);

      vrm.expressionManager.setValue('aa', aaValue);
      vrm.expressionManager.setValue('ih', iiValue);
      vrm.expressionManager.setValue('ou', ouValue);
    } else {
      // 話していない時は口を閉じる
      vrm.expressionManager.setValue('aa', 0);
      vrm.expressionManager.setValue('ih', 0);
      vrm.expressionManager.setValue('ou', 0);
      vrm.expressionManager.setValue('ee', 0);
      vrm.expressionManager.setValue('oh', 0);
    }

    // ===== VRMの更新 =====
    vrm.expressionManager.update();
    vrm.update(delta);
  });

  // 感情が変わったら表情を更新
  useEffect(() => {
    if (vrmRef.current && isLoaded) {
      setEmotion(vrmRef.current, emotion);
    }
  }, [emotion, isLoaded, setEmotion]);

  return (
    <group ref={groupRef}>
      {/* ===== ライト設定 ===== */}
      {/* 環境光: 全体を均一に照らす（強めに設定） */}
      <ambientLight intensity={1.0} />

      {/* メインライト: 正面やや上から顔を照らす */}
      <directionalLight
        position={[0, 2, 3]}
        intensity={0.5}
        castShadow
      />

      {/* フィルライト: 左側から補助光 */}
      <directionalLight
        position={[-2, 1, 2]}
        intensity={1.2}
      />

      {/* リムライト: 右側から輪郭を強調 */}
      <directionalLight
        position={[2, 1, 2]}
        intensity={0.1}
      />

      {/* 顔を直接照らすポイントライト */}
      <pointLight
        position={[0, 1.2, 1.5]}
        intensity={2}
        distance={5}
      />

      {/* ロード中表示 */}
      {!isLoaded && (
        <mesh>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshStandardMaterial color="#0066CC" wireframe />
        </mesh>
      )}
    </group>
  );
}

interface Avatar3DProps {
  emotion?: EmotionType;
  isSpeaking?: boolean;
}

export default function Avatar3D({ emotion = 'neutral', isSpeaking = false }: Avatar3DProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  return (
    <div className="w-full h-full bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl shadow-yuyama-lg overflow-hidden relative">
      {/* ローディングオーバーレイ */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
          {/* アニメーションするアバターアイコン */}
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#0066CC] to-[#0d4a87] flex items-center justify-center animate-pulse">
              <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
              </svg>
            </div>
            {/* 回転するリング */}
            <div className="absolute inset-0 w-24 h-24 border-4 border-transparent border-t-[#0066CC] rounded-full animate-spin"></div>
          </div>

          {/* ローディングテキスト */}
          <p className="text-lg font-medium text-gray-700 mb-2">
            アバターを読み込み中...
          </p>

          {/* プログレスバー */}
          <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#0066CC] to-[#0d4a87] transition-all duration-300 ease-out"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 mt-2">{Math.round(loadProgress)}%</p>
        </div>
      )}

      <Canvas
        camera={{
          position: [0, 0.3, 1],  // カメラを正面に配置（z を正の値に）
          fov: 35,
          near: 0.1,
          far: 20.0
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <VRMAvatarModel
          emotion={emotion}
          isSpeaking={isSpeaking}
          onLoadComplete={() => setIsLoading(false)}
          onLoadProgress={(progress) => setLoadProgress(progress)}
        />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          target={[0, 1.2, 0]}  // モデルの頭部付近を注視
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 1.8}
        />
      </Canvas>

      {/* ステータス表示 */}
      {!isLoading && (
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
      )}
    </div>
  );
}

