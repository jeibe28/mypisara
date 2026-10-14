import { describe, expect, it } from "vitest";
import { SHAPE_IDS, linePathData, shapePath } from "../src/lib/board-shapes";
import { boardCardSchema, newCard } from "../src/lib/boards";

describe("board shapes", () => {
  it("draws every shape as a finite path at any size", () => {
    for (const shape of SHAPE_IDS)
      for (const [w, h] of [[8, 8], [180, 120], [900, 40], [40, 600]] as const)
        for (const sketchy of [false, true]) {
          const d = shapePath(shape, w, h, { sketchy, seed: 42, inset: 3 });
          expect(d.startsWith("M"), `${shape} ${w}x${h}`).toBe(true);
          expect(d).not.toMatch(/NaN|Infinity/);
        }
  });

  it("is repeatable for a seed and different for another", () => {
    const a = shapePath("rounded", 200, 120, { sketchy: true, seed: 5 });
    expect(shapePath("rounded", 200, 120, { sketchy: true, seed: 5 })).toBe(a);
    expect(shapePath("rounded", 200, 120, { sketchy: true, seed: 6 })).not.toBe(a);
    expect(shapePath("circle", 200, 120, { seed: 5 })).toBe(shapePath("circle", 200, 120, { seed: 5 }));
  });

  it("keeps sketchy line ends exactly on the endpoints", () => {
    const route = linePathData({ start: { x: 10, y: 10 }, end: { x: 210, y: 90 }, bend: 0, shift: 0, routing: "straight", sketchy: true, seed: 9 });
    expect(route.d.startsWith("M 10 10")).toBe(true);
    expect(route.d.trim().endsWith("210 90") || route.d.includes("210 90")).toBe(true);
  });

  it("routes elbows with right angles and straight when level", () => {
    const elbow = linePathData({ start: { x: 0, y: 0 }, end: { x: 200, y: 100 }, bend: 0, shift: 0, routing: "elbow", sketchy: false, seed: 1 });
    expect(elbow.d).toContain("Q");
    const level = linePathData({ start: { x: 0, y: 50 }, end: { x: 200, y: 50 }, bend: 0, shift: 0, routing: "elbow", sketchy: false, seed: 1 });
    expect(level.d).toBe("M 0 50 L 200 50");
  });

  it("stores shape cards and old cards without shape fields still load", () => {
    const card = newCard("shape");
    expect(card.height).toBe(120);
    expect(boardCardSchema.parse(card).shape).toBe("rounded");
    const legacy: Record<string, unknown> = { ...newCard("line") };
    for (const key of ["shape", "sketchy", "shape_seed", "line_arrow_style", "line_routing"]) delete legacy[key];
    const parsed = boardCardSchema.parse(legacy);
    expect(parsed.line_routing).toBe("straight");
    expect(parsed.sketchy).toBe(false);
  });
});
