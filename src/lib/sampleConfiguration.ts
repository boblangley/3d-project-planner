import type {
  ClearanceZone,
  ComponentSpec,
  PlacedElement,
  SpatialConfiguration,
} from "./spatial";
import {
  initialGardenParameters,
  type GardenBedParameters,
} from "./gardenBeds";
import {
  initialBbqIslandModel,
  type BbqIslandModel,
} from "./bbqIsland";

export interface PlannerParameters {
  mode: "bbq" | "garden";
  width: number;
  depth: number;
  height: number;
  stockLength: number;
  stockPieceCount: number;
  partialStockLength: number;
  connectorDeduction: number;
  includeCabinet: boolean;
  bbqIsland: BbqIslandModel;
  garden: GardenBedParameters;
}

export const initialPlannerParameters: PlannerParameters = {
  mode: "bbq",
  width: 96,
  depth: 48,
  height: 72,
  stockLength: 120,
  stockPieceCount: 8,
  partialStockLength: 72,
  connectorDeduction: 1,
  includeCabinet: true,
  bbqIsland: initialBbqIslandModel,
  garden: initialGardenParameters,
};

export function buildSampleConfiguration(
  parameters: PlannerParameters,
): SpatialConfiguration {
  const connectorSize = 2;
  const connectorCenter = connectorSize / 2;
  const specs: ComponentSpec[] = [
    {
      category: "linear",
      id: "steel-tube-1-5",
      name: "1.5 in square steel tube",
      material: "powder-coated steel",
      profile: "square tube",
      profileDimensions: { width: 1.5, depth: 1.5, height: 1.5 },
      rawStockLength: parameters.stockLength,
      maxCutLength: parameters.stockLength,
    },
    {
      category: "connector",
      id: "corner-3way",
      name: "3-way corner joint",
      connectorType: "3-way",
      ports: [
        {
          id: "x",
          label: "X-axis tube socket",
          axis: "x",
          deduction: parameters.connectorDeduction,
        },
        {
          id: "y",
          label: "Y-axis tube socket",
          axis: "y",
          deduction: parameters.connectorDeduction,
        },
        {
          id: "z",
          label: "Z-axis tube socket",
          axis: "z",
          deduction: parameters.connectorDeduction,
        },
      ],
      dimensions: {
        width: connectorSize,
        depth: connectorSize,
        height: connectorSize,
      },
      defaultDeduction: parameters.connectorDeduction,
    },
    {
      category: "fixed",
      id: "cabinet-24",
      name: "24 in cabinet insert",
      dimensions: { width: 24, depth: 22, height: 34 },
    },
  ];

  const connectorPositions = [
    ["c-000", 0, 0, 0],
    ["c-100", parameters.width - connectorSize, 0, 0],
    ["c-010", 0, parameters.depth - connectorSize, 0],
    ["c-110", parameters.width - connectorSize, parameters.depth - connectorSize, 0],
    ["c-001", 0, 0, parameters.height - connectorSize],
    ["c-101", parameters.width - connectorSize, 0, parameters.height - connectorSize],
    ["c-011", 0, parameters.depth - connectorSize, parameters.height - connectorSize],
    [
      "c-111",
      parameters.width - connectorSize,
      parameters.depth - connectorSize,
      parameters.height - connectorSize,
    ],
  ] as const;

  const connectors: PlacedElement[] = connectorPositions.map(([id, x, y, z]) => ({
    kind: "connector",
    id,
    specId: "corner-3way",
    position: { x, y, z },
  }));

  const p = {
    "000": { x: connectorCenter, y: connectorCenter, z: connectorCenter },
    "100": {
      x: parameters.width - connectorCenter,
      y: connectorCenter,
      z: connectorCenter,
    },
    "010": {
      x: connectorCenter,
      y: parameters.depth - connectorCenter,
      z: connectorCenter,
    },
    "110": {
      x: parameters.width - connectorCenter,
      y: parameters.depth - connectorCenter,
      z: connectorCenter,
    },
    "001": {
      x: connectorCenter,
      y: connectorCenter,
      z: parameters.height - connectorCenter,
    },
    "101": {
      x: parameters.width - connectorCenter,
      y: connectorCenter,
      z: parameters.height - connectorCenter,
    },
    "011": {
      x: connectorCenter,
      y: parameters.depth - connectorCenter,
      z: parameters.height - connectorCenter,
    },
    "111": {
      x: parameters.width - connectorCenter,
      y: parameters.depth - connectorCenter,
      z: parameters.height - connectorCenter,
    },
  };

  const rails: PlacedElement[] = [
    rail("rail-bottom-front", "x", "000", "100"),
    rail("rail-bottom-back", "x", "010", "110"),
    rail("rail-top-front", "x", "001", "101"),
    rail("rail-top-back", "x", "011", "111"),
    rail("rail-bottom-left", "y", "000", "010"),
    rail("rail-bottom-right", "y", "100", "110"),
    rail("rail-top-left", "y", "001", "011"),
    rail("rail-top-right", "y", "101", "111"),
    rail("post-front-left", "z", "000", "001"),
    rail("post-front-right", "z", "100", "101"),
    rail("post-back-left", "z", "010", "011"),
    rail("post-back-right", "z", "110", "111"),
  ];

  const fixed: PlacedElement[] = parameters.includeCabinet
    ? [
        {
          kind: "fixed",
          id: "cabinet-a",
          specId: "cabinet-24",
          position: {
            x: Math.max(4, parameters.width * 0.18),
            y: Math.max(4, parameters.depth * 0.18),
            z: 0,
          },
        },
      ]
    : [];

  const walkwayStartX = Math.max(0, parameters.width - 34);
  const clearanceZones: ClearanceZone[] = [
    {
      id: "service-walkway",
      name: "Service walkway",
      minimumWidth: 30,
      bounds: {
        min: { x: walkwayStartX, y: 8, z: 0 },
        max: {
          x: Math.min(parameters.width, walkwayStartX + 30),
          y: Math.max(8, parameters.depth - 8),
          z: parameters.height,
        },
      },
    },
  ];

  return {
    boundary: {
      id: "workspace",
      name: "Configured build volume",
      origin: { x: 0, y: 0, z: 0 },
      dimensions: {
        width: parameters.width,
        depth: parameters.depth,
        height: parameters.height,
      },
    },
    specs,
    elements: [...connectors, ...rails, ...fixed],
    inventory: [
      ...Array.from({ length: parameters.stockPieceCount }, (_, index) => ({
        id: `tube-stock-${index + 1}`,
        specId: "steel-tube-1-5",
        label: `New tube stock ${index + 1}`,
        length: parameters.stockLength,
        status: "available" as const,
      })),
      {
        id: "tube-partial-1",
        specId: "steel-tube-1-5",
        label: "Partial offcut",
        length: parameters.partialStockLength,
        status: "partial" as const,
      },
      {
        id: "tube-allocated-old",
        specId: "steel-tube-1-5",
        label: "Already allocated old cut",
        length: 36,
        status: "allocated" as const,
      },
    ],
    assemblies: [
      {
        id: "bbq-island-a",
        kind: "bbq-island",
        name: "BBQ island frame",
        counterProfiles: [
          {
            id: "poured-counter",
            name: "Poured concrete counter with lip",
            slabThickness: 2,
            frontLipHeight: 3.5,
            overhang: { front: 1.5, back: 1, left: 1, right: 1 },
          },
        ],
        masonrySkins: [
          {
            id: "cement-board-skin",
            name: "Composite masonry board skin",
            thickness: 0.5,
            faces: ["front", "back", "left", "right", "top"],
          },
        ],
        inserts: parameters.includeCabinet
          ? [
              {
                id: "cabinet-a-profile",
                placedElementId: "cabinet-a",
                name: "24 in cabinet insert",
                body: { width: 24, depth: 22, height: 34 },
                faceFrame: { width: 27, height: 36, projection: 0.75 },
                requiredClearance: { side: 0.25, rear: 1, top: 0.5 },
                supportRails: [
                  {
                    id: "cabinet-a-front-support",
                    face: "front",
                    axis: "x",
                    offsetFromFloor: 4,
                    insetFromFace: 1.5,
                  },
                  {
                    id: "cabinet-a-rear-support",
                    face: "back",
                    axis: "x",
                    offsetFromFloor: 4,
                    insetFromFace: 3,
                  },
                ],
              },
            ]
          : [],
      },
    ],
    clearanceZones,
  };

  function rail(
    id: string,
    axis: "x" | "y" | "z",
    startKey: keyof typeof p,
    endKey: keyof typeof p,
  ): PlacedElement {
    return {
      kind: "linear",
      id,
      specId: "steel-tube-1-5",
      axis,
      start: { point: p[startKey], connectorId: `c-${startKey}`, portId: axis },
      end: { point: p[endKey], connectorId: `c-${endKey}`, portId: axis },
    };
  }
}
