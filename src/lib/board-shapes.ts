// Shape outlines and line routes as plain SVG path strings. The canvas and the image/PDF export
// both draw from these (the export feeds them to Path2D), so what you see is what you export.

export type Pt = { x: number; y: number };

export const SHAPE_IDS = [
  "rect", "rounded", "ellipse", "triangle", "diamond", "hexagon", "star", "bubble", "arrow",
  "circle", "underline", "highlight", "cross", "check",
] as const;
export type ShapeId = (typeof SHAPE_IDS)[number];

export const SHAPES: Record<ShapeId, { label: string; hand: boolean; closed: boolean }> = {
  rect: { label: "Rectangle", hand: false, closed: true },
  rounded: { label: "Rounded", hand: false, closed: true },
  ellipse: { label: "Ellipse", hand: false, closed: true },
  triangle: { label: "Triangle", hand: false, closed: true },
  diamond: { label: "Diamond", hand: false, closed: true },
  hexagon: { label: "Hexagon", hand: false, closed: true },
  star: { label: "Star", hand: false, closed: true },
  bubble: { label: "Speech bubble", hand: false, closed: true },
  arrow: { label: "Block arrow", hand: false, closed: true },
  circle: { label: "Circle it", hand: true, closed: false },
  underline: { label: "Underline", hand: true, closed: false },
  highlight: { label: "Highlight", hand: true, closed: true },
  cross: { label: "Cross", hand: true, closed: false },
  check: { label: "Check", hand: true, closed: false },
};

// Small seeded generator: the same seed always draws the same wobble.
function random(seed: number) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => Math.round(n * 10) / 10;

function polygon(points: Pt[], closed: boolean) {
  return points.map((p, i) => `${i ? "L" : "M"} ${f(p.x)} ${f(p.y)}`).join(" ") + (closed ? " Z" : "");
}

