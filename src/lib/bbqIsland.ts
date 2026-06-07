import {
  addMemberWithSurfaceConnectors,
  structuralConnectorPosition,
} from "./bbqStructuralTopology";
import type { Axis, Box3, InventoryItem } from "./spatial";

export type IslandFace = "front" | "back" | "left" | "right";
export type InsertKind = "drawer" | "door" | "sleeve";
export type StructuralMemberKind = "vertical-post" | "horizontal-beam" | "rafter";
export type StructuralConnectorKind = "node" | "surface";
export type StructuralConnectorDirection = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
export type StructuralMemberTerminal = "start" | "end";
export type ConnectorType =
  | "5-way"
  | "4-way"
  | "3-way-corner"
  | "3-way-T"
  | "linear-2-way"
  | "l-2-way"
  | "tee-surface";

export interface SectionRelationship {
  connectsToSectionId: string;
  type: "right-of" | "left-of" | "behind" | "in-front" | "offset";
  offset: {
    x: number;
    y: number;
    z: number;
  };
  sharedFace?: IslandFace;
}

export interface ExtraVerticalPost {
  id: string;
  color: string;
  face: IslandFace;
  offset: number;
}

export interface StructuralMember {
  id: string;
  name: string;
  color: string;
  kind: StructuralMemberKind;
  startConnectorId?: string;
  endConnectorId?: string;
  start: {
    x: number;
    y: number;
    z: number;
  };
  end: {
    x: number;
    y: number;
    z: number;
  };
}

export interface StructuralConnectorAttachment {
  memberId: string;
  terminal: StructuralMemberTerminal;
}

export interface StructuralNodeConnector {
  id: string;
  name: string;
  color: string;
  kind: "node";
  connectorType: ConnectorType;
  axis: Axis;
  position: {
    x: number;
    y: number;
    z: number;
  };
  enabledDirections: StructuralConnectorDirection[];
  rotation: number;
}

export interface StructuralSurfaceConnector {
  id: string;
  name: string;
  color: string;
  kind: "surface";
  connectorType: "tee-surface";
  hostMemberId: string;
  hostFace: StructuralConnectorDirection;
  offset: number;
  attached?: StructuralConnectorAttachment;
}

export type StructuralConnector =
  | StructuralNodeConnector
  | StructuralSurfaceConnector;

export interface InsertDefinition {
  id: string;
  kind: InsertKind;
  name: string;
  color: string;
  sectionId: string;
  face: IslandFace;
  offsetFromLeft: number;
  offsetFromBottom: number;
  body: {
    width: number;
    depth: number;
    height: number;
  };
  faceFrame: {
    width: number;
    height: number;
    projection: number;
    memberSize: number;
  };
}

export interface IslandSection {
  id: string;
  name: string;
  origin: {
    x: number;
    y: number;
    z: number;
  };
  length: number;
  depth: number;
  height: number;
  extraVerticalPosts: ExtraVerticalPost[];
  structuralMembers: StructuralMember[];
  structuralConnectors: StructuralConnector[];
  relationship?: SectionRelationship;
}

export interface IslandGlobalSettings {
  tubeSpecId: string;
  tubeProfileSize: number;
  connectorDeduction: number;
  connectorSize: number;
  counter: {
    thickness: number;
    edgeOverhang: number;
    edgeThickness: number;
  };
  footingBoard: {
    thickness: number;
  };
}

export interface BbqIslandModel {
  id: string;
  name: string;
  settings: IslandGlobalSettings;
  sections: IslandSection[];
  inserts: InsertDefinition[];
  inventory: InventoryItem[];
}

export interface AssemblyPiece {
  id: string;
  sectionId?: string;
  sourceId?: string;
  kind:
    | "tube"
    | "insert-body"
    | "insert-face-frame"
    | "insert-sleeve-frame"
    | "counter"
    | "footing-board";
  axis?: Axis;
  length?: number;
  color?: string;
  bounds: Box3;
}

export interface BbqConnector {
  id: string;
  sectionId: string;
  kind: StructuralConnectorKind;
  position: {
    x: number;
    y: number;
    z: number;
  };
  directions: string[];
  pieceIds: string[];
  connectorType: ConnectorType;
  hostMemberId?: string;
}

export interface BbqInventoryAllocation {
  inventoryItemId: string;
  inventoryLabel: string;
  pieces: AssemblyPiece[];
  remainingLength: number;
}

export interface BbqValidationIssue {
  id: string;
  severity: "error" | "warning";
  message: string;
}

export interface BbqIslandEvaluation {
  pieces: AssemblyPiece[];
  tubePieces: AssemblyPiece[];
  connectors: BbqConnector[];
  allocations: BbqInventoryAllocation[];
  unallocatedPieces: AssemblyPiece[];
  validationIssues: BbqValidationIssue[];
  bounds: Box3;
}

