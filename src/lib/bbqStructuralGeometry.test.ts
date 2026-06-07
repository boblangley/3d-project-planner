import { describe, expect, it } from "vitest";
import type { IslandSection, StructuralMember } from "./bbqIsland";
import { normalizeStructuralMemberRunSpan } from "./bbqStructuralGeometry";

const tubeWidth = 1;
const connectorSize = 1;

describe("normalizeStructuralMemberRunSpan", () => {
  it("keeps a new vertical post from spanning through a horizontal beam in its bay", () => {
    const section = sectionWith([
      horizontalBeam("front-bottom", 1, 95, 0, 0),
      horizontalBeam("front-top", 1, 95, 0, 35),
      horizontalBeam("middle-beam", 33, 64, 0, 18),
    ]);
    const post = verticalPost("post", 48, 0, 1, 35);

    const normalized = normalizeStructuralMemberRunSpan(
      section,
      post,
      connectorSize,
      tubeWidth,
    );

    expect(normalized.start.z).toBe(1);
    expect(normalized.end.z).toBe(18);
  });
});

function sectionWith(structuralMembers: StructuralMember[]): IslandSection {
  return {
    id: "section",
    name: "Section",
    origin: { x: 0, y: 0, z: 0 },
    length: 96,
    depth: 31.5,
    height: 36,
    extraVerticalPosts: [],
    structuralMembers,
    structuralConnectors: [],
  };
}

function horizontalBeam(
  id: string,
  startX: number,
  endX: number,
  y: number,
  z: number,
): StructuralMember {
  return {
    id,
    name: id,
    color: "#2563eb",
    kind: "horizontal-beam",
    start: { x: startX, y, z },
    end: { x: endX, y, z },
  };
}

function verticalPost(
  id: string,
  x: number,
  y: number,
  startZ: number,
  endZ: number,
): StructuralMember {
  return {
    id,
    name: id,
    color: "#0891b2",
    kind: "vertical-post",
    start: { x, y, z: startZ },
    end: { x, y, z: endZ },
  };
}