// Points spaced about `step` apart along a polyline (closed polylines wrap back to the start).
function resample(points: Pt[], closed: boolean, step: number): Pt[] {
  const pts = closed ? [...points, points[0]] : points;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(length / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
}

// Smooth curve through the points (Catmull-Rom converted to cubic Béziers).
function smooth(points: Pt[], closed: boolean) {
  const n = points.length;
  if (n < 3) return polygon(points, false);
  const at = (i: number) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  let d = `M ${f(points[0].x)} ${f(points[0].y)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d + (closed ? " Z" : "");
}

// A hand-drawn version of a polyline: spaced points nudged by a small seeded amount, then smoothed.
export function sketchPath(points: Pt[], closed: boolean, seed: number, amp: number, passes = 1): string {
  const parts: string[] = [];
  for (let pass = 0; pass < passes; pass++) {
    const rand = random(seed + pass * 977);
    const jitter = amp * (1 + pass * 0.5);
    const base = resample(points, closed, 22);
    // Open strokes keep their two ends exactly where they were, so arrowheads and
    // connections still meet the cards they point at.
    const sampled = base.map((p, i) => closed || (i > 0 && i < base.length - 1)
      ? { x: p.x + (rand() - 0.5) * 2 * jitter, y: p.y + (rand() - 0.5) * 2 * jitter }
      : p);
    parts.push(smooth(sampled, closed));
  }
  return parts.join(" ");
}

function roundedRect(w: number, h: number, r: number, inset: number): Pt[] {
  const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
  const radius = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  const pts: Pt[] = [];
  const arc = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = from + (Math.PI / 2) * (i / 6);
      pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
    }
  };
  arc(x1 - radius, y0 + radius, -Math.PI / 2);
  arc(x1 - radius, y1 - radius, 0);
  arc(x0 + radius, y1 - radius, Math.PI / 2);
  arc(x0 + radius, y0 + radius, Math.PI);
  return pts;
}

function ellipsePoints(w: number, h: number, inset: number, count = 48): Pt[] {
  const rx = w / 2 - inset, ry = h / 2 - inset;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { x: w / 2 + Math.cos(a) * rx, y: h / 2 + Math.sin(a) * ry };
  });
}

// The outline of each shape as one or more polylines inside a w×h box, kept `inset` away from the
// edges so a thick stroke is never clipped.
function outline(shape: ShapeId, w: number, h: number, inset: number, seed: number): { pts: Pt[]; closed: boolean }[] {
  const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
  const cx = w / 2, cy = h / 2;
  switch (shape) {
    case "rect":
      return [{ pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true }];
    case "rounded":
      return [{ pts: roundedRect(w, h, Math.min(w, h) * 0.2, inset), closed: true }];
    case "ellipse":
      return [{ pts: ellipsePoints(w, h, inset), closed: true }];
    case "triangle":
      return [{ pts: [{ x: cx, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true }];
    case "diamond":
      return [{ pts: [{ x: cx, y: y0 }, { x: x1, y: cy }, { x: cx, y: y1 }, { x: x0, y: cy }], closed: true }];
    case "hexagon": {
      const k = Math.min(0.25 * (x1 - x0), (y1 - y0) / 2);
      return [{ pts: [{ x: x0 + k, y: y0 }, { x: x1 - k, y: y0 }, { x: x1, y: cy }, { x: x1 - k, y: y1 }, { x: x0 + k, y: y1 }, { x: x0, y: cy }], closed: true }];
    }
    case "star": {
      const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
      return [{
        pts: Array.from({ length: 10 }, (_, i) => {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 ? 0.42 : 1;
          return { x: cx + Math.cos(a) * r * rx, y: cy + Math.sin(a) * r * ry };
        }),
        closed: true,
      }];
    }
    case "bubble": {
      const bottom = y1 - (y1 - y0) * 0.18;
      const body = roundedRect(w, bottom + inset, Math.min(w, h) * 0.14, inset);
      // The tail drops from the lower-left of the body.
      const tailX = x0 + (x1 - x0) * 0.22;
      const out: Pt[] = [];
      let placed = false;
      for (const p of body) {
        if (!placed && p.y >= bottom - 0.5 && p.x <= tailX + 14 && p.x >= x0 + 4 && out.length) {
          out.push({ x: tailX + 22, y: bottom }, { x: tailX - 6, y: y1 }, { x: tailX - 8, y: bottom });
          placed = true;
        }
        out.push(p);
      }
      return [{ pts: out, closed: true }];
    }
    case "arrow": {
      const neck = (y1 - y0) * 0.2;
      const headX = x0 + (x1 - x0) * 0.62;
      return [{
        pts: [
          { x: x0, y: cy - neck }, { x: headX, y: cy - neck }, { x: headX, y: y0 }, { x: x1, y: cy },
          { x: headX, y: y1 }, { x: headX, y: cy + neck }, { x: x0, y: cy + neck },
        ],
        closed: true,
      }];
    }
    case "circle": {
      // Slightly more than one turn that drifts inward, like a quick loop around something.
      const rand = random(seed + 11);
      const phase = rand() * Math.PI * 2;
      const turns = 1.1 + rand() * 0.06;
      const rx = w / 2 - inset, ry = h / 2 - inset;
      const count = 56;
      const pts = Array.from({ length: count + 1 }, (_, i) => {
        const t = i / count;
        const a = phase + t * Math.PI * 2 * turns;
        const drift = 1 - 0.07 * t + 0.025 * Math.sin(a * 2 + phase);
        return { x: cx + Math.cos(a) * rx * drift, y: cy + Math.sin(a) * ry * drift };
      });
      return [{ pts, closed: false }];
    }
    case "underline": {
      const rand = random(seed + 5);
      const count = 18;
      const wave = (k: number) => Array.from({ length: count + 1 }, (_, i) => ({
        x: x0 + ((x1 - x0) * i) / count,
        y: cy + k + Math.sin(i * 0.9 + rand() * 0.6) * Math.min(3, h * 0.12),
      }));
      return [{ pts: wave(-2), closed: false }, { pts: wave(4), closed: false }];
    }
    case "highlight":
      return [{ pts: [{ x: x0, y: y0 + (y1 - y0) * 0.18 }, { x: x1, y: y0 }, { x: x1 - 4, y: y1 }, { x: x0 + 3, y: y1 - (y1 - y0) * 0.1 }], closed: true }];
    case "cross":
      return [
        { pts: [{ x: x0, y: y0 }, { x: x1, y: y1 }], closed: false },
        { pts: [{ x: x1, y: y0 }, { x: x0, y: y1 }], closed: false },
      ];
    case "check":
      return [{ pts: [{ x: x0 + (x1 - x0) * 0.08, y: cy + (y1 - y0) * 0.05 }, { x: x0 + (x1 - x0) * 0.38, y: y1 - (y1 - y0) * 0.08 }, { x: x1 - (x1 - x0) * 0.04, y: y0 + (y1 - y0) * 0.08 }], closed: false }];
  }
}

export function shapePath(
  shape: ShapeId,
  w: number,
  h: number,
  opts: { sketchy?: boolean; seed?: number; inset?: number } = {},
): string {
  const seed = opts.seed ?? 1;
  const inset = opts.inset ?? 3;
  const width = Math.max(8, w), height = Math.max(8, h);
  const parts = outline(shape, width, height, inset, seed);
  const meta = SHAPES[shape];
  const amp = Math.max(0.8, Math.min(2.6, Math.min(width, height) / 40));
  // The hand-drawn presets already look drawn; "sketchy" adds the wobble to the clean shapes
  // and a touch more to the presets.
  return parts.map(({ pts, closed }, i) => {
    if (opts.sketchy || meta.hand) {
      return sketchPath(pts, closed, seed + i * 31, opts.sketchy ? amp : amp * 0.35, opts.sketchy && closed ? 2 : 1);
    }
    if (shape === "ellipse") {
      const rx = width / 2 - inset, ry = height / 2 - inset;
      return `M${f(width / 2 - rx)} ${f(height / 2)} a${f(rx)} ${f(ry)} 0 1 0 ${f(rx * 2)} 0 a${f(rx)} ${f(ry)} 0 1 0 ${f(-rx * 2)} 0 Z`;
    }
    return polygon(pts, closed);
  }).join(" ");
}

// ---- Lines ----

export type LineRoute = {
  start: Pt;
  end: Pt;
  bend: number;
  shift: number;
  routing: "straight" | "elbow";
  sketchy: boolean;
  seed: number;
};

function quadPoints(a: Pt, c: Pt, b: Pt, steps = 28): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  });
}

// SVG path for a line in canvas coordinates, plus where the arrowheads should point.
export function linePathData(route: LineRoute) {
  const { start, end } = route;
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  let polyline: Pt[];
  let d: string;
  if (route.routing === "elbow") {
    const mx = mid.x + route.shift;
    polyline = [start, { x: mx, y: start.y }, { x: mx, y: end.y }, end];
    const r = Math.min(10, Math.abs(mx - start.x) / 2, Math.abs(mx - end.x) / 2, Math.abs(dy) / 2);
    if (Math.abs(dy) < 1 || r < 1) {
      d = polygon(Math.abs(dy) < 1 ? [start, end] : polyline, false);
    } else {
      const sx = Math.sign(mx - start.x) || 1, ex = Math.sign(end.x - mx) || 1, sy = Math.sign(dy);
      d = `M${f(start.x)} ${f(start.y)} L${f(mx - sx * r)} ${f(start.y)} Q${f(mx)} ${f(start.y)} ${f(mx)} ${f(start.y + sy * r)}`
        + ` L${f(mx)} ${f(end.y - sy * r)} Q${f(mx)} ${f(end.y)} ${f(mx + ex * r)} ${f(end.y)} L${f(end.x)} ${f(end.y)}`;
    }
  } else if (route.bend || route.shift) {
    const control = {
      x: mid.x + (-dy / length) * route.bend + (dx / length) * route.shift,
      y: mid.y + (dx / length) * route.bend + (dy / length) * route.shift,
    };
    polyline = quadPoints(start, control, end);
    d = `M ${f(start.x)} ${f(start.y)} Q ${f(control.x)} ${f(control.y)} ${f(end.x)} ${f(end.y)}`;
  } else {
    polyline = [start, end];
    d = polygon(polyline, false);
  }
  if (route.sketchy) d = sketchPath(polyline, false, route.seed, 1.4, 2);
  const first = polyline[1] ?? end, lastFrom = polyline[polyline.length - 2] ?? start;
  return { d, startFrom: first, endFrom: lastFrom };
}