export const defaultBbqSectionDepth = 31.5;
export const defaultBbqSectionHeight = 36;

const mainSectionTopology = createBoxFrameTopology({
  prefix: "main",
  length: 96,
  depth: defaultBbqSectionDepth,
  height: defaultBbqSectionHeight,
  tubeWidth: 1,
  connectorSize: 1,
});
const sideBurnerSectionTopology = createBoxFrameTopology({
  prefix: "side",
  length: 28,
  depth: defaultBbqSectionDepth,
  height: defaultBbqSectionHeight,
  tubeWidth: 1,
  connectorSize: 1,
});
const mainSectionModel = withSurfaceConnectedMembers(
  {
    id: "main-section",
    name: "Main cabinet run",
    origin: { x: 0, y: 0, z: 0 },
    length: 96,
    depth: defaultBbqSectionDepth,
    height: defaultBbqSectionHeight,
    structuralMembers: mainSectionTopology.structuralMembers,
    structuralConnectors: mainSectionTopology.structuralConnectors,
    extraVerticalPosts: [],
  },
  [
    verticalMember("main-front-post-18", "Front post 18", 18, 0, 1, 35, "#0891b2"),
    verticalMember("main-front-post-32", "Front post 32", 32, 0, 1, 35, "#0891b2"),
    verticalMember("main-back-post-18", "Back post 18", 18, 30.5, 1, 35, "#0891b2"),
    verticalMember("main-back-post-32", "Back post 32", 32, 30.5, 1, 35, "#0891b2"),
    verticalMember("main-front-post-64", "Front post 64", 64, 0, 1, 35, "#0891b2"),
    verticalMember("main-back-post-64", "Back post 64", 64, 30.5, 1, 35, "#0891b2"),
  ],
  1,
);
const sideBurnerSectionModel = withSurfaceConnectedMembers(
  {
    id: "side-burner-section",
    name: "Side burner sleeve",
    origin: { x: 96, y: 0, z: 0 },
    length: 28,
    depth: defaultBbqSectionDepth,
    height: defaultBbqSectionHeight,
    structuralMembers: sideBurnerSectionTopology.structuralMembers,
    structuralConnectors: sideBurnerSectionTopology.structuralConnectors,
    relationship: {
      connectsToSectionId: "main-section",
      type: "right-of",
      offset: { x: 0, y: 0, z: 0 },
      sharedFace: "left",
    },
    extraVerticalPosts: [],
  },
  [
    verticalMember("side-front-post-14", "Front post 14", 14, 0, 1, 35, "#0891b2"),
    verticalMember("side-back-post-14", "Back post 14", 14, 30.5, 1, 35, "#0891b2"),
  ],
  1,
);

export const initialBbqIslandModel: BbqIslandModel = {
  id: "island-a",
  name: "Island A",
  settings: {
    tubeSpecId: "steel-tube-1-5",
    tubeProfileSize: 1,
    connectorDeduction: 1,
    connectorSize: 1,
    counter: {
      thickness: 2,
      edgeOverhang: 1.5,
      edgeThickness: 3.5,
    },
    footingBoard: {
      thickness: 0.5,
    },
  },
  sections: [mainSectionModel, sideBurnerSectionModel],
  inserts: [
    {
      id: "drawer-stack",
      kind: "drawer",
      name: "Three drawer insert",
      color: "#dc2626",
      sectionId: "main-section",
      face: "front",
      offsetFromLeft: 18,
      offsetFromBottom: 4,
      body: { width: 14, depth: 23, height: 21 },
      faceFrame: { width: 14, height: 21, projection: 0.75, memberSize: 1.5 },
    },
    {
      id: "side-burner-sleeve-insert",
      kind: "sleeve",
      name: "Side burner sleeve insert",
      color: "#f97316",
      sectionId: "side-burner-section",
      face: "front",
      offsetFromLeft: 4,
      offsetFromBottom: 20,
      body: { width: 20, depth: 28, height: 14 },
      faceFrame: { width: 20, height: 14, projection: 1.5, memberSize: 1.5 },
    },
  ],
  inventory: [
    ...Array.from({ length: 14 }, (_, index) => ({
      id: `tube-stock-${index + 1}`,
      specId: "steel-tube-1-5",
      label: `Tube stock ${index + 1}`,
      length: 120,
      status: "available" as const,
    })),
    {
      id: "tube-offcut-1",
      specId: "steel-tube-1-5",
      label: "Existing offcut",
      length: 42,
      status: "partial" as const,
    },
  ],
};

