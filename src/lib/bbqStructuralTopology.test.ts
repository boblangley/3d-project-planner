import { describe, expect, it } from "vitest";
import type {
  IslandSection,
  StructuralConnectorDirection,
  StructuralMember,
} from "./bbqIsland";
import {
  addMemberWithSurfaceConnectors,
  addSurfaceConnector,
  connectorTypeOptionsForStructuralConnector,
  convertNodeConnectorToSurface,
  convertSurfaceConnectorToNode,
  deleteStructuralConnector,
  deleteStructuralMember,
  insertNodeConnector,
  nodeConnectorDirectionOptions,
  nodeConnectorFreeDirections,
  nodeConnectorTypesForDirections,
  preferredNodeConnectorDirections,
  structuralConnectorDeletePlan,
  structuralConnectorDemotePlan,
  surfaceConnectorNodeTypeOptions,
  updateMembersAndRehostSurfaceConnectors,
  updateStructuralConnector,
} from "./bbqStructuralTopology";

const tubeWidth = 1;

describe("bbq structural topology", () => {
  it("derives node connector types from enabled directions", () => {
    const directions = (...values: StructuralConnectorDirection[]) => values;

    expect(nodeConnectorTypesForDirections(directions("+X", "-X"))).toEqual([
      "linear-2-way",
    ]);
    expect(nodeConnectorTypesForDirections(directions("+X", "+Z"))).toEqual([
      "l-2-way",
    ]);
    expect(nodeConnectorTypesForDirections(directions("+X", "+Y", "+Z"))).toEqual([
      "3-way-corner",
    ]);
    expect(nodeConnectorTypesForDirections(directions("+X", "-X", "+Z"))).toEqual([
      "3-way-T",
    ]);
    expect(
      nodeConnectorTypesForDirections(directions("+X", "-X", "+Y", "+Z")),
    ).toEqual(["4-way"]);
    expect(
      nodeConnectorTypesForDirections(directions("+X", "-X", "+Y", "-Y")),
    ).toEqual([]);
    expect(
      nodeConnectorTypesForDirections(directions("+X", "-X", "+Y", "-Y", "+Z")),
    ).toEqual(["5-way"]);
  });

  it("inserts a node connector by splitting the selected member", () => {
    const section = sectionWith([horizontalBeam("beam", 0, 40, 0, 10)]);

    const updated = insertNodeConnector(section, {
      memberId: "beam",
      offset: 16,
    });

    expect(updated.structuralConnectors).toHaveLength(1);
    expect(updated.structuralConnectors[0]).toMatchObject({
      kind: "node",
      position: { x: 16, y: 0, z: 10 },
    });
    expect(updated.structuralMembers).toHaveLength(2);
    expect(updated.structuralMembers[0].end).toEqual({ x: 16, y: 0, z: 10 });
    expect(updated.structuralMembers[0].endConnectorId).toBe("node-1");
    expect(updated.structuralMembers[1].start).toEqual({ x: 16, y: 0, z: 10 });
    expect(updated.structuralMembers[1].startConnectorId).toBe("node-1");
  });

  it("moves a node connector by resizing attached member segments", () => {
    const section = insertNodeConnector(sectionWith([horizontalBeam("beam", 0, 40, 0, 10)]), {
      memberId: "beam",
      offset: 16,
    });
    const connector = section.structuralConnectors[0];
    if (!connector || connector.kind !== "node") throw new Error("Expected node connector");

    const updated = updateStructuralConnector(
      section,
      connector.id,
      {
        position: { ...connector.position, x: 22 },
      },
      tubeWidth,
    );

    expect(updated.structuralMembers[0].end.x).toBe(22);
    expect(updated.structuralMembers[1].start.x).toBe(22);
  });

  it("adds a surface connector without splitting the host member", () => {
    const section = sectionWith([
      horizontalBeam("beam", 0, 40, 0, 10),
      verticalPost("post", 20, 0, 0, 8),
    ]);

    const updated = addSurfaceConnector(
      section,
      {
        hostMemberId: "beam",
        hostFace: "-Z",
        offset: 20,
        attached: { memberId: "post", terminal: "end" },
      },
      tubeWidth,
    );

    expect(updated.structuralConnectors).toHaveLength(1);
    expect(updated.structuralConnectors[0]).toMatchObject({
      kind: "surface",
      hostMemberId: "beam",
      offset: 20,
    });
    expect(updated.structuralMembers).toHaveLength(2);
    expect(updated.structuralMembers.find((member) => member.id === "post")?.end).toEqual({
      x: 20,
      y: 0,
      z: 10,
    });
  });

  it("adds a new member with explicit surface connectors at both endpoints", () => {
    const section = sectionWith([
      verticalPost("left-post", 0, 0, 1, 35),
      verticalPost("right-post", 18, 0, 1, 35),
    ]);

    const updated = addMemberWithSurfaceConnectors(
      section,
      horizontalBeam("beam", 1, 18, 0, 18),
      tubeWidth,
    );

    expect(updated.structuralMembers).toHaveLength(3);
    expect(updated.structuralConnectors).toHaveLength(2);
    expect(updated.structuralMembers.find((member) => member.id === "beam")).toMatchObject({
      startConnectorId: "surface-1",
      endConnectorId: "surface-2",
    });
    expect(updated.structuralConnectors[0]).toMatchObject({
      kind: "surface",
      connectorType: "tee-surface",
      hostMemberId: "left-post",
      hostFace: "+X",
      offset: 17,
      attached: { memberId: "beam", terminal: "start" },
    });
    expect(updated.structuralConnectors[1]).toMatchObject({
      kind: "surface",
      connectorType: "tee-surface",
      hostMemberId: "right-post",
      hostFace: "-X",
      offset: 17,
      attached: { memberId: "beam", terminal: "end" },
    });
  });

  it("rehosts attached surface connectors when a member moves to another span", () => {
    const section = addMemberWithSurfaceConnectors(
      sectionWith([
        verticalPost("left-post", 0, 0, 1, 35),
        verticalPost("middle-post", 18, 0, 1, 35),
        verticalPost("right-post", 32, 0, 1, 35),
      ]),
      horizontalBeam("beam", 1, 18, 0, 18),
      tubeWidth,
    );

    const updated = updateMembersAndRehostSurfaceConnectors(
      section,
      {
        beam: {
          start: { x: 19, y: 0, z: 18 },
          end: { x: 32, y: 0, z: 18 },
        },
      },
      tubeWidth,
    );

    expect(updated.structuralMembers.find((member) => member.id === "beam")).toMatchObject({
      start: { x: 19, y: 0, z: 18 },
      end: { x: 32, y: 0, z: 18 },
      startConnectorId: "surface-1",
      endConnectorId: "surface-2",
    });
    expect(updated.structuralConnectors[0]).toMatchObject({
      id: "surface-1",
      name: "middle-post bracket",
      kind: "surface",
      hostMemberId: "middle-post",
      hostFace: "+X",
      offset: 17,
    });
    expect(updated.structuralConnectors[1]).toMatchObject({
      id: "surface-2",
      name: "right-post bracket",
      kind: "surface",
      hostMemberId: "right-post",
      hostFace: "-X",
      offset: 17,
    });
  });

  it("converts a surface connector to a node connector by splitting the host", () => {
    const surfaceSection = addSurfaceConnector(
      sectionWith([
        horizontalBeam("beam", 0, 40, 0, 10),
        verticalPost("post", 20, 0, 0, 8),
      ]),
      {
        hostMemberId: "beam",
        hostFace: "-Z",
        offset: 20,
        attached: { memberId: "post", terminal: "end" },
      },
      tubeWidth,
    );
    const surfaceConnector = surfaceSection.structuralConnectors[0];
    if (!surfaceConnector || surfaceConnector.kind !== "surface") {
      throw new Error("Expected surface connector");
    }

    expect(
      surfaceConnectorNodeTypeOptions(surfaceSection, surfaceConnector, tubeWidth),
    ).toEqual(["3-way-T"]);
    expect(
      connectorTypeOptionsForStructuralConnector(
        surfaceSection,
        surfaceConnector,
        tubeWidth,
      ),
    ).toEqual(["3-way-T"]);

    const updated = convertSurfaceConnectorToNode(
      surfaceSection,
      "surface-1",
      tubeWidth,
      "3-way-T",
    );

    expect(updated.structuralConnectors[0]).toMatchObject({
      id: "surface-1",
      kind: "node",
      connectorType: "3-way-T",
      position: { x: 20, y: 0, z: 10 },
    });
    expect(updated.structuralConnectors[0]).toHaveProperty(
      "enabledDirections",
      expect.arrayContaining(["-X", "+X", "-Z"]),
    );
    expect(updated.structuralMembers).toHaveLength(3);
    expect(updated.structuralMembers.find((member) => member.id === "post")?.endConnectorId)
      .toBe("surface-1");
  });

  it("rehosts later surface brackets when a previous bracket splits the host", () => {
    const surfaceSection = addSurfaceConnector(
      addSurfaceConnector(
        sectionWith([
          horizontalBeam("top-beam", 1, 95, 0, 35),
          verticalPost("post-32", 32, 0, 1, 34),
          verticalPost("post-64", 64, 0, 1, 34),
        ]),
        {
          hostMemberId: "top-beam",
          hostFace: "-Z",
          offset: 31,
          attached: { memberId: "post-32", terminal: "end" },
        },
        tubeWidth,
      ),
      {
        hostMemberId: "top-beam",
        hostFace: "-Z",
        offset: 63,
        attached: { memberId: "post-64", terminal: "end" },
      },
      tubeWidth,
    );

    const updated = convertSurfaceConnectorToNode(
      surfaceSection,
      "surface-1",
      tubeWidth,
      "3-way-T",
    );
    const remainingBracket = updated.structuralConnectors.find(
      (connector) => connector.id === "surface-2",
    );

    if (!remainingBracket || remainingBracket.kind !== "surface") {
      throw new Error("Expected remaining surface connector");
    }

    expect(remainingBracket).toMatchObject({
      hostMemberId: "top-beam-segment-4",
      offset: 32,
      attached: { memberId: "post-64", terminal: "end" },
    });
    expect(
      connectorTypeOptionsForStructuralConnector(
        updated,
        remainingBracket,
        tubeWidth,
      ),
    ).toEqual(["3-way-T"]);
  });

  it("does not offer node conversion when a surface connector cannot split its host", () => {
    const surfaceSection = addSurfaceConnector(
      sectionWith([horizontalBeam("beam", 0, 40, 0, 10)]),
      {
        hostMemberId: "beam",
        hostFace: "-Z",
        offset: 0,
      },
      tubeWidth,
    );
    const surfaceConnector = surfaceSection.structuralConnectors[0];
    if (!surfaceConnector || surfaceConnector.kind !== "surface") {
      throw new Error("Expected surface connector");
    }

    expect(
      surfaceConnectorNodeTypeOptions(surfaceSection, surfaceConnector, tubeWidth),
    ).toEqual([]);
    expect(convertSurfaceConnectorToNode(surfaceSection, "surface-1", tubeWidth))
      .toEqual(surfaceSection);
  });

  it("keeps deleted member directions as free node ports", () => {
    const surfaceSection = addSurfaceConnector(
      sectionWith([
        horizontalBeam("beam", 0, 40, 0, 10),
        verticalPost("post", 20, 0, 0, 8),
      ]),
      {
        hostMemberId: "beam",
        hostFace: "-Z",
        offset: 20,
        attached: { memberId: "post", terminal: "end" },
      },
      tubeWidth,
    );
    const nodeSection = convertSurfaceConnectorToNode(
      surfaceSection,
      "surface-1",
      tubeWidth,
      "3-way-T",
    );
    const rightBeamSegment = nodeSection.structuralMembers.find(
      (member) =>
        member.kind === "horizontal-beam" &&
        member.startConnectorId === "surface-1",
    );
    if (!rightBeamSegment) throw new Error("Expected right beam segment");

    const updated = deleteStructuralMember(nodeSection, rightBeamSegment.id);
    const connector = updated.structuralConnectors.find(
      (candidate) => candidate.id === "surface-1",
    );
    if (!connector || connector.kind !== "node") {
      throw new Error("Expected promoted node connector");
    }

    expect(nodeConnectorFreeDirections(updated, connector)).toContain("+X");
    expect(
      nodeConnectorDirectionOptions(updated, connector).map(
        (option) => option.connectorType,
      ),
    ).toContain("l-2-way");
    expect(
      preferredNodeConnectorDirections(updated, connector, "l-2-way"),
    ).toEqual(expect.arrayContaining(["-X", "-Z"]));
    expect(
      preferredNodeConnectorDirections(updated, connector, "l-2-way"),
    ).toHaveLength(2);
  });

  it("deletes a two-way node connector by joining opposing member segments", () => {
    const section = insertNodeConnector(sectionWith([horizontalBeam("beam", 0, 40, 0, 10)]), {
      memberId: "beam",
      offset: 16,
    });

    expect(structuralConnectorDeletePlan(section, "node-1")).toMatchObject({
      allowed: true,
    });

    const updated = deleteStructuralConnector(section, "node-1");

    expect(updated.structuralConnectors).toHaveLength(0);
    expect(updated.structuralMembers).toHaveLength(1);
    expect(updated.structuralMembers[0]).toMatchObject({
      id: "beam",
      start: { x: 0, y: 0, z: 10 },
      end: { x: 40, y: 0, z: 10 },
    });
  });

  it("deletes a two-way node connector while rehosting surface brackets on joined segments", () => {
    const splitSection = insertNodeConnector(
      sectionWith([
        horizontalBeam("beam", 0, 40, 0, 10),
        verticalPost("post", 30, 0, 0, 8),
      ]),
      {
        memberId: "beam",
        offset: 16,
      },
    );
    const rightSegment = splitSection.structuralMembers.find(
      (member) =>
        member.kind === "horizontal-beam" &&
        member.startConnectorId === "node-1",
    );
    if (!rightSegment) throw new Error("Expected right beam segment");

    const bracketSection = addSurfaceConnector(
      splitSection,
      {
        hostMemberId: rightSegment.id,
        hostFace: "-Z",
        offset: 14,
        attached: { memberId: "post", terminal: "end" },
      },
      tubeWidth,
    );

    expect(structuralConnectorDeletePlan(bracketSection, "node-1")).toMatchObject({
      allowed: true,
    });

    const updated = deleteStructuralConnector(bracketSection, "node-1");
    const joinedBeam = updated.structuralMembers.find(
      (member) => member.kind === "horizontal-beam",
    );
    const bracket = updated.structuralConnectors.find(
      (connector) => connector.id === "surface-2",
    );

    expect(joinedBeam).toMatchObject({
      id: "beam",
      start: { x: 0, y: 0, z: 10 },
      end: { x: 40, y: 0, z: 10 },
    });
    expect(bracket).toMatchObject({
      kind: "surface",
      hostMemberId: "beam",
      offset: 30,
      attached: { memberId: "post", terminal: "end" },
    });
    expect(updated.structuralMembers.find((member) => member.id === "post")?.end)
      .toEqual({ x: 30, y: 0, z: 10 });
  });

  it("demotes a three-way node connector to a surface connector", () => {
    const surfaceSection = addSurfaceConnector(
      sectionWith([
        horizontalBeam("beam", 0, 40, 0, 10),
        verticalPost("post", 20, 0, 0, 8),
      ]),
      {
        hostMemberId: "beam",
        hostFace: "-Z",
        offset: 20,
        attached: { memberId: "post", terminal: "end" },
      },
      tubeWidth,
    );
    const nodeSection = convertSurfaceConnectorToNode(
      surfaceSection,
      "surface-1",
      tubeWidth,
    );

    expect(structuralConnectorDemotePlan(nodeSection, "surface-1")).toMatchObject({
      allowed: true,
    });

    const updated = convertNodeConnectorToSurface(
      nodeSection,
      "surface-1",
      tubeWidth,
    );

    expect(updated.structuralConnectors[0]).toMatchObject({
      id: "surface-1",
      kind: "surface",
      hostMemberId: "beam",
      hostFace: "-Z",
      offset: 20,
      attached: { memberId: "post", terminal: "end" },
    });
    expect(updated.structuralMembers).toHaveLength(2);
    expect(updated.structuralMembers.find((member) => member.id === "beam")).toMatchObject({
      start: { x: 0, y: 0, z: 10 },
      end: { x: 40, y: 0, z: 10 },
    });
    expect(updated.structuralMembers.find((member) => member.id === "post")?.endConnectorId)
      .toBe("surface-1");
  });

  it("does not delete a three-way node connector because it has a branch", () => {
    const surfaceSection = addSurfaceConnector(
      sectionWith([
        horizontalBeam("beam", 0, 40, 0, 10),
        verticalPost("post", 20, 0, 0, 8),
      ]),
      {
        hostMemberId: "beam",
        hostFace: "-Z",
        offset: 20,
        attached: { memberId: "post", terminal: "end" },
      },
      tubeWidth,
    );
    const nodeSection = convertSurfaceConnectorToNode(
      surfaceSection,
      "surface-1",
      tubeWidth,
    );

    expect(structuralConnectorDeletePlan(nodeSection, "surface-1")).toMatchObject({
      allowed: false,
    });
    expect(deleteStructuralConnector(nodeSection, "surface-1")).toEqual(nodeSection);
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
