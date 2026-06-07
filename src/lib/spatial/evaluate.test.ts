import { describe, expect, it } from "vitest";
import { optimizeCuts } from "./cutOptimizer";
import { buildCutPieces, evaluateSpatialConfiguration } from "./evaluate";
import type { SpatialConfiguration } from "./types";

const baselineConfiguration: SpatialConfiguration = {
  boundary: {
    id: "bay",
    name: "Garage Bay",
    origin: { x: 0, y: 0, z: 0 },
    dimensions: { width: 144, depth: 96, height: 96 },
  },
  specs: [
    {
      category: "linear",
      id: "tube-1",
      name: "1.5 in steel tube",
      material: "steel",
      profile: "square tube",
      profileDimensions: { width: 1.5, depth: 1.5, height: 1.5 },
      rawStockLength: 120,
      maxCutLength: 120,
    },
    {
      category: "connector",
      id: "corner-3way",
      name: "3-way corner joint",
      dimensions: { width: 2, depth: 2, height: 2 },
      defaultDeduction: 1,
    },
    {
      category: "fixed",
      id: "cabinet-24",
      name: "24 in cabinet insert",
      dimensions: { width: 24, depth: 24, height: 34 },
    },
  ],
  elements: [
    {
      kind: "connector",
      id: "c-left",
      specId: "corner-3way",
      position: { x: 0, y: 0, z: 0 },
    },
    {
      kind: "connector",
      id: "c-right",
      specId: "corner-3way",
      position: { x: 96, y: 0, z: 0 },
    },
    {
      kind: "linear",
      id: "rail-front",
      specId: "tube-1",
      axis: "x",
      start: { point: { x: 1, y: 1, z: 1 }, connectorId: "c-left" },
      end: { point: { x: 97, y: 1, z: 1 }, connectorId: "c-right" },
    },
    {
      kind: "fixed",
      id: "cabinet-a",
      specId: "cabinet-24",
      position: { x: 24, y: 24, z: 0 },
    },
  ],
};