export function createBoxFrameTopology({
  prefix,
  length,
  depth = defaultBbqSectionDepth,
  height = defaultBbqSectionHeight,
  tubeWidth = 1,
  connectorSize = 1,
}: {
  prefix: string;
  length: number;
  depth?: number;
  height?: number;
  tubeWidth?: number;
  connectorSize?: number;
}): Pick<IslandSection, "structuralMembers" | "structuralConnectors"> {
  const rightX = length - tubeWidth;
  const backY = depth - tubeWidth;
  const topZ = height - tubeWidth;
  const innerRightX = length - connectorSize;
  const innerBackY = depth - connectorSize;
  const innerTopZ = height - connectorSize;
  const nodeIds = {
    frontLeftBottom: `${prefix}-node-front-left-bottom`,
    frontRightBottom: `${prefix}-node-front-right-bottom`,
    backLeftBottom: `${prefix}-node-back-left-bottom`,
    backRightBottom: `${prefix}-node-back-right-bottom`,
    frontLeftTop: `${prefix}-node-front-left-top`,
    frontRightTop: `${prefix}-node-front-right-top`,
    backLeftTop: `${prefix}-node-back-left-top`,
    backRightTop: `${prefix}-node-back-right-top`,
  };

  return {
    structuralConnectors: [
      cornerNode(nodeIds.frontLeftBottom, "Front left bottom", 0, 0, 0, ["+X", "+Y", "+Z"]),
      cornerNode(nodeIds.frontRightBottom, "Front right bottom", length, 0, 0, ["-X", "+Y", "+Z"]),
      cornerNode(nodeIds.backLeftBottom, "Back left bottom", 0, depth, 0, ["+X", "-Y", "+Z"]),
      cornerNode(nodeIds.backRightBottom, "Back right bottom", length, depth, 0, ["-X", "-Y", "+Z"]),
      cornerNode(nodeIds.frontLeftTop, "Front left top", 0, 0, height, ["+X", "+Y", "-Z"]),
      cornerNode(nodeIds.frontRightTop, "Front right top", length, 0, height, ["-X", "+Y", "-Z"]),
      cornerNode(nodeIds.backLeftTop, "Back left top", 0, depth, height, ["+X", "-Y", "-Z"]),
      cornerNode(nodeIds.backRightTop, "Back right top", length, depth, height, ["-X", "-Y", "-Z"]),
    ],
    structuralMembers: [
      withConnectors(
        verticalMember(`${prefix}-post-front-left`, "Front left post", 0, 0, connectorSize, innerTopZ),
        nodeIds.frontLeftBottom,
        nodeIds.frontLeftTop,
      ),
      withConnectors(
        verticalMember(`${prefix}-post-front-right`, "Front right post", rightX, 0, connectorSize, innerTopZ),
        nodeIds.frontRightBottom,
        nodeIds.frontRightTop,
      ),
      withConnectors(
        verticalMember(`${prefix}-post-back-left`, "Back left post", 0, backY, connectorSize, innerTopZ),
        nodeIds.backLeftBottom,
        nodeIds.backLeftTop,
      ),
      withConnectors(
        verticalMember(`${prefix}-post-back-right`, "Back right post", rightX, backY, connectorSize, innerTopZ),
        nodeIds.backRightBottom,
        nodeIds.backRightTop,
      ),
      withConnectors(
        horizontalMember(`${prefix}-beam-front-bottom`, "Front bottom beam", connectorSize, innerRightX, 0, 0),
        nodeIds.frontLeftBottom,
        nodeIds.frontRightBottom,
      ),
      withConnectors(
        horizontalMember(`${prefix}-beam-back-bottom`, "Back bottom beam", connectorSize, innerRightX, backY, 0),
        nodeIds.backLeftBottom,
        nodeIds.backRightBottom,
      ),
      withConnectors(
        horizontalMember(`${prefix}-beam-front-top`, "Front top beam", connectorSize, innerRightX, 0, topZ),
        nodeIds.frontLeftTop,
        nodeIds.frontRightTop,
      ),
      withConnectors(
        horizontalMember(`${prefix}-beam-back-top`, "Back top beam", connectorSize, innerRightX, backY, topZ),
        nodeIds.backLeftTop,
        nodeIds.backRightTop,
      ),
      withConnectors(
        rafterMember(`${prefix}-rafter-left-bottom`, "Left bottom rafter", 0, connectorSize, innerBackY, 0),
        nodeIds.frontLeftBottom,
        nodeIds.backLeftBottom,
      ),
      withConnectors(
        rafterMember(`${prefix}-rafter-right-bottom`, "Right bottom rafter", rightX, connectorSize, innerBackY, 0),
        nodeIds.frontRightBottom,
        nodeIds.backRightBottom,
      ),
      withConnectors(
        rafterMember(`${prefix}-rafter-left-top`, "Left top rafter", 0, connectorSize, innerBackY, topZ),
        nodeIds.frontLeftTop,
        nodeIds.backLeftTop,
      ),
      withConnectors(
        rafterMember(`${prefix}-rafter-right-top`, "Right top rafter", rightX, connectorSize, innerBackY, topZ),
        nodeIds.frontRightTop,
        nodeIds.backRightTop,
      ),
    ],
	  };
	}

