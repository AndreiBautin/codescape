import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { layoutPipes, type PipesLayout, type Segment } from '../core/pipesLayout';
import type { Hover, Scene, SceneContext } from './scene';

const RADIUS = 0.34;
const SEGMENTS_PER_SECOND = 14;
/** Big repos grow faster, so the whole tree is up within this long. */
const MAX_GROW_SECONDS = 40;
/** After the whole tree has grown, hold it on screen this long before regrowing. */
const HOLD_SECONDS = 14;

interface Built {
  readonly segment: Segment;
  readonly mesh: THREE.Mesh;
  readonly joint: THREE.Mesh;
  readonly length: number;
}

/** 3D Pipes: every top-level directory is a pipe, every folder a branch, every file a joint. */
export function createPipesScene(ctx: SceneContext): Scene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  ctx.host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.fog = new THREE.FogExp2(0x05060a, 0.005);

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(20, 30, 15);
  scene.add(key, new THREE.AmbientLight(0x8090b0, 0.25));

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;
  controls.enablePan = false;

  const cylinder = new THREE.CylinderGeometry(RADIUS, RADIUS, 1, 20, 1, true);
  cylinder.translate(0, 0.5, 0); // grow from the base
  const ball = new THREE.SphereGeometry(RADIUS * 1.45, 24, 16);

  let layout: PipesLayout;
  let built: Built[] = [];
  let materials: THREE.MeshPhysicalMaterial[] = [];
  let progress = 0;
  let hold = 0;
  const group = new THREE.Group();
  scene.add(group);

  const build = (): void => {
    group.clear();
    for (const m of materials) m.dispose();
    layout = layoutPipes(ctx.root, ctx.rng);
    materials = layout.pipes.map(
      (p) =>
        new THREE.MeshPhysicalMaterial({
          color: p.color,
          metalness: 0.35,
          roughness: 0.22,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          emissive: p.color,
          emissiveIntensity: 0.12,
        }),
    );
    const up = new THREE.Vector3(0, 1, 0);
    built = layout.segments.map((segment) => {
      const material = materials[segment.pipe] ?? materials[0];
      const from = new THREE.Vector3(segment.from.x, segment.from.y, segment.from.z);
      const to = new THREE.Vector3(segment.to.x, segment.to.y, segment.to.z);
      const length = from.distanceTo(to);
      const mesh = new THREE.Mesh(cylinder, material);
      mesh.position.copy(from);
      mesh.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize());
      mesh.scale.set(1, 0.0001, 1);
      mesh.visible = false;
      const joint = new THREE.Mesh(ball, material);
      joint.position.copy(to);
      // Directories get full joints, files a smaller cap — the old screensaver's elbows.
      joint.scale.setScalar(segment.node.kind === 'dir' ? 1.15 : 0.8);
      joint.visible = false;
      joint.userData['segment'] = segment;
      group.add(mesh, joint);
      return { segment, mesh, joint, length };
    });
    progress = 0;
    hold = 0;
    const dist = layout.bound * 1.6;
    camera.position.set(dist, dist * 0.6, dist);
    controls.target.set(0, 0, 0);
  };
  build();

  const apply = (): void => {
    for (const b of built) {
      const t = Math.min(1, Math.max(0, progress - b.segment.order));
      b.mesh.visible = t > 0;
      b.mesh.scale.y = Math.max(0.0001, t * b.length);
      b.joint.visible = t >= 1;
    }
  };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let width = 1;
  let height = 1;
  let highlighted: THREE.Mesh | null = null;

  return {
    resize(w, h) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    frame(dt) {
      const longest = Math.max(...layout.pipes.map((p) => p.length));
      if (progress < longest)
        progress += dt * Math.max(SEGMENTS_PER_SECOND, longest / MAX_GROW_SECONDS);
      else if ((hold += dt) > HOLD_SECONDS) build();
      apply();
      controls.update();
      renderer.render(scene, camera);
    },
    pointer(x, y) {
      if (highlighted) highlighted.scale.multiplyScalar(1 / 1.4);
      highlighted = null;
      if (x < 0) return null;
      ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const joints = built.filter((b) => b.joint.visible).map((b) => b.joint);
      const hit = raycaster.intersectObjects(joints, false)[0];
      if (!hit) return null;
      const mesh = hit.object as THREE.Mesh;
      const segment = mesh.userData['segment'] as Segment;
      highlighted = mesh;
      mesh.scale.multiplyScalar(1.4);
      return {
        node: segment.node,
        color: layout.pipes[segment.pipe]?.color ?? '#fff',
      } satisfies Hover;
    },
    dispose() {
      controls.dispose();
      cylinder.dispose();
      ball.dispose();
      for (const m of materials) m.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
