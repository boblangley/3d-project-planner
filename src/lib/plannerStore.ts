import { Store } from "@tanstack/store";
import { useSyncExternalStore } from "react";
import {
  initialPlannerParameters,
  type PlannerParameters,
} from "./sampleConfiguration";
import type {
  InsertDefinition,
  InsertKind,
  IslandSection,
  StructuralConnector,
  StructuralConnectorDirection,
  StructuralMember,
  StructuralMemberTerminal,
} from "./bbqIsland";
import {
  createBoxFrameTopology,
  defaultBbqSectionDepth,
  defaultBbqSectionHeight,
} from "./bbqIsland";
import {
  nonAxisMax,
  normalizeStructuralMemberRunSpan,
  snapToIncrement,
  structuralMemberAxisName,
  structuralMemberLocalBounds,
} from "./bbqStructuralGeometry";
import {
  addMemberWithSurfaceConnectors,
  addSurfaceConnector,
  convertNodeConnectorToSurface,
  convertSurfaceConnectorToNode,
  deleteStructuralMember,
  deleteStructuralConnector,
  insertNodeConnector,
  updateMembersAndRehostSurfaceConnectors,
  updateStructuralConnector,
} from "./bbqStructuralTopology";
import type { InventoryItem } from "./spatial";

const maxUndoDepth = 80;
const undoStack: PlannerParameters[] = [];

export const plannerStore = new Store<PlannerParameters>(
  initialPlannerParameters,
);
const plannerUndoStore = new Store({ canUndo: false });

function updateUndoState() {
  plannerUndoStore.setState(() => ({ canUndo: undoStack.length > 0 }));
}

function setPlannerState(
  updater: (state: PlannerParameters) => PlannerParameters,
  options: { trackUndo?: boolean } = {},
) {
  plannerStore.setState((state) => {
    const nextState = updater(state);
    if (options.trackUndo !== false && nextState !== state) {
      undoStack.push(state);
      if (undoStack.length > maxUndoDepth) undoStack.shift();
      updateUndoState();
    }
    return nextState;
  });
}

export function usePlannerState(): PlannerParameters {
  return useSyncExternalStore(
    (notify) => {
      const subscription = plannerStore.subscribe(notify);
      return () => subscription.unsubscribe();
    },
    () => plannerStore.state,
    () => plannerStore.state,
  );
}

export function usePlannerUndoState() {
  return useSyncExternalStore(
    (notify) => {
      const subscription = plannerUndoStore.subscribe(notify);
      return () => subscription.unsubscribe();
    },
    () => plannerUndoStore.state,
    () => plannerUndoStore.state,
  );
}

export function undoPlannerChange() {
  const previousState = undoStack.pop();
  if (!previousState) return;
  plannerStore.setState(() => previousState);
  updateUndoState();
}

export function updatePlannerParameter<K extends keyof PlannerParameters>(
  key: K,
  value: PlannerParameters[K],
) {
  setPlannerState((state) => ({
    ...state,
    [key]: value,
  }));
}

export function updateGardenParameter<K extends keyof PlannerParameters["garden"]>(
  key: K,
  value: PlannerParameters["garden"][K],
) {
  setPlannerState((state) => ({
    ...state,
    garden: {
      ...state.garden,
      [key]: value,
    },
  }));
}

export function updateBbqIslandSettings<
  K extends keyof PlannerParameters["bbqIsland"]["settings"],
>(
  key: K,
  value: PlannerParameters["bbqIsland"]["settings"][K],
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      settings: {
        ...state.bbqIsland.settings,
        [key]: value,
      },
    },
  }));
}

export function updateBbqCounterSetting<
  K extends keyof PlannerParameters["bbqIsland"]["settings"]["counter"],
>(
  key: K,
  value: PlannerParameters["bbqIsland"]["settings"]["counter"][K],
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      settings: {
        ...state.bbqIsland.settings,
        counter: {
          ...state.bbqIsland.settings.counter,
          [key]: value,
        },
      },
    },
  }));
}

export function updateBbqFootingSetting<
  K extends keyof PlannerParameters["bbqIsland"]["settings"]["footingBoard"],