function withSurfaceConnectedMembers(
  section: IslandSection,
  members: StructuralMember[],
  tubeWidth: number,
) {
  return members.reduce(
    (currentSection, member) =>
      addMemberWithSurfaceConnectors(currentSection, member, tubeWidth),
    section,
  );
}

function cornerNode(
  id: string,
  label: string,
  x: number,
  y: number,
  z: number,
  enabledDirections: StructuralConnectorDirection[],
): StructuralConnector {
  return {
    id,
    name: `${label} connector`,
    color: "#94a3b8",
    kind: "node",
    connectorType: "3-way-corner",
    axis: "x",
    position: { x, y, z },
    enabledDirections,
    rotation: 0,
  };
}

function withConnectors(
  member: StructuralMember,
  startConnectorId: string,
  endConnectorId: string,
): StructuralMember {
  return {
    ...member,
    startConnectorId,
    endConnectorId,
  };
}

function verticalMember(
  id: string,
  name: string,
  x: number,
  y: number,
  zStart: number,
  zEnd: number,
  color = "#0891b2",
): StructuralMember {
  return {
    id,
    name,
    color,
    kind: "vertical-post",
    start: { x, y, z: zStart },
    end: { x, y, z: zEnd },
  };
}

function horizontalMember(
  id: string,
  name: string,
  xStart: number,
  xEnd: number,
  y: number,
  z: number,
  color = "#2563eb",
): StructuralMember {
  return {
    id,
    name,
    color,
    kind: "horizontal-beam",
    start: { x: xStart, y, z },
    end: { x: xEnd, y, z },
  };
}

function rafterMember(
  id: string,
  name: string,
  x: number,
  yStart: number,
  yEnd: number,
  z: number,
  color = "#dc2626",
): StructuralMember {
  return {
    id,
    name,
    color,
    kind: "rafter",
    start: { x, y: yStart, z },
    end: { x, y: yEnd, z },
  };
}

export function evaluateBbqIsland(model: BbqIslandModel): BbqIslandEvaluation {
  const pieces: AssemblyPiece[] = [];
  const issues: BbqValidationIssue[] = [];

  for (const section of model.sections) {
    pieces.push(...sectionStructuralMemberPieces(model, section, issues));
    pieces.push(...sectionFootingPieces(model, section));
  }

  for (const insert of model.inserts) {
    const section = model.sections.find((candidate) => candidate.id === insert.sectionId);
    if (!section) {
      issues.push({
        id: `insert-section:${insert.id}`,
        severity: "error",
        message: `${insert.name} references missing section ${insert.sectionId}.`,
      });
      continue;
    }

    pieces.push(...insertObjectPieces(section, insert));
    validateInsertFaceFrame(model, section, insert, issues);
  }

  pieces.push(counterPiece(model));

  const tubePieces = pieces.filter((piece) => isTubeInventoryPiece(piece));
  const connectors = explicitConnectors(model);
  const { allocations, unallocatedPieces } = allocateTubeInventory(model, tubePieces);

  if (unallocatedPieces.length > 0) {
    issues.push({
      id: "inventory:tube-shortage",
      severity: "error",
      message: `${unallocatedPieces.length} tube piece(s) could not be allocated to available inventory.`,
    });
  }

  return {
    pieces,
    tubePieces,
    connectors,
    allocations,
    unallocatedPieces,
    validationIssues: issues,
    bounds: overallBounds(pieces),
  };
}

function sectionStructuralMemberPieces(
  model: BbqIslandModel,
  section: IslandSection,
  issues: BbqValidationIssue[],
): AssemblyPiece[] {
  const pieces: AssemblyPiece[] = [];

  for (const member of section.structuralMembers ?? []) {
    const axis = structuralMemberAxis(member);
    const length = structuralMemberLength(member);

    if (length <= 0) {
      issues.push({
        id: `structural-member-length:${member.id}`,
        severity: "error",
        message: `${member.name} must have a positive length.`,
      });
      continue;
    }

    if (!isMemberInsideSection(model, section, member)) {
      issues.push({
        id: `structural-member-fit:${member.id}`,
        severity: "error",
        message: `${member.name} extends outside ${section.name}.`,
      });
      continue;
    }

    pieces.push(
      tube(
        section,
        member.id,
        "tube",
        axis,
        length,
        structuralMemberBounds(model, section, member),
        member.id,
        member.color,
      ),
    );
  }

  validateStructuralMemberEndpoints(model, section, issues);

  return pieces;
}

