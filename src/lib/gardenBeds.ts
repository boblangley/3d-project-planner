export interface GardenBedParameters {
  yardWidth: number;
  yardDepth: number;
  bedWidth: number;
  bedDepth: number;
  bedCount: number;
  walkway: number;
  panelHeight: 17 | 32;
  panelWidth: number;
  availablePanels: number;
  availableRoundedCorners: number;
  availableSharpCorners: number;
  includeTrellis: boolean;
}

export interface GardenPanelRun {
  id: string;
  side: "front" | "back" | "left" | "right";
  panelCount: number;
  panelWidth: number;
  actualLength: number;
}

export interface GardenBedPlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  panelRuns: GardenPanelRun[];
  roundedCornerCount: number;
  sharpCornerCount: number;
}

export interface GardenValidationIssue {
  id: string;
  severity: "error" | "warning";
  message: string;
}

export interface GardenInventoryLine {
  id: string;
  item: string;
  required: number;
  available: number;
  delta: number;
}

export interface GardenEvaluation {
  yard: {
    width: number;
    depth: number;
  };
  beds: GardenBedPlacement[];
  requiredPanels: number;
  requiredRoundedCorners: number;
  requiredSharpCorners: number;
  inventory: GardenInventoryLine[];
  validationIssues: GardenValidationIssue[];
  trellis?: {
    bedId: string;
    x: number;
    y: number;
    width: number;
    depth: number;
  };
}

export const initialGardenParameters: GardenBedParameters = {
  yardWidth: 240,
  yardDepth: 144,
  bedWidth: 48,
  bedDepth: 96,
  bedCount: 2,
  walkway: 36,
  panelHeight: 17,
  panelWidth: 24,
  availablePanels: 24,
  availableRoundedCorners: 8,
  availableSharpCorners: 0,
  includeTrellis: true,
};

export function evaluateGardenBeds(
  parameters: GardenBedParameters,
): GardenEvaluation {
  const issues: GardenValidationIssue[] = [];
  const bedPanelWidthCount = Math.ceil(parameters.bedWidth / parameters.panelWidth);
  const bedPanelDepthCount = Math.ceil(parameters.bedDepth / parameters.panelWidth);
  const actualBedWidth = bedPanelWidthCount * parameters.panelWidth;
  const actualBedDepth = bedPanelDepthCount * parameters.panelWidth;
  const columns = Math.max(
    1,
    Math.floor(
      (parameters.yardWidth + parameters.walkway) /
        (actualBedWidth + parameters.walkway),
    ),
  );

  const beds: GardenBedPlacement[] = Array.from(
    { length: parameters.bedCount },
    (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = column * (actualBedWidth + parameters.walkway);
      const y = row * (actualBedDepth + parameters.walkway);

      return {
        id: `bed-${index + 1}`,
        x,
        y,
        width: actualBedWidth,
        depth: actualBedDepth,
        panelRuns: [
          run(`bed-${index + 1}:front`, "front", bedPanelWidthCount, parameters.panelWidth),
          run(`bed-${index + 1}:back`, "back", bedPanelWidthCount, parameters.panelWidth),
          run(`bed-${index + 1}:left`, "left", bedPanelDepthCount, parameters.panelWidth),
          run(`bed-${index + 1}:right`, "right", bedPanelDepthCount, parameters.panelWidth),
        ],
        roundedCornerCount: 4,
        sharpCornerCount: 0,
      };
    },
  );

  for (const bed of beds) {
    if (bed.x + bed.width > parameters.yardWidth || bed.y + bed.depth > parameters.yardDepth) {
      issues.push({
        id: `yard-fit:${bed.id}`,
        severity: "error",
        message: `${bed.id} exceeds the configured yard space.`,
      });
    }
  }

  if (parameters.walkway < 24 && parameters.bedCount > 1) {
    issues.push({
      id: "walkway:min",
      severity: "warning",
      message: `Walkway is ${parameters.walkway} in; 24 in or more is recommended.`,
    });
  }

  const requiredPanels = beds.reduce(
    (total, bed) =>
      total +
      bed.panelRuns.reduce((runTotal, panelRun) => runTotal + panelRun.panelCount, 0),
    0,
  );
  const requiredRoundedCorners = beds.reduce(
    (total, bed) => total + bed.roundedCornerCount,
    0,
  );
  const requiredSharpCorners = beds.reduce(
    (total, bed) => total + bed.sharpCornerCount,
    0,
  );

  const inventory: GardenInventoryLine[] = [
    line("panels", `${parameters.panelHeight} in high panels`, requiredPanels, parameters.availablePanels),
    line("rounded-corners", "Outside radiused corners", requiredRoundedCorners, parameters.availableRoundedCorners),
    line("sharp-corners", "Inside sharp corners", requiredSharpCorners, parameters.availableSharpCorners),
  ];

  for (const item of inventory) {
    if (item.delta < 0) {
      issues.push({
        id: `inventory:${item.id}`,
        severity: "error",
        message: `${item.item} is short by ${Math.abs(item.delta)} piece(s).`,
      });
    }
  }

  const firstBed = beds[0];

  return {
    yard: {
      width: parameters.yardWidth,
      depth: parameters.yardDepth,
    },
    beds,
    requiredPanels,
    requiredRoundedCorners,
    requiredSharpCorners,
    inventory,
    validationIssues: issues,
    trellis:
      parameters.includeTrellis && firstBed
        ? {
            bedId: firstBed.id,
            x: firstBed.x + firstBed.width / 2 - 12,
            y: firstBed.y,
            width: 24,
            depth: firstBed.depth,
          }
        : undefined,
  };
}

function run(
  id: string,
  side: GardenPanelRun["side"],
  panelCount: number,
  panelWidth: number,
): GardenPanelRun {
  return {
    id,
    side,
    panelCount,
    panelWidth,
    actualLength: panelCount * panelWidth,
  };
}

function line(
  id: string,
  item: string,
  required: number,
  available: number,
): GardenInventoryLine {
  return {
    id,
    item,
    required,
    available,
    delta: available - required,
  };
}
