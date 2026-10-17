import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { walk, type DirNode, type TreeNode } from '../core/tree';
import { neighbourPaths } from './flow';
import { createFlows3D } from './flow3d';
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
  const picked = [...nodes, ...files].slice(0, MAX_PETALS);
  // Spread the top-level folders evenly over the sphere, so the module arcs between them wrap
  // the whole bloom instead of bunching at one pole.
  const tops = picked.filter((n) => n.kind === 'dir' && ctx.root.children.includes(n));
  const rest = picked.filter((n) => !tops.includes(n));
  const chosen: TreeNode[] = [];
  const stride = tops.length > 0 ? picked.length / tops.length : Infinity;
  for (let i = 0, t = 0; i < picked.length; i++) {
    const top = tops[t];
    if (top && i >= Math.round(t * stride + stride / 2)) {
      chosen.push(top);
      t++;
    } else chosen.push(rest.shift() ?? (tops[t++] as TreeNode));
  }
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

  // Module arcs run over the outside of the bloom between the top-level folders' petals.
  const flows = createFlows3D(scene, new THREE.Vector3(0, 0, 0), 2.5, 0.08);
  const tipOf = new Map<string, THREE.Vector3>();
  for (const p of petals)
    tipOf.set(p.node.path, p.dir.clone().multiplyScalar(1.5 + p.length * 0.55));
  flows.setArcs(
    ctx.graph.edges.flatMap((e) => {
      const a = ctx.graph.modules[e.from];
      const b = ctx.graph.modules[e.to];
      const from = a?.node ? tipOf.get(a.path) : undefined;
      const to = b?.node ? tipOf.get(b.path) : undefined;
      return from && to ? [{ from, to, weight: e.weight, cycle: e.inCycle }] : [];
    }),
  );
  let pinned: TreeNode | null = null;
  let shown: TreeNode | null = null;
  const showLinks = (node: TreeNode | null): void => {
    if (node === shown) return;
    shown = node;
    const here = node ? tipOf.get(node.path) : undefined;
    if (!node || !here) {
      flows.setLinks([]);
      return;
    }
    const pairs: [THREE.Vector3, THREE.Vector3][] = [];
    for (const p of neighbourPaths(node, ctx.edges)) {
      const there = tipOf.get(p);
      if (there) pairs.push([here, there]);
    }
    flows.setLinks(pairs);
  };

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
      flows.update(dt);
      core.scale.setScalar(1 + 0.08 * Math.sin(t * 1.6));
      controls.update();
      renderer.render(scene, camera);
    },
    pointer(x, y) {
      hovered = null;
      if (x < 0) {
        showLinks(pinned);
        return null;
      }
      ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(
        petals.map((p) => p.mesh),
        false,
      )[0];
      const i = hit?.object.userData['i'];
      hovered = typeof i === 'number' ? (petals[i] ?? null) : null;
      showLinks(hovered?.node ?? pinned);
      if (!hovered) return null;
      const m = hovered.mesh.material as THREE.MeshPhysicalMaterial;
      return { node: hovered.node, color: `#${m.color.getHexString()}` };
    },
    pin(node) {
      pinned = node;
      if (!hovered) showLinks(node);
    },
    dispose() {
      flows.dispose();
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
