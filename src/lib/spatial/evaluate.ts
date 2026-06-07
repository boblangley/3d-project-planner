import {
  axisLength,
  boundaryToBox,
  boxFromMinAndDimensions,
  componentAt,
  containsBox,
  intersectsBox,
  isAxisAligned,
  linearBounds,
} from "./geometry";
import { optimizeCuts } from "./cutOptimizer";
import type {
  AssemblyArtifact,
  Axis,
  ComponentSpec,
  ConnectionGraph,
  ConnectionGraphEdge,
  ConnectionTerminal,
  ConnectorSpec,
  CutPiece,
  EvaluatedConfiguration,
  EvaluatedConnectorElement,
  EvaluatedElement,
  EvaluatedFixedElement,
  EvaluatedLinearElement,
  InsertSupportRail,
  LinearPrimitiveSpec,
  PlacedElement,
  ProcurementLine,
  SpatialConfiguration,
  ValidationIssue,
} from "./types";

export function evaluateSpatialConfiguration(
  configuration: SpatialConfiguration,
): EvaluatedConfiguration {
  const specsById = new Map(configuration.specs.map((spec) => [spec.id, spec]));
  const connectorsById = new Map(
    configuration.elements
      .filter((element) => element.kind === "connector")
      .map((element) => [element.id, element]),
  );
  const issues: ValidationIssue[] = [];
  const evaluated: EvaluatedElement[] = [];

  for (const element of configuration.elements) {
    const spec = specsById.get(element.specId);
    if (!spec) {
      issues.push(issue("UNKNOWN_SPEC", `No component spec found for "${element.specId}".`, element.id));
      continue;
    }

    if (element.kind !== spec.category) {
      issues.push(issue("UNKNOWN_SPEC", `Element "${element.id}" references a ${spec.category} spec but is placed as ${element.kind}.`, element.id));
      continue;
    }

    if (element.kind === "linear") {
      evaluated.push(evaluateLinear(element, spec as LinearPrimitiveSpec, specsById, connectorsById, issues));
    } else if (element.kind === "fixed") {
      const fixedSpec = spec as Extract<ComponentSpec, { category: "fixed" }>;
      evaluated.push({
        kind: "fixed",
        id: element.id,
        spec: fixedSpec,
        bounds: boxFromMinAndDimensions(element.position, fixedSpec.dimensions),
      });
    } else {
      const connectorSpec = spec as Extract<ComponentSpec, { category: "connector" }>;
      evaluated.push({
        kind: "connector",
        id: element.id,
        spec: connectorSpec,
        bounds: boxFromMinAndDimensions(element.position, connectorSpec.dimensions),
      });
    }
  }

  validateBounds(configuration, evaluated, issues);
  validateClearances(configuration, evaluated, issues);
  validateAssemblies(configuration, issues);

  const linearElements = evaluated.filter(
    (element): element is EvaluatedLinearElement => element.kind === "linear",
  );
  const fixedElements = evaluated.filter(
    (element): element is EvaluatedFixedElement => element.kind === "fixed",
  );
  const connectorElements = evaluated.filter(
    (element): element is EvaluatedConnectorElement => element.kind === "connector",
  );
  const connectionGraph = buildConnectionGraph(linearElements, connectorElements);
  const assemblyArtifacts = buildAssemblyArtifacts(configuration, fixedElements);
  const cutPieces = buildCutPieces(linearElements);
  const cutMap = optimizeCuts(
    groupCutsBySpec(linearElements, cutPieces),
    configuration.inventory,
  );

  if (configuration.inventory && cutMap.unplacedCuts.length > 0) {
    issues.push(
      issue(
        "INVENTORY_SHORTAGE",
        `${cutMap.unplacedCuts.length} cut(s) cannot be allocated to available inventory.`,
      ),
    );
  }

  return {
    boundary: configuration.boundary,
    elements: evaluated,
    linearElements,
    fixedElements,
    connectorElements,
    validationIssues: issues,
    procurement: buildProcurement(configuration.specs, linearElements, fixedElements, connectorElements),
    connectionGraph,
    inventoryAllocations: cutMap.stock
      .filter((plan) => plan.sourceInventoryItemId)
      .map((plan) => ({
        inventoryItemId: plan.sourceInventoryItemId!,
        inventoryLabel: plan.sourceLabel ?? plan.stockItemId,
        specId: plan.specId,
        cuts: plan.cuts,
        remainingLength: plan.scrapLength,
      })),
    unallocatedCuts: cutMap.unplacedCuts,
    assemblyArtifacts,
  };
}

