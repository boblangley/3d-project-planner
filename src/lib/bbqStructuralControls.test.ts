import { describe, expect, it } from "vitest";
import type { IslandSection, StructuralMember } from "./bbqIsland";
import { stickyStructuralMemberUpdates } from "./bbqStructuralControls";

const tubeWidth = 1;

describe("stickyStructuralMemberUpdates", () => {
  it("moves a vertical post endpoint that is stuck to a horizontal beam underside", () => {
    const beam = horizontalBeam("beam", 10, 20, 0, 18);
    const post = verticalPost("post", 12, 0, 1, 18);
    const section = sectionWith([beam, post]);
    const movedBeam = horizontalBeam("beam", 10, 20, 0, 22);

    const updates = stickyStructuralMemberUpdates({
      section,
      before: beam,
      after: movedBeam,
      movedAxis: "z",
      tubeWidth,
    });

    expect(updates.beam).toEqual({
      start: movedBeam.start,
      end: movedBeam.end,
    });
    expect(updates.post?.end).toEqual({ x: 12, y: 0, z: 22 });
  });

  it("moves a vertical post start that is stuck to a horizontal beam top face", () => {
    const beam = horizontalBeam("beam", 10, 20, 0, 18);
    const post = verticalPost("post", 12, 0, 19, 30);
    const section = sectionWith([beam, post]);
    const movedBeam = horizontalBeam("beam", 10, 20, 0, 16);

    const updates = stickyStructuralMemberUpdates({
      section,
      before: beam,
      after: movedBeam,
      movedAxis: "z",
      tubeWidth,
    });

    expect(updates.post?.start).toEqual({ x: 12, y: 0, z: 17 });
  });

  it("moves a horizontal beam endpoint that is stuck to a vertical post side face", () => {
    const post = verticalPost("post", 10, 0, 1, 30);
    const beam = horizontalBeam("beam", 11, 20, 0, 18);
    const section = sectionWith([post, beam]);
    const movedPost = verticalPost("post", 14, 0, 1, 30);

    const updates = stickyStructuralMemberUpdates({
      section,
      before: post,
      after: movedPost,
      movedAxis: "x",
      tubeWidth,
    });

    expect(updates.beam?.start).toEqual({ x: 15, y: 0, z: 18 });
  });

  it("does not move an endpoint that no longer lands inside the moved member", () => {
    const beam = horizontalBeam("beam", 10, 20, 0, 18);
    const post = verticalPost("post", 12, 0, 1, 18);
    const section = sectionWith([beam, post]);
    const movedBeam = horizontalBeam("beam", 30, 40, 0, 22);

    const updates = stickyStructuralMemberUpdates({
      section,
      before: beam,
      after: movedBeam,
      movedAxis: "z",
      tubeWidth,
    });

    expect(updates.post).toBeUndefined();
  });

  it("does not move an endpoint already owned by an explicit connector", () => {
    const post = verticalPost("post", 10, 0, 1, 30);
    const beam = {
      ...horizontalBeam("beam", 11, 20, 0, 18),
      startConnectorId: "node-1",
    };
    const section = sectionWith([post, beam]);
    const movedPost = verticalPost("post", 14, 0, 1, 30);

    const updates = stickyStructuralMemberUpdates({
      section,
      before: post,
      after: movedPost,
      movedAxis: "x",
      tubeWidth,
    });

    expect(updates.beam).toBeUndefined();
  });
});

function sectionWith(structuralMembers: StructuralMember[]): IslandSection {
  return {
    id: "section",
    name: "Section",
    origin: { x: 0, y: 0, z: 0 },
    length: 48,
    depth: 24,
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
