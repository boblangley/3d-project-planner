import type {
  ConnectorType,
  IslandSection,
  StructuralConnector,
  StructuralConnectorDirection,
  StructuralMember,
  StructuralMemberTerminal,
} from "./bbqIsland";
import type { Axis } from "./spatial";

export interface InsertNodeConnectorOptions {
  memberId: string;
  offset: number;
  connectorType?: ConnectorType;
}

export interface AddSurfaceConnectorOptions {
  hostMemberId: string;
  hostFace: StructuralConnectorDirection;
  offset: number;
  attached?: {
    memberId: string;
    terminal: StructuralMemberTerminal;
  };
}

interface SurfaceAttachmentPlan extends AddSurfaceConnectorOptions {
  attached: {
    memberId: string;
    terminal: StructuralMemberTerminal;
  };
}

export interface StructuralConnectorOperationPlan {
  allowed: boolean;
  reason: string;
}

export interface NodeConnectorDirectionOption {
  connectorType: ConnectorType;
  directions: StructuralConnectorDirection[];
}

const nodeConnectorTypes: ConnectorType[] = [
  "5-way",
  "4-way",
  "3-way-corner",
  "3-way-T",
  "linear-2-way",
  "l-2-way",
];
const structuralDirections: StructuralConnectorDirection[] = [
  "+X",
  "-X",
  "+Y",
  "-Y",
  "+Z",
  "-Z",
];

interface NodeAttachment {
  member: StructuralMember;
  terminal: StructuralMemberTerminal;
  outerPoint: StructuralMember["start"];
  outerConnectorId?: string;
}

interface JoinableNodePair {
  axis: Axis;
  low: NodeAttachment;
  high: NodeAttachment;
  joinedMember: StructuralMember;
  offset: number;
}

function surfaceConnectorNameForHost(host: StructuralMember): string {
  return `${host.name} bracket`;
}

export function insertNodeConnector(
  section: IslandSection,
  options: InsertNodeConnectorOptions,
): IslandSection {
  const member = section.structuralMembers.find(
    (candidate) => candidate.id === options.memberId,
  );
  if (!member) return section;

  const axis = structuralMemberAxis(member);
  const length = structuralMemberLength(member);
  if (length <= 0.25) return section;

  const offset = snapToIncrement(Math.max(0.125, Math.min(length - 0.125, options.offset)));
  const splitPoint = pointAlongMember(member, offset);
  const connectorId = uniqueId(
    "node",
    section.structuralConnectors.map((connector) => connector.id),
  );
  const secondMemberId = uniqueId(
    `${member.id}-segment`,
    section.structuralMembers.map((candidate) => candidate.id),
  );
  const connector: StructuralConnector = {
    id: connectorId,
    name: `${member.name} node`,
    color: "#7c3aed",
    kind: "node",
    connectorType: options.connectorType ?? "linear-2-way",
    axis,
    position: splitPoint,
    enabledDirections: directionsForAxis(axis),
    rotation: 0,
  };
  const firstSegment: StructuralMember = {
    ...member,
    end: splitPoint,
    endConnectorId: connectorId,
  };
  const secondSegment: StructuralMember = {
    ...member,
    id: secondMemberId,
    name: `${member.name} segment`,
    start: splitPoint,
    startConnectorId: connectorId,
  };

  return rehostSurfaceConnectorsAfterMemberSplit(
    {
      ...section,
      structuralMembers: section.structuralMembers.flatMap((candidate) =>
        candidate.id === member.id ? [firstSegment, secondSegment] : [candidate],
      ),
      structuralConnectors: [...section.structuralConnectors, connector],
    },
    member,
    firstSegment,
    secondSegment,
    offset,
  );
}

function rehostSurfaceConnectorsAfterMemberSplit(
  section: IslandSection,
  originalMember: StructuralMember,
  firstSegment: StructuralMember,
  secondSegment: StructuralMember,
  splitOffset: number,
): IslandSection {
  return {
    ...section,
    structuralConnectors: section.structuralConnectors.map((connector) => {
      if (connector.kind !== "surface") return connector;

      let nextConnector = connector;
      if (connector.hostMemberId === originalMember.id) {
        const isBeforeSplit = connector.offset <= splitOffset + 0.001;
        const host = isBeforeSplit ? firstSegment : secondSegment;
        nextConnector = {
          ...nextConnector,
          name:
            connector.name === surfaceConnectorNameForHost(originalMember)
              ? surfaceConnectorNameForHost(host)
              : connector.name,
          hostMemberId: host.id,
          offset: isBeforeSplit
            ? Math.min(connector.offset, structuralMemberLength(firstSegment))
            : snapToIncrement(connector.offset - splitOffset),
        };
      }

      if (connector.attached?.memberId === originalMember.id) {
        nextConnector = {
          ...nextConnector,
          attached: {
            ...connector.attached,
            memberId:
              connector.attached.terminal === "start"
                ? firstSegment.id
                : secondSegment.id,
          },
        };
      }

      return nextConnector;
    }),
  };
}