export function buildCutPieces(linearElements: EvaluatedLinearElement[]): CutPiece[] {
  return linearElements.map((element) => ({
    id: element.id,
    specId: element.spec.id,
    length: element.cutLength,
  }));
}

function evaluateLinear(
  element: Extract<PlacedElement, { kind: "linear" }>,
  spec: LinearPrimitiveSpec,
  specsById: Map<string, ComponentSpec>,
  connectorsById: Map<string, Extract<PlacedElement, { kind: "connector" }>>,
  issues: ValidationIssue[],
): EvaluatedLinearElement {
  if (!isAxisAligned(element.start.point, element.end.point, element.axis)) {
    issues.push(issue("NON_AXIS_ALIGNED_LINEAR", `Linear element "${element.id}" is not aligned to the ${element.axis}-axis.`, element.id));
  }

  const rawSpanLength = Math.abs(
    componentAt(element.end.point, element.axis) -
      componentAt(element.start.point, element.axis),
  );
  const startDeduction = connectorDeduction(
    element.start.connectorId,
    element.start.portId,
    element.axis,
    specsById,
    connectorsById,
    issues,
    element.id,
  );
  const endDeduction = connectorDeduction(
    element.end.connectorId,
    element.end.portId,
    element.axis,
    specsById,
    connectorsById,
    issues,
    element.id,
  );
  const cutLength = roundLength(rawSpanLength - startDeduction - endDeduction);

  if (cutLength <= 0) {
    issues.push(issue("NEGATIVE_CUT_LENGTH", `Connector deductions leave "${element.id}" with a non-positive cut length of ${cutLength}.`, element.id));
  }

  if (cutLength > spec.maxCutLength || cutLength > spec.rawStockLength) {
    issues.push(issue("STOCK_LENGTH_EXCEEDED", `Cut length ${cutLength} for "${element.id}" exceeds available stock limit.`, element.id));
  }

  return {
    kind: "linear",
    id: element.id,
    spec,
    axis: element.axis,
    rawSpanLength: roundLength(rawSpanLength),
    startDeduction,
    endDeduction,
    cutLength,
    bounds: linearBounds(element.start.point, element.end.point, element.axis, spec.profileDimensions),
    connections: {
      start: connectionTerminal(
        element.start.connectorId,
        element.start.portId,
        element.axis,
        startDeduction,
      ),
      end: connectionTerminal(
        element.end.connectorId,
        element.end.portId,
        element.axis,
        endDeduction,
      ),
    },
  };
}

function connectorDeduction(
  connectorId: string | undefined,
  portId: string | undefined,
  axis: Axis,
  specsById: Map<string, ComponentSpec>,
  connectorsById: Map<string, Extract<PlacedElement, { kind: "connector" }>>,
  issues: ValidationIssue[],
  elementId: string,
): number {
  if (!connectorId) return 0;

  const connector = connectorsById.get(connectorId);
  if (!connector) {
    issues.push(issue("UNKNOWN_CONNECTOR", `Linear element "${elementId}" references missing connector "${connectorId}".`, elementId));
    return 0;
  }

  const spec = specsById.get(connector.specId);
  if (!spec || spec.category !== "connector") {
    issues.push(issue("UNKNOWN_CONNECTOR", `Connector "${connectorId}" does not reference a connector spec.`, elementId));
    return 0;
  }

  const connectorSpec = spec as ConnectorSpec;
  if (connectorSpec.ports && connectorSpec.ports.length > 0 && portId) {
    const port = connectorSpec.ports.find((candidate) => candidate.id === portId);
    if (!port) {
      issues.push(issue("UNKNOWN_CONNECTOR_PORT", `Connector "${connectorId}" does not have port "${portId}".`, elementId));
      return connectorSpec.defaultDeduction;
    }

    if (port.axis !== axis) {
      issues.push(issue("PORT_AXIS_MISMATCH", `Port "${portId}" on connector "${connectorId}" is a ${port.axis}-axis port, but "${elementId}" runs on the ${axis}-axis.`, elementId));
    }

    return roundLength(port.deduction);
  }

  if (connectorSpec.ports && connectorSpec.ports.length > 0 && !portId) {
    const matchingPort = connectorSpec.ports.find((port) => port.axis === axis);
    if (matchingPort) return roundLength(matchingPort.deduction);
  }

  return roundLength(connectorSpec.deductionByAxis?.[axis] ?? connectorSpec.defaultDeduction);
}

