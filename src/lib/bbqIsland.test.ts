import { describe, expect, it } from "vitest";
import { evaluateBbqIsland, initialBbqIslandModel } from "./bbqIsland";

describe("evaluateBbqIsland", () => {
  it("compiles sections, inserts, counter, and footing into assembly pieces", () => {
    const result = evaluateBbqIsland(initialBbqIslandModel);

    expect(result.validationIssues).toEqual([]);
    expect(result.pieces.map((piece) => piece.kind)).toEqual(
      expect.arrayContaining([
        "tube",
        "insert-body",
        "insert-face-frame",
        "insert-sleeve-frame",
        "counter",
        "footing-board",
      ]),
    );
    expect(result.tubePieces.map((piece) => piece.kind)).not.toContain("insert-body");
    expect(result.pieces.find((piece) => piece.id === "island-a:counter")).toMatchObject({
      kind: "counter",
      bounds: {
        min: { x: -1.5, y: -1.5, z: 36 },
        max: { x: 125.5, y: 33, z: 38 },
      },
    });
    expect(result.connectors).toHaveLength(32);
	    expect(result.connectors.find((connector) => connector.id === "main-node-front-left-bottom"))
	      .toMatchObject({
	        kind: "node",
	        connectorType: "3-way-corner",
	        position: { x: 0, y: 0, z: 0 },
	      });
  });

  it("allocates generated tube pieces to inventory and reports shortages", () => {
    const result = evaluateBbqIsland({
      ...initialBbqIslandModel,
      inventory: [
        {
          id: "tiny-offcut",
          specId: "steel-tube-1-5",
          label: "Tiny offcut",
          length: 12,
          status: "partial",
        },
      ],
    });

    expect(result.unallocatedPieces.length).toBeGreaterThan(0);
    expect(result.validationIssues.map((issue) => issue.id)).toContain(
      "inventory:tube-shortage",
    );
  });

  it("places explicit vertical posts from structural members", () => {
    const result = evaluateBbqIsland({
      ...initialBbqIslandModel,
      sections: [
        {
          id: "test-section",
          name: "Test section",
          origin: { x: 0, y: 0, z: 0 },
          length: 60,
          depth: 30,
          height: 36,
          extraVerticalPosts: [],
          structuralConnectors: [],
          structuralMembers: [
            {
              id: "front-post",
              name: "Front post",
              color: "#0891b2",
              kind: "vertical-post",
              start: { x: 20, y: 0, z: 0 },
              end: { x: 20, y: 0, z: 36 },
            },
            {
              id: "left-post",
              name: "Left post",
              color: "#0891b2",
              kind: "vertical-post",
              start: { x: 0, y: 12, z: 0 },
              end: { x: 0, y: 12, z: 36 },
            },
          ],
        },
      ],
      inserts: [],
      inventory: initialBbqIslandModel.inventory.map((item) => ({
        ...item,
        length: 240,
      })),
    });

    expect(result.pieces.find((piece) => piece.id === "test-section:front-post")).toMatchObject({
      color: "#0891b2",
      bounds: {
        min: { x: 20, y: 0, z: 0 },
        max: { x: 21, y: 1, z: 36 },
      },
    });
    expect(result.pieces.find((piece) => piece.id === "test-section:left-post")).toMatchObject({
      bounds: {
        min: { x: 0, y: 12, z: 0 },
        max: { x: 1, y: 13, z: 36 },
      },
    });
    expect(
      result.pieces.some(
        (piece) =>
          piece.id.includes("front-post") &&
          piece.bounds.min.y === 30,
      ),
    ).toBe(false);
  });

  it("validates structural members against section dimensions", () => {
    const result = evaluateBbqIsland({
      ...initialBbqIslandModel,
      sections: [
        {
          id: "test-section",
          name: "Test section",
          origin: { x: 0, y: 0, z: 0 },
          length: 60,
          depth: 30,
          height: 36,
          extraVerticalPosts: [
          ],
          structuralConnectors: [],
          structuralMembers: [
            {
              id: "bad-left-post",
              name: "Bad left post",
              color: "#0891b2",
              kind: "vertical-post",
              start: { x: 0, y: 40, z: 0 },
              end: { x: 0, y: 40, z: 36 },
            },
          ],
        },
      ],
      inserts: [],
    });

    expect(result.validationIssues.map((issue) => issue.id)).toContain(
      "structural-member-fit:bad-left-post",
    );
    expect(
      result.pieces.some((piece) => piece.id === "test-section:bad-left-post"),
    ).toBe(false);
  });

  it("models inserts as face frames and centered boxes separate from structural tubing", () => {
    const result = evaluateBbqIsland(initialBbqIslandModel);

    expect(result.pieces.find((piece) => piece.id === "main-section:drawer-stack-face-frame")).toMatchObject({
      kind: "insert-face-frame",
      bounds: {
        min: { x: 18, y: -0.75, z: 4 },
        max: { x: 32, y: 0, z: 25 },
      },
    });
    expect(result.pieces.find((piece) => piece.id === "main-section:drawer-stack-body")).toMatchObject({
      kind: "insert-body",
      bounds: {
        min: { x: 18, y: 0, z: 4 },
        max: { x: 32, y: 23, z: 25 },
      },
    });
    expect(result.tubePieces.map((piece) => piece.kind)).not.toContain("insert-body");
    expect(result.tubePieces.map((piece) => piece.kind)).not.toContain("insert-face-frame");
    expect(new Set(result.tubePieces.map((piece) => piece.kind))).toEqual(new Set(["tube"]));
  });

  it("models sleeve inserts as three-sided top and front fixed frames", () => {
    const result = evaluateBbqIsland(initialBbqIslandModel);
    const sleevePieces = result.pieces.filter(
      (piece) => piece.sourceId === "side-burner-sleeve-insert",
    );

    expect(sleevePieces.map((piece) => piece.id)).toEqual(
      expect.arrayContaining([
        "side-burner-section:side-burner-sleeve-insert-top-left",
        "side-burner-section:side-burner-sleeve-insert-top-right",
        "side-burner-section:side-burner-sleeve-insert-top-back",
        "side-burner-section:side-burner-sleeve-insert-front-left",
        "side-burner-section:side-burner-sleeve-insert-front-right",
        "side-burner-section:side-burner-sleeve-insert-front-bottom",
      ]),
    );
    expect(sleevePieces.every((piece) => piece.kind === "insert-sleeve-frame")).toBe(true);
    expect(
      result.tubePieces.some((piece) => piece.sourceId === "side-burner-sleeve-insert"),
    ).toBe(false);
  });

  it("compiles explicit structural members without inferring connector nodes", () => {
    const result = evaluateBbqIsland({
      ...initialBbqIslandModel,
      sections: [
        {
          id: "test-section",
          name: "Test section",
          origin: { x: 0, y: 0, z: 0 },
          length: 60,
          depth: 30,
          height: 36,
          extraVerticalPosts: [],
          structuralConnectors: [],
          structuralMembers: [
            {
              id: "drawer-left-post",
              name: "Drawer left post",
              color: "#0891b2",
              kind: "vertical-post",
              start: { x: 20, y: 0, z: 0 },
              end: { x: 20, y: 0, z: 36 },
            },
            {
              id: "drawer-front-rail",
              name: "Drawer front rail",
              color: "#2563eb",
              kind: "horizontal-beam",
              start: { x: 20, y: 0, z: 4 },
              end: { x: 44, y: 0, z: 4 },
            },
          ],
        },
      ],
      inserts: [],
      inventory: initialBbqIslandModel.inventory.map((item) => ({
        ...item,
        length: 240,
      })),
    });

    expect(result.pieces.find((piece) => piece.id === "test-section:drawer-left-post")).toMatchObject({
      kind: "tube",
      axis: "z",
      length: 36,
    });
    expect(result.pieces.find((piece) => piece.id === "test-section:drawer-front-rail")).toMatchObject({
      kind: "tube",
      axis: "x",
      length: 24,
    });
    expect(result.connectors).toEqual([]);
  });

  it("warns when structural member endpoints float without a connector or perpendicular member", () => {
    const result = evaluateBbqIsland({
      ...initialBbqIslandModel,
      sections: [
        {
          id: "test-section",
          name: "Test section",
          origin: { x: 0, y: 0, z: 0 },
          length: 60,
          depth: 30,
          height: 36,
          extraVerticalPosts: [],
          structuralConnectors: [],
          structuralMembers: [
            {
              id: "floating-rail",
              name: "Floating rail",
              color: "#2563eb",
              kind: "horizontal-beam",
              start: { x: 12, y: 0, z: 10 },
              end: { x: 24, y: 0, z: 10 },
            },
          ],
        },
      ],
      inserts: [],
      inventory: initialBbqIslandModel.inventory.map((item) => ({
        ...item,
        length: 240,
      })),
    });

    expect(result.validationIssues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        "structural-member-endpoint:floating-rail:start",
        "structural-member-endpoint:floating-rail:end",
      ]),
    );
  });
});