export function addSurfaceConnector(
  section: IslandSection,
  options: AddSurfaceConnectorOptions,
  tubeWidth: number,
): IslandSection {
  const host = section.structuralMembers.find(
    (candidate) => candidate.id === options.hostMemberId,
  );
  if (!host) return section;

  const length = structuralMemberLength(host);
  const offset = snapToIncrement(Math.max(0, Math.min(length, options.offset)));
  const connectorId = uniqueId(
    "surface",
    section.structuralConnectors.map((connector) => connector.id),
  );
  const connector: StructuralConnector = {
    id: connectorId,
    name: surfaceConnectorNameForHost(host),
    color: "#f97316",
    kind: "surface",
    connectorType: "tee-surface",
    hostMemberId: host.id,
    hostFace: options.hostFace,
    offset,
    attached: options.attached,
  };
  const sectionWithConnector = {
    ...section,
    structuralConnectors: [...section.structuralConnectors, connector],
  };

  return options.attached
    ? snapAttachedEndpointToSurface(sectionWithConnector, connector, tubeWidth)
    : sectionWithConnector;
}

export function addMemberWithSurfaceConnectors(
  section: IslandSection,
  member: StructuralMember,
  tubeWidth: number,
): IslandSection {
  const startPlan = surfaceAttachmentPlanForEndpoint(
    section,
    member,
    "start",
    tubeWidth,
  );
  const endPlan = surfaceAttachmentPlanForEndpoint(
    section,
    member,
    "end",
    tubeWidth,
  );

  if (!startPlan || !endPlan) return section;

  const sectionWithMember = {
    ...section,
    structuralMembers: [...section.structuralMembers, member],
  };

  return addSurfaceConnector(
    addSurfaceConnector(sectionWithMember, startPlan, tubeWidth),
    endPlan,
    tubeWidth,
  );
}

export function updateMembersAndRehostSurfaceConnectors(
  section: IslandSection,
  updatesByMemberId: Record<string, Partial<StructuralMember>>,
  tubeWidth: number,
): IslandSection {
  const movedMemberIds = new Set(
    Object.entries(updatesByMemberId)
      .filter(([, updates]) => updates.start || updates.end)
      .map(([memberId]) => memberId),
  );
  const nextSection = {
    ...section,
    structuralMembers: section.structuralMembers.map((member) =>
      updatesByMemberId[member.id]
        ? { ...member, ...updatesByMemberId[member.id] }
        : member,
    ),
  };

  if (movedMemberIds.size === 0) return nextSection;

  let rehostedSection = nextSection;

  for (const connector of nextSection.structuralConnectors) {
    if (
      connector.kind !== "surface" ||
      !connector.attached ||
      !movedMemberIds.has(connector.attached.memberId)
    ) {
      continue;
    }

    const member = rehostedSection.structuralMembers.find(
      (candidate) => candidate.id === connector.attached?.memberId,
    );
    if (!member) return section;

    const plan = surfaceAttachmentPlanForEndpoint(
      rehostedSection,
      member,
      connector.attached.terminal,
      tubeWidth,
    );
    if (!plan) return section;

    const previousHost = section.structuralMembers.find(
      (candidate) => candidate.id === connector.hostMemberId,
    );
    const nextHost = rehostedSection.structuralMembers.find(
      (candidate) => candidate.id === plan.hostMemberId,
    );
    if (!nextHost) return section;

    const shouldRefreshGeneratedName =
      !previousHost || connector.name === surfaceConnectorNameForHost(previousHost);

    const nextConnector: StructuralConnector = {
      ...connector,
      name: shouldRefreshGeneratedName
        ? surfaceConnectorNameForHost(nextHost)
        : connector.name,
      hostMemberId: plan.hostMemberId,
      hostFace: plan.hostFace,
      offset: plan.offset,
      attached: connector.attached,
    };

    rehostedSection = snapAttachedEndpointToSurface(
      {
        ...rehostedSection,
        structuralConnectors: rehostedSection.structuralConnectors.map(
          (candidate) =>
            candidate.id === connector.id ? nextConnector : candidate,
        ),
      },
      nextConnector,
      tubeWidth,
    );
  }

  return rehostedSection;
}

export function updateStructuralConnector(
  section: IslandSection,
  connectorId: string,
  updates: Partial<StructuralConnector>,
  tubeWidth: number,
): IslandSection {
  const connector = section.structuralConnectors.find(
    (candidate) => candidate.id === connectorId,
  );
  if (!connector) return section;

  const nextConnector = { ...connector, ...updates } as StructuralConnector;
  const nextSection = {
    ...section,
    structuralConnectors: section.structuralConnectors.map((candidate) =>
      candidate.id === connectorId ? nextConnector : candidate,
    ),
  };

  if (nextConnector.kind === "node") {
    return resizeMembersAttachedToNode(section, nextSection, connector, nextConnector);
  }

  return snapAttachedEndpointToSurface(nextSection, nextConnector, tubeWidth);
}

export function deleteStructuralConnector(
  section: IslandSection,
  connectorId: string,
): IslandSection {
  const connector = section.structuralConnectors.find(
    (candidate) => candidate.id === connectorId,
  );
  if (!connector) return section;

  if (connector.kind === "surface") {
    if (connector.attached) return section;
    return {
      ...section,
      structuralConnectors: section.structuralConnectors.filter(
        (candidate) => candidate.id !== connectorId,
      ),
    };
  }

  const attachments = nodeAttachments(section, connector.id);
  if (attachments.length !== 2) return section;

  const pair = joinableNodePair(section, connector);
  if (!pair) return section;
  return joinNodePair(section, connector.id, pair);
}