function validateBounds(
  configuration: SpatialConfiguration,
  evaluated: EvaluatedElement[],
  issues: ValidationIssue[],
) {
  const boundaryBox = boundaryToBox(
    configuration.boundary.origin,
    configuration.boundary.dimensions,
  );

  for (const element of evaluated) {
    if (!containsBox(boundaryBox, element.bounds)) {
      issues.push(issue("BOUNDARY_EXCEEDED", `Element "${element.id}" exceeds the configured boundary space.`, element.id));
    }
  }
}

function validateClearances(
  configuration: SpatialConfiguration,
  evaluated: EvaluatedElement[],
  issues: ValidationIssue[],
) {
  for (const zone of configuration.clearanceZones ?? []) {
    if (zone.minimumWidth) {
      const width = Math.min(
        zone.bounds.max.x - zone.bounds.min.x,
        zone.bounds.max.y - zone.bounds.min.y,
      );

      if (width < zone.minimumWidth) {
        issues.push({
          ...issue("CLEARANCE_TOO_SMALL", `Clearance zone "${zone.name}" is ${width}, below the required ${zone.minimumWidth}.`),
          zoneId: zone.id,
        });
      }
    }

    for (const element of evaluated) {
      if (intersectsBox(zone.bounds, element.bounds)) {
        issues.push({
          ...issue("CLEARANCE_OBSTRUCTED", `Element "${element.id}" obstructs clearance zone "${zone.name}".`, element.id),
          zoneId: zone.id,
        });
      }
    }
  }
}

function validateAssemblies(
  configuration: SpatialConfiguration,
  issues: ValidationIssue[],
) {
  for (const assembly of configuration.assemblies ?? []) {
    if (assembly.kind !== "bbq-island") continue;

    for (const insert of assembly.inserts ?? []) {
      for (const support of insert.supportRails) {
        if (support.offsetFromFloor > configuration.boundary.dimensions.height) {
          issues.push(
            issue(
              "INSERT_SUPPORT_OUTSIDE_FRAME",
              `Support rail "${support.id}" for "${insert.name}" is above the configured frame height.`,
            ),
          );
        }
      }
    }
  }
}