describe("evaluateSpatialConfiguration", () => {
  it("deducts connector consumption from linear cut lengths", () => {
    const result = evaluateSpatialConfiguration(baselineConfiguration);

    expect(result.validationIssues).toEqual([]);
    expect(result.linearElements[0]).toMatchObject({
      id: "rail-front",
      rawSpanLength: 96,
      startDeduction: 1,
      endDeduction: 1,
      cutLength: 94,
    });
  });

  it("flags boundary, stock, alignment, and clearance issues", () => {
    const result = evaluateSpatialConfiguration({
      ...baselineConfiguration,
      clearanceZones: [
        {
          id: "walkway",
          name: "Main walkway",
          minimumWidth: 36,
          bounds: {
            min: { x: 20, y: 20, z: 0 },
            max: { x: 42, y: 42, z: 80 },
          },
        },
      ],
      elements: [
        ...baselineConfiguration.elements,
        {
          kind: "linear",
          id: "bad-rail",
          specId: "tube-1",
          axis: "x",
          start: { point: { x: 0, y: 3, z: 3 } },
          end: { point: { x: 150, y: 4, z: 3 } },
        },
      ],
    });

    expect(result.validationIssues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "NON_AXIS_ALIGNED_LINEAR",
        "STOCK_LENGTH_EXCEEDED",
        "BOUNDARY_EXCEEDED",
        "CLEARANCE_TOO_SMALL",
        "CLEARANCE_OBSTRUCTED",
      ]),
    );
  });

  it("derives BBQ assembly geometry for counter, masonry, insert, and supports", () => {
    const result = evaluateSpatialConfiguration({
      ...baselineConfiguration,
      assemblies: [
        {
          id: "bbq-a",
          kind: "bbq-island",
          name: "BBQ island",
          counterProfiles: [
            {
              id: "counter-a",
              name: "Concrete counter",
              slabThickness: 2,
              frontLipHeight: 3,
              overhang: { front: 1.5, back: 1, left: 1, right: 1 },
            },
          ],
          masonrySkins: [
            {
              id: "skin-a",
              name: "Board skin",
              thickness: 0.5,
              faces: ["front", "top"],
            },
          ],
          inserts: [
            {
              id: "cabinet-profile",
              placedElementId: "cabinet-a",
              name: "Cabinet profile",
              body: { width: 24, depth: 24, height: 34 },
              faceFrame: { width: 27, height: 36, projection: 0.75 },
              requiredClearance: { side: 0.25, rear: 1, top: 0.5 },
              supportRails: [
                {
                  id: "cabinet-front-support",
                  face: "front",
                  axis: "x",
                  offsetFromFloor: 4,
                  insetFromFace: 1.5,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.assemblyArtifacts.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining([
        "counter-slab",
        "counter-lip",
        "masonry-skin",
        "insert-body",
        "face-frame",
        "support-rail",
      ]),
    );
    expect(
      result.assemblyArtifacts.find((artifact) => artifact.id === "counter-a:slab"),
    ).toMatchObject({
      bounds: {
        min: { x: -1, y: -1.5, z: 96 },
        max: { x: 145, y: 97, z: 98 },
      },
    });
  });
});

describe("optimizeCuts", () => {
  it("packs evaluated cuts onto raw stock using best-fit decreasing", () => {
    const result = evaluateSpatialConfiguration({
      ...baselineConfiguration,
      elements: [
        ...baselineConfiguration.elements,
        {
          kind: "linear",
          id: "rail-back",
          specId: "tube-1",
          axis: "x",
          start: { point: { x: 1, y: 12, z: 1 }, connectorId: "c-left" },
          end: { point: { x: 49, y: 12, z: 1 }, connectorId: "c-right" },
        },
        {
          kind: "linear",
          id: "rail-side",
          specId: "tube-1",
          axis: "x",
          start: { point: { x: 1, y: 24, z: 1 }, connectorId: "c-left" },
          end: { point: { x: 25, y: 24, z: 1 }, connectorId: "c-right" },
        },
      ],
    });

    const spec = result.linearElements[0].spec;
    const cuts = buildCutPieces(result.linearElements);
    const cutMap = optimizeCuts([{ spec, cuts }]);

    expect(cutMap.stock).toHaveLength(2);
    expect(cutMap.stock[0].cuts.map((cut) => cut.length)).toEqual([94, 22]);
    expect(cutMap.stock[0].scrapLength).toBe(4);
    expect(cutMap.stock[1].cuts.map((cut) => cut.length)).toEqual([46]);
    expect(cutMap.stock[1].scrapLength).toBe(74);
    expect(cutMap.totalScrapLength).toBe(78);
  });

  it("allocates cuts to physical inventory and reports unplaced cuts", () => {
    const result = evaluateSpatialConfiguration({
      ...baselineConfiguration,
      specs: baselineConfiguration.specs.map((spec) =>
        spec.id === "corner-3way" && spec.category === "connector"
          ? {
              ...spec,
              ports: [
                { id: "x", label: "X", axis: "x", deduction: 1 },
                { id: "y", label: "Y", axis: "y", deduction: 1 },
              ],
            }
          : spec,
      ),
      inventory: [
        {
          id: "tube-a",
          specId: "tube-1",
          label: "Existing 100 in tube",
          length: 100,
          status: "partial",
        },
        {
          id: "tube-b",
          specId: "tube-1",
          label: "Allocated old tube",
          length: 120,
          status: "allocated",
        },
      ],
      elements: [
        {
          kind: "connector",
          id: "c-left",
          specId: "corner-3way",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          kind: "connector",
          id: "c-right",
          specId: "corner-3way",
          position: { x: 96, y: 0, z: 0 },
        },
        {
          kind: "linear",
          id: "rail-front",
          specId: "tube-1",
          axis: "x",
          start: {
            point: { x: 1, y: 1, z: 1 },
            connectorId: "c-left",
            portId: "x",
          },
          end: {
            point: { x: 97, y: 1, z: 1 },
            connectorId: "c-right",
            portId: "x",
          },
        },
        {
          kind: "linear",
          id: "rail-too-long",
          specId: "tube-1",
          axis: "x",
          start: { point: { x: 1, y: 4, z: 1 } },
          end: { point: { x: 90, y: 4, z: 1 } },
        },
      ],
    });

    expect(result.connectionGraph.edges[0]).toMatchObject({
      linearElementId: "rail-front",
      start: { connectorId: "c-left", portId: "x", deduction: 1 },
      end: { connectorId: "c-right", portId: "x", deduction: 1 },
    });
    expect(result.inventoryAllocations).toEqual([
      {
        inventoryItemId: "tube-a",
        inventoryLabel: "Existing 100 in tube",
        specId: "tube-1",
        cuts: [{ id: "rail-front", specId: "tube-1", length: 94 }],
        remainingLength: 6,
      },
    ]);
    expect(result.unallocatedCuts.map((cut) => cut.id)).toEqual([
      "rail-too-long",
    ]);
    expect(result.validationIssues.map((issue) => issue.code)).toContain(
      "INVENTORY_SHORTAGE",
    );
  });
});