export function deleteStructuralMember(
  section: IslandSection,
  memberId: string,
): IslandSection {
  const member = section.structuralMembers.find(
    (candidate) => candidate.id === memberId,
  );
  if (!member) return section;

  const removedSurfaceConnectorIds = new Set(
    section.structuralConnectors
      .filter(
        (connector) =>
          connector.kind === "surface" &&
          (connector.hostMemberId === memberId ||
            connector.attached?.memberId === memberId),
      )
      .map((connector) => connector.id),
  );

  return {
    ...section,
    structuralMembers: section.structuralMembers
      .filter((candidate) => candidate.id !== memberId)
      .map((candidate) => ({
        ...candidate,
        startConnectorId: removedSurfaceConnectorIds.has(candidate.startConnectorId ?? "")
          ? undefined
          : candidate.startConnectorId,
        endConnectorId: removedSurfaceConnectorIds.has(candidate.endConnectorId ?? "")
          ? undefined
          : candidate.endConnectorId,
      })),
    structuralConnectors: section.structuralConnectors.filter(
      (connector) => !removedSurfaceConnectorIds.has(connector.id),
    ),
  };
}

export function structuralConnectorDeletePlan(
  section: IslandSection,
  connectorId: string,
): StructuralConnectorOperationPlan {
  const connector = section.structuralConnectors.find(
    (candidate) => candidate.id === connectorId,
  );
  if (!connector) {
    return { allowed: false, reason: "Connector does not exist." };
  }

  if (connector.kind === "surface") {
    return connector.attached
      ? {
          allowed: false,
          reason: "Surface bracket has an attached member endpoint.",
        }
      : {
          allowed: true,
          reason: "Remove unattached surface bracket.",
        };
  }

  const attachments = nodeAttachments(section, connector.id);
  if (attachments.length !== 2) {
    return {
      allowed: false,
      reason: "Node delete requires exactly two opposing member endpoints.",
    };
  }

  const pair = joinableNodePair(section, connector);
  return pair
    ? {
        allowed: true,
        reason: "Delete node and join opposing members.",
      }
    : {
        allowed: false,
        reason: "Attached members are not opposing, collinear, and joinable.",
      };
}

export function structuralConnectorDemotePlan(
  section: IslandSection,
  connectorId: string,
): StructuralConnectorOperationPlan {
  const connector = section.structuralConnectors.find(
    (candidate) => candidate.id === connectorId,
  );
  if (!connector) {
    return { allowed: false, reason: "Connector does not exist." };
  }
  if (connector.kind !== "node") {
    return { allowed: false, reason: "Only node connectors can demote to surface brackets." };
  }

  const attachments = nodeAttachments(section, connector.id);
  if (attachments.length !== 3) {
    return {
      allowed: false,
      reason: "Demotion requires two opposing members and one perpendicular member.",
    };
  }

  const pair = joinableNodePair(section, connector);
  const branch = pair
    ? attachments.find(
        (attachment) =>
          attachment.member.id !== pair.low.member.id &&
          attachment.member.id !== pair.high.member.id,
      )
    : undefined;
  if (!pair || !branch) {
    return {
      allowed: false,
      reason: "Node does not have one joinable straight-through pair plus one branch.",
    };
  }

  if (structuralMemberAxis(branch.member) === pair.axis) {
    return {
      allowed: false,
      reason: "The remaining member must be perpendicular to the joined host.",
    };
  }

  return {
    allowed: true,
    reason: "Join opposing members and keep the branch as a surface bracket.",
  };
}

export function convertNodeConnectorToSurface(
  section: IslandSection,
  connectorId: string,
  tubeWidth: number,
): IslandSection {
  const connector = section.structuralConnectors.find(
    (candidate) => candidate.id === connectorId,
  );
  if (!connector || connector.kind !== "node") return section;

  const attachments = nodeAttachments(section, connectorId);
  const pair = joinableNodePair(section, connector);
  const branch = pair
    ? attachments.find(
        (attachment) =>
          attachment.member.id !== pair.low.member.id &&
          attachment.member.id !== pair.high.member.id,
      )
    : undefined;

  if (!pair || !branch || structuralMemberAxis(branch.member) === pair.axis) {
    return section;
  }

  const hostFace = hostFaceForBranch(connector.position, branch);
  const surface: StructuralConnector = {
    id: connector.id,
    name: connector.name.replace("node", "bracket"),
    color: "#f97316",
    kind: "surface",
    connectorType: "tee-surface",
    hostMemberId: pair.joinedMember.id,
    hostFace,
    offset: pair.offset,
    attached: {
      memberId: branch.member.id,
      terminal: branch.terminal,
    },
  };

  return snapAttachedEndpointToSurface(
    joinNodePair(section, connector.id, pair, surface),
    surface,
    tubeWidth,
  );
}

