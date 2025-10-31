import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
  const outlineRef = useRef<THREE.LineSegments | null>(null);
  // no transform controls (move/rotate) per latest requirement

  const [selected, setSelected] = useState<boolean>(false);
  const [textureUrl, setTextureUrl] = useState<string>("");
  const [repeatX, setRepeatX] = useState<number>(2);
  const [repeatY, setRepeatY] = useState<number>(2);

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
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

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
        // outline
        if (outlineRef.current) {
          scene.remove(outlineRef.current);
          outlineRef.current.geometry.dispose();
          (outlineRef.current.material as THREE.LineBasicMaterial).dispose();
          outlineRef.current = null;
        }
        const edges = new THREE.EdgesGeometry(mesh.geometry);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00c2ff, linewidth: 2 }));
        line.position.copy(mesh.position);
        line.rotation.copy(mesh.rotation);
        line.scale.copy(mesh.scale);
        scene.add(line);
        outlineRef.current = line;
      } else {
        if (outlineRef.current) {
          scene.remove(outlineRef.current);
          outlineRef.current.geometry.dispose();
          (outlineRef.current.material as THREE.LineBasicMaterial).dispose();
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
        // show outline if not already shown
        if (!outlineRef.current) {
          const edges = new THREE.EdgesGeometry(mesh.geometry);
          const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00c2ff, linewidth: 2 }));
          line.position.copy(mesh.position);
          line.rotation.copy(mesh.rotation);
          line.scale.copy(mesh.scale);
          scene.add(line);
          outlineRef.current = line;
        }
      } else if (!selected) {
        // only hide outline if not selected
        if (outlineRef.current) {
          scene.remove(outlineRef.current);
          outlineRef.current.geometry.dispose();
          (outlineRef.current.material as THREE.LineBasicMaterial).dispose();
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
        tex.repeat.set(repeatX, repeatY);
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
  }, [textureUrl, repeatX, repeatY]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>
        3D Floor — ShapeGeometry từ polygon 2D
      </div>
      <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
        {selected && (
          <div style={{ position: 'absolute', right: 12, top: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.95)', border: '1px solid #ddd', borderRadius: 6, width: 260, boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Floor Properties</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Click outside the floor to hide</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => setTextureUrl('/texture/oak.jpg')}>Wood 1</button>
              <button onClick={() => setTextureUrl('/texture/hardwood.png')}>Wood 2</button>
              <button onClick={() => setTextureUrl('/texture/finewood.jpg')}>Wood 3</button>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#444' }}>Texture URL</label>
              <input value={textureUrl} onChange={(e) => setTextureUrl(e.target.value)} placeholder="/path/to/texture.jpg" style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#444' }}>Repeat X</label>
                <input type="number" min={0.1} step={0.1} value={repeatX} onChange={(e) => setRepeatX(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#444' }}>Repeat Y</label>
                <input type="number" min={0.1} step={0.1} value={repeatY} onChange={(e) => setRepeatY(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => { setTextureUrl(""); }}>Clear</button>
              <button onClick={() => setSelected(false)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}