>(
  key: K,
  value: PlannerParameters["bbqIsland"]["settings"]["footingBoard"][K],
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      settings: {
        ...state.bbqIsland.settings,
        footingBoard: {
          ...state.bbqIsland.settings.footingBoard,
          [key]: value,
        },
      },
    },
  }));
}

export function addBbqSection() {
  setPlannerState((state) => {
    const index = state.bbqIsland.sections.length + 1;
    const previous = state.bbqIsland.sections.at(-1);
    const id = uniqueId("section", state.bbqIsland.sections.map((section) => section.id));
    const depth = previous?.depth ?? defaultBbqSectionDepth;
    const height = previous?.height ?? defaultBbqSectionHeight;
    const topology = createBoxFrameTopology({
      prefix: id,
      length: 36,
      depth,
      height,
      tubeWidth: state.bbqIsland.settings.tubeProfileSize,
      connectorSize: state.bbqIsland.settings.connectorSize,
    });

    return {
      ...state,
      bbqIsland: {
        ...state.bbqIsland,
        sections: [
          ...state.bbqIsland.sections,
          {
            id,
            name: `Section ${index}`,
            origin: {
              x: previous ? previous.origin.x + previous.length : 0,
              y: 0,
              z: 0,
            },
            length: 36,
            depth,
            height,
            extraVerticalPosts: [],
            structuralMembers: topology.structuralMembers,
            structuralConnectors: topology.structuralConnectors,
            relationship: previous
              ? {
                  connectsToSectionId: previous.id,
                  type: "right-of",
                  offset: { x: 0, y: 0, z: 0 },
                  sharedFace: "left",
                }
              : undefined,
          },
        ],
      },
    };
  });
}

export function addBbqStructuralMember(
  sectionId: string,
  kind: StructuralMember["kind"],
  placement: {
    start?: Partial<StructuralMember["start"]>;
    end?: Partial<StructuralMember["end"]>;
  } = {},
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      sections: state.bbqIsland.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const id = uniqueId(
          kind,
          section.structuralMembers.map((member) => member.id),
        );
        const defaultMember = defaultStructuralMember(
          section,
          id,
          kind,
          state.bbqIsland.settings.tubeProfileSize,
          state.bbqIsland.settings.connectorSize,
        );
        const member = {
          ...defaultMember,
          start: { ...defaultMember.start, ...placement.start },
          end: { ...defaultMember.end, ...placement.end },
        };
        const normalizedMember = normalizeStructuralMemberRunSpan(
          section,
          member,
          state.bbqIsland.settings.connectorSize,
          state.bbqIsland.settings.tubeProfileSize,
        );
        return addMemberWithBestSurfaceAttachment(
          section,
          normalizedMember,
          state.bbqIsland.settings.connectorSize,
          state.bbqIsland.settings.tubeProfileSize,
        );
      }),
    },
  }));
}

export function updateBbqStructuralMember(
  sectionId: string,
  memberId: string,
  updates: Partial<StructuralMember>,
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      sections: state.bbqIsland.sections.map((section) =>
        section.id === sectionId
          ? updateMembersAndRehostSurfaceConnectors(
              section,
              { [memberId]: updates },
              state.bbqIsland.settings.tubeProfileSize,
            )
          : section,
      ),
    },
  }));
}

export function updateBbqStructuralMembers(
  sectionId: string,
  updatesByMemberId: Record<string, Partial<StructuralMember>>,
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      sections: state.bbqIsland.sections.map((section) =>
        section.id === sectionId
          ? updateMembersAndRehostSurfaceConnectors(
              section,
              updatesByMemberId,
              state.bbqIsland.settings.tubeProfileSize,
            )
          : section,
      ),
    },
  }));
}

export function insertBbqNodeConnector(
  sectionId: string,
  memberId: string,
  offset: number,
) {
  updateBbqSectionTopology(sectionId, (section) =>
    insertNodeConnector(section, { memberId, offset }),
  );
}

export function addBbqSurfaceConnector(
  sectionId: string,
  options: {
    hostMemberId: string;
    hostFace: StructuralConnectorDirection;
    offset: number;
    attached?: {
      memberId: string;
      terminal: StructuralMemberTerminal;
    };
  },
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      sections: state.bbqIsland.sections.map((section) =>
        section.id === sectionId
          ? addSurfaceConnector(
              section,
              options,
              state.bbqIsland.settings.tubeProfileSize,
            )
          : section,
      ),
    },
  }));
}