export function convertSurfaceConnectorToNode(
  section: IslandSection,
  connectorId: string,
  tubeWidth: number,
  connectorType?: ConnectorType,
): IslandSection {
  const surface = section.structuralConnectors.find(
    (connector) => connector.id === connectorId && connector.kind === "surface",
  );
  if (!surface || surface.kind !== "surface") return section;

  const host = section.structuralMembers.find(
    (member) => member.id === surface.hostMemberId,
  );
  if (!host) return section;
  const enabledDirections = surfacePromotedNodeDirections(section, surface, tubeWidth);
  const validConnectorTypes = nodeConnectorTypesForDirections(enabledDirections);
  if (validConnectorTypes.length === 0) return section;
  const selectedConnectorType =
    connectorType && validConnectorTypes.includes(connectorType)
      ? connectorType
      : validConnectorTypes[0];

  const splitSection = insertNodeConnector(
    {
      ...section,
      structuralConnectors: section.structuralConnectors.filter(
        (connector) => connector.id !== connectorId,
      ),
    },
    {
      memberId: host.id,
      offset: surface.offset,
      connectorType: selectedConnectorType,
    },
  );
  const insertedNode = splitSection.structuralConnectors.at(-1);
  if (!insertedNode || insertedNode.kind !== "node") return splitSection;

  let nextSection: IslandSection = {
    ...splitSection,
    structuralConnectors: splitSection.structuralConnectors.map((connector) =>
      connector.id === insertedNode.id
        ? {
            ...insertedNode,
            id: surface.id,
            name: surface.name.replace("bracket", "node"),
            color: "#7c3aed",
            enabledDirections,
          }
        : connector,
    ),
    structuralMembers: splitSection.structuralMembers.map((member) => ({
      ...member,
      startConnectorId:
        member.startConnectorId === insertedNode.id ? surface.id : member.startConnectorId,
      endConnectorId:
        member.endConnectorId === insertedNode.id ? surface.id : member.endConnectorId,
    })),
  };

  if (surface.attached) {
    nextSection = attachMemberEndpointToNode(nextSection, surface.id, surface.attached, tubeWidth);
  }

  return nextSection;
}

export function connectorTypeOptionsForStructuralConnector(
  section: IslandSection,
  connector: StructuralConnector,
  tubeWidth: number,
): ConnectorType[] {
  if (connector.kind === "node") {
    return uniqueConnectorTypes(
      nodeConnectorDirectionOptions(section, connector).map(
        (option) => option.connectorType,
      ),
    );
  }

  return surfaceConnectorNodeTypeOptions(section, connector, tubeWidth);
}

export function surfaceConnectorNodeTypeOptions(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "surface" }>,
  tubeWidth: number,
): ConnectorType[] {
  const host = section.structuralMembers.find(
    (member) => member.id === connector.hostMemberId,
  );
  if (!host) return [];

  const hostAxis = structuralMemberAxis(host);
  const directions = surfacePromotedNodeDirections(section, connector, tubeWidth);
  const hostDirections = directions.filter(
    (direction) => direction.slice(1).toLowerCase() === hostAxis,
  );

  if (hostDirections.length < 2) return [];
  return nodeConnectorTypesForDirections(directions);
}

export function nodeConnectorTypesForDirections(
  directions: StructuralConnectorDirection[],
): ConnectorType[] {
  const directionSet = new Set(directions);
  const byAxis = new Map<Axis, Set<"+" | "-">>();

  for (const direction of directionSet) {
    const axis = direction.slice(1).toLowerCase() as Axis;
    const sign = direction.startsWith("+") ? "+" : "-";
    byAxis.set(axis, byAxis.get(axis) ?? new Set());
    byAxis.get(axis)?.add(sign);
  }

  const directionCount = [...byAxis.values()].reduce(
    (total, signs) => total + signs.size,
    0,
  );
  const axisCount = byAxis.size;
  const opposingAxisCount = [...byAxis.values()].filter(
    (signs) => signs.size === 2,
  ).length;

  if (directionCount === 2) {
    if (axisCount === 1 && opposingAxisCount === 1) return ["linear-2-way"];
    if (axisCount === 2) return ["l-2-way"];
  }

  if (directionCount === 3) {
    if (axisCount === 3) return ["3-way-corner"];
    if (axisCount === 2 && opposingAxisCount === 1) return ["3-way-T"];
  }

  if (directionCount === 4) {
    return axisCount === 3 && opposingAxisCount === 1 ? ["4-way"] : [];
  }

  if (directionCount === 5) {
    return axisCount === 3 && opposingAxisCount === 2 ? ["5-way"] : [];
  }

  return [];
}

export function nodeConnectorDirectionOptions(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "node" }>,
  connectorType?: ConnectorType,
): NodeConnectorDirectionOption[] {
  const attachedDirections = nodeConnectorAttachedDirections(section, connector);
  const allowedDirections = nodeDirectionsAllowedAtPosition(section, connector.position);
  const candidateTypes = connectorType
    ? [connectorType]
    : nodeConnectorTypes;
  const options = candidateTypes.flatMap((type) =>
    directionSetsForConnectorType(type, allowedDirections)
      .filter((directions) => directionsIncludeAll(directions, attachedDirections))
      .map((directions) => ({ connectorType: type, directions })),
  );

  return options.sort(
    (first, second) =>
      directionOverlapScore(second.directions, connector.enabledDirections) -
        directionOverlapScore(first.directions, connector.enabledDirections) ||
      first.directions.length - second.directions.length ||
      directionKey(first.directions).localeCompare(directionKey(second.directions)),
  );
}