function explicitConnectors(model: BbqIslandModel): BbqConnector[] {
  return model.sections.flatMap((section) =>
    (section.structuralConnectors ?? []).map((connector) => {
      const localPosition = structuralConnectorPosition(
        section,
        connector,
        model.settings.tubeProfileSize,
      );
      const position = {
        x: section.origin.x + localPosition.x,
        y: section.origin.y + localPosition.y,
        z: section.origin.z + localPosition.z,
      };
      const attachedMembers = section.structuralMembers.filter(
        (member) =>
          member.startConnectorId === connector.id ||
          member.endConnectorId === connector.id ||
          (connector.kind === "surface" &&
            (member.id === connector.hostMemberId ||
              member.id === connector.attached?.memberId)),
      );

      return {
        id: connector.id,
        sectionId: section.id,
        kind: connector.kind,
        position,
        directions:
          connector.kind === "node"
            ? connector.enabledDirections
            : [connector.hostFace],
        pieceIds: attachedMembers.map((member) => `${section.id}:${member.id}`).sort(),
        connectorType: connector.connectorType,
        hostMemberId: connector.kind === "surface" ? connector.hostMemberId : undefined,
      };
    }),
  );
}

function validateStructuralMemberEndpoints(
  model: BbqIslandModel,
  section: IslandSection,
  issues: BbqValidationIssue[],
) {
  const members = section.structuralMembers ?? [];
  for (const member of members) {
    for (const terminal of ["start", "end"] as const) {
      const point = member[terminal];
      if (!isViableMemberEndpoint(model, section, member, point, members)) {
        issues.push({
          id: `structural-member-endpoint:${member.id}:${terminal}`,
          severity: "warning",
          message: `${member.name} ${terminal} endpoint does not touch a connector or perpendicular member.`,
        });
      }
    }
  }
}

function isViableMemberEndpoint(
  model: BbqIslandModel,
  section: IslandSection,
  member: StructuralMember,
  point: StructuralMember["start"],
  members: StructuralMember[],
) {
  return (
    touchesCornerConnector(model, section, point) ||
    members.some((candidate) =>
      candidate.id !== member.id &&
      structuralMemberAxis(candidate) !== structuralMemberAxis(member) &&
      pointOnStructuralMember(model, section, point, candidate),
    )
  );
}

function touchesCornerConnector(
  model: BbqIslandModel,
  section: IslandSection,
  point: StructuralMember["start"],
) {
  const size = model.settings.connectorSize;
  const insideX = [0, size, section.length - size, section.length];
  const insideY = [0, size, section.depth - size, section.depth];
  const insideZ = [0, size, section.height - size, section.height];

  return (
    insideX.some((value) => sameLength(point.x, value)) &&
    insideY.some((value) => sameLength(point.y, value)) &&
    insideZ.some((value) => sameLength(point.z, value))
  );
}

function pointOnStructuralMember(
  model: BbqIslandModel,
  section: IslandSection,
  point: StructuralMember["start"],
  member: StructuralMember,
) {
  const bounds = structuralMemberBounds(model, {
    ...section,
    origin: { x: 0, y: 0, z: 0 },
  }, member);

  for (const dimension of ["x", "y", "z"] as const) {
    if (
      point[dimension] < bounds.min[dimension] - 0.001 ||
      point[dimension] > bounds.max[dimension] + 0.001
    ) {
      return false;
    }
  }

  return true;
}

function sameLength(first: number, second: number) {
  return Math.abs(roundLength(first) - roundLength(second)) <= 0.001;
}