export function updateBbqStructuralConnector(
  sectionId: string,
  connectorId: string,
  updates: Partial<StructuralConnector>,
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      sections: state.bbqIsland.sections.map((section) =>
        section.id === sectionId
          ? updateStructuralConnector(
              section,
              connectorId,
              updates,
              state.bbqIsland.settings.tubeProfileSize,
            )
          : section,
      ),
    },
  }));
}

export function deleteBbqStructuralConnector(
  sectionId: string,
  connectorId: string,
) {
  updateBbqSectionTopology(sectionId, (section) =>
    deleteStructuralConnector(section, connectorId),
  );
}

export function convertBbqSurfaceConnectorToNode(
  sectionId: string,
  connectorId: string,
  connectorType?: StructuralConnector["connectorType"],
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      sections: state.bbqIsland.sections.map((section) =>
        section.id === sectionId
          ? convertSurfaceConnectorToNode(
              section,
              connectorId,
              state.bbqIsland.settings.tubeProfileSize,
              connectorType,
            )
          : section,
      ),
    },
  }));
}

export function convertBbqNodeConnectorToSurface(
  sectionId: string,
  connectorId: string,
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      sections: state.bbqIsland.sections.map((section) =>
        section.id === sectionId
          ? convertNodeConnectorToSurface(
              section,
              connectorId,
              state.bbqIsland.settings.tubeProfileSize,
            )
          : section,
      ),
    },
  }));
}

export function deleteBbqStructuralMember(
  sectionId: string,
  memberId: string,
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      sections: state.bbqIsland.sections.map((section) =>
        section.id === sectionId
          ? deleteStructuralMember(section, memberId)
          : section,
      ),
    },
  }));
}

export function updateBbqSection(
  sectionId: string,
  updates: Partial<IslandSection>,
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      sections: state.bbqIsland.sections.map((section) =>
        section.id === sectionId ? { ...section, ...updates } : section,
      ),
    },
  }));
}

export function deleteBbqSection(sectionId: string) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      sections:
        state.bbqIsland.sections.length <= 1
          ? state.bbqIsland.sections
          : state.bbqIsland.sections.filter((section) => section.id !== sectionId),
      inserts: state.bbqIsland.inserts.filter(
        (insert) => insert.sectionId !== sectionId,
      ),
    },
  }));
}

export function addBbqInsert(sectionId: string, kind: InsertKind = "drawer") {
  setPlannerState((state) => {
    const section = state.bbqIsland.sections.find((candidate) => candidate.id === sectionId);
    const id = uniqueId("insert", state.bbqIsland.inserts.map((insert) => insert.id));
    const isSleeve = kind === "sleeve";

    return {
      ...state,
      bbqIsland: {
        ...state.bbqIsland,
        inserts: [
          ...state.bbqIsland.inserts,
          {
            id,
            kind,
            name: `${kindLabel(kind)} ${state.bbqIsland.inserts.length + 1}`,
            color: isSleeve ? "#f97316" : "#dc2626",
            sectionId,
            face: "front",
            offsetFromLeft: 4,
            offsetFromBottom: isSleeve ? Math.max(0, (section?.height ?? 36) - 16) : 4,
            body: {
              width: Math.min(isSleeve ? 24 : 24, Math.max(12, (section?.length ?? 36) - 8)),
              depth: isSleeve ? section?.depth ?? 28 : 23,
              height: isSleeve ? 14 : 21,
            },
            faceFrame: {
              width: Math.min(isSleeve ? 24 : 27, Math.max(14, (section?.length ?? 36) - 8)),
              height: isSleeve ? 14 : 21,
              projection: isSleeve ? 1.5 : 0.75,
              memberSize: 1.5,
            },
          },
        ],
      },
    };
  });
}

function kindLabel(kind: InsertKind): string {
  if (kind === "drawer") return "Drawer";
  if (kind === "door") return "Door";
  return "Sleeve";
}