export function preferredNodeConnectorDirections(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "node" }>,
  connectorType: ConnectorType,
): StructuralConnectorDirection[] {
  return (
    nodeConnectorDirectionOptions(section, connector, connectorType)[0]?.directions ??
    connector.enabledDirections
  );
}

export function nodeConnectorAttachedDirections(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "node" }>,
): StructuralConnectorDirection[] {
  return uniqueDirections(
    nodeAttachments(section, connector.id)
      .map((attachment) =>
        directionBetween(
          connector.position,
          attachment.outerPoint,
          structuralMemberAxis(attachment.member),
        ),
      )
      .filter(Boolean) as StructuralConnectorDirection[],
  );
}

export function nodeConnectorFreeDirections(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "node" }>,
): StructuralConnectorDirection[] {
  const attachedDirections = new Set(nodeConnectorAttachedDirections(section, connector));
  return connector.enabledDirections.filter(
    (direction) => !attachedDirections.has(direction),
  );
}

export function structuralConnectorPosition(
  section: IslandSection,
  connector: StructuralConnector,
  tubeWidth: number,
) {
  if (connector.kind === "node") return connector.position;
  return surfaceConnectorPosition(section, connector, tubeWidth);
}

export function structuralMemberAxis(member: StructuralMember): Axis {
  if (member.kind === "horizontal-beam") return "x";
  if (member.kind === "rafter") return "y";
  return "z";
}

export function structuralMemberLength(member: StructuralMember): number {
  const axis = structuralMemberAxis(member);
  return Math.abs(member.end[axis] - member.start[axis]);
}

function nodeAttachments(
  section: IslandSection,
  connectorId: string,
): NodeAttachment[] {
  return section.structuralMembers.flatMap((member) => {
    const attachments: NodeAttachment[] = [];
    if (member.startConnectorId === connectorId) {
      attachments.push({
        member,
        terminal: "start",
        outerPoint: member.end,
        outerConnectorId: member.endConnectorId,
      });
    }
    if (member.endConnectorId === connectorId) {
      attachments.push({
        member,
        terminal: "end",
        outerPoint: member.start,
        outerConnectorId: member.startConnectorId,
      });
    }
    return attachments;
  });
}

function joinableNodePair(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "node" }>,
): JoinableNodePair | null {
  const attachments = nodeAttachments(section, connector.id);
  const candidates: JoinableNodePair[] = [];

  for (let firstIndex = 0; firstIndex < attachments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < attachments.length; secondIndex += 1) {
      const pair = buildJoinablePair(section, connector, attachments[firstIndex], attachments[secondIndex]);
      if (pair) candidates.push(pair);
    }
  }

  return candidates[0] ?? null;
}

function buildJoinablePair(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "node" }>,
  first: NodeAttachment,
  second: NodeAttachment,
): JoinableNodePair | null {
  if (first.member.kind !== second.member.kind) return null;
  const axis = structuralMemberAxis(first.member);
  if (structuralMemberAxis(second.member) !== axis) return null;
  if (!samePlane(first.member, second.member, axis)) return null;

  const firstDirection = Math.sign(first.outerPoint[axis] - connector.position[axis]);
  const secondDirection = Math.sign(second.outerPoint[axis] - connector.position[axis]);
  if (firstDirection === 0 || secondDirection === 0 || firstDirection === secondDirection) {
    return null;
  }

  const low = first.outerPoint[axis] < second.outerPoint[axis] ? first : second;
  const high = low === first ? second : first;
  const joinedMember: StructuralMember = {
    ...low.member,
    id: low.member.id,
    name: joinedMemberName(low.member, high.member),
    start: low.outerPoint,
    end: high.outerPoint,
    startConnectorId: low.outerConnectorId,
    endConnectorId: high.outerConnectorId,
  };

  if (!surfaceReferencesCanJoin(section, { axis, low, high, joinedMember, offset: 0 })) {
    return null;
  }
  if (!memberInsideSection(section, joinedMember)) return null;

  return {
    axis,
    low,
    high,
    joinedMember,
    offset: snapToIncrement(connector.position[axis] - joinedMember.start[axis]),
  };
}

function joinNodePair(
  section: IslandSection,
  connectorId: string,
  pair: JoinableNodePair,
  replacementConnector?: StructuralConnector,
): IslandSection {
  const removedIds = new Set([pair.low.member.id, pair.high.member.id]);
  const structuralConnectors = section.structuralConnectors
    .map((connector) => rehostSurfaceConnectorForJoinedMember(connector, pair))
    .map((connector) =>
      connector.id === connectorId && replacementConnector
        ? replacementConnector
        : connector,
    )
    .filter((connector) => replacementConnector || connector.id !== connectorId);

  return {
    ...section,
    structuralConnectors,
    structuralMembers: [
      pair.joinedMember,
      ...section.structuralMembers
        .filter((member) => !removedIds.has(member.id))
        .map((member) => ({
          ...member,
          startConnectorId:
            member.startConnectorId === connectorId && !replacementConnector
              ? undefined
              : member.startConnectorId,
          endConnectorId:
            member.endConnectorId === connectorId && !replacementConnector
              ? undefined
              : member.endConnectorId,
        })),
    ],
  };
}

