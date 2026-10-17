import * as THREE from 'three';
import { CYCLE_COLOR, FLOW_COLOR } from './flow';

export interface Arc {
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
  readonly weight: number;
  readonly cycle: boolean;
}

export interface Flows3D {
  /** Module-level dependency arcs, always shown. */
  setArcs(arcs: readonly Arc[]): void;
  /** File-level links for the hovered or selected item; empty to clear. */
  setLinks(links: readonly (readonly [THREE.Vector3, THREE.Vector3])[]): void;
  update(dt: number): void;
  dispose(): void;
}

/** Glowing arcs that bow outward from `center`, with particles running importer → imported. */
export function createFlows3D(
  scene: THREE.Scene,
  center: THREE.Vector3,
  lift: number,
  dotRadius = 0.16,
): Flows3D {
  const group = new THREE.Group();
  scene.add(group);
  const additive = (color: string, opacity: number): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  const tubeFlow = additive(FLOW_COLOR, 0.28);
  const tubeCycle = additive(CYCLE_COLOR, 0.5);
  const dotFlow = additive(FLOW_COLOR, 0.95);
  const dotCycle = additive(CYCLE_COLOR, 0.95);
  const dot = new THREE.SphereGeometry(dotRadius, 10, 8);
  const linkMaterial = new THREE.LineBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
  });

  let curves: { curve: THREE.QuadraticBezierCurve3; dots: THREE.Mesh[] }[] = [];
  let links: THREE.LineSegments | null = null;
  let t = 0;

  const clearArcs = (): void => {
    for (const child of [...group.children]) {
      if (child === links) continue;
      group.remove(child);
      if (child instanceof THREE.Mesh && child.geometry !== dot) child.geometry.dispose();
    }
    curves = [];
  };

  return {
    setArcs(arcs) {
      clearArcs();
      for (const a of arcs) {
        const mid = a.from.clone().add(a.to).multiplyScalar(0.5);
        const out = mid.clone().sub(center);
        if (out.lengthSq() < 1e-6) out.set(0, 1, 0);
        const control = mid.add(
          out.normalize().multiplyScalar(lift + a.from.distanceTo(a.to) * 0.25),
        );
        const curve = new THREE.QuadraticBezierCurve3(a.from, control, a.to);
        const radius = Math.min(0.14, 0.03 + 0.02 * Math.log2(1 + a.weight));
        group.add(
          new THREE.Mesh(
            new THREE.TubeGeometry(curve, 40, radius, 6),
            a.cycle ? tubeCycle : tubeFlow,
          ),
        );
        const n = Math.min(5, 1 + Math.floor(Math.log2(1 + a.weight)));
        const dots = Array.from({ length: n }, () => {
          const m = new THREE.Mesh(dot, a.cycle ? dotCycle : dotFlow);
          group.add(m);
          return m;
        });
        curves.push({ curve, dots });
      }
    },
    setLinks(pairs) {
      if (links) {
        group.remove(links);
        links.geometry.dispose();
        links = null;
      }
      if (pairs.length === 0) return;
      const pts = pairs.flatMap(([a, b]) => [a, b]);
      links = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), linkMaterial);
      group.add(links);
    },
    update(dt) {
      t += dt;
      for (const { curve, dots } of curves) {
        const len = curve.getLength();
        dots.forEach((d, i) => {
          d.position.copy(curve.getPoint((t * (6 / Math.max(6, len)) + i / dots.length) % 1));
        });
      }
    },
    dispose() {
      clearArcs();
      this.setLinks([]);
      scene.remove(group);
      for (const m of [tubeFlow, tubeCycle, dotFlow, dotCycle, linkMaterial]) m.dispose();
      dot.dispose();
    },
  };
}