function buildAssemblyArtifacts(
  configuration: SpatialConfiguration,
  fixedElements: EvaluatedFixedElement[],
): AssemblyArtifact[] {
  const artifacts: AssemblyArtifact[] = [];
  const boundary = configuration.boundary;
  const { width, depth, height } = boundary.dimensions;

  for (const assembly of configuration.assemblies ?? []) {
    if (assembly.kind !== "bbq-island") continue;

    for (const profile of assembly.counterProfiles ?? []) {
      artifacts.push({
        id: `${profile.id}:slab`,
        assemblyId: assembly.id,
        kind: "counter-slab",
        name: `${profile.name} slab`,
        sourceId: profile.id,
        bounds: {
          min: {
            x: boundary.origin.x - profile.overhang.left,
            y: boundary.origin.y - profile.overhang.front,
            z: boundary.origin.z + height,
          },
          max: {
            x: boundary.origin.x + width + profile.overhang.right,
            y: boundary.origin.y + depth + profile.overhang.back,
            z: boundary.origin.z + height + profile.slabThickness,
          },
        },
      });

      artifacts.push({
        id: `${profile.id}:front-lip`,
        assemblyId: assembly.id,
        kind: "counter-lip",
        name: `${profile.name} front lip`,
        sourceId: profile.id,
        bounds: {
          min: {
            x: boundary.origin.x - profile.overhang.left,
            y: boundary.origin.y - profile.overhang.front,
            z: boundary.origin.z + height - profile.frontLipHeight,
          },
          max: {
            x: boundary.origin.x + width + profile.overhang.right,
            y: boundary.origin.y,
            z: boundary.origin.z + height,
          },
        },
      });
    }

    for (const skin of assembly.masonrySkins ?? []) {
      for (const face of skin.faces) {
        artifacts.push({
          id: `${skin.id}:${face}`,
          assemblyId: assembly.id,
          kind: "masonry-skin",
          name: `${skin.name} ${face}`,
          sourceId: skin.id,
          bounds: masonryBounds(face, skin.thickness, boundary.origin, boundary.dimensions),
        });
      }
    }

    for (const insert of assembly.inserts ?? []) {
      const placed = fixedElements.find(
        (element) => element.id === insert.placedElementId,
      );
      if (!placed) continue;

      artifacts.push({
        id: `${insert.id}:body`,
        assemblyId: assembly.id,
        kind: "insert-body",
        name: `${insert.name} body envelope`,
        sourceId: insert.id,
        bounds: placed.bounds,
      });

      artifacts.push({
        id: `${insert.id}:face-frame`,
        assemblyId: assembly.id,
        kind: "face-frame",
        name: `${insert.name} face frame`,
        sourceId: insert.id,
        bounds: {
          min: {
            x:
              placed.bounds.min.x -
              (insert.faceFrame.width - insert.body.width) / 2,
            y: placed.bounds.min.y - insert.faceFrame.projection,
            z: placed.bounds.min.z,
          },
          max: {
            x:
              placed.bounds.min.x +
              insert.body.width +
              (insert.faceFrame.width - insert.body.width) / 2,
            y: placed.bounds.min.y,
            z: placed.bounds.min.z + insert.faceFrame.height,
          },
        },
      });

      for (const support of insert.supportRails) {
        artifacts.push({
          id: support.id,
          assemblyId: assembly.id,
          kind: "support-rail",
          name: `${insert.name} ${support.face} support rail`,
          sourceId: insert.id,
          bounds: supportRailBounds(support, placed.bounds),
        });
      }
    }
  }

  return artifacts;
}

function masonryBounds(
  face: "front" | "back" | "left" | "right" | "top",
  thickness: number,
  origin: SpatialConfiguration["boundary"]["origin"],
  dimensions: SpatialConfiguration["boundary"]["dimensions"],
) {
  const { width, depth, height } = dimensions;
  if (face === "front") {
    return {
      min: { x: origin.x, y: origin.y - thickness, z: origin.z },
      max: { x: origin.x + width, y: origin.y, z: origin.z + height },
    };
  }
  if (face === "back") {
    return {
      min: { x: origin.x, y: origin.y + depth, z: origin.z },
      max: { x: origin.x + width, y: origin.y + depth + thickness, z: origin.z + height },
    };
  }
  if (face === "left") {
    return {
      min: { x: origin.x - thickness, y: origin.y, z: origin.z },
      max: { x: origin.x, y: origin.y + depth, z: origin.z + height },
    };
  }
  if (face === "right") {
    return {
      min: { x: origin.x + width, y: origin.y, z: origin.z },
      max: { x: origin.x + width + thickness, y: origin.y + depth, z: origin.z + height },
    };
  }
  return {
    min: { x: origin.x, y: origin.y, z: origin.z + height },
    max: { x: origin.x + width, y: origin.y + depth, z: origin.z + height + thickness },
  };
}

function supportRailBounds(
  support: InsertSupportRail,
  insertBounds: EvaluatedFixedElement["bounds"],
) {
  const z = insertBounds.min.z + support.offsetFromFloor;
  const thickness = 1.5;

  if (support.face === "front" || support.face === "back") {
    const y =
      support.face === "front"
        ? insertBounds.min.y - support.insetFromFace
        : insertBounds.max.y + support.insetFromFace - thickness;
    return {
      min: { x: insertBounds.min.x, y, z },
      max: { x: insertBounds.max.x, y: y + thickness, z: z + thickness },
    };
  }

  const x =
    support.face === "left"
      ? insertBounds.min.x - support.insetFromFace
      : insertBounds.max.x + support.insetFromFace - thickness;
  return {
    min: { x, y: insertBounds.min.y, z },
    max: { x: x + thickness, y: insertBounds.max.y, z: z + thickness },
  };
}