function surfaceReferencesCanJoin(section: IslandSection, pair: JoinableNodePair) {
  const removedIds = new Set([pair.low.member.id, pair.high.member.id]);
  return section.structuralConnectors.every((connector) => {
    if (connector.kind !== "surface") return true;

    if (removedIds.has(connector.hostMemberId)) {
      const host = connector.hostMemberId === pair.low.member.id
        ? pair.low.member
        : pair.high.member;
      const hostPoint = pointAlongMember(host, connector.offset);
      if (offsetAlongMember(pair.joinedMember, hostPoint[pair.axis]) === null) {
        return false;
      }
    }

    if (connector.attached && removedIds.has(connector.attached.memberId)) {
      const member = connector.attached.memberId === pair.low.member.id
        ? pair.low.member
        : pair.high.member;
      const attachedPoint = member[connector.attached.terminal];
      if (
        !pointsMatch(attachedPoint, pair.joinedMember.start) &&
        !pointsMatch(attachedPoint, pair.joinedMember.end)
      ) {
        return false;
      }
    }

    return true;
  });
}

function rehostSurfaceConnectorForJoinedMember(
  connector: StructuralConnector,
  pair: JoinableNodePair,
): StructuralConnector {
  if (connector.kind !== "surface") return connector;

  const removedIds = new Set([pair.low.member.id, pair.high.member.id]);
  let nextConnector: StructuralConnector = connector;

  if (removedIds.has(connector.hostMemberId)) {
    const host = connector.hostMemberId === pair.low.member.id
      ? pair.low.member
      : pair.high.member;
    const hostPoint = pointAlongMember(host, connector.offset);
    const offset = offsetAlongMember(pair.joinedMember, hostPoint[pair.axis]);

    if (offset !== null) {
      nextConnector = {
        ...nextConnector,
        name:
          connector.name === surfaceConnectorNameForHost(host)
            ? surfaceConnectorNameForHost(pair.joinedMember)
            : connector.name,
        hostMemberId: pair.joinedMember.id,
        offset,
      };
    }
  }

  if (connector.attached && removedIds.has(connector.attached.memberId)) {
    const member = connector.attached.memberId === pair.low.member.id
      ? pair.low.member
      : pair.high.member;
    const attachedPoint = member[connector.attached.terminal];
    const terminal = pointsMatch(attachedPoint, pair.joinedMember.start)
      ? "start"
      : pointsMatch(attachedPoint, pair.joinedMember.end)
        ? "end"
        : connector.attached.terminal;

    nextConnector = {
      ...nextConnector,
      attached: {
        ...connector.attached,
        memberId: pair.joinedMember.id,
        terminal,
      },
    };
  }

  return nextConnector;
}

function samePlane(
  first: StructuralMember,
  second: StructuralMember,
  axis: Axis,
) {
  return (["x", "y", "z"] as const).every(
    (coordinate) =>
      coordinate === axis ||
      (sameNumber(first.start[coordinate], second.start[coordinate]) &&
        sameNumber(first.end[coordinate], second.end[coordinate])),
  );
}

function memberInsideSection(section: IslandSection, member: StructuralMember) {
  return (["x", "y", "z"] as const).every((axis) => {
    const min = Math.min(member.start[axis], member.end[axis]);
    const max = Math.max(member.start[axis], member.end[axis]);
    const dimension = sectionDimension(section, axis);
    return min >= 0 && max <= dimension;
  });
}

function sectionDimension(section: IslandSection, axis: Axis) {
  if (axis === "x") return section.length;
  if (axis === "y") return section.depth;
  return section.height;
}

function joinedMemberName(first: StructuralMember, second: StructuralMember) {
  const base = first.name.replace(/\s+segment$/i, "");
  return base === first.name ? `${first.name} joined` : base;
}

function hostFaceForBranch(
  connectorPosition: StructuralMember["start"],
  branch: NodeAttachment,
): StructuralConnectorDirection {
  const axis = structuralMemberAxis(branch.member);
  const direction = branch.outerPoint[axis] >= connectorPosition[axis] ? "+" : "-";
  return `${direction}${axis.toUpperCase()}` as StructuralConnectorDirection;
}

function resizeMembersAttachedToNode(
  previousSection: IslandSection,
  nextSection: IslandSection,
  previousConnector: StructuralConnector,
  nextConnector: StructuralConnector,
): IslandSection {
  if (previousConnector.kind !== "node" || nextConnector.kind !== "node") {
    return nextSection;
  }

  const axis = previousConnector.axis;
  const nextPosition = nextConnector.position;
  const previousPosition = previousConnector.position;
  if (sameNumber(previousPosition[axis], nextPosition[axis])) return nextSection;

  return {
    ...nextSection,
    structuralMembers: nextSection.structuralMembers.map((member) => {
      if (member.startConnectorId === nextConnector.id) {
        return { ...member, start: { ...member.start, ...nextPosition } };
      }
      if (member.endConnectorId === nextConnector.id) {
        return { ...member, end: { ...member.end, ...nextPosition } };
      }
      return member;
    }),
  };
}

