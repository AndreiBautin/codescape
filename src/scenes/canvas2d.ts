/** Shared setup for the 2D scenes: a DPR-aware canvas attached to the host. */
export interface Canvas2D {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  resize(width: number, height: number): void;
}

export function createCanvas2D(host: HTMLElement): Canvas2D {
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return {
    canvas,
    g,
    resize(width, height) {
      const dpr = Math.min(2, window.devicePixelRatio);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
  };
}
