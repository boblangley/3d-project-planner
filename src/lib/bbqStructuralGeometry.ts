import type { IslandSection, StructuralMember } from "./bbqIsland";

export type StructuralAxis = keyof StructuralMember["start"];

export interface AxisInterval {
  min: number;
  max: number;
}

export interface LocalBounds {
  min: StructuralMember["start"];
  max: StructuralMember["start"];
}

export function normalizeStructuralMemberRunSpan(
  section: IslandSection,
  member: StructuralMember,
  connectorSize: number,
  tubeWidth: number,
): StructuralMember {
  const runAxis = structuralMemberAxisName(member);
  const spans = availableRunSpans(section, member, runAxis, connectorSize, tubeWidth);
  if (spans.length === 0) return member;

  const currentSpan = {
    min: Math.min(member.start[runAxis], member.end[runAxis]),
    max: Math.max(member.start[runAxis], member.end[runAxis]),
  };
  const selectedSpan = selectBestRunSpan(currentSpan, spans);

  return {
    ...member,
    start: { ...member.start, [runAxis]: selectedSpan.min },
    end: { ...member.end, [runAxis]: selectedSpan.max },
  };
}

export function availableRunSpans(
  section: IslandSection,
  member: StructuralMember,
  runAxis: StructuralAxis,
  connectorSize: number,
  tubeWidth: number,
): AxisInterval[] {
  const memberBounds = structuralMemberLocalBounds(member, tubeWidth);
  const max = sectionDimension(section, runAxis);
  const blockers = [
    ...connectorBounds(section, connectorSize),
    ...(section.structuralMembers ?? [])
      .filter((candidate) => candidate.id !== member.id)
      .map((candidate) => structuralMemberLocalBounds(candidate, tubeWidth)),
  ]
    .filter((bounds) => boundsOverlapExcept(memberBounds, bounds, runAxis))
    .map((bounds) => ({
      min: Math.max(0, bounds.min[runAxis]),
      max: Math.min(max, bounds.max[runAxis]),
    }));
  const blocked = mergeBands(blockers);
  const spans: AxisInterval[] = [];
  let cursor = 0;

  for (const band of blocked) {
    if (band.min > cursor) {
      spans.push({
        min: snapToIncrement(cursor),
        max: snapToIncrement(band.min),
      });
    }
    cursor = Math.max(cursor, band.max);
  }

  if (cursor < max) {
    spans.push({ min: snapToIncrement(cursor), max: snapToIncrement(max) });
  }

  return spans.filter((span) => span.max - span.min >= 0.125);
}

export function structuralMemberLocalBounds(
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

export function structuralMemberAxisName(member: StructuralMember): StructuralAxis {
  if (member.kind === "horizontal-beam") return "x";
  if (member.kind === "rafter") return "y";
  return "z";
}

export function sectionDimension(
  section: IslandSection,
  coordinate: StructuralAxis,
) {
  if (coordinate === "x") return section.length;
  if (coordinate === "y") return section.depth;
  return section.height;
}

export function nonAxisMax(
  section: IslandSection,
  coordinate: StructuralAxis,
  tubeWidth: number,
) {
  return Math.max(0, sectionDimension(section, coordinate) - tubeWidth);
}

export function boundsOverlapExcept(
  first: LocalBounds,
  second: LocalBounds,
  except: StructuralAxis,
) {
  return (["x", "y", "z"] as const).every(
    (dimension) =>
      dimension === except ||
      intervalsOverlap(
        first.min[dimension],
        first.max[dimension],
        second.min[dimension],
        second.max[dimension],
      ),
  );
}

export function intervalsOverlap(
  firstMin: number,
  firstMax: number,
  secondMin: number,
  secondMax: number,
) {
  return firstMin < secondMax && firstMax > secondMin;
}

export function mergeBands(bands: Array<{ min: number; max: number }>) {
  const sorted = [...bands].sort((first, second) => first.min - second.min);
  const merged: Array<{ min: number; max: number }> = [];

  for (const band of sorted) {
    const previous = merged.at(-1);
    if (!previous || band.min > previous.max) {
      merged.push({ min: band.min, max: band.max });
      continue;
    }
    previous.max = Math.max(previous.max, band.max);
  }

  return merged;
}

export function snapToIncrement(value: number, increment = 0.125): number {
  return Number((Math.round(value / increment) * increment).toFixed(3));
}

function selectBestRunSpan(currentSpan: AxisInterval, spans: AxisInterval[]) {
  const currentMidpoint = (currentSpan.min + currentSpan.max) / 2;
  return [...spans].sort((first, second) => {
    const firstContains = intervalContains(first, currentMidpoint) ? 0 : 1;
    const secondContains = intervalContains(second, currentMidpoint) ? 0 : 1;
    if (firstContains !== secondContains) return firstContains - secondContains;

    const firstDistance = distanceToInterval(currentMidpoint, first);
    const secondDistance = distanceToInterval(currentMidpoint, second);
    if (firstDistance !== secondDistance) return firstDistance - secondDistance;

    return spanLength(second) - spanLength(first);
  })[0];
}

function intervalContains(interval: AxisInterval, value: number) {
  return value >= interval.min && value <= interval.max;
}

function distanceToInterval(value: number, interval: AxisInterval) {
  if (intervalContains(interval, value)) return 0;
  return Math.min(Math.abs(value - interval.min), Math.abs(value - interval.max));
}

function spanLength(span: AxisInterval) {
  return span.max - span.min;
}

function connectorBounds(
  section: IslandSection,
  connectorSize: number,
): LocalBounds[] {
  const xPositions = [0, section.length - connectorSize];
  const yPositions = [0, section.depth - connectorSize];
  const zPositions = [0, section.height - connectorSize];
  const bounds: LocalBounds[] = [];

  for (const x of xPositions) {
    for (const y of yPositions) {
      for (const z of zPositions) {
        bounds.push({
          min: { x, y, z },
          max: {
            x: x + connectorSize,
            y: y + connectorSize,
            z: z + connectorSize,
          },
        });
      }
    }
  }

  return bounds;
}