function attachMemberEndpointToNode(
  section: IslandSection,
  connectorId: string,
  attachment: { memberId: string; terminal: StructuralMemberTerminal },
  tubeWidth: number,
): IslandSection {
  const connector = section.structuralConnectors.find(
    (candidate) => candidate.id === connectorId,
  );
  if (!connector) return section;
  const position = structuralConnectorPosition(section, connector, tubeWidth);

  return {
    ...section,
    structuralMembers: section.structuralMembers.map((member) => {
      if (member.id !== attachment.memberId) return member;
      return {
        ...member,
        [attachment.terminal]: position,
        [`${attachment.terminal}ConnectorId`]: connectorId,
      };
    }),
  };
}

function snapAttachedEndpointToSurface(
  section: IslandSection,
  connector: StructuralConnector,
  tubeWidth: number,
): IslandSection {
  if (connector.kind !== "surface" || !connector.attached) return section;
  const position = surfaceConnectorPosition(section, connector, tubeWidth);

  return {
    ...section,
    structuralMembers: section.structuralMembers.map((member) => {
      if (member.id !== connector.attached?.memberId) return member;
      return {
        ...member,
        [connector.attached.terminal]: position,
        [`${connector.attached.terminal}ConnectorId`]: connector.id,
      };
    }),
  };
}

function surfacePromotedNodeDirections(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "surface" }>,
  tubeWidth: number,
): StructuralConnectorDirection[] {
  const host = section.structuralMembers.find(
    (member) => member.id === connector.hostMemberId,
  );
  if (!host) return [];

  const position = structuralConnectorPosition(section, connector, tubeWidth);
  const hostAxis = structuralMemberAxis(host);
  const directions = [
    directionBetween(position, host.start, hostAxis),
    directionBetween(position, host.end, hostAxis),
  ];

  if (connector.attached) {
    const attached = section.structuralMembers.find(
      (member) => member.id === connector.attached?.memberId,
    );
    if (attached) {
      const attachedAxis = structuralMemberAxis(attached);
      const outerPoint =
        connector.attached.terminal === "start" ? attached.end : attached.start;
      directions.push(directionBetween(position, outerPoint, attachedAxis));
    }
  }

  return uniqueDirections(directions.filter(Boolean) as StructuralConnectorDirection[]);
}

function directionBetween(
  origin: StructuralMember["start"],
  point: StructuralMember["start"],
  axis: Axis,
): StructuralConnectorDirection | null {
  const delta = snapToIncrement(point[axis] - origin[axis]);
  if (Math.abs(delta) <= 0.001) return null;
  return `${delta > 0 ? "+" : "-"}${axis.toUpperCase()}` as StructuralConnectorDirection;
}

function uniqueDirections(
  directions: StructuralConnectorDirection[],
): StructuralConnectorDirection[] {
  return directions.filter(
    (direction, index) => directions.indexOf(direction) === index,
  );
}

function uniqueConnectorTypes(types: ConnectorType[]): ConnectorType[] {
  return types.filter((type, index) => types.indexOf(type) === index);
}

function nodeDirectionsAllowedAtPosition(
  section: IslandSection,
  position: StructuralMember["start"],
): StructuralConnectorDirection[] {
  return structuralDirections.filter((direction) => {
    const axis = direction.slice(1).toLowerCase() as Axis;
    const dimension = sectionDimension(section, axis);
    return direction.startsWith("+")
      ? position[axis] < dimension - 0.001
      : position[axis] > 0.001;
  });
}

function directionSetsForConnectorType(
  connectorType: ConnectorType,
  allowedDirections: StructuralConnectorDirection[],
): StructuralConnectorDirection[][] {
  if (connectorType === "tee-surface") return [];

  return [2, 3, 4, 5].flatMap((directionCount) =>
    combinations(allowedDirections, directionCount).filter((directions) =>
      nodeConnectorTypesForDirections(directions).includes(connectorType),
    ),
  );
}

function combinations<T>(items: T[], count: number): T[][] {
  if (count === 0) return [[]];
  if (items.length < count) return [];
  if (items.length === count) return [items];

  const [head, ...tail] = items;
  return [
    ...combinations(tail, count - 1).map((combination) => [head, ...combination]),
    ...combinations(tail, count),
  ];
}

function directionsIncludeAll(
  directions: StructuralConnectorDirection[],
  requiredDirections: StructuralConnectorDirection[],
) {
  const directionSet = new Set(directions);
  return requiredDirections.every((direction) => directionSet.has(direction));
}

function directionOverlapScore(
  directions: StructuralConnectorDirection[],
  preferredDirections: StructuralConnectorDirection[],
) {
  const directionSet = new Set(directions);
  return preferredDirections.filter((direction) => directionSet.has(direction)).length;
}