function sectionFramePieces(
  model: BbqIslandModel,
  section: IslandSection,
  issues: BbqValidationIssue[],
): AssemblyPiece[] {
  const pieces: AssemblyPiece[] = [];

  for (const z of [0, section.height]) {
    pieces.push(tube(section, `front-x-${z}`, "tube", "x", section.length, {
      min: { x: section.origin.x, y: section.origin.y, z },
      max: { x: section.origin.x + section.length, y: section.origin.y + model.settings.tubeProfileSize, z: z + model.settings.tubeProfileSize },
    }));
    pieces.push(tube(section, `back-x-${z}`, "tube", "x", section.length, {
      min: { x: section.origin.x, y: section.origin.y + section.depth - model.settings.tubeProfileSize, z },
      max: { x: section.origin.x + section.length, y: section.origin.y + section.depth, z: z + model.settings.tubeProfileSize },
    }));
  }

  for (const xOffset of [0, section.length]) {
    for (const yOffset of [0, section.depth - model.settings.tubeProfileSize]) {
      pieces.push(
        verticalPost(model, section, `corner-post-${xOffset}-${yOffset}`, {
          x: xOffset,
          y: yOffset,
        }),
      );
    }
  }

  for (const post of section.extraVerticalPosts) {
    if (post.offset < 0 || post.offset > faceLength(section, post.face)) {
      issues.push({
        id: `extra-post-fit:${post.id}`,
        severity: "error",
        message: `${post.id} is outside the ${post.face} face of ${section.name}.`,
      });
      continue;
    }

    const position = verticalPostPosition(model, section, post);
    pieces.push(verticalPost(model, section, post.id, position, post.id, post.color));
  }

  for (const xOffset of [0, section.length - model.settings.tubeProfileSize]) {
    for (const z of [0, section.height]) {
      pieces.push(tube(section, `rafter-y-${xOffset}-${z}`, "tube", "y", section.depth, {
        min: { x: section.origin.x + xOffset, y: section.origin.y, z },
        max: { x: section.origin.x + xOffset + model.settings.tubeProfileSize, y: section.origin.y + section.depth, z: z + model.settings.tubeProfileSize },
      }));
    }
  }

  return pieces;
}

function verticalPostPosition(
  model: BbqIslandModel,
  section: IslandSection,
  post: ExtraVerticalPost,
) {
  if (post.face === "front") {
    return { x: post.offset, y: 0 };
  }
  if (post.face === "back") {
    return { x: post.offset, y: section.depth - model.settings.tubeProfileSize };
  }
  if (post.face === "left") {
    return { x: 0, y: post.offset };
  }

  return {
    x: section.length - model.settings.tubeProfileSize,
    y: post.offset,
  };
}

function verticalPost(
  model: BbqIslandModel,
  section: IslandSection,
  id: string,
  position: { x: number; y: number },
  sourceId?: string,
  color?: string,
): AssemblyPiece {
  return tube(section, id, "tube", "z", section.height, {
    min: {
      x: section.origin.x + position.x,
      y: section.origin.y + position.y,
      z: section.origin.z,
    },
    max: {
      x: section.origin.x + position.x + model.settings.tubeProfileSize,
      y: section.origin.y + position.y + model.settings.tubeProfileSize,
      z: section.origin.z + section.height,
    },
  }, sourceId, color);
}

function structuralMemberAxis(member: StructuralMember): Axis {
  if (member.kind === "horizontal-beam") return "x";
  if (member.kind === "rafter") return "y";
  return "z";
}

function structuralMemberLength(member: StructuralMember): number {
  const axis = structuralMemberAxis(member);
  return Math.abs(member.end[axis] - member.start[axis]);
}

function structuralMemberBounds(
  model: BbqIslandModel,
  section: IslandSection,
  member: StructuralMember,
): Box3 {
  const axis = structuralMemberAxis(member);
  const min = {
    x: section.origin.x + Math.min(member.start.x, member.end.x),
    y: section.origin.y + Math.min(member.start.y, member.end.y),
    z: section.origin.z + Math.min(member.start.z, member.end.z),
  };
  const max = {
    x: section.origin.x + Math.max(member.start.x, member.end.x),
    y: section.origin.y + Math.max(member.start.y, member.end.y),
    z: section.origin.z + Math.max(member.start.z, member.end.z),
  };

  for (const dimension of ["x", "y", "z"] as const) {
    if (dimension !== axis) {
      max[dimension] += model.settings.tubeProfileSize;
    }
  }

  return { min, max };
}

function isMemberInsideSection(
  model: BbqIslandModel,
  section: IslandSection,
  member: StructuralMember,
) {
  const bounds = structuralMemberBounds(model, section, member);

  return (
    bounds.min.x >= section.origin.x &&
    bounds.min.y >= section.origin.y &&
    bounds.min.z >= section.origin.z &&
    bounds.max.x <= section.origin.x + section.length &&
    bounds.max.y <= section.origin.y + section.depth &&
    bounds.max.z <= section.origin.z + section.height
  );
}

function insertObjectPieces(
  section: IslandSection,
  insert: InsertDefinition,
): AssemblyPiece[] {
  if (insert.kind === "sleeve") {
    return sleeveObjectPieces(section, insert);
  }

  return [
    {
      id: `${section.id}:${insert.id}-face-frame`,
      sectionId: section.id,
      sourceId: insert.id,
      kind: "insert-face-frame",
      color: insert.color,
      bounds: insertFaceFrameBounds(section, insert),
    },
    {
      id: `${section.id}:${insert.id}-body`,
      sectionId: section.id,
      sourceId: insert.id,
      kind: "insert-body",
      color: insert.color,
      bounds: insertBodyBounds(section, insert),
    },
  ];
}

