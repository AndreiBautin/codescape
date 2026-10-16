import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { walk, type DirNode, type TreeNode } from '../core/tree';
import type { Scene, SceneContext } from './scene';

const MAX_PETALS = 160;

interface Petal {
  readonly node: TreeNode;
  readonly mesh: THREE.Mesh;
  readonly dir: THREE.Vector3;
  readonly length: number;
  readonly phase: number;
}

/** 3D Flower Box: a glossy core that blooms a spike for every folder and the biggest files.
 *  Spike length is size, colour is language; the bloom breathes, and drag spins it. */
export function createFlowerBoxScene(ctx: SceneContext): Scene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  ctx.host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  const light = new THREE.PointLight(0xffffff, 60, 0, 1.5);
  light.position.set(6, 8, 10);
  scene.add(light);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 2, 14);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.6, 4),
    new THREE.MeshPhysicalMaterial({
      color: '#1a2033',
      metalness: 0.9,
      roughness: 0.15,
      clearcoat: 1,
    }),
  );
  scene.add(core);

  // Folders first (they are the structure), then the largest files to fill the bloom.
  const nodes: TreeNode[] = [];
  const files: TreeNode[] = [];
  for (const { node } of walk(ctx.root)) {
    if (node === ctx.root) continue;
    (node.kind === 'dir' ? nodes : files).push(node);
  }
  files.sort((a, b) => b.lines - a.lines);
  const chosen = [...nodes, ...files].slice(0, MAX_PETALS);
  const maxLines = Math.max(1, ...chosen.map((n) => n.lines));

  const cone = new THREE.ConeGeometry(0.14, 1, 10, 1, true);
  cone.translate(0, 0.5, 0);
  const materials = new Map<string, THREE.MeshPhysicalMaterial>();
  const materialFor = (color: string): THREE.MeshPhysicalMaterial => {
    let m = materials.get(color);
    if (!m) {
      m = new THREE.MeshPhysicalMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25,
        metalness: 0.4,
        roughness: 0.2,
        clearcoat: 1,
      });
      materials.set(color, m);
    }
    return m;
  };
  const dirColor = (d: DirNode): string => {
    let best: TreeNode | null = null;
    for (const { node } of walk(d))
      if (node.kind === 'file' && (!best || node.lines > best.lines)) best = node;
    return best?.kind === 'file' ? best.language.color : '#e8ecf5';
  };

  const up = new THREE.Vector3(0, 1, 0);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const petals: Petal[] = chosen.map((node, i) => {
    // Fibonacci sphere: even coverage whatever the count.
    const y = 1 - (2 * (i + 0.5)) / chosen.length;
    const r = Math.sqrt(1 - y * y);
    const dir = new THREE.Vector3(Math.cos(golden * i) * r, y, Math.sin(golden * i) * r);
    const color = node.kind === 'file' ? node.language.color : dirColor(node);
    const mesh = new THREE.Mesh(cone, materialFor(color));
    mesh.position.copy(dir).multiplyScalar(1.5);
    mesh.quaternion.setFromUnitVectors(up, dir);
    mesh.userData['i'] = i;
    scene.add(mesh);
    return {
      node,
      mesh,
      dir,
      length: 0.8 + 3.6 * Math.sqrt(node.lines / maxLines),
      phase: ctx.rng.range(0, Math.PI * 2),
    };
  });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let width = 1;
  let height = 1;
  let t = 0;
  let hovered: Petal | null = null;

  return {
    resize(w, h) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    frame(dt) {
      t += dt;
      // The classic morph: the whole bloom breathes between a sphere and full spikes.
      const bloom = 0.55 + 0.45 * Math.sin(t * 0.8);
      for (const p of petals) {
        const wave = 0.85 + 0.15 * Math.sin(t * 2.4 + p.phase);
        const grow = p === hovered ? 1.35 : 1;
        p.mesh.scale.set(grow, Math.max(0.05, p.length * bloom * wave * grow), grow);
      }
      core.scale.setScalar(1 + 0.08 * Math.sin(t * 1.6));
      controls.update();
      renderer.render(scene, camera);
    },
    pointer(x, y) {
      hovered = null;
      if (x < 0) return null;
      ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(
        petals.map((p) => p.mesh),
        false,
      )[0];
      const i = hit?.object.userData['i'];
      hovered = typeof i === 'number' ? (petals[i] ?? null) : null;
      if (!hovered) return null;
      const m = hovered.mesh.material as THREE.MeshPhysicalMaterial;
      return { node: hovered.node, color: `#${m.color.getHexString()}` };
    },
    dispose() {
      controls.dispose();
      cone.dispose();
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      for (const m of materials.values()) m.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