function connectionTerminal(
  connectorId: string | undefined,
  portId: string | undefined,
  axis: Axis,
  deduction: number,
): ConnectionTerminal | undefined {
  if (!connectorId) return undefined;
  return {
    connectorId,
    portId,
    axis,
    deduction,
  };
}

function buildConnectionGraph(
  linearElements: EvaluatedLinearElement[],
  connectorElements: EvaluatedConnectorElement[],
): ConnectionGraph {
  const nodes = new Map<string, ConnectionGraph["nodes"][number]>();
  const edges: ConnectionGraphEdge[] = [];

  for (const connector of connectorElements) {
    nodes.set(connector.id, {
      connectorId: connector.id,
      specId: connector.spec.id,
      ports: (connector.spec.ports ?? []).map((port) => ({
        portId: port.id,
        axis: port.axis,
        attachedLinearElementIds: [],
      })),
    });
  }

  for (const element of linearElements) {
    edges.push({
      id: `edge:${element.id}`,
      linearElementId: element.id,
      start: element.connections.start,
      end: element.connections.end,
    });

    for (const terminal of [
      element.connections.start,
      element.connections.end,
    ]) {
      if (!terminal) continue;
      const node = nodes.get(terminal.connectorId);
      if (!node) continue;
      const portId = terminal.portId ?? terminal.axis;
      let port = node.ports.find((candidate) => candidate.portId === portId);
      if (!port) {
        port = {
          portId,
          axis: terminal.axis,
          attachedLinearElementIds: [],
        };
        node.ports.push(port);
      }
      port.attachedLinearElementIds.push(element.id);
    }
  }

  return {
    nodes: [...nodes.values()],
    edges,
  };
}

function groupCutsBySpec(
  linearElements: EvaluatedLinearElement[],
  cuts: CutPiece[],
) {
  const specsById = new Map(
    linearElements.map((element) => [element.spec.id, element.spec]),
  );
  const cutsBySpec = cuts.reduce<Map<string, CutPiece[]>>((map, cut) => {
    const existing = map.get(cut.specId);
    if (existing) existing.push(cut);
    else map.set(cut.specId, [cut]);
    return map;
  }, new Map());

  return [...cutsBySpec.entries()].map(([specId, specCuts]) => ({
    spec: specsById.get(specId)!,
    cuts: specCuts,
  }));
}

function buildProcurement(
  specs: ComponentSpec[],
  linearElements: EvaluatedLinearElement[],
  fixedElements: EvaluatedFixedElement[],
  connectorElements: EvaluatedConnectorElement[],
): ProcurementLine[] {
  const lines = new Map<string, ProcurementLine>();

  for (const element of fixedElements) {
    increment(lines, element.spec, 1);
  }

  for (const element of connectorElements) {
    increment(lines, element.spec, 1);
  }

  for (const spec of specs.filter((candidate): candidate is LinearPrimitiveSpec => candidate.category === "linear")) {
    const cuts = linearElements.filter((element) => element.spec.id === spec.id);
    if (cuts.length === 0) continue;
    lines.set(`linear:${spec.id}`, {
      id: `linear:${spec.id}`,
      category: "linear",
      specId: spec.id,
      name: spec.name,
      quantity: cuts.length,
      totalCutLength: roundLength(cuts.reduce((total, cut) => total + cut.cutLength, 0)),
      rawStockLength: spec.rawStockLength,
    });
  }

  return [...lines.values()];
}

function increment(
  lines: Map<string, ProcurementLine>,
  spec: ComponentSpec,
  quantity: number,
) {
  const id = `${spec.category}:${spec.id}`;
  const existing = lines.get(id);
  if (existing) {
    existing.quantity += quantity;
    return;
  }

  lines.set(id, {
    id,
    category: spec.category,
    specId: spec.id,
    name: spec.name,
    quantity,
  });
}

function issue(
  code: ValidationIssue["code"],
  message: string,
  elementId?: string,
): ValidationIssue {
  return {
    id: `${code}:${elementId ?? "global"}:${message}`,
    severity: code === "CLEARANCE_TOO_SMALL" ? "warning" : "error",
    code,
    message,
    elementId,
  };
}

function roundLength(value: number): number {
  return Number(value.toFixed(4));
}