function sleeveObjectPieces(
  section: IslandSection,
  insert: InsertDefinition,
): AssemblyPiece[] {
  const body = insertBodyBounds(section, insert);
  const member = insert.faceFrame.memberSize;
  const topZ = body.max.z - member;
  const backY = body.max.y - member;
  const frontY = body.min.y;

  return [
    fixedPiece(section, insert, "top-left", "insert-sleeve-frame", {
      min: { x: body.min.x, y: body.min.y, z: topZ },
      max: { x: body.min.x + member, y: body.max.y, z: body.max.z },
    }),
    fixedPiece(section, insert, "top-right", "insert-sleeve-frame", {
      min: { x: body.max.x - member, y: body.min.y, z: topZ },
      max: { x: body.max.x, y: body.max.y, z: body.max.z },
    }),
    fixedPiece(section, insert, "top-back", "insert-sleeve-frame", {
      min: { x: body.min.x, y: backY, z: topZ },
      max: { x: body.max.x, y: body.max.y, z: body.max.z },
    }),
    fixedPiece(section, insert, "front-left", "insert-sleeve-frame", {
      min: { x: body.min.x, y: frontY, z: body.min.z },
      max: { x: body.min.x + member, y: frontY + member, z: body.max.z },
    }),
    fixedPiece(section, insert, "front-right", "insert-sleeve-frame", {
      min: { x: body.max.x - member, y: frontY, z: body.min.z },
      max: { x: body.max.x, y: frontY + member, z: body.max.z },
    }),
    fixedPiece(section, insert, "front-bottom", "insert-sleeve-frame", {
      min: { x: body.min.x, y: frontY, z: body.min.z },
      max: { x: body.max.x, y: frontY + member, z: body.min.z + member },
    }),
  ];
}

function fixedPiece(
  section: IslandSection,
  insert: InsertDefinition,
  id: string,
  kind: AssemblyPiece["kind"],
  bounds: Box3,
): AssemblyPiece {
  return {
    id: `${section.id}:${insert.id}-${id}`,
    sectionId: section.id,
    sourceId: insert.id,
    kind,
    color: insert.color,
    bounds,
  };
}

function insertFaceFrameBounds(
  section: IslandSection,
  insert: InsertDefinition,
): Box3 {
  const x = section.origin.x + insert.offsetFromLeft;
  const z = section.origin.z + insert.offsetFromBottom;

  if (insert.face === "front") {
    return {
      min: { x, y: section.origin.y - insert.faceFrame.projection, z },
      max: {
        x: x + insert.faceFrame.width,
        y: section.origin.y,
        z: z + insert.faceFrame.height,
      },
    };
  }

  if (insert.face === "back") {
    return {
      min: { x, y: section.origin.y + section.depth, z },
      max: {
        x: x + insert.faceFrame.width,
        y: section.origin.y + section.depth + insert.faceFrame.projection,
        z: z + insert.faceFrame.height,
      },
    };
  }

  const y = section.origin.y + insert.offsetFromLeft;
  const xFace =
    insert.face === "left"
      ? section.origin.x - insert.faceFrame.projection
      : section.origin.x + section.length;

  return {
    min: {
      x: xFace,
      y,
      z,
    },
    max: {
      x: xFace + insert.faceFrame.projection,
      y: y + insert.faceFrame.width,
      z: z + insert.faceFrame.height,
    },
  };
}

function insertBodyBounds(
  section: IslandSection,
  insert: InsertDefinition,
): Box3 {
  const frame = insertFaceFrameBounds(section, insert);
  const verticalInset = (insert.faceFrame.height - insert.body.height) / 2;

  if (insert.face === "front" || insert.face === "back") {
    const horizontalInset = (insert.faceFrame.width - insert.body.width) / 2;
    const x = frame.min.x + horizontalInset;
    const z = frame.min.z + verticalInset;
    const y =
      insert.face === "front"
        ? section.origin.y
        : section.origin.y + section.depth - insert.body.depth;

    return {
      min: { x, y, z },
      max: { x: x + insert.body.width, y: y + insert.body.depth, z: z + insert.body.height },
    };
  }

  const horizontalInset = (insert.faceFrame.width - insert.body.width) / 2;
  const y = frame.min.y + horizontalInset;
  const z = frame.min.z + verticalInset;
  const x =
    insert.face === "left"
      ? section.origin.x
      : section.origin.x + section.length - insert.body.depth;

  return {
    min: { x, y, z },
    max: { x: x + insert.body.depth, y: y + insert.body.width, z: z + insert.body.height },
  };
}