export function updateBbqInsert(
  insertId: string,
  updates: Partial<InsertDefinition>,
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      inserts: state.bbqIsland.inserts.map((insert) =>
        insert.id === insertId ? { ...insert, ...updates } : insert,
      ),
    },
  }));
}

export function deleteBbqInsert(insertId: string) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      inserts: state.bbqIsland.inserts.filter((insert) => insert.id !== insertId),
    },
  }));
}

export function addBbqInventoryItem() {
  setPlannerState((state) => {
    const id = uniqueId("tube-stock", state.bbqIsland.inventory.map((item) => item.id));
    return {
      ...state,
      bbqIsland: {
        ...state.bbqIsland,
        inventory: [
          ...state.bbqIsland.inventory,
          {
            id,
            specId: state.bbqIsland.settings.tubeSpecId,
            label: `Tube stock ${state.bbqIsland.inventory.length + 1}`,
            length: 120,
            status: "available",
          },
        ],
      },
    };
  });
}

export function updateBbqInventoryItem(
  itemId: string,
  updates: Partial<InventoryItem>,
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      inventory: state.bbqIsland.inventory.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item,
      ),
    },
  }));
}

export function deleteBbqInventoryItem(itemId: string) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      inventory: state.bbqIsland.inventory.filter((item) => item.id !== itemId),
    },
  }));
}

export function resetPlannerParameters() {
  setPlannerState(() => initialPlannerParameters);
}

