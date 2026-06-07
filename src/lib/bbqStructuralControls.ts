import type { IslandSection, StructuralMember } from "./bbqIsland";

type StructuralAxis = keyof StructuralMember["start"];
type StructuralTerminal = "start" | "end";
type StickyFace = "min" | "max";

interface LocalBounds {
  min: StructuralMember["start"];
  max: StructuralMember["start"];
}

export function stickyStructuralMemberUpdates({
  section,
  before,
  after,
  movedAxis,
  tubeWidth,
}: {
  section: IslandSection;
  before: StructuralMember;
  after: StructuralMember;
  movedAxis: StructuralAxis;
  tubeWidth: number;
}): Record<string, Partial<StructuralMember>> {
  const beforeBounds = structuralMemberLocalBounds(before, tubeWidth);
  const afterBounds = structuralMemberLocalBounds(after, tubeWidth);
  const updates: Record<string, Partial<StructuralMember>> = {
    [after.id]: {
      start: after.start,
      end: after.end,
    },
  };

  for (const candidate of section.structuralMembers ?? []) {
    if (candidate.id === before.id) continue;
    if (structuralMemberAxisName(candidate) !== movedAxis) continue;

    const nextMember = stickyMemberEndpointUpdates(
      candidate,
      beforeBounds,
      afterBounds,
      movedAxis,
    );

    if (nextMember) {
      updates[candidate.id] = {
        start: nextMember.start,
        end: nextMember.end,
      };
    }
  }

  return updates;
}

function stickyMemberEndpointUpdates(
  member: StructuralMember,
  beforeBounds: LocalBounds,
  afterBounds: LocalBounds,
  movedAxis: StructuralAxis,
): StructuralMember | null {
  let nextMember = member;

  for (const terminal of ["start", "end"] as const) {
    const connectorId =
      terminal === "start" ? nextMember.startConnectorId : nextMember.endConnectorId;
    if (connectorId) continue;

    const endpoint = nextMember[terminal];
    const face = stickyFaceForEndpoint(endpoint, beforeBounds, movedAxis);
    if (!face) continue;

    const nextValue = snapToIncrement(afterBounds[face][movedAxis]);
    const nextEndpoint = { ...endpoint, [movedAxis]: nextValue };
    if (!pointWithinBounds(nextEndpoint, afterBounds)) continue;
    if (!terminalCanMoveTo(nextMember, terminal, movedAxis, nextValue)) continue;

    nextMember = {
      ...nextMember,
      [terminal]: nextEndpoint,
    };
  }

  return nextMember === member ? null : nextMember;
}

function stickyFaceForEndpoint(
  endpoint: StructuralMember["start"],
  bounds: LocalBounds,
  axis: StructuralAxis,
): StickyFace | null {
  if (!pointWithinBounds(endpoint, bounds)) return null;
  if (sameNumber(endpoint[axis], bounds.min[axis])) return "min";
  if (sameNumber(endpoint[axis], bounds.max[axis])) return "max";
  return null;
}

function terminalCanMoveTo(
  member: StructuralMember,
  terminal: StructuralTerminal,
  axis: StructuralAxis,
  value: number,
) {
  const otherValue = terminal === "start" ? member.end[axis] : member.start[axis];
  return terminal === "start"
    ? value <= otherValue - 0.125
    : value >= otherValue + 0.125;
}

function pointWithinBounds(point: StructuralMember["start"], bounds: LocalBounds) {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      point[axis] >= bounds.min[axis] - 0.001 &&
      point[axis] <= bounds.max[axis] + 0.001,
  );
}

function structuralMemberLocalBounds(
  member: StructuralMember,
  tubeWidth: number,
): LocalBounds {
  const axis = structuralMemberAxisName(member);
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

function structuralMemberAxisName(member: StructuralMember): StructuralAxis {
  if (member.kind === "horizontal-beam") return "x";
  if (member.kind === "rafter") return "y";
  return "z";
}

function sameNumber(first: number, second: number) {
  return Math.abs(snapToIncrement(first) - snapToIncrement(second)) <= 0.001;
}

function snapToIncrement(value: number, increment = 0.125): number {
  return Number((Math.round(value / increment) * increment).toFixed(3));
}
