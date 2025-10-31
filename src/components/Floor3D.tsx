import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FiCamera } from 'react-icons/fi';
import { type Vec2 } from '../types';

type Props = { vertices: Vec2[] };

export default function Floor3D({ vertices }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const pointerRef = useRef<THREE.Vector2 | null>(null);
  const outlineRef = useRef<THREE.Mesh | null>(null);
  // no transform controls (move/rotate) per latest requirement

  const [selected, setSelected] = useState<boolean>(false);
  const [textureUrl, setTextureUrl] = useState<string>("");
  // --- Preset textures for quick selection ---
  const texturePresets = [
    { name: 'Oak', url: '/texture/oak.jpg' },
    { name: 'Hardwood', url: '/texture/hardwood.png' },
    { name: 'Finewood', url: '/texture/finewood.jpg' },
  ];

  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f8fb);
    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.set(4, 4, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    // keep camera above the floor (prevent underside views)
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.01;

    // lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.9);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 5);
    scene.add(dir);

    // large white ground plane (floor base)
    const groundGeom = new THREE.PlaneGeometry(50, 50);
    groundGeom.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    raycasterRef.current = new THREE.Raycaster();
    pointerRef.current = new THREE.Vector2();

    // removed transform controls (move/rotate)

    const onResize = () => {
      const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // Respond to container size changes (e.g., splitter drag) via ResizeObserver
    const ro = new ResizeObserver(() => onResize());
    ro.observe(mount);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (meshRef.current) {
      const oldMesh = meshRef.current;
      scene.remove(oldMesh);
      oldMesh.geometry.dispose();
      meshRef.current = null;
    }
    if (vertices.length < 3) return;

    const shape = new THREE.Shape(vertices.map(v => new THREE.Vector2(v.x, v.y)));
    const geometry = new THREE.ShapeGeometry(shape, 1);
    // Rotate to lie on XZ plane (y up)
    geometry.rotateX(-Math.PI / 2);

    const material = materialRef.current ?? new THREE.MeshStandardMaterial({
      color: 0x1e90ff,
      metalness: 0.0,
      roughness: 0.9,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });

    const mesh = new THREE.Mesh(geometry, material);
    // slightly lift above ground to avoid z-fighting
    mesh.position.y = 0.01;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshRef.current = mesh;
    materialRef.current = material;
    setSelected(false);

    // update outline geometry if exists
    if (outlineRef.current) {
      scene.remove(outlineRef.current);
      outlineRef.current.geometry.dispose();
      (outlineRef.current.material as THREE.LineBasicMaterial).dispose();
      outlineRef.current = null;
    }
  }, [vertices]);

  useEffect(() => {
    const mount = mountRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    const raycaster = raycasterRef.current;
    const pointer = pointerRef.current;
    if (!mount || !renderer || !camera || !scene || !raycaster || !pointer) return;

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const mesh = meshRef.current;
      if (!mesh) return;
      const intersects = raycaster.intersectObject(mesh, true);
      const hit = intersects.length > 0;
      setSelected(hit);
      const scene = sceneRef.current!;
      // manage outline only (no transform controls)
      if (hit && mesh) {
        // remove previous glow
        if (outlineRef.current) {
          scene.remove(outlineRef.current);
          const obj = outlineRef.current;
          (obj.material as THREE.Material).dispose();
          obj.geometry.dispose();
          outlineRef.current = null;
        }
        // add yellow glow using slightly scaled backside mesh
        const glowGeom = (mesh.geometry as THREE.BufferGeometry).clone();
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.35, side: THREE.BackSide });
        const glow = new THREE.Mesh(glowGeom, glowMat);
        glow.position.copy(mesh.position);
        glow.rotation.copy(mesh.rotation);
        glow.scale.copy(mesh.scale).multiplyScalar(1.02);
        glow.renderOrder = 1;
        scene.add(glow);
        outlineRef.current = glow;
      } else {
        if (outlineRef.current) {
          scene.remove(outlineRef.current);
          const obj = outlineRef.current;
          (obj.material as THREE.Material).dispose();
          obj.geometry.dispose();
          outlineRef.current = null;
        }
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    const onMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const mesh = meshRef.current;
      if (!mesh) return;
      const intersects = raycaster.intersectObject(mesh, true);
      const hit = intersects.length > 0;
      const scene = sceneRef.current!;
      if (hit) {
        // show glow if not already shown
        if (!outlineRef.current) {
          const glowGeom = (mesh.geometry as THREE.BufferGeometry).clone();
          const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.35, side: THREE.BackSide });
          const glow = new THREE.Mesh(glowGeom, glowMat);
          glow.position.copy(mesh.position);
          glow.rotation.copy(mesh.rotation);
          glow.scale.copy(mesh.scale).multiplyScalar(1.02);
          glow.renderOrder = 1;
          scene.add(glow);
          outlineRef.current = glow;
        }
      } else if (!selected) {
        // only hide glow if not selected
        if (outlineRef.current) {
          scene.remove(outlineRef.current);
          const obj = outlineRef.current;
          (obj.material as THREE.Material).dispose();
          obj.geometry.dispose();
          outlineRef.current = null;
        }
      }
    };
    renderer.domElement.addEventListener('mousemove', onMove);

    return () => {
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('mousemove', onMove);
    };
  },);


  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    if (!textureUrl) {
      // clear texture
      if (material.map) {
        material.map.dispose();
        material.map = null;
      }
      material.needsUpdate = true;
      return;
    }
    const loader = new THREE.TextureLoader();
    loader.load(
      textureUrl,
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = Math.min(8, rendererRef.current?.capabilities.getMaxAnisotropy?.() || 1);
        tex.repeat.set(2, 2);
        material.map = tex;
        material.color.set(0xffffff);
        material.transparent = false;
        material.opacity = 1.0;
        material.needsUpdate = true;
      },
      undefined,
      () => {
      }
    );
  }, [textureUrl]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #e6e8eb', display: 'flex', alignItems: 'center', gap: 8, background: '#333333' }}>
        <div />
        <button title="Screenshot" style={{ width: 40, height: 40, border: '1px solid #dcdfe3', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => {
          const r = rendererRef.current; if (!r) return;
          r.render(sceneRef.current!, cameraRef.current!);
          const url = r.domElement.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = url; a.download = 'screenshot-3d.png'; a.click();
        }}><FiCamera style={{ fontSize: 16 }} /></button>
      </div>
      <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
        {selected && (
          <div
            style={{
              position: 'absolute',
              right: 12,
              top: 12,
              width: 260,
              background: 'rgba(255,255,255,0.98)',
              border: '1px solid #ddd',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: 14,
              backdropFilter: 'blur(5px)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Floor Properties</div>
              <div style={{ fontSize: 12, color: '#666' }}>Click outside the floor to hide</div>
            </div>

            {/* Content */}
            <div style={{ padding: '16px' }}>
              {/* Presets */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#444',
                    marginBottom: 4,
                  }}
                >
                  Presets
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                  }}
                >
                  {texturePresets.map((tex) => (
                    <button
                      key={tex.url}
                      title={tex.name}
                      onClick={() => setTextureUrl(tex.url)}
                      style={{
                        width: '100%',
                        height: 60,
                        border: '2px solid #ddd',
                        borderRadius: 4,
                        cursor: 'pointer',
                        backgroundColor: '#f0f0f0',
                        backgroundImage: `url(${tex.url})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* URL */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#444',
                    marginBottom: 4,
                  }}
                >
                  Texture URL
                </label>
                <input
                  value={textureUrl}
                  onChange={(e) => setTextureUrl(e.target.value)}
                  placeholder="/path/to/texture.jpg"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end',
                padding: '12px 16px',
                background: '#f9f9f9',
                borderTop: '1px solid #eee',
              }}
            >
              <button
                onClick={() => { setTextureUrl(''); }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  backgroundColor: '#e0e0e0',
                  color: '#333',
                }}
              >
                Clear
              </button>
              <button
                onClick={() => setSelected(false)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #1e90ff',
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  backgroundColor: '#1e90ff',
                  color: 'white',
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}