function sectionFootingPieces(
  model: BbqIslandModel,
  section: IslandSection,
): AssemblyPiece[] {
  return [
    {
      id: `${section.id}:footing-board`,
      sectionId: section.id,
      kind: "footing-board",
      bounds: {
        min: { x: section.origin.x, y: section.origin.y, z: section.origin.z - model.settings.footingBoard.thickness },
        max: { x: section.origin.x + section.length, y: section.origin.y + section.depth, z: section.origin.z },
      },
    },
  ];
}

function counterPiece(model: BbqIslandModel): AssemblyPiece {
  const bounds = overallBounds(
    model.sections.map((section) => ({
      id: section.id,
      kind: "footing-board" as const,
      bounds: {
        min: section.origin,
        max: {
          x: section.origin.x + section.length,
          y: section.origin.y + section.depth,
          z: section.origin.z + section.height,
        },
      },
    })),
  );
  const overhang = model.settings.counter.edgeOverhang;

  return {
    id: `${model.id}:counter`,
    kind: "counter",
    bounds: {
      min: { x: bounds.min.x - overhang, y: bounds.min.y - overhang, z: bounds.max.z },
      max: { x: bounds.max.x + overhang, y: bounds.max.y + overhang, z: bounds.max.z + model.settings.counter.thickness },
    },
  };
}

function validateInsertFaceFrame(
  model: BbqIslandModel,
  section: IslandSection,
  insert: InsertDefinition,
  issues: BbqValidationIssue[],
) {
  const siblings = model.inserts.filter(
    (candidate) =>
      candidate.id !== insert.id &&
      candidate.sectionId === insert.sectionId &&
      candidate.face === insert.face,
  );
  const frameStart = insert.offsetFromLeft;
  const frameEnd = insert.offsetFromLeft + insert.faceFrame.width;

  if (frameStart < 0 || frameEnd > faceLength(section, insert.face)) {
    issues.push({
      id: `insert-frame-fit:${insert.id}`,
      severity: "error",
      message: `${insert.name} face frame exceeds the ${insert.face} face.`,
    });
  }

  for (const sibling of siblings) {
    const siblingStart = sibling.offsetFromLeft;
    const siblingEnd = sibling.offsetFromLeft + sibling.faceFrame.width;
    if (frameStart < siblingEnd && frameEnd > siblingStart) {
      issues.push({
        id: `insert-frame-overlap:${insert.id}:${sibling.id}`,
        severity: "error",
        message: `${insert.name} face frame overlaps ${sibling.name}.`,
      });
    }
  }
}

function isTubeInventoryPiece(piece: AssemblyPiece): boolean {
  return piece.kind === "tube";
}

function allocateTubeInventory(
  model: BbqIslandModel,
  tubePieces: AssemblyPiece[],
) {
  const allocations = model.inventory
    .filter((item) => item.status === "available" || item.status === "partial")
    .map((item) => ({
      inventoryItemId: item.id,
      inventoryLabel: item.label,
      pieces: [] as AssemblyPiece[],
      remainingLength: item.length,
    }));
  const unallocatedPieces: AssemblyPiece[] = [];

  for (const piece of [...tubePieces].sort((a, b) => (b.length ?? 0) - (a.length ?? 0))) {
    const allocation = allocations
      .filter((item) => item.remainingLength >= (piece.length ?? 0))
      .sort((a, b) => a.remainingLength - b.remainingLength)[0];

    if (!allocation) {
      unallocatedPieces.push(piece);
      continue;
    }

    allocation.pieces.push(piece);
    allocation.remainingLength = roundLength(allocation.remainingLength - (piece.length ?? 0));
  }

  return { allocations, unallocatedPieces };
}

function tube(
  section: IslandSection,
  id: string,
  kind: AssemblyPiece["kind"],
  axis: Axis,
  length: number,
  bounds: Box3,
  sourceId?: string,
  color?: string,
): AssemblyPiece {
  return {
    id: `${section.id}:${id}`,
    sectionId: section.id,
    sourceId,
    kind,
    axis,
    length: roundLength(length),
    color,
    bounds,
  };
}

function faceLength(section: IslandSection, face: IslandFace): number {
  return face === "front" || face === "back" ? section.length : section.depth;
}

function overallBounds(pieces: Pick<AssemblyPiece, "bounds">[]): Box3 {
  return {
    min: {
      x: Math.min(...pieces.map((piece) => piece.bounds.min.x)),
      y: Math.min(...pieces.map((piece) => piece.bounds.min.y)),
      z: Math.min(...pieces.map((piece) => piece.bounds.min.z)),
    },
    max: {
      x: Math.max(...pieces.map((piece) => piece.bounds.max.x)),
      y: Math.max(...pieces.map((piece) => piece.bounds.max.y)),
      z: Math.max(...pieces.map((piece) => piece.bounds.max.z)),
    },
  };
}

function roundLength(value: number): number {
  return Number(value.toFixed(4));
}