function updateBbqSectionTopology(
  sectionId: string,
  updateSection: (section: IslandSection) => IslandSection,
) {
  setPlannerState((state) => ({
    ...state,
    bbqIsland: {
      ...state.bbqIsland,
      sections: state.bbqIsland.sections.map((section) =>
        section.id === sectionId ? updateSection(section) : section,
      ),
    },
  }));
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

function addMemberWithBestSurfaceAttachment(
  section: IslandSection,
  member: StructuralMember,
  connectorSize: number,
  tubeWidth: number,
): IslandSection {
  for (const candidate of candidateMemberPlacements(section, member, tubeWidth)) {
    const normalizedMember = normalizeStructuralMemberRunSpan(
      section,
      candidate,
      connectorSize,
      tubeWidth,
    );
    const nextSection = addMemberWithSurfaceConnectors(
      section,
      normalizedMember,
      tubeWidth,
    );

    if (
      nextSection.structuralMembers.some(
        (candidateMember) => candidateMember.id === member.id,
      )
    ) {
      return nextSection;
    }
  }

  return section;
}

function candidateMemberPlacements(
  section: IslandSection,
  member: StructuralMember,
  tubeWidth: number,
): StructuralMember[] {
  const placementAxes = structuralMemberPlacementAxes(member);
  const valuesByAxis = placementAxes.map((axis) => ({
    axis,
    values: placementCandidateValues(section, member, axis, tubeWidth),
  }));
  const candidates = combinePlacementValues(valuesByAxis)
    .map((placement) => {
      let nextMember = member;
      for (const [axis, value] of Object.entries(placement) as Array<
        [keyof StructuralMember["start"], number]
      >) {
        nextMember = {
          ...nextMember,
          start: { ...nextMember.start, [axis]: value },
          end: { ...nextMember.end, [axis]: value },
        };
      }
      return nextMember;
    })
    .sort(
      (first, second) =>
        placementDistance(first, member, placementAxes) -
        placementDistance(second, member, placementAxes),
    );

  return candidates.length > 0 ? candidates : [member];
}

function placementCandidateValues(
  section: IslandSection,
  member: StructuralMember,
  axis: keyof StructuralMember["start"],
  tubeWidth: number,
) {
  const max = nonAxisMax(section, axis, tubeWidth);
  const values = new Set<number>([
    snapToIncrement(member.start[axis]),
    0,
    max,
  ]);

  for (const candidate of section.structuralMembers ?? []) {
    const bounds = structuralMemberLocalBounds(candidate, tubeWidth);
    const candidateAxis = structuralMemberAxisName(candidate);

    values.add(snapToIncrement(bounds.min[axis]));
    if (candidateAxis === axis) {
      values.add(Math.max(0, snapToIncrement(bounds.max[axis] - tubeWidth)));
    }
  }

  return [...values]
    .filter((value) => value >= 0 && value <= max)
    .sort(
      (first, second) =>
        Math.abs(first - member.start[axis]) -
          Math.abs(second - member.start[axis]) ||
        first - second,
    )
    .slice(0, 32);
}

function combinePlacementValues(
  valuesByAxis: Array<{
    axis: keyof StructuralMember["start"];
    values: number[];
  }>,
) {
  return valuesByAxis.reduce<Array<Partial<StructuralMember["start"]>>>(
    (placements, { axis, values }) =>
      placements.flatMap((placement) =>
        values.map((value) => ({ ...placement, [axis]: value })),
      ),
    [{}],
  );
}

function placementDistance(
  member: StructuralMember,
  reference: StructuralMember,
  axes: Array<keyof StructuralMember["start"]>,
) {
  return axes.reduce(
    (distance, axis) =>
      distance + Math.abs(member.start[axis] - reference.start[axis]),
    0,
  );
}

function structuralMemberPlacementAxes(
  member: StructuralMember,
): Array<keyof StructuralMember["start"]> {
  if (member.kind === "vertical-post") return ["x", "y"];
  if (member.kind === "horizontal-beam") return ["y", "z"];
  return ["x", "z"];
}

function defaultStructuralMember(
  section: IslandSection,
  id: string,
  kind: StructuralMember["kind"],
  tubeWidth: number,
  connectorSize: number,
): StructuralMember {
  const rightX = Math.max(0, section.length - tubeWidth);
  const backY = Math.max(0, section.depth - tubeWidth);
  const topZ = Math.max(0, section.height - tubeWidth);
  const innerRightX = Math.max(connectorSize, section.length - connectorSize);
  const innerBackY = Math.max(connectorSize, section.depth - connectorSize);
  const innerTopZ = Math.max(connectorSize, section.height - connectorSize);

  if (kind === "horizontal-beam") {
    const z = Math.min(topZ, section.height / 2);
    const span = firstOpenHorizontalSpan(section, tubeWidth, connectorSize, 0, z);
    return {
      id,
      name: "Horizontal beam",
      color: "#2563eb",
      kind,
      start: { x: span.start, y: 0, z },
      end: { x: span.end, y: 0, z },
    };
  }

  if (kind === "rafter") {
    return {
      id,
      name: "Rafter",
      color: "#dc2626",
      kind,
      start: { x: Math.min(rightX, section.length / 2), y: connectorSize, z: Math.min(topZ, section.height / 2) },
      end: { x: Math.min(rightX, section.length / 2), y: innerBackY, z: Math.min(topZ, section.height / 2) },
    };
  }

  return {
    id,
    name: "Vertical post",
    color: "#0891b2",
    kind,
    start: { x: Math.min(rightX, section.length / 2), y: 0, z: connectorSize },
    end: { x: Math.min(rightX, section.length / 2), y: 0, z: innerTopZ },
  };
}

function firstOpenHorizontalSpan(
  section: IslandSection,
  tubeWidth: number,
  connectorSize: number,
  y: number,
  z: number,
) {
  const blocked = [
    { min: 0, max: connectorSize },
    { min: section.length - connectorSize, max: section.length },
    ...section.structuralMembers
      .filter(
        (member) =>
          member.kind === "vertical-post" &&
          rangesOverlap(y, y + tubeWidth, member.start.y, member.start.y + tubeWidth) &&
          rangesOverlap(z, z + tubeWidth, member.start.z, member.end.z),
      )
      .map((member) => ({
        min: member.start.x,
        max: member.start.x + tubeWidth,
      })),
  ].sort((first, second) => first.min - second.min);

  let cursor = 0;
  let best = { start: connectorSize, end: Math.max(connectorSize, section.length - connectorSize) };

  for (const band of blocked) {
    if (band.min - cursor >= tubeWidth) {
      best = { start: cursor, end: band.min };
      break;
    }
    cursor = Math.max(cursor, band.max);
  }

  return best;
}

function rangesOverlap(
  firstMin: number,
  firstMax: number,
  secondMin: number,
  secondMax: number,
) {
  return firstMin < secondMax && firstMax > secondMin;
}