function directionKey(directions: StructuralConnectorDirection[]) {
  return structuralDirections
    .filter((direction) => directions.includes(direction))
    .join(",");
}

function surfaceAttachmentPlanForEndpoint(
  section: IslandSection,
  member: StructuralMember,
  terminal: StructuralMemberTerminal,
  tubeWidth: number,
): SurfaceAttachmentPlan | null {
  const endpoint = member[terminal];
  const memberAxis = structuralMemberAxis(member);
  const candidateFaces: StructuralConnectorDirection[] = [
    `+${memberAxis.toUpperCase()}`,
    `-${memberAxis.toUpperCase()}`,
  ] as StructuralConnectorDirection[];
  const candidates: SurfaceAttachmentPlan[] = [];

  for (const host of section.structuralMembers) {
    if (host.id === member.id) continue;
    if (structuralMemberAxis(host) === memberAxis) continue;

    for (const hostFace of candidateFaces) {
      const offset = surfaceOffsetForEndpoint(host, hostFace, endpoint, tubeWidth);
      if (offset === null) continue;
      candidates.push({
        hostMemberId: host.id,
        hostFace,
        offset,
        attached: {
          memberId: member.id,
          terminal,
        },
      });
    }
  }

  return candidates.sort((first, second) => first.offset - second.offset)[0] ?? null;
}

function surfaceOffsetForEndpoint(
  host: StructuralMember,
  hostFace: StructuralConnectorDirection,
  endpoint: StructuralMember["start"],
  tubeWidth: number,
) {
  const hostAxis = structuralMemberAxis(host);
  const offset = offsetAlongMember(host, endpoint[hostAxis]);
  if (offset === null) return null;
  const surfacePosition = surfacePositionOnHost(host, hostFace, offset, tubeWidth);

  return pointsMatch(surfacePosition, endpoint) ? offset : null;
}

function offsetAlongMember(member: StructuralMember, value: number) {
  const axis = structuralMemberAxis(member);
  const direction = member.end[axis] >= member.start[axis] ? 1 : -1;
  const offset = snapToIncrement((value - member.start[axis]) * direction);
  const length = structuralMemberLength(member);

  if (offset < -0.001 || offset > length + 0.001) return null;
  return Math.max(0, Math.min(length, offset));
}

function surfaceConnectorPosition(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "surface" }>,
  tubeWidth: number,
) {
  const host = section.structuralMembers.find(
    (member) => member.id === connector.hostMemberId,
  );
  if (!host) return { x: 0, y: 0, z: 0 };

  return surfacePositionOnHost(host, connector.hostFace, connector.offset, tubeWidth);
}

function surfacePositionOnHost(
  host: StructuralMember,
  hostFace: StructuralConnectorDirection,
  offset: number,
  tubeWidth: number,
) {
  const hostBounds = structuralMemberLocalBounds(host, tubeWidth);
  const hostAxis = structuralMemberAxis(host);
  const position = pointAlongMember(host, offset);
  const faceAxis = hostFace.slice(1).toLowerCase() as Axis;
  const faceSign = hostFace.startsWith("+") ? "max" : "min";

  for (const axis of ["x", "y", "z"] as const) {
    if (axis === hostAxis) continue;
    position[axis] = hostBounds.min[axis];
  }

  position[faceAxis] = hostBounds[faceSign][faceAxis];
  return position;
}

function pointsMatch(
  first: StructuralMember["start"],
  second: StructuralMember["start"],
) {
  return (["x", "y", "z"] as const).every((axis) =>
    sameNumber(first[axis], second[axis]),
  );
}

function pointAlongMember(member: StructuralMember, offset: number) {
  const axis = structuralMemberAxis(member);
  const direction = member.end[axis] >= member.start[axis] ? 1 : -1;
  return {
    ...member.start,
    [axis]: snapToIncrement(member.start[axis] + direction * offset),
  };
}

function structuralMemberLocalBounds(
  member: StructuralMember,
  tubeWidth: number,
) {
  const axis = structuralMemberAxis(member);
  const min = {
    x: Math.min(member.start.x, member.end.x),
    y: Math.min(member.start.y, member.end.y),
    z: Math.min(member.start.z, member.end.z),
  };
  const max = {
    x: Math.max(member.start.x, member.end.x),
    y: Math.max(member.start.y, member.end.y),
    z: Math.max(member.start.z, member.end.z),
  };

  for (const dimension of ["x", "y", "z"] as const) {
    if (dimension !== axis) {
      max[dimension] += tubeWidth;
    }
  }

  return { min, max };
}

function directionsForAxis(axis: Axis): StructuralConnectorDirection[] {
  const label = axis.toUpperCase();
  return [`+${label}`, `-${label}`] as StructuralConnectorDirection[];
}

function uniqueId(prefix: string, existingIds: string[]): string {
  let index = existingIds.length + 1;
  let id = `${prefix}-${index}`;
  while (existingIds.includes(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }
  return id;
}

function sameNumber(first: number, second: number) {
  return Math.abs(snapToIncrement(first) - snapToIncrement(second)) <= 0.001;
}

function snapToIncrement(value: number, increment = 0.125): number {
  return Number((Math.round(value / increment) * increment).toFixed(3));
}
