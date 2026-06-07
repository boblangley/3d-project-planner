import {
  AlertTriangle,
  AlignCenterHorizontal,
  Box,
  CheckCircle2,
  FlipHorizontal,
  Grid2X2,
  Leaf,
  Package,
  RotateCcw,
  Ruler,
  ShoppingCart,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Slider } from "@/components/ui/slider";
import {
  evaluateBbqIsland,
  type AssemblyPiece,
  type BbqInventoryAllocation,
  type BbqConnector,
  type BbqIslandEvaluation,
  type ExtraVerticalPost,
  type InsertDefinition,
  type InsertKind,
  type IslandFace,
  type IslandSection,
  type ConnectorType,
  type StructuralConnector,
  type StructuralConnectorDirection,
  type StructuralMember,
  type StructuralMemberTerminal,
} from "./lib/bbqIsland";
import {
  evaluateGardenBeds,
  type GardenBedPlacement,
  type GardenEvaluation,
  type GardenInventoryLine,
  type GardenPanelRun,
} from "./lib/gardenBeds";
import {
  buildCutPieces,
  evaluateSpatialConfiguration,
  type AssemblyArtifact,
  type CutPiece,
  type EvaluatedConfiguration,
  type EvaluatedElement,
  type InventoryAllocation,
  type InventoryItem,
  type InventoryStatus,
  type ProcurementLine,
} from "./lib/spatial";
import { buildSampleConfiguration } from "./lib/sampleConfiguration";
import {
  addBbqInsert,
  addBbqInventoryItem,
  addBbqSection,
  addBbqStructuralMember,
  addBbqSurfaceConnector,
  convertBbqNodeConnectorToSurface,
  convertBbqSurfaceConnectorToNode,
  deleteBbqInsert,
  deleteBbqInventoryItem,
  deleteBbqSection,
  deleteBbqStructuralConnector,
  deleteBbqStructuralMember,
  insertBbqNodeConnector,
  resetPlannerParameters,
  undoPlannerChange,
  updateBbqCounterSetting,
  updateBbqFootingSetting,
  updateBbqInsert,
  updateBbqInventoryItem,
  updateBbqIslandSettings,
  updateBbqSection,
  updateBbqStructuralConnector,
  updateBbqStructuralMember,
  updateBbqStructuralMembers,
  updateGardenParameter,
  updatePlannerParameter,
  usePlannerState,
  usePlannerUndoState,
} from "./lib/plannerStore";
import { stickyStructuralMemberUpdates } from "./lib/bbqStructuralControls";
import {
  connectorTypeOptionsForStructuralConnector,
  nodeConnectorAttachedDirections,
  nodeConnectorDirectionOptions,
  nodeConnectorFreeDirections,
  preferredNodeConnectorDirections,
  structuralConnectorDeletePlan,
  structuralConnectorDemotePlan,
  structuralConnectorPosition,
  structuralMemberAxis,
  structuralMemberLength,
} from "./lib/bbqStructuralTopology";

interface ShoppingRow {
  id: string;
  item: string;
  category: string;
  quantity: string;
  detail: string;
}

interface ConnectionRow {
  id: string;
  tube: string;
  start: string;
  end: string;
}

interface ConnectorRow {
  id: string;
  kind: string;
  position: string;
  type: string;
  directions: string;
  pieces: string;
}

type SectionView = "top" | "front" | "back" | "side" | "right";
type StructuralAxis = keyof StructuralMember["start"];
type SectionEditorTab =
  | "main"
  | "vertical"
  | "horizontal"
  | "rafter"
  | "connectors"
  | "inserts";
type StructuralSelection =
  | { type: "member"; id: string }
  | { type: "connector"; id: string }
  | null;
type ConnectorEditorMode = "existing" | "new-node" | "new-surface";

interface AxisInterval {
  min: number;
  max: number;
}

interface ForcedEndpointControl {
  kind: "forced-endpoints";
  axis: StructuralAxis;
  startValue: number;
  endValue: number;
  min: number;
  max: number;
  stops: number[];
  spans: AxisInterval[];
  onSpanChange: (span: AxisInterval) => void;
}

interface ContinuousBlockedControl {
  kind: "continuous-blocked";
  axis: StructuralAxis;
  label: string;
  value: number;
  min: number;
  max: number;
  tubeWidth: number;
  blockedBands: AxisInterval[];
  allowedBands: AxisInterval[];
  orientation?: "horizontal" | "vertical";
  onChange: (value: number) => void;
}

interface LockedAxisControl {
  kind: "locked";
  axis: StructuralAxis;
  label: string;
  value: number;
}

interface MemberControlModel {
  runControl: ForcedEndpointControl;
  placementControls: Array<ContinuousBlockedControl | LockedAxisControl>;
}

interface CenterAction {
  axis: StructuralAxis;
  target: number;
  label: string;
  reason: string;
}

interface DirectionFlipAction {
  label: string;
  reason: string;
  directions: StructuralConnectorDirection[];
}

const procurementColumns = createColumnHelper<ShoppingRow>();
const cutColumns = createColumnHelper<InventoryAllocation>();
const linearColumns = createColumnHelper<CutPiece>();
const connectionColumns = createColumnHelper<ConnectionRow>();
const connectorColumns = createColumnHelper<ConnectorRow>();
const gardenInventoryColumns = createColumnHelper<GardenInventoryLine>();
const gardenBedColumns = createColumnHelper<GardenBedPlacement>();
const bbqPieceColumns = createColumnHelper<AssemblyPiece>();
const bbqAllocationColumns = createColumnHelper<BbqInventoryAllocation>();

function connectorTypeOptionsForConnector(
  section: IslandSection,
  connector: StructuralConnector,
  tubeWidth: number,
  options: { allowSurfacePromotion?: boolean } = {},
): ConnectorType[] {
  const topologyOptions = connectorTypeOptionsForStructuralConnector(
    section,
    connector,
    tubeWidth,
  );

  if (connector.kind === "surface") {
    return options.allowSurfacePromotion
      ? ["tee-surface", ...topologyOptions]
      : ["tee-surface"];
  }

  return topologyOptions;
}
const structuralConnectorFaces: StructuralConnectorDirection[] = [
  "+X",
  "-X",
  "+Y",
  "-Y",
  "+Z",
  "-Z",
];
const structuralTerminals: StructuralMemberTerminal[] = ["start", "end"];

function connectorDirectionOptionValue(
  directions: StructuralConnectorDirection[],
) {
  return structuralConnectorFaces
    .filter((direction) => directions.includes(direction))
    .join(", ");
}

function parseConnectorDirectionOption(value: string): StructuralConnectorDirection[] {
  if (!value) return [];
  return value.split(", ") as StructuralConnectorDirection[];
}

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const parameters = usePlannerState();
  const undoState = usePlannerUndoState();
  const gardenEvaluation = useMemo(
    () => evaluateGardenBeds(parameters.garden),
    [parameters.garden],
  );
  const bbqIslandEvaluation = useMemo(
    () => evaluateBbqIsland(parameters.bbqIsland),
    [parameters.bbqIsland],
  );
  const configuration = useMemo(
    () => buildSampleConfiguration(parameters),
    [parameters],
  );
  const evaluated = useMemo(
    () => evaluateSpatialConfiguration(configuration),
    [configuration],
  );
  const cutPieces = useMemo(
    () => buildCutPieces(evaluated.linearElements),
    [evaluated.linearElements],
  );
  const shoppingRows = useMemo(
    () =>
      buildShoppingRows(
        evaluated.procurement,
        evaluated.inventoryAllocations,
        evaluated.unallocatedCuts,
      ),
    [evaluated.procurement, evaluated.inventoryAllocations, evaluated.unallocatedCuts],
  );
  const connectionRows = useMemo(
    () =>
      evaluated.connectionGraph.edges.map((edge) => ({
        id: edge.id,
        tube: edge.linearElementId,
        start: formatTerminal(edge.start),
        end: formatTerminal(edge.end),
      })),
    [evaluated.connectionGraph.edges],
  );
  const inspectableObjects = useMemo(
    () => [...evaluated.elements, ...evaluated.assemblyArtifacts],
    [evaluated.elements, evaluated.assemblyArtifacts],
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-w-0 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 2xl:px-10">
        <header className="flex flex-col gap-3 border-b border-slate-300 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
              Parametric BOM Compiler
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">
              Spatial Configuration Engine
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={undoPlannerChange}
              disabled={!undoState.canUndo}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Undo
            </button>
            <StatusPill
              issueCount={
                parameters.mode === "garden"
                  ? gardenEvaluation.validationIssues.length
                  : bbqIslandEvaluation.validationIssues.length
              }
            />
          </div>
        </header>

        <div className="inline-flex w-fit rounded-md border border-slate-300 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => updatePlannerParameter("mode", "bbq")}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              parameters.mode === "bbq"
                ? "bg-teal-700 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            BBQ Island
          </button>
          <button
            type="button"
            onClick={() => updatePlannerParameter("mode", "garden")}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              parameters.mode === "garden"
                ? "bg-teal-700 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            Raised Beds
          </button>
        </div>

        {parameters.mode === "garden" ? (
          <GardenPlanner evaluation={gardenEvaluation} />
        ) : (
          <BbqPlanner
            evaluated={evaluated}
            bbqIslandEvaluation={bbqIslandEvaluation}
            cutPieces={cutPieces}
            shoppingRows={shoppingRows}
            connectionRows={connectionRows}
            inspectableObjects={inspectableObjects}
            selectedId={selectedId}
            onSelect={setSelectedId}
            parameters={parameters}
          />
        )}
      </div>
    </main>
  );
}

function BbqPlanner({
  bbqIslandEvaluation,
  parameters,
}: {
  evaluated: EvaluatedConfiguration;
  bbqIslandEvaluation: BbqIslandEvaluation;
  cutPieces: CutPiece[];
  shoppingRows: ShoppingRow[];
  connectionRows: ConnectionRow[];
  inspectableObjects: Array<EvaluatedElement | AssemblyArtifact>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  parameters: ReturnType<typeof usePlannerState>;
}) {
  const [activeSectionId, setActiveSectionId] = useState<string>("overview");
  const activeSection =
    parameters.bbqIsland.sections.find((section) => section.id === activeSectionId) ??
    null;
  const isOverview = activeSectionId === "overview" || !activeSection;

  return (
    <>
      <BbqBreadcrumbs
        section={isOverview ? null : activeSection}
        onOverview={() => setActiveSectionId("overview")}
      />

      {isOverview ? (
        <BbqOverview
          evaluation={bbqIslandEvaluation}
          parameters={parameters}
          onOpenSection={setActiveSectionId}
        />
      ) : (
        <BbqSectionPage
          section={activeSection}
          evaluation={bbqIslandEvaluation}
        />
      )}
    </>
  );
}

function BbqBreadcrumbs({
  section,
  onOverview,
}: {
  section: IslandSection | null;
  onOverview: () => void;
}) {
  return (
    <nav aria-label="BBQ island breadcrumbs" className="text-sm text-slate-600">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <button
            type="button"
            onClick={onOverview}
            className="font-medium text-teal-800 hover:text-teal-950"
          >
            BBQ Island
          </button>
        </li>
        {section ? (
          <>
            <li className="text-slate-400">/</li>
            <li className="font-medium text-slate-950">{section.name}</li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}

function BbqOverview({
  evaluation,
  parameters,
  onOpenSection,
}: {
  evaluation: BbqIslandEvaluation;
  parameters: ReturnType<typeof usePlannerState>;
  onOpenSection: (sectionId: string) => void;
}) {
  return (
    <>
      <section className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <DataPanel
          icon={<Ruler className="h-4 w-4 text-teal-700" />}
          title="Common Settings"
        >
          <div className="space-y-4">
            <NumberControl
              label="Counter thickness"
              value={parameters.bbqIsland.settings.counter.thickness}
              min={0.5}
              max={6}
              step={0.25}
              unit="in"
              onChange={(value) => updateBbqCounterSetting("thickness", value)}
            />
            <NumberControl
              label="Counter overhang"
              value={parameters.bbqIsland.settings.counter.edgeOverhang}
              min={0}
              max={6}
              step={0.25}
              unit="in"
              onChange={(value) => updateBbqCounterSetting("edgeOverhang", value)}
            />
            <NumberControl
              label="Counter edge"
              value={parameters.bbqIsland.settings.counter.edgeThickness}
              min={0}
              max={8}
              step={0.25}
              unit="in"
              onChange={(value) => updateBbqCounterSetting("edgeThickness", value)}
            />
            <NumberControl
              label="Footing board"
              value={parameters.bbqIsland.settings.footingBoard.thickness}
              min={0}
              max={2}
              step={0.125}
              unit="in"
              onChange={(value) => updateBbqFootingSetting("thickness", value)}
            />
            <NumberControl
              label="Tube width"
              value={parameters.bbqIsland.settings.tubeProfileSize}
              min={0.125}
              max={4}
              step={0.125}
              unit="in"
              onChange={(value) => updateBbqIslandSettings("tubeProfileSize", value)}
            />
            <NumberControl
              label="Tube deduction"
              value={parameters.bbqIsland.settings.connectorDeduction}
              min={0}
              max={4}
              step={0.125}
              unit="in"
              onChange={(value) => updateBbqIslandSettings("connectorDeduction", value)}
            />
            <NumberControl
              label="Connector cube"
              value={parameters.bbqIsland.settings.connectorSize}
              min={0.125}
              max={4}
              step={0.125}
              unit="in"
              onChange={(value) => updateBbqIslandSettings("connectorSize", value)}
            />
          </div>
        </DataPanel>

        <DataPanel
          icon={<AlertTriangle className="h-4 w-4 text-teal-700" />}
          title="Compiler Validation"
        >
          {evaluation.validationIssues.length === 0 ? (
            <p className="text-sm text-slate-700">
              Section model compiles without issues.
            </p>
          ) : (
            <ul className="space-y-2">
              {evaluation.validationIssues.map((issue) => (
                <li
                  key={issue.id}
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                >
                  <span className="font-medium">{issue.severity}</span>:{" "}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </DataPanel>
      </section>

      <DataPanel
        icon={<Box className="h-4 w-4 text-teal-700" />}
        title="Island Sections"
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={addBbqSection}
            className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            Add Section
          </button>
        </div>
        <IslandSectionsList
          sections={parameters.bbqIsland.sections}
          onOpenSection={onOpenSection}
        />
      </DataPanel>

      <DataPanel
        icon={<Package className="h-4 w-4 text-teal-700" />}
        title="All Inventory Allocation"
      >
        <SimpleTable
          table={useReactTable({
            data: evaluation.allocations,
            columns: [
              bbqAllocationColumns.accessor("inventoryLabel", {
                header: "Inventory",
              }),
              bbqAllocationColumns.accessor("pieces", {
                header: "Allocated assembly pieces",
                cell: (info) =>
                  info.getValue().length === 0
                    ? "Unused"
                    : info
                        .getValue()
                        .map(
                          (piece: AssemblyPiece) =>
                            `${piece.id}: ${formatLength(piece.length ?? 0)} in`,
                        )
                        .join(", "),
              }),
              bbqAllocationColumns.accessor("remainingLength", {
                header: "Remaining",
                cell: (info) => `${formatLength(info.getValue())} in`,
              }),
            ],
            getCoreRowModel: getCoreRowModel(),
          })}
        />
      </DataPanel>

      <DataPanel
        icon={<Package className="h-4 w-4 text-teal-700" />}
        title="Inventory CRUD"
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={addBbqInventoryItem}
            className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            Add Inventory Item
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {parameters.bbqIsland.inventory.map((item) => (
            <InventoryEditor key={item.id} item={item} />
          ))}
        </div>
      </DataPanel>
    </>
  );
}

function IslandSectionsList({
  sections,
  onOpenSection,
}: {
  sections: IslandSection[];
  onOpenSection: (sectionId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-300">
            <th className="px-3 py-2 font-semibold text-slate-700">Section</th>
            <th className="px-3 py-2 font-semibold text-slate-700">Length</th>
            <th className="px-3 py-2 font-semibold text-slate-700">Depth</th>
            <th className="px-3 py-2 font-semibold text-slate-700">Height</th>
            <th className="px-3 py-2 font-semibold text-slate-700">Members</th>
            <th className="px-3 py-2 font-semibold text-slate-700">Relation</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <tr
              key={section.id}
              onClick={() => onOpenSection(section.id)}
              className="cursor-pointer border-b border-slate-200 transition hover:bg-teal-50/70"
            >
              <td className="px-3 py-2 align-top">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenSection(section.id);
                  }}
                  className="font-medium text-teal-800 hover:text-teal-950"
                >
                  {section.name}
                </button>
              </td>
              <td className="px-3 py-2 align-top text-slate-800">
                {formatLength(section.length)} in
              </td>
              <td className="px-3 py-2 align-top text-slate-800">
                {formatLength(section.depth)} in
              </td>
              <td className="px-3 py-2 align-top text-slate-800">
                {formatLength(section.height)} in
              </td>
              <td className="px-3 py-2 align-top text-slate-800">
                {formatStructuralMembers(section.structuralMembers)}
              </td>
              <td className="px-3 py-2 align-top text-slate-800">
                {section.relationship
                  ? `${section.relationship.type} ${section.relationship.connectsToSectionId}`
                  : "Root"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionEditor({
  section,
  sectionCount,
  compact = false,
}: {
  section: IslandSection;
  sectionCount: number;
  compact?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-300 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{section.name}</h3>
        <button
          type="button"
          onClick={() => deleteBbqSection(section.id)}
          disabled={sectionCount <= 1}
          className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      <div className={`grid gap-3 ${compact ? "" : "md:grid-cols-2"}`}>
        <TextControl
          label="Name"
          value={section.name}
          onChange={(value) => updateBbqSection(section.id, { name: value })}
        />
        <NumberControl
          label="Length"
          value={section.length}
          min={1}
          max={240}
          step={1}
          unit="in"
          onChange={(value) => updateBbqSection(section.id, { length: value })}
        />
        <NumberControl
          label="Depth"
          value={section.depth}
          min={1}
          max={96}
          step={1}
          unit="in"
          onChange={(value) => updateBbqSection(section.id, { depth: value })}
        />
        <NumberControl
          label="Height"
          value={section.height}
          min={1}
          max={96}
          step={1}
          unit="in"
          onChange={(value) => updateBbqSection(section.id, { height: value })}
        />
        <NumberControl
          label="Origin X"
          value={section.origin.x}
          min={-120}
          max={360}
          step={1}
          unit="in"
          onChange={(value) =>
            updateBbqSection(section.id, {
              origin: { ...section.origin, x: value },
            })
          }
        />
        <NumberControl
          label="Origin Y"
          value={section.origin.y}
          min={-120}
          max={360}
          step={1}
          unit="in"
          onChange={(value) =>
            updateBbqSection(section.id, {
              origin: { ...section.origin, y: value },
            })
          }
        />
        <NumberControl
          label="Origin Z"
          value={section.origin.z}
          min={-24}
          max={96}
          step={1}
          unit="in"
          onChange={(value) =>
            updateBbqSection(section.id, {
              origin: { ...section.origin, z: value },
            })
          }
        />
      </div>
    </div>
  );
}

function ExtraPostEditor({
  section,
  compact,
  structuralView,
}: {
  section: IslandSection;
  compact: boolean;
  structuralView: SectionView;
}) {
  const visiblePosts = section.extraVerticalPosts.filter((post) =>
    isExtraPostVisibleInStructuralView(post, structuralView),
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
          Extra Posts
        </h4>
        <button
          type="button"
          onClick={() => addExtraPost(section, defaultExtraPostFaceForView(structuralView))}
          className="rounded-md border border-teal-200 bg-white px-2 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50"
        >
          Add Post
        </button>
      </div>
      {visiblePosts.length === 0 ? (
        <p className="text-sm text-slate-600">No extra posts.</p>
      ) : (
        <div className={`grid gap-2 ${compact ? "" : "lg:grid-cols-2"}`}>
          {visiblePosts.map((post) => (
            <ExtraPostRow key={post.id} section={section} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}

function InsertsEditorPanel({
  sectionId,
  inserts,
}: {
  sectionId: string;
  inserts: InsertDefinition[];
}) {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <AddInsertMenu sectionId={sectionId} />
      </div>
      <div className="grid gap-3">
        {inserts.length === 0 ? (
          <p className="text-sm text-slate-600">No inserts on this section.</p>
        ) : (
          inserts.map((insert) => (
            <InsertEditor key={insert.id} insert={insert} />
          ))
        )}
      </div>
    </>
  );
}

function ExtraPostRow({
  section,
  post,
}: {
  section: IslandSection;
  post: ExtraVerticalPost;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">
          {post.face} @ {formatLength(post.offset)} in
        </span>
        <button
          type="button"
          onClick={() => deleteExtraPost(section, post.id)}
          className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ColorControl
          label="Color"
          value={post.color}
          onChange={(value) => updateExtraPost(section, post.id, { color: value })}
        />
        <SelectControl
          label="Face"
          value={post.face}
          options={["front", "back", "left", "right"]}
          onChange={(value) =>
            updateExtraPost(section, post.id, { face: value as IslandFace })
          }
        />
        <NumberControl
          label="Index"
          value={post.offset}
          min={0}
          max={post.face === "front" || post.face === "back" ? section.length : section.depth}
          step={0.5}
          unit="in"
          onChange={(value) => updateExtraPost(section, post.id, { offset: value })}
        />
      </div>
    </div>
  );
}

function StructuralMembersEditor({
  section,
  kind,
  structuralView,
  layerPosition,
  connectorSize,
  tubeWidth,
  selectedMemberId,
  onSelectMember,
}: {
  section: IslandSection;
  kind: StructuralMember["kind"];
  structuralView: SectionView;
  layerPosition: number;
  connectorSize: number;
  tubeWidth: number;
  selectedMemberId: string | null;
  onSelectMember: (member: StructuralMember) => void;
}) {
  const [showOffViewMembers, setShowOffViewMembers] = useState(false);
  const members = (section.structuralMembers ?? []).filter(
    (member) => member.kind === kind,
  );
  const visibleMemberIds = new Set(
    members
      .filter((member) =>
        isStructuralMemberVisibleInView(
          section,
          member,
          structuralView,
          layerPosition,
          tubeWidth,
        ),
      )
      .map((member) => member.id),
  );
  const visibleMembers = members.filter((member) => visibleMemberIds.has(member.id));
  const offViewCount = members.length - visibleMembers.length;
  const displayedMembers = showOffViewMembers ? members : visibleMembers;
  const selectedMember =
    displayedMembers.find((member) => member.id === selectedMemberId) ??
    displayedMembers[0] ??
    null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-600">
            {visibleMemberIds.size} of {members.length} {structuralMemberLabel(kind)}
            {members.length === 1 ? "" : "s"} visible in{" "}
            {structuralViewTitle(structuralView).toLowerCase()}.
          </p>
          {offViewCount > 0 ? (
            <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={showOffViewMembers}
                onChange={(event) => setShowOffViewMembers(event.target.checked)}
                className="h-3.5 w-3.5 accent-teal-700"
              />
              Show off-view
            </label>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() =>
            addBbqStructuralMember(
              section.id,
              kind,
              structuralMemberLayerPlacement(kind, structuralView, layerPosition, tubeWidth),
            )
          }
          className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
        >
          Add {structuralMemberLabel(kind)}
        </button>
      </div>
      {members.length === 0 ? (
        <p className="text-sm text-slate-600">No {structuralMemberLabel(kind)}s.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="grid max-h-[32rem] content-start gap-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2">
            {displayedMembers.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                No {structuralMemberLabel(kind)}s on this layer.
              </div>
            ) : null}
            {displayedMembers.map((member) => {
              const isVisible = visibleMemberIds.has(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => onSelectMember(member)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                    selectedMember?.id === member.id
                      ? "border-teal-700 bg-white text-teal-950 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-teal-50"
                  } ${isVisible ? "" : "opacity-60"}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{member.name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${
                        isVisible
                          ? "bg-teal-50 text-teal-800"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {isVisible ? "visible" : "off-view"}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {memberCoordinateSummary(member)}
                  </span>
                </button>
              );
            })}
          </div>
          {selectedMember ? (
            <StructuralMemberEditor
              key={selectedMember.id}
              section={section}
              member={selectedMember}
              structuralView={structuralView}
              layerPosition={layerPosition}
              connectorSize={connectorSize}
              tubeWidth={tubeWidth}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function StructuralConnectorsEditor({
  section,
  evaluatedConnectors,
  tubeWidth,
  connectorSize,
  structuralView,
  layerPosition,
  selectedConnectorId,
  onSelectConnector,
}: {
  section: IslandSection;
  evaluatedConnectors: BbqConnector[];
  tubeWidth: number;
  connectorSize: number;
  structuralView: SectionView;
  layerPosition: number;
  selectedConnectorId: string | null;
  onSelectConnector: (connector: BbqConnector) => void;
}) {
  const members = section.structuralMembers ?? [];
  const authoredConnectors = section.structuralConnectors ?? [];
  const [showOffViewConnectors, setShowOffViewConnectors] = useState(false);
  const connectors = evaluatedConnectors.filter(
    (connector) => connector.sectionId === section.id,
  );
  const [editorMode, setEditorMode] = useState<ConnectorEditorMode>("existing");
  const connectorVisuals = connectorVisualsForView(
    section,
    connectors,
    structuralView,
    layerPosition,
    tubeWidth,
    connectorSize,
  );
  const visibleConnectorIds = new Set(
    connectorVisuals.flatMap((visual) => visual.connectorIds),
  );
  const visibleConnectors = connectors.filter((connector) =>
    visibleConnectorIds.has(connector.id),
  );
  const offViewConnectorCount = connectors.length - visibleConnectors.length;
  const displayedConnectors = showOffViewConnectors
    ? connectors
    : visibleConnectors;
  const visibleMembers = members.filter((member) =>
    isStructuralMemberVisibleInView(
      section,
      member,
      structuralView,
      layerPosition,
      tubeWidth,
    ),
  );
  const selectedConnector =
    displayedConnectors.find((connector) => connector.id === selectedConnectorId) ??
    displayedConnectors[0] ??
    null;
  const selectedAuthoredConnector = selectedConnector
    ? authoredConnectors.find((connector) => connector.id === selectedConnector.id)
    : null;
  const addDisabled = visibleMembers.length === 0;
  const selectedConnectorIsEditable =
    selectedConnector ? visibleConnectorIds.has(selectedConnector.id) : false;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-600">
            {visibleConnectorIds.size} of {connectors.length} connector
            {connectors.length === 1 ? "" : "s"} visible in{" "}
            {structuralViewTitle(structuralView).toLowerCase()}.
          </p>
          {offViewConnectorCount > 0 ? (
            <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={showOffViewConnectors}
                onChange={(event) => setShowOffViewConnectors(event.target.checked)}
                className="h-3.5 w-3.5 accent-teal-700"
              />
              Show off-view
            </label>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditorMode("new-node")}
            disabled={addDisabled}
            className="rounded-md border border-teal-300 bg-white px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add node
          </button>
          <button
            type="button"
            onClick={() => setEditorMode("new-surface")}
            disabled={addDisabled}
            className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add bracket
          </button>
        </div>
      </div>
      {members.length === 0 ? (
        <p className="text-sm text-slate-600">No structural members.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="grid max-h-[32rem] content-start gap-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2">
            {connectors.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-600">
                No explicit connectors.
              </div>
            ) : (
              <>
                {displayedConnectors.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                    No connectors on this layer.
                  </div>
                ) : null}
                {displayedConnectors.map((connector) => {
                  const authoredConnector = authoredConnectors.find(
                    (candidate) => candidate.id === connector.id,
                  );
                  const position = localEvaluatedConnectorPosition(section, connector);
                  const isVisible = visibleConnectorIds.has(connector.id);
                  const isSelected =
                    editorMode === "existing" && selectedConnector?.id === connector.id;
                  return (
                    <button
                      key={connector.id}
                      type="button"
                      onClick={() => {
                        setEditorMode("existing");
                        onSelectConnector(connector);
                      }}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                        isSelected
                          ? "border-teal-700 bg-white text-teal-950 shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-teal-50"
                      } ${isVisible ? "" : "opacity-60"}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {authoredConnector?.name ?? connector.id}
                        </span>
                        <span className="flex items-center gap-1">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${
                              isVisible
                                ? "bg-teal-50 text-teal-800"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {isVisible ? "visible" : "off-view"}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-600">
                            {connector.kind}
                          </span>
                        </span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {connector.connectorType} @ x {formatLength(position.x)}, y{" "}
                        {formatLength(position.y)}, z {formatLength(position.z)}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
          {editorMode === "new-node" ? (
            <NewNodeConnectorEditor
              section={section}
              members={visibleMembers}
              onCancel={() => setEditorMode("existing")}
              onInsert={() => setEditorMode("existing")}
            />
          ) : null}
          {editorMode === "new-surface" ? (
            <NewSurfaceConnectorEditor
              section={section}
              members={visibleMembers}
              tubeWidth={tubeWidth}
              onCancel={() => setEditorMode("existing")}
              onInsert={() => setEditorMode("existing")}
            />
          ) : null}
          {editorMode === "existing" && selectedConnector && selectedAuthoredConnector ? (
            <StructuralConnectorEditor
              key={selectedAuthoredConnector.id}
              section={section}
              connector={selectedAuthoredConnector}
              members={members}
              structuralView={structuralView}
              layerPosition={layerPosition}
              connectorSize={connectorSize}
              tubeWidth={tubeWidth}
              isEditable={selectedConnectorIsEditable}
            />
          ) : null}
          {editorMode === "existing" && !selectedConnector ? (
            <div className="rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
              Select a connector or add one for this active layer.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function NewNodeConnectorEditor({
  section,
  members,
  onCancel,
  onInsert,
}: {
  section: IslandSection;
  members: StructuralMember[];
  onCancel: () => void;
  onInsert: () => void;
}) {
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const member = members.find((candidate) => candidate.id === memberId) ?? members[0] ?? null;
  const [offset, setOffset] = useState(
    member ? structuralMemberLength(member) / 2 : 0,
  );

  const selectMember = (nextMemberId: string) => {
    const nextMember = members.find((candidate) => candidate.id === nextMemberId);
    setMemberId(nextMemberId);
    setOffset(nextMember ? structuralMemberLength(nextMember) / 2 : 0);
  };

  return (
    <div className="rounded-md border border-slate-300 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">New node connector</h3>
          <div className="mt-1 text-xs text-slate-500">
            Splits a visible member at the selected offset.
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
      {member ? (
        <div className="grid gap-3 md:grid-cols-2">
          <SelectControl
            label="Member"
            value={member.id}
            options={members.map((candidate) => candidate.id)}
            onChange={selectMember}
          />
          <NumberControl
            label="Offset"
            value={offset}
            min={0}
            max={structuralMemberLength(member)}
            step={0.125}
            unit="in"
            onChange={setOffset}
          />
          <div className="flex items-end md:col-span-2">
            <button
              type="button"
              onClick={() => {
                insertBbqNodeConnector(section.id, member.id, offset);
                onInsert();
              }}
              className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              Insert node
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          No visible members are available on the active layer.
        </p>
      )}
    </div>
  );
}

function NewSurfaceConnectorEditor({
  section,
  members,
  tubeWidth,
  onCancel,
  onInsert,
}: {
  section: IslandSection;
  members: StructuralMember[];
  tubeWidth: number;
  onCancel: () => void;
  onInsert: () => void;
}) {
  const [hostMemberId, setHostMemberId] = useState(members[0]?.id ?? "");
  const host = members.find((member) => member.id === hostMemberId) ?? members[0] ?? null;
  const attachedMemberOptions = members
    .filter((member) => member.id !== host?.id)
    .map((member) => member.id);
  const [attachedMemberId, setAttachedMemberId] = useState(
    attachedMemberOptions[0] ?? "",
  );
  const [terminal, setTerminal] = useState<StructuralMemberTerminal>("start");
  const [hostFace, setHostFace] = useState<StructuralConnectorDirection>("+Z");
  const [offset, setOffset] = useState(
    host ? structuralMemberLength(host) / 2 : 0,
  );

  const selectHost = (nextHostMemberId: string) => {
    const nextHost = members.find((member) => member.id === nextHostMemberId);
    const nextAttached = members.find((member) => member.id !== nextHostMemberId);
    setHostMemberId(nextHostMemberId);
    setOffset(nextHost ? structuralMemberLength(nextHost) / 2 : 0);
    setAttachedMemberId(nextAttached?.id ?? "");
  };
  const attachedMember = attachedMemberOptions.includes(attachedMemberId)
    ? attachedMemberId
    : attachedMemberOptions[0];

  return (
    <div className="rounded-md border border-slate-300 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">New surface bracket</h3>
          <div className="mt-1 text-xs text-slate-500">
            Fastens one member endpoint to the face of another visible member.
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
      {host ? (
        <div className="grid gap-3 md:grid-cols-2">
          <SelectControl
            label="Host member"
            value={host.id}
            options={members.map((member) => member.id)}
            onChange={selectHost}
          />
          <SelectControl
            label="Host face"
            value={hostFace}
            options={structuralConnectorFaces}
            onChange={setHostFace}
          />
          <NumberControl
            label="Offset"
            value={offset}
            min={0}
            max={structuralMemberLength(host)}
            step={0.125}
            unit="in"
            onChange={setOffset}
          />
          {attachedMemberOptions.length > 0 && attachedMember ? (
            <>
              <SelectControl
                label="Attached member"
                value={attachedMember}
                options={attachedMemberOptions}
                onChange={setAttachedMemberId}
              />
              <SelectControl
                label="Attached end"
                value={terminal}
                options={structuralTerminals}
                onChange={setTerminal}
              />
            </>
          ) : null}
          <div className="flex items-end md:col-span-2">
            <button
              type="button"
              onClick={() => {
                addBbqSurfaceConnector(section.id, {
                  hostMemberId: host.id,
                  hostFace,
                  offset,
                  attached: attachedMember
                    ? { memberId: attachedMember, terminal }
                    : undefined,
                });
                onInsert();
              }}
              className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              Add bracket
            </button>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600 md:col-span-2">
            Tube profile {formatLength(tubeWidth)} in controls the bracket face position.
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          No visible members are available on the active layer.
        </p>
      )}
    </div>
  );
}

function StructuralConnectorEditor({
  section,
  connector,
  members,
  structuralView,
  layerPosition,
  connectorSize,
  tubeWidth,
  isEditable,
}: {
  section: IslandSection;
  connector: StructuralConnector;
  members: StructuralMember[];
  structuralView: SectionView;
  layerPosition: number;
  connectorSize: number;
  tubeWidth: number;
  isEditable: boolean;
}) {
  const updateConnector = (updates: Partial<StructuralConnector>) =>
    updateBbqStructuralConnector(section.id, connector.id, updates);
  const position = structuralConnectorPosition(section, connector, tubeWidth);
  const deletePlan = structuralConnectorDeletePlan(section, connector.id);
  const demotePlan = structuralConnectorDemotePlan(section, connector.id);
  const validNodeConnectorTypes = connectorTypeOptionsForStructuralConnector(
    section,
    connector,
    tubeWidth,
  );
  const nodeDirectionOptions =
    connector.kind === "node"
      ? nodeConnectorDirectionOptions(section, connector, connector.connectorType)
      : [];
  const nodeDirectionOptionValues = nodeDirectionOptions.map((option) =>
    connectorDirectionOptionValue(option.directions),
  );
  const selectedDirectionOptionValue =
    connector.kind === "node"
      ? connectorDirectionOptionValue(connector.enabledDirections)
      : "";
  const surfacePromotionPlan =
    connector.kind === "surface" && validNodeConnectorTypes.length === 0
      ? "Surface bracket cannot be converted at this host offset."
      : "Convert bracket into a node connector.";
  const centerAction = centerActionForConnector(
    section,
    connector,
    structuralView,
    layerPosition,
    tubeWidth,
    connectorSize,
  );
  const yFlipAction = connector.kind === "node"
    ? nodeYFlipAction(section, connector)
    : null;
  const centerConnector = () => {
    if (!centerAction) return;

    if (connector.kind === "node") {
      updateConnector({
        position: {
          ...connector.position,
          [centerAction.axis]: centerAction.target,
        },
      } as Partial<StructuralConnector>);
      return;
    }

    const host = members.find((member) => member.id === connector.hostMemberId);
    if (!host || structuralMemberAxisName(host) !== centerAction.axis) return;
    updateConnector({
      offset: offsetAlongLocalMember(host, centerAction.target),
    } as Partial<StructuralConnector>);
  };

  return (
    <div className="rounded-md border border-slate-300 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{connector.name}</h3>
          <div className="mt-1 text-xs text-slate-500">
            {isEditable ? deletePlan.reason : "Off active view layer; editing disabled."}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={centerConnector}
            disabled={!isEditable || !centerAction}
            title={centerAction?.reason ?? "No neighboring references to center between."}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <AlignCenterHorizontal className="h-3.5 w-3.5" />
            {centerAction?.label ?? "Center"}
          </button>
          {connector.kind === "node" ? (
            <button
              type="button"
              onClick={() =>
                yFlipAction
                  ? updateConnector({
                      enabledDirections: yFlipAction.directions,
                    } as Partial<StructuralConnector>)
                  : undefined
              }
              disabled={!isEditable || !yFlipAction}
              title={yFlipAction?.reason ?? "This node has no free Y port to flip."}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FlipHorizontal className="h-3.5 w-3.5" />
              Flip Y
            </button>
          ) : null}
          {connector.kind === "surface" ? (
            <button
              type="button"
              onClick={() =>
                convertBbqSurfaceConnectorToNode(
                  section.id,
                  connector.id,
                  validNodeConnectorTypes[0],
                )
              }
              disabled={!isEditable || validNodeConnectorTypes.length === 0}
              title={surfacePromotionPlan}
              className="rounded-md border border-teal-300 bg-white px-2 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Convert to node
            </button>
          ) : null}
          {connector.kind === "node" ? (
            <button
              type="button"
              onClick={() => convertBbqNodeConnectorToSurface(section.id, connector.id)}
              disabled={!isEditable || !demotePlan.allowed}
              title={demotePlan.reason}
              className="rounded-md border border-teal-300 bg-white px-2 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Convert to bracket
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => deleteBbqStructuralConnector(section.id, connector.id)}
            disabled={!isEditable || !deletePlan.allowed}
            title={deletePlan.reason}
            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextControl
          label="Name"
          value={connector.name}
          disabled={!isEditable}
          onChange={(value) => updateConnector({ name: value } as Partial<StructuralConnector>)}
        />
        <ColorControl
          label="Color"
          value={connector.color}
          disabled={!isEditable}
          onChange={(value) => updateConnector({ color: value } as Partial<StructuralConnector>)}
        />
        {connector.kind === "node" ? (
          <>
            <SelectControl
              label="Type"
              value={connector.connectorType}
              options={connectorTypeOptionsForConnector(section, connector, tubeWidth)}
              disabled={!isEditable}
              onChange={(value) => {
                const enabledDirections = preferredNodeConnectorDirections(
                  section,
                  connector,
                  value,
                );
                updateConnector({
                  connectorType: value,
                  enabledDirections,
                } as Partial<StructuralConnector>);
              }}
            />
            {nodeDirectionOptionValues.length > 0 ? (
              <SelectControl
                label="Enabled ports"
                value={
                  nodeDirectionOptionValues.includes(selectedDirectionOptionValue)
                    ? selectedDirectionOptionValue
                    : nodeDirectionOptionValues[0]
                }
                options={nodeDirectionOptionValues}
                disabled={!isEditable}
                onChange={(value) =>
                  updateConnector({
                    enabledDirections: parseConnectorDirectionOption(value),
                  } as Partial<StructuralConnector>)
                }
              />
            ) : null}
            <NumberControl
              label="Rotation"
              value={connector.rotation}
              min={0}
              max={270}
              step={90}
              unit="deg"
              disabled={!isEditable}
              onChange={(value) =>
                updateConnector({ rotation: value } as Partial<StructuralConnector>)
              }
            />
            <NumberControl
              label={`${connector.axis.toUpperCase()} position`}
              value={connector.position[connector.axis]}
              min={0}
              max={sectionDimension(section, connector.axis)}
              step={0.125}
              unit="in"
              disabled={!isEditable}
              onChange={(value) =>
                updateConnector({
                  position: {
                    ...connector.position,
                    [connector.axis]: value,
                  },
                } as Partial<StructuralConnector>)
              }
            />
            <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Position
              </div>
              <div className="mt-1 text-slate-800">
                x {formatLength(position.x)}, y {formatLength(position.y)}, z{" "}
                {formatLength(position.z)}
              </div>
            </div>
          </>
        ) : (
          <SurfaceConnectorFields
            section={section}
            connector={connector}
            members={members}
            tubeWidth={tubeWidth}
            disabled={!isEditable}
            updateConnector={updateConnector}
          />
        )}
      </div>
    </div>
  );
}

function SurfaceConnectorFields({
  section,
  connector,
  members,
  tubeWidth,
  disabled,
  updateConnector,
}: {
  section: IslandSection;
  connector: Extract<StructuralConnector, { kind: "surface" }>;
  members: StructuralMember[];
  tubeWidth: number;
  disabled: boolean;
  updateConnector: (updates: Partial<StructuralConnector>) => void;
}) {
  const host = members.find((member) => member.id === connector.hostMemberId) ?? members[0] ?? null;
  const attachedMemberOptions = members
    .filter((member) => member.id !== host?.id)
    .map((member) => member.id);
  const position = structuralConnectorPosition(section, connector, tubeWidth);
  const attachedMemberId = connector.attached?.memberId ?? attachedMemberOptions[0] ?? "";
  const attachedTerminal = connector.attached?.terminal ?? "start";

  return (
    <>
      <SelectControl
        label="Host member"
        value={host?.id ?? ""}
        options={members.map((member) => member.id)}
        disabled={disabled}
        onChange={(value) =>
          updateConnector({
            hostMemberId: value,
            attached:
              connector.attached?.memberId === value
                ? undefined
                : connector.attached,
          } as Partial<StructuralConnector>)
        }
      />
      <SelectControl
        label="Host face"
        value={connector.hostFace}
        options={structuralConnectorFaces}
        disabled={disabled}
        onChange={(value) =>
          updateConnector({ hostFace: value } as Partial<StructuralConnector>)
        }
      />
      <NumberControl
        label="Offset"
        value={connector.offset}
        min={0}
        max={host ? structuralMemberLength(host) : 0}
        step={0.125}
        unit="in"
        disabled={disabled}
        onChange={(value) =>
          updateConnector({ offset: value } as Partial<StructuralConnector>)
        }
      />
      {attachedMemberOptions.length > 0 ? (
        <>
          <SelectControl
            label="Attached member"
            value={
              attachedMemberOptions.includes(attachedMemberId)
                ? attachedMemberId
                : attachedMemberOptions[0]
            }
            options={attachedMemberOptions}
            disabled={disabled}
            onChange={(value) =>
              updateConnector({
                attached: { memberId: value, terminal: attachedTerminal },
              } as Partial<StructuralConnector>)
            }
          />
          <SelectControl
            label="Attached end"
            value={attachedTerminal}
            options={structuralTerminals}
            disabled={disabled}
            onChange={(value) =>
              updateConnector({
                attached: { memberId: attachedMemberId, terminal: value },
              } as Partial<StructuralConnector>)
            }
          />
        </>
      ) : null}
      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Position
        </div>
        <div className="mt-1 text-slate-800">
          x {formatLength(position.x)}, y {formatLength(position.y)}, z{" "}
          {formatLength(position.z)}
        </div>
      </div>
    </>
  );
}

function StructuralMemberEditor({
  section,
  member,
  structuralView,
  layerPosition,
  connectorSize,
  tubeWidth,
}: {
  section: IslandSection;
  member: StructuralMember;
  structuralView: SectionView;
  layerPosition: number;
  connectorSize: number;
  tubeWidth: number;
}) {
  const controlModel = buildMemberControlModel(
    section,
    member,
    structuralView,
    layerPosition,
    connectorSize,
    tubeWidth,
  );
  const verticalPlacementControl = controlModel.placementControls.find(
    (control): control is ContinuousBlockedControl =>
      control.kind === "continuous-blocked" && control.orientation === "vertical",
  );
  const inlinePlacementControls = controlModel.placementControls.filter(
    (control) => control !== verticalPlacementControl,
  );
  const centerAction = centerActionForMember(
    section,
    member,
    structuralView,
    layerPosition,
    tubeWidth,
  );
  const centerMember = () => {
    if (!centerAction) return;
    const movedMember = moveMemberPlacement(member, centerAction.axis, centerAction.target);
    const normalizedMember = normalizeRunSpanForPlacement(
      section,
      movedMember,
      connectorSize,
      tubeWidth,
    );
    updateBbqStructuralMembers(
      section.id,
      stickyStructuralMemberUpdates({
        section,
        before: member,
        after: normalizedMember,
        movedAxis: centerAction.axis,
        tubeWidth,
      }),
    );
  };

  return (
    <div className="rounded-md border border-slate-300 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{member.name}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={centerMember}
            disabled={!centerAction}
            title={centerAction?.reason ?? "No neighboring references to center between."}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <AlignCenterHorizontal className="h-3.5 w-3.5" />
            {centerAction?.label ?? "Center"}
          </button>
          <button
            type="button"
            onClick={() => deleteBbqStructuralMember(section.id, member.id)}
            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
      <div
        className={`grid gap-3 ${
          verticalPlacementControl
            ? "xl:grid-cols-[minmax(0,1fr)_11rem]"
            : ""
        }`}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <TextControl
            label="Name"
            value={member.name}
            onChange={(value) =>
              updateBbqStructuralMember(section.id, member.id, { name: value })
            }
          />
          <ColorControl
            label="Color"
            value={member.color}
            onChange={(value) =>
              updateBbqStructuralMember(section.id, member.id, { color: value })
            }
          />
          <MemberRunAxisControl control={controlModel.runControl} />
          {inlinePlacementControls.map((control) =>
            control.kind === "locked" ? (
              <LockedAxisControlView key={control.axis} control={control} />
            ) : (
              <MemberPlacementAxisControl key={control.axis} control={control} />
            ),
          )}
          <MemberEndpointConnectorControls
            section={section}
            member={member}
            tubeWidth={tubeWidth}
          />
        </div>
        {verticalPlacementControl ? (
          <MemberPlacementAxisControl control={verticalPlacementControl} />
        ) : null}
      </div>
    </div>
  );
}

function MemberEndpointConnectorControls({
  section,
  member,
  tubeWidth,
}: {
  section: IslandSection;
  member: StructuralMember;
  tubeWidth: number;
}) {
  const terminals: Array<{
    terminal: StructuralMemberTerminal;
    label: string;
    connectorId?: string;
  }> = [
    { terminal: "start", label: "Start connector", connectorId: member.startConnectorId },
    { terminal: "end", label: "End connector", connectorId: member.endConnectorId },
  ];

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 md:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Endpoint connectors
        </div>
        <div className="text-xs text-slate-500">
          {terminals.filter((terminal) => terminal.connectorId).length} of 2 linked
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {terminals.map(({ terminal, label, connectorId }) => {
          const connector = connectorId
            ? section.structuralConnectors.find((candidate) => candidate.id === connectorId)
            : undefined;

          if (!connector) {
            return (
              <div
                key={terminal}
                className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-2 text-sm text-slate-500"
              >
                <div className="font-medium text-slate-700">{label}</div>
                <div className="mt-1 text-xs">No explicit connector linked.</div>
              </div>
            );
          }

          const position = structuralConnectorPosition(section, connector, tubeWidth);
          const typeOptions = connectorTypeOptionsForConnector(
            section,
            connector,
            tubeWidth,
            { allowSurfacePromotion: true },
          );
          const nodeDirectionOptions =
            connector.kind === "node"
              ? nodeConnectorDirectionOptions(section, connector, connector.connectorType)
              : [];
          const nodeDirectionOptionValues = nodeDirectionOptions.map((option) =>
            connectorDirectionOptionValue(option.directions),
          );
          const selectedDirectionOptionValue =
            connector.kind === "node"
              ? connectorDirectionOptionValue(connector.enabledDirections)
              : "";

          return (
            <div
              key={terminal}
              className="rounded-md border border-slate-200 bg-slate-50 p-2"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-900">{label}</div>
                  <div className="text-xs text-slate-500">{connector.name}</div>
                </div>
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-600">
                  {connector.kind}
                </span>
              </div>
              <SelectControl
                label="Connector type"
                value={connector.connectorType}
                options={typeOptions}
                onChange={(value) => {
                  if (connector.kind === "surface") {
                    if (value !== "tee-surface") {
                      convertBbqSurfaceConnectorToNode(
                        section.id,
                        connector.id,
                        value,
                      );
                    }
                    return;
                  }

                  if (connector.kind === "node") {
                    const enabledDirections = preferredNodeConnectorDirections(
                      section,
                      connector,
                      value,
                    );
                    updateBbqStructuralConnector(section.id, connector.id, {
                      connectorType: value,
                      enabledDirections,
                    } as Partial<StructuralConnector>);
                    return;
                  }
                }}
              />
              {connector.kind === "node" && nodeDirectionOptionValues.length > 0 ? (
                <div className="mt-2">
                  <SelectControl
                    label="Enabled ports"
                    value={
                      nodeDirectionOptionValues.includes(selectedDirectionOptionValue)
                        ? selectedDirectionOptionValue
                        : nodeDirectionOptionValues[0]
                    }
                    options={nodeDirectionOptionValues}
                    onChange={(value) =>
                      updateBbqStructuralConnector(section.id, connector.id, {
                        enabledDirections: parseConnectorDirectionOption(value),
                      } as Partial<StructuralConnector>)
                    }
                  />
                </div>
              ) : null}
              <div className="mt-2 text-xs text-slate-500">
                x {formatLength(position.x)}, y {formatLength(position.y)}, z{" "}
                {formatLength(position.z)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MemberRunAxisControl({ control }: { control: ForcedEndpointControl }) {
  const axisLabel = control.axis.toUpperCase();
  const selectedSpanValue = spanValue({
    min: control.startValue,
    max: control.endValue,
  });
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-800">
          {axisLabel} available span
        </span>
        <span className="text-xs text-slate-500">
          {formatLength(control.startValue)} to {formatLength(control.endValue)} in
        </span>
      </div>
      <select
        value={selectedSpanValue}
        onChange={(event) => {
          const span = control.spans.find(
            (candidate) => spanValue(candidate) === event.target.value,
          );
          if (span) control.onSpanChange(span);
        }}
        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-teal-700"
      >
        {control.spans.map((span) => (
          <option key={spanValue(span)} value={spanValue(span)}>
            {axisLabel} {formatLength(span.min)}-{formatLength(span.max)} in
          </option>
        ))}
      </select>
    </div>
  );
}

function MemberPlacementAxisControl({
  control,
}: {
  control: ContinuousBlockedControl;
}) {
  const stopValues = [
    ...blockedBandEdges(control.blockedBands, control.tubeWidth),
    ...bandEdges(control.allowedBands),
  ];
  return (
    <NumberControl
      label={control.label}
      value={control.value}
      min={control.min}
      max={control.max}
      step={0.125}
      unit="in"
      snapStops={stopValues}
      orientation={control.orientation}
      onChange={control.onChange}
    />
  );
}

function LockedAxisControlView({ control }: { control: LockedAxisControl }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
      <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {control.axis.toUpperCase()} locked
      </div>
      <div className="mt-0.5 text-slate-700">
        {control.label}: {formatLength(control.value)} in
      </div>
    </div>
  );
}

function buildMemberControlModel(
  section: IslandSection,
  member: StructuralMember,
  structuralView: SectionView,
  layerPosition: number,
  connectorSize: number,
  tubeWidth: number,
) : MemberControlModel {
  const runAxis = structuralMemberAxisName(member);
  const lockedAxis = layerAxisForView(structuralView);
  const placementAxes = structuralMemberPlacementAxes(member);
  const runControl = buildForcedEndpointControl(
    section,
    member,
    runAxis,
    connectorSize,
    tubeWidth,
  );
  const placementControls = placementAxes.map((axis) => {
    if (axis === lockedAxis) {
      return {
        kind: "locked" as const,
        axis,
        label: "Driven by active layer",
        value: layerPosition,
      };
    }

    return buildContinuousBlockedControl(
      section,
      member,
      structuralView,
      layerPosition,
      axis,
      connectorSize,
      tubeWidth,
    );
  });

  return { runControl, placementControls };
}

function buildForcedEndpointControl(
  section: IslandSection,
  member: StructuralMember,
  axis: StructuralAxis,
  connectorSize: number,
  tubeWidth: number,
): ForcedEndpointControl {
  const currentSpan = {
    min: Math.min(member.start[axis], member.end[axis]),
    max: Math.max(member.start[axis], member.end[axis]),
  };
  const spans = includeCurrentSpan(
    availableRunSpans(section, member, axis, connectorSize, tubeWidth),
    currentSpan,
  );

  const updateSpan = (span: AxisInterval) => {
    updateBbqStructuralMember(section.id, member.id, {
      start: { ...member.start, [axis]: span.min },
      end: { ...member.end, [axis]: span.max },
    });
  };

  return {
    kind: "forced-endpoints",
    axis,
    startValue: member.start[axis],
    endValue: member.end[axis],
    min: 0,
    max: sectionDimension(section, axis),
    stops: bandEdges(spans),
    spans,
    onSpanChange: updateSpan,
  };
}

function buildContinuousBlockedControl(
  section: IslandSection,
  member: StructuralMember,
  structuralView: SectionView,
  layerPosition: number,
  axis: StructuralAxis,
  connectorSize: number,
  tubeWidth: number,
): ContinuousBlockedControl {
  const blockedBands = occupiedBandsForPlacementAxis(
    section,
    member,
    axis,
    tubeWidth,
    layerAxisForView(structuralView),
    layerPosition,
  );
  const max = nonAxisMax(section, axis, tubeWidth);
  const allowedBands = supportBandsForPlacementAxis(
    section,
    member,
    axis,
    connectorSize,
    tubeWidth,
  );

  return {
    kind: "continuous-blocked",
    axis,
    label: `${axis.toUpperCase()} placement`,
    value: member.start[axis],
    min: 0,
    max,
    tubeWidth,
    blockedBands,
    allowedBands,
    orientation: axis === "z" &&
      (structuralView === "front" ||
        structuralView === "back" ||
        structuralView === "side" ||
        structuralView === "right")
      ? "vertical"
      : "horizontal",
    onChange: (value) => {
      const snapped = snapPlaneValue(value, blockedBands, tubeWidth, max, allowedBands);
      const movedMember = moveMemberPlacement(member, axis, snapped);
      const normalizedMember = normalizeRunSpanForPlacement(
        section,
        movedMember,
        connectorSize,
        tubeWidth,
      );
      updateBbqStructuralMembers(
        section.id,
        stickyStructuralMemberUpdates({
          section,
          before: member,
          after: normalizedMember,
          movedAxis: axis,
          tubeWidth,
        }),
      );
    },
  };
}

function centerActionForMember(
  section: IslandSection,
  member: StructuralMember,
  structuralView: SectionView,
  layerPosition: number,
  tubeWidth: number,
): CenterAction | null {
  const axis = centerAxisForView(structuralView);
  if (!structuralMemberPlacementAxes(member).includes(axis)) return null;

  const sameKindReferences = centerValuesFromMembers(
    section,
    axis,
    structuralView,
    layerPosition,
    tubeWidth,
    {
      memberKind: member.kind,
      excludedMemberId: member.id,
    },
  );
  const target = centerTargetBetweenNearest(sameKindReferences, member.start[axis]);

  if (target === null) return null;
  return {
    axis,
    target,
    label: `Center ${axis.toUpperCase()}`,
    reason: `Center between nearest visible ${structuralMemberLabel(member.kind)} references.`,
  };
}

function centerActionForConnector(
  section: IslandSection,
  connector: StructuralConnector,
  structuralView: SectionView,
  layerPosition: number,
  tubeWidth: number,
  connectorSize: number,
): CenterAction | null {
  const axis = centerAxisForView(structuralView);
  const position = structuralConnectorPosition(section, connector, tubeWidth);

  if (connector.kind === "node") {
    if (connector.axis !== axis) return null;
    const attachedTarget = centerTargetFromNodeAttachments(section, connector, axis);
    if (attachedTarget !== null) {
      return {
        axis,
        target: attachedTarget,
        label: `Center ${axis.toUpperCase()}`,
        reason: "Center between the opposing member endpoints attached to this node.",
      };
    }
  }

  if (connector.kind === "surface") {
    const host = section.structuralMembers.find(
      (member) => member.id === connector.hostMemberId,
    );
    if (!host || structuralMemberAxisName(host) !== axis) return null;
    return {
      axis,
      target: snapToIncrement((host.start[axis] + host.end[axis]) / 2),
      label: `Center ${axis.toUpperCase()}`,
      reason: "Center along the hosted member span.",
    };
  }

  const postReferences = centerValuesFromMembers(
    section,
    axis,
    structuralView,
    layerPosition,
    tubeWidth,
    { memberKind: "vertical-post" },
  );
  const fallbackReferences = postReferences.length >= 2
    ? postReferences
    : [
        ...centerValuesFromMembers(section, axis, structuralView, layerPosition, tubeWidth),
        ...centerValuesFromConnectors(
          section,
          axis,
          structuralView,
          layerPosition,
          tubeWidth,
          connectorSize,
          connector.id,
        ),
      ];
  const target = centerTargetBetweenNearest(fallbackReferences, position[axis]);

  if (target === null) return null;
  return {
    axis,
    target,
    label: `Center ${axis.toUpperCase()}`,
    reason: "Center between nearest visible structural references.",
  };
}

function nodeYFlipAction(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "node" }>,
): DirectionFlipAction | null {
  const attachedDirections = new Set(nodeConnectorAttachedDirections(section, connector));
  const currentFreeY = (["+Y", "-Y"] as StructuralConnectorDirection[]).find(
    (direction) =>
      connector.enabledDirections.includes(direction) &&
      !attachedDirections.has(direction),
  );

  if (!currentFreeY) return null;

  const nextFreeY = currentFreeY === "+Y" ? "-Y" : "+Y";
  const desiredDirections = connector.enabledDirections.map((direction) =>
    direction === currentFreeY ? nextFreeY : direction,
  );
  const validOption = nodeConnectorDirectionOptions(
    section,
    connector,
    connector.connectorType,
  ).find((option) => sameDirections(option.directions, desiredDirections));

  if (!validOption) return null;

  return {
    label: `Flip ${currentFreeY} to ${nextFreeY}`,
    reason: `Move the free Y port from ${currentFreeY} to ${nextFreeY}.`,
    directions: validOption.directions,
  };
}

function centerTargetFromNodeAttachments(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "node" }>,
  axis: StructuralAxis,
) {
  const values: number[] = [];

  for (const member of section.structuralMembers ?? []) {
    if (structuralMemberAxisName(member) !== axis) continue;
    if (member.startConnectorId === connector.id) {
      values.push(member.end[axis]);
    }
    if (member.endConnectorId === connector.id) {
      values.push(member.start[axis]);
    }
  }

  const opposingValues = values
    .filter((value) => !sameNumber(value, connector.position[axis]))
    .sort((first, second) => first - second);
  const lower = [...opposingValues].reverse().find(
    (value) => value < connector.position[axis],
  );
  const upper = opposingValues.find((value) => value > connector.position[axis]);

  return lower === undefined || upper === undefined
    ? null
    : snapToIncrement((lower + upper) / 2);
}

function centerAxisForView(view: SectionView): StructuralAxis {
  return view === "side" || view === "right" ? "y" : "x";
}

function centerValuesFromMembers(
  section: IslandSection,
  axis: StructuralAxis,
  structuralView: SectionView,
  layerPosition: number,
  tubeWidth: number,
  filters: {
    memberKind?: StructuralMember["kind"];
    excludedMemberId?: string;
  } = {},
) {
  return (section.structuralMembers ?? [])
    .filter((member) => member.id !== filters.excludedMemberId)
    .filter((member) => !filters.memberKind || member.kind === filters.memberKind)
    .filter((member) =>
      isStructuralMemberVisibleInView(
        section,
        member,
        structuralView,
        layerPosition,
        tubeWidth,
      ),
    )
    .filter((member) => structuralMemberAxisName(member) !== axis)
    .map((member) => snapToIncrement(member.start[axis]));
}

function centerValuesFromConnectors(
  section: IslandSection,
  axis: StructuralAxis,
  structuralView: SectionView,
  layerPosition: number,
  tubeWidth: number,
  connectorSize: number,
  excludedConnectorId?: string,
) {
  return (section.structuralConnectors ?? [])
    .filter((connector) => connector.id !== excludedConnectorId)
    .filter((connector) =>
      isStructuralConnectorVisibleInView(
        section,
        connector,
        structuralView,
        layerPosition,
        tubeWidth,
        connectorSize,
      ),
    )
    .map((connector) =>
      snapToIncrement(structuralConnectorPosition(section, connector, tubeWidth)[axis]),
    );
}

function centerTargetBetweenNearest(values: number[], current: number) {
  const uniqueValues = [...new Set(values.map((value) => snapToIncrement(value)))]
    .sort((first, second) => first - second);
  const lower = [...uniqueValues].reverse().find((value) => value < current - 0.001);
  const upper = uniqueValues.find((value) => value > current + 0.001);

  return lower === undefined || upper === undefined
    ? null
    : snapToIncrement((lower + upper) / 2);
}

function offsetAlongLocalMember(member: StructuralMember, value: number) {
  const axis = structuralMemberAxisName(member);
  const direction = member.end[axis] >= member.start[axis] ? 1 : -1;
  const length = structuralMemberLength(member);
  return Math.max(
    0,
    Math.min(length, snapToIncrement((value - member.start[axis]) * direction)),
  );
}

function sameDirections(
  first: StructuralConnectorDirection[],
  second: StructuralConnectorDirection[],
) {
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  return (
    firstSet.size === secondSet.size &&
    [...firstSet].every((direction) => secondSet.has(direction))
  );
}

function structuralMemberLabel(kind: StructuralMember["kind"]) {
  if (kind === "vertical-post") return "vertical post";
  if (kind === "horizontal-beam") return "horizontal beam";
  return "rafter";
}

function memberCoordinateSummary(member: StructuralMember): string {
  const axis = structuralMemberAxisName(member);
  const plane = (["x", "y", "z"] as const)
    .filter((dimension) => dimension !== axis)
    .map((dimension) => `${dimension.toUpperCase()} ${formatLength(member.start[dimension])}`)
    .join(", ");
  return `${axis.toUpperCase()} ${formatLength(member.start[axis])}-${formatLength(member.end[axis])}${plane ? ` | ${plane}` : ""}`;
}

function snapToIncrement(value: number, increment = 0.125): number {
  return Number((Math.round(value / increment) * increment).toFixed(3));
}

function snapStructuralEndpointValue(
  section: IslandSection,
  member: StructuralMember,
  terminal: "start" | "end",
  coordinate: keyof StructuralMember["start"],
  value: number,
  connectorSize: number,
  tubeWidth: number,
) {
  const snapped = snapToIncrement(value);
  const candidates = viableEndpointValues(section, member, terminal, coordinate, connectorSize, tubeWidth);
  const nearest = candidates
    .map((candidate) => ({ candidate, distance: Math.abs(candidate - snapped) }))
    .sort((first, second) => first.distance - second.distance)[0];

  if (!nearest) {
    const max =
      coordinate === structuralMemberAxisName(member)
        ? sectionDimension(section, coordinate)
        : nonAxisMax(section, coordinate, tubeWidth);
    return Math.max(0, Math.min(max, snapped));
  }

  return nearest.candidate;
}

function viableEndpointValues(
  section: IslandSection,
  member: StructuralMember,
  terminal: "start" | "end",
  coordinate: keyof StructuralMember["start"],
  connectorSize: number,
  tubeWidth: number,
) {
  const axis = structuralMemberAxisName(member);
  const dimensionMax =
    coordinate === axis
      ? sectionDimension(section, coordinate)
      : nonAxisMax(section, coordinate, tubeWidth);
  const values = new Set<number>();

  addViableValuesFromBounds(
    values,
    connectorBounds(section, connectorSize),
    coordinate,
    coordinate === axis ? 0 : tubeWidth,
  );

  for (const candidate of section.structuralMembers ?? []) {
    if (candidate.id === member.id) continue;
    addViableValuesFromBounds(
      values,
      [structuralMemberLocalBounds(candidate, tubeWidth)],
      coordinate,
      coordinate === axis ? 0 : tubeWidth,
    );
  }

  values.add(0);
  values.add(snapToIncrement(dimensionMax));

  return [...values]
    .filter((candidate) => candidate >= 0 && candidate <= dimensionMax)
    .filter(
      (candidate) =>
        coordinate !== axis ||
        (!sameNumber(candidate, 0) && !sameNumber(candidate, sectionDimension(section, coordinate))),
    )
    .sort((first, second) => first - second);
}

function sameNumber(first: number, second: number) {
  return Math.abs(snapToIncrement(first) - snapToIncrement(second)) <= 0.001;
}

function snapToNearestStop(value: number, stops: number[]) {
  const nearest = stops
    .map((stop) => ({ stop, distance: Math.abs(stop - value) }))
    .sort((first, second) => first.distance - second.distance)[0];

  return snapToIncrement(nearest?.stop ?? value);
}

function postCenterStops(
  section: IslandSection,
  coordinate: keyof StructuralMember["start"],
  tubeWidth: number,
) {
  const stops = new Set<number>();

  for (const member of section.structuralMembers ?? []) {
    if (member.kind !== "vertical-post") continue;
    const bounds = structuralMemberLocalBounds(member, tubeWidth);
    stops.add(snapToIncrement(bounds.min[coordinate] + tubeWidth / 2));
  }

  return [...stops].sort((first, second) => first - second);
}

function occupiedBandsForPlacementAxis(
  section: IslandSection,
  member: StructuralMember,
  coordinate: keyof StructuralMember["start"],
  tubeWidth: number,
  layerAxis?: keyof StructuralMember["start"],
  layerPosition?: number,
) {
  const memberBounds = structuralMemberLocalBounds(member, tubeWidth);
  const activeBounds =
    layerAxis && layerPosition !== undefined
      ? {
          ...memberBounds,
          min: { ...memberBounds.min, [layerAxis]: layerPosition - tubeWidth / 2 },
          max: { ...memberBounds.max, [layerAxis]: layerPosition + tubeWidth / 2 },
        }
      : memberBounds;
  const bands: Array<{ min: number; max: number }> = [];

  for (const candidate of section.structuralMembers ?? []) {
    if (candidate.id === member.id) continue;
    if (candidate.kind !== member.kind) continue;

    const candidateBounds = structuralMemberLocalBounds(candidate, tubeWidth);
    if (!boundsOverlapExcept(activeBounds, candidateBounds, coordinate)) continue;

    bands.push({
      min: candidateBounds.min[coordinate],
      max: candidateBounds.max[coordinate],
    });
  }

  return mergeBands(bands);
}

function supportBandsForPlacementAxis(
  section: IslandSection,
  member: StructuralMember,
  placementAxis: StructuralAxis,
  connectorSize: number,
  tubeWidth: number,
): AxisInterval[] {
  const runAxis = structuralMemberAxisName(member);
  const runFaces = collectRunSupportFaces(section, member, runAxis, connectorSize, tubeWidth);
  const fallback = [{ min: 0, max: nonAxisMax(section, placementAxis, tubeWidth) }];
  const bands: AxisInterval[] = [];

  for (let startIndex = 0; startIndex < runFaces.length; startIndex += 1) {
    for (let endIndex = startIndex + 1; endIndex < runFaces.length; endIndex += 1) {
      const start = runFaces[startIndex];
      const end = runFaces[endIndex];
      if (end - start < 0.125) continue;

      const startBands = supportBandsAtRunEndpoint(
        section,
        member,
        runAxis,
        placementAxis,
        start,
        connectorSize,
        tubeWidth,
      );
      const endBands = supportBandsAtRunEndpoint(
        section,
        member,
        runAxis,
        placementAxis,
        end,
        connectorSize,
        tubeWidth,
      );

      bands.push(...intersectBands(startBands, endBands));
    }
  }

  const merged = mergeBands(bands);
  return merged.length > 0 ? merged : fallback;
}

function collectRunSupportFaces(
  section: IslandSection,
  member: StructuralMember,
  runAxis: StructuralAxis,
  connectorSize: number,
  tubeWidth: number,
) {
  const values = new Set<number>([0, sectionDimension(section, runAxis)]);
  for (const bounds of [
    ...connectorBounds(section, connectorSize),
    ...(section.structuralMembers ?? [])
      .filter((candidate) => candidate.id !== member.id && candidate.kind !== member.kind)
      .map((candidate) => structuralMemberLocalBounds(candidate, tubeWidth)),
  ]) {
    values.add(Math.max(0, snapToIncrement(bounds.min[runAxis])));
    values.add(Math.min(sectionDimension(section, runAxis), snapToIncrement(bounds.max[runAxis])));
  }

  return [...values]
    .filter((value) => value >= 0 && value <= sectionDimension(section, runAxis))
    .sort((first, second) => first - second);
}

function moveMemberPlacement(
  member: StructuralMember,
  axis: StructuralAxis,
  value: number,
): StructuralMember {
  return {
    ...member,
    start: { ...member.start, [axis]: value },
    end: { ...member.end, [axis]: value },
  };
}

function normalizeRunSpanForPlacement(
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

function availableRunSpans(
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

function includeCurrentSpan(spans: AxisInterval[], currentSpan: AxisInterval) {
  if (spans.some((span) => spanValue(span) === spanValue(currentSpan))) {
    return spans;
  }

  return [...spans, currentSpan].sort((first, second) => first.min - second.min);
}

function spanValue(span: AxisInterval) {
  return `${formatLength(span.min)}:${formatLength(span.max)}`;
}

function supportBandsAtRunEndpoint(
  section: IslandSection,
  member: StructuralMember,
  runAxis: StructuralAxis,
  placementAxis: StructuralAxis,
  endpointValue: number,
  connectorSize: number,
  tubeWidth: number,
): AxisInterval[] {
  const memberBounds = structuralMemberLocalBounds(member, tubeWidth);
  const supportBounds = [
    ...connectorBounds(section, connectorSize),
    ...(section.structuralMembers ?? [])
      .filter((candidate) => candidate.id !== member.id && candidate.kind !== member.kind)
      .map((candidate) => structuralMemberLocalBounds(candidate, tubeWidth)),
  ];
  const bands: AxisInterval[] = [];

  for (const bounds of supportBounds) {
    if (!touchesRunEndpointFace(bounds, runAxis, endpointValue)) continue;
    if (!supportOverlapsFixedPlacementAxes(memberBounds, bounds, runAxis, placementAxis)) continue;

    const supportAxis = supportAxisForBounds(section, bounds, tubeWidth);
    const max = nonAxisMax(section, placementAxis, tubeWidth);

    if (supportAxis === placementAxis) {
      bands.push({
        min: Math.max(0, snapToIncrement(bounds.min[placementAxis])),
        max: Math.min(max, snapToIncrement(bounds.max[placementAxis] - tubeWidth)),
      });
      continue;
    }

    const value = Math.max(
      0,
      Math.min(max, snapToIncrement(bounds.min[placementAxis])),
    );
    bands.push({ min: value, max: value });
  }

  return mergeBands(bands.filter((band) => band.max >= band.min));
}

function supportAxisForBounds(
  section: IslandSection,
  bounds: LocalBounds,
  tubeWidth: number,
): StructuralAxis | null {
  const matchingMember = (section.structuralMembers ?? []).find((member) => {
    const memberBounds = structuralMemberLocalBounds(member, tubeWidth);
    return boundsKey(memberBounds) === boundsKey(bounds);
  });

  return matchingMember ? structuralMemberAxisName(matchingMember) : null;
}

function touchesRunEndpointFace(
  bounds: LocalBounds,
  runAxis: StructuralAxis,
  endpointValue: number,
) {
  return sameNumber(bounds.min[runAxis], endpointValue) || sameNumber(bounds.max[runAxis], endpointValue);
}

function supportOverlapsFixedPlacementAxes(
  memberBounds: LocalBounds,
  supportBounds: LocalBounds,
  runAxis: StructuralAxis,
  placementAxis: StructuralAxis,
) {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      axis === runAxis ||
      axis === placementAxis ||
      intervalsOverlap(
        memberBounds.min[axis],
        memberBounds.max[axis],
        supportBounds.min[axis],
        supportBounds.max[axis],
      ),
  );
}

function intersectBands(first: AxisInterval[], second: AxisInterval[]) {
  const intersections: AxisInterval[] = [];

  for (const firstBand of first) {
    for (const secondBand of second) {
      const min = Math.max(firstBand.min, secondBand.min);
      const max = Math.min(firstBand.max, secondBand.max);
      if (max >= min) intersections.push({ min, max });
    }
  }

  return mergeBands(intersections);
}

function blockedBandEdges(
  bands: Array<{ min: number; max: number }>,
  tubeWidth: number,
) {
  const stops = new Set<number>();
  for (const band of bands) {
    stops.add(snapToIncrement(band.min));
    stops.add(snapToIncrement(band.max));
    stops.add(snapToIncrement(band.max - tubeWidth));
  }
  return [...stops].sort((first, second) => first - second);
}

function bandEdges(bands: AxisInterval[]) {
  const stops = new Set<number>();
  for (const band of bands) {
    stops.add(snapToIncrement(band.min));
    stops.add(snapToIncrement(band.max));
  }
  return [...stops].sort((first, second) => first - second);
}

function snapPlaneValue(
  value: number,
  blockedBands: Array<{ min: number; max: number }>,
  tubeWidth: number,
  max: number,
  allowedBands: AxisInterval[] = [{ min: 0, max }],
) {
  const snapped = Math.max(0, Math.min(max, snapToIncrement(value)));
  if (
    isPlaneValueAllowed(snapped, allowedBands) &&
    isPlaneValueFree(snapped, blockedBands, tubeWidth)
  ) {
    return snapped;
  }

  const candidates = new Set<number>([0, max]);
  for (const band of allowedBands) {
    candidates.add(Math.max(0, snapToIncrement(band.min)));
    candidates.add(Math.min(max, snapToIncrement(band.max)));
    candidates.add(Math.max(0, Math.min(max, snapToIncrement(valueToBand(value, band)))));
  }
  for (const band of blockedBands) {
    candidates.add(Math.max(0, snapToIncrement(band.min - tubeWidth)));
    candidates.add(Math.min(max, snapToIncrement(band.max)));
  }

  const nearest = [...candidates]
    .filter((candidate) => candidate >= 0 && candidate <= max)
    .filter((candidate) => isPlaneValueAllowed(candidate, allowedBands))
    .filter((candidate) => isPlaneValueFree(candidate, blockedBands, tubeWidth))
    .map((candidate) => ({ candidate, distance: Math.abs(candidate - snapped) }))
    .sort((first, second) => first.distance - second.distance)[0];

  return nearest?.candidate ?? snapped;
}

function valueToBand(value: number, band: AxisInterval) {
  return Math.max(band.min, Math.min(band.max, value));
}

function isPlaneValueAllowed(
  value: number,
  allowedBands: AxisInterval[],
) {
  return allowedBands.some((band) => value >= band.min - 0.001 && value <= band.max + 0.001);
}

function isPlaneValueFree(
  value: number,
  blockedBands: Array<{ min: number; max: number }>,
  tubeWidth: number,
) {
  const occupied = { min: value, max: value + tubeWidth };
  return !blockedBands.some((band) =>
    intervalsOverlap(occupied.min, occupied.max, band.min, band.max),
  );
}

function constrainAxisEndpointForOccupiedSpace(
  section: IslandSection,
  member: StructuralMember,
  terminal: "start" | "end",
  axis: keyof StructuralMember["start"],
  value: number,
  connectorSize: number,
  tubeWidth: number,
) {
  const current = member[terminal][axis];
  const otherTerminal = terminal === "start" ? member.end[axis] : member.start[axis];
  const desiredMin = Math.min(value, otherTerminal);
  const desiredMax = Math.max(value, otherTerminal);
  const memberBounds = structuralMemberLocalBounds(member, tubeWidth);
  const proposedBounds = {
    min: { ...memberBounds.min, [axis]: desiredMin },
    max: { ...memberBounds.max, [axis]: desiredMax },
  };
  const blockers = [
    ...connectorBounds(section, connectorSize),
    ...(section.structuralMembers ?? [])
      .filter((candidate) => candidate.id !== member.id)
      .map((candidate) => structuralMemberLocalBounds(candidate, tubeWidth)),
  ]
    .filter((bounds) => boundsOverlapExcept(proposedBounds, bounds, axis))
    .map((bounds) => ({
      min: bounds.min[axis],
      max: bounds.max[axis],
    }));

  const merged = mergeBands(blockers);

  if (terminal === "end" && value > otherTerminal) {
    const blocker = merged.find((band) =>
      intervalsOverlap(otherTerminal, value, band.min, band.max),
    );
    if (!blocker) return snapToIncrement(value);
    return snapToIncrement(Math.max(otherTerminal, blocker.min));
  }

  if (terminal === "start" && value < otherTerminal) {
    const blocker = [...merged]
      .reverse()
      .find((band) => intervalsOverlap(value, otherTerminal, band.min, band.max));
    if (!blocker) return snapToIncrement(value);
    return snapToIncrement(Math.min(otherTerminal, blocker.max));
  }

  return snapToIncrement(current === value ? current : value);
}

function boundsOverlapExcept(
  first: LocalBounds,
  second: LocalBounds,
  except: keyof StructuralMember["start"],
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

function intervalsOverlap(
  firstMin: number,
  firstMax: number,
  secondMin: number,
  secondMax: number,
) {
  return firstMin < secondMax && firstMax > secondMin;
}

function mergeBands(bands: Array<{ min: number; max: number }>) {
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

function addViableValuesFromBounds(
  values: Set<number>,
  boundsList: LocalBounds[],
  coordinate: keyof StructuralMember["start"],
  occupiedWidth: number,
) {
  for (const bounds of boundsList) {
    values.add(snapToIncrement(bounds.min[coordinate]));
    values.add(snapToIncrement(bounds.max[coordinate]));
    if (occupiedWidth > 0) {
      values.add(snapToIncrement(bounds.max[coordinate] - occupiedWidth));
    }
  }
}

interface LocalBounds {
  min: StructuralMember["start"];
  max: StructuralMember["start"];
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

function structuralMemberAxisName(member: StructuralMember): keyof StructuralMember["start"] {
  if (member.kind === "horizontal-beam") return "x";
  if (member.kind === "rafter") return "y";
  return "z";
}

function structuralMemberPlacementAxes(member: StructuralMember): StructuralAxis[] {
  if (member.kind === "vertical-post") return ["x", "y"];
  if (member.kind === "horizontal-beam") return ["y", "z"];
  return ["x", "z"];
}

function sectionDimension(
  section: IslandSection,
  coordinate: keyof StructuralMember["start"],
) {
  if (coordinate === "x") return section.length;
  if (coordinate === "y") return section.depth;
  return section.height;
}

function nonAxisMax(
  section: IslandSection,
  coordinate: keyof StructuralMember["start"],
  tubeWidth: number,
) {
  return Math.max(0, sectionDimension(section, coordinate) - tubeWidth);
}

function isStructuralMemberVisibleInView(
  section: IslandSection,
  member: StructuralMember,
  view: SectionView,
  layerPosition: number,
  tubeWidth: number,
) {
  const layerAxis = layerAxisForView(view);
  if (structuralMemberAxisName(member) === layerAxis) return true;
  const bounds = structuralMemberLocalBounds(member, tubeWidth);
  return layerPosition >= bounds.min[layerAxis] && layerPosition <= bounds.max[layerAxis];
}

function layerAxisForView(view: SectionView): keyof StructuralMember["start"] {
  if (view === "top") return "z";
  if (view === "side" || view === "right") return "x";
  return "y";
}

function defaultStructuralLayers(
  section: IslandSection,
  tubeWidth: number,
): Record<SectionView, number> {
  return {
    top: defaultStructuralLayer(section, "top", tubeWidth),
    front: defaultStructuralLayer(section, "front", tubeWidth),
    back: defaultStructuralLayer(section, "back", tubeWidth),
    side: defaultStructuralLayer(section, "side", tubeWidth),
    right: defaultStructuralLayer(section, "right", tubeWidth),
  };
}

function defaultStructuralLayer(
  section: IslandSection,
  view: SectionView,
  tubeWidth: number,
) {
  const axis = layerAxisForView(view);
  return view === "top" || view === "back" || view === "right"
    ? snapToIncrement(sectionDimension(section, axis) - tubeWidth / 2)
    : snapToIncrement(tubeWidth / 2);
}

function structuralLayerStops(
  section: IslandSection,
  view: SectionView,
  tubeWidth: number,
  connectorSize: number,
) {
  const axis = layerAxisForView(view);
  const stops = new Set<number>([
    snapToIncrement(connectorSize / 2),
    snapToIncrement(sectionDimension(section, axis) - connectorSize / 2),
  ]);

  for (const member of section.structuralMembers ?? []) {
    if (structuralMemberAxisName(member) === axis) continue;
    const bounds = structuralMemberLocalBounds(member, tubeWidth);
    stops.add(snapToIncrement((bounds.min[axis] + bounds.max[axis]) / 2));
  }

  return [...stops]
    .filter((stop) => stop >= tubeWidth / 2 && stop <= sectionDimension(section, axis) - tubeWidth / 2)
    .sort((first, second) => first - second);
}

function memberLayerPositionForView(
  section: IslandSection,
  member: StructuralMember,
  view: SectionView,
  tubeWidth: number,
) {
  const axis = layerAxisForView(view);
  const bounds = structuralMemberLocalBounds(member, tubeWidth);
  return Math.max(
    tubeWidth / 2,
    Math.min(
      sectionDimension(section, axis) - tubeWidth / 2,
      snapToIncrement((bounds.min[axis] + bounds.max[axis]) / 2),
    ),
  );
}

function connectorLayerPositionForView(
  section: IslandSection,
  connector: BbqConnector,
  view: SectionView,
  tubeWidth: number,
) {
  const axis = layerAxisForView(view);
  const position = localEvaluatedConnectorPosition(section, connector);
  return Math.max(
    tubeWidth / 2,
    Math.min(
      sectionDimension(section, axis) - tubeWidth / 2,
      snapToIncrement(position[axis]),
    ),
  );
}

function structuralMemberLayerPlacement(
  kind: StructuralMember["kind"],
  view: SectionView,
  layerPosition: number,
  tubeWidth: number,
): {
  start?: Partial<StructuralMember["start"]>;
  end?: Partial<StructuralMember["end"]>;
} {
  const layerStart = snapToIncrement(layerPosition - tubeWidth / 2);
  if (view === "front" || view === "back") {
    if (kind === "vertical-post" || kind === "horizontal-beam") {
      return {
        start: { y: layerStart },
        end: { y: layerStart },
      };
    }
  }
  if (view === "top") {
    if (kind === "horizontal-beam" || kind === "rafter") {
      return {
        start: { z: layerStart },
        end: { z: layerStart },
      };
    }
  }
  if (view === "side" || view === "right") {
    if (kind === "vertical-post" || kind === "rafter") {
      return {
        start: { x: layerStart },
        end: { x: layerStart },
      };
    }
  }

  return {};
}

function InventoryEditor({ item }: { item: InventoryItem }) {
  return (
    <div className="rounded-md border border-slate-300 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{item.label}</h3>
        <button
          type="button"
          onClick={() => deleteBbqInventoryItem(item.id)}
          className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextControl
          label="Label"
          value={item.label}
          onChange={(value) => updateBbqInventoryItem(item.id, { label: value })}
        />
        <SelectControl
          label="Status"
          value={item.status}
          options={["available", "partial", "allocated", "consumed"]}
          onChange={(value) =>
            updateBbqInventoryItem(item.id, {
              status: value as InventoryStatus,
            })
          }
        />
        <NumberControl
          label="Length"
          value={item.length}
          min={0}
          max={240}
          step={1}
          unit="in"
          onChange={(value) => updateBbqInventoryItem(item.id, { length: value })}
        />
        <TextControl
          label="Spec"
          value={item.specId}
          onChange={(value) => updateBbqInventoryItem(item.id, { specId: value })}
        />
      </div>
    </div>
  );
}

function AddInsertMenu({ sectionId }: { sectionId: string }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-teal-700 bg-white shadow-sm">
      {(["drawer", "door", "sleeve"] as InsertKind[]).map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => addBbqInsert(sectionId, kind)}
          className="border-r border-teal-700 px-3 py-2 text-sm font-medium text-teal-800 last:border-r-0 hover:bg-teal-50"
        >
          {kind === "drawer" ? "Drawer" : kind === "door" ? "Door" : "Sleeve"}
        </button>
      ))}
    </div>
  );
}

function InsertEditor({ insert }: { insert: InsertDefinition }) {
  return (
    <div className="rounded-md border border-slate-300 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{insert.name}</h3>
        <button
          type="button"
          onClick={() => deleteBbqInsert(insert.id)}
          className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <SelectControl
          label="Type"
          value={insert.kind}
          options={["drawer", "door", "sleeve"]}
          onChange={(value) =>
            updateBbqInsert(insert.id, { kind: value as InsertKind })
          }
        />
        <TextControl
          label="Name"
          value={insert.name}
          onChange={(value) => updateBbqInsert(insert.id, { name: value })}
        />
        <ColorControl
          label="Color"
          value={insert.color}
          onChange={(value) => updateBbqInsert(insert.id, { color: value })}
        />
        <SelectControl
          label="Face"
          value={insert.face}
          options={["front", "back", "left", "right"]}
          onChange={(value) =>
            updateBbqInsert(insert.id, { face: value as IslandFace })
          }
        />
        <NumberControl
          label="Offset left"
          value={insert.offsetFromLeft}
          min={0}
          max={240}
          step={0.5}
          unit="in"
          onChange={(value) =>
            updateBbqInsert(insert.id, { offsetFromLeft: value })
          }
        />
        <NumberControl
          label="Offset bottom"
          value={insert.offsetFromBottom}
          min={0}
          max={96}
          step={0.5}
          unit="in"
          onChange={(value) =>
            updateBbqInsert(insert.id, { offsetFromBottom: value })
          }
        />
        <NumberControl
          label="Body width"
          value={insert.body.width}
          min={1}
          max={120}
          step={0.5}
          unit="in"
          onChange={(value) =>
            updateBbqInsert(insert.id, {
              body: { ...insert.body, width: value },
            })
          }
        />
        <NumberControl
          label="Body depth"
          value={insert.body.depth}
          min={1}
          max={96}
          step={0.5}
          unit="in"
          onChange={(value) =>
            updateBbqInsert(insert.id, {
              body: { ...insert.body, depth: value },
            })
          }
        />
        <NumberControl
          label="Body height"
          value={insert.body.height}
          min={1}
          max={96}
          step={0.5}
          unit="in"
          onChange={(value) =>
            updateBbqInsert(insert.id, {
              body: { ...insert.body, height: value },
            })
          }
        />
        <NumberControl
          label="Frame width"
          value={insert.faceFrame.width}
          min={1}
          max={120}
          step={0.5}
          unit="in"
          onChange={(value) =>
            updateBbqInsert(insert.id, {
              faceFrame: { ...insert.faceFrame, width: value },
            })
          }
        />
        <NumberControl
          label="Frame height"
          value={insert.faceFrame.height}
          min={1}
          max={96}
          step={0.5}
          unit="in"
          onChange={(value) =>
            updateBbqInsert(insert.id, {
              faceFrame: { ...insert.faceFrame, height: value },
            })
          }
        />
        <NumberControl
          label={insert.kind === "sleeve" ? "Sleeve depth" : "Frame projection"}
          value={insert.faceFrame.projection}
          min={0}
          max={6}
          step={0.125}
          unit="in"
          onChange={(value) =>
            updateBbqInsert(insert.id, {
              faceFrame: { ...insert.faceFrame, projection: value },
            })
          }
        />
        <NumberControl
          label="Frame member"
          value={insert.faceFrame.memberSize}
          min={0.25}
          max={4}
          step={0.125}
          unit="in"
          onChange={(value) =>
            updateBbqInsert(insert.id, {
              faceFrame: { ...insert.faceFrame, memberSize: value },
            })
          }
        />
      </div>
    </div>
  );
}

function BbqSectionPage({
  section,
  evaluation,
}: {
  section: IslandSection;
  evaluation: BbqIslandEvaluation;
}) {
  const parameters = usePlannerState();
  const tubeWidth = parameters.bbqIsland.settings.tubeProfileSize;
  const connectorSize = parameters.bbqIsland.settings.connectorSize;
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [activeStructuralSelection, setActiveStructuralSelection] =
    useState<StructuralSelection>(null);
  const [previewMode, setPreviewMode] = useState<"structural" | "layout">("structural");
  const [structuralView, setStructuralView] = useState<SectionView>("top");
  const [structuralLayers, setStructuralLayers] = useState<Record<SectionView, number>>(
    () => defaultStructuralLayers(section, tubeWidth),
  );
  const [layoutView, setLayoutView] = useState<"top" | "front">("top");
  const [previewZoom, setPreviewZoom] = useState(1);
  const [editorTab, setEditorTab] = useState<SectionEditorTab>("main");
  const sectionPieces = useMemo(
    () => evaluation.pieces.filter((piece) => piece.sectionId === section.id),
    [evaluation.pieces, section.id],
  );
  const tubePieces = useMemo(
    () =>
      sectionPieces.filter(
        (piece) => piece.kind === "tube",
      ),
    [sectionPieces],
  );
  const connectionRowsForSection = useMemo(
    () => tubePieces.map(pieceConnectionRow),
    [tubePieces],
  );
  const connectorRowsForSection = useMemo(
    () =>
      evaluation.connectors
        .filter((connector) => connector.sectionId === section.id)
        .map((connector) => ({
          id: connector.id,
          kind: connector.kind,
          position: `x ${formatLength(connector.position.x)}, y ${formatLength(connector.position.y)}, z ${formatLength(connector.position.z)}`,
          type: connector.connectorType,
          directions: connector.directions.join(", "),
          pieces: connector.pieceIds.join(", "),
        })),
    [evaluation.connectors, section.id],
  );
  const selectedPiece =
    sectionPieces.find((piece) => piece.id === selectedPieceId) ?? null;
  const sectionInserts = parameters.bbqIsland.inserts.filter(
    (insert) => insert.sectionId === section.id,
  );
  const layerAxis = layerAxisForView(structuralView);
  const layerStops = structuralLayerStops(section, structuralView, tubeWidth, connectorSize);
  const structuralLayer = Math.max(
    tubeWidth / 2,
    Math.min(
      sectionDimension(section, layerAxis) - tubeWidth / 2,
      structuralLayers[structuralView],
    ),
  );
  const editorOptions = sectionEditorOptions(section.name, structuralView);
  const activeEditorTab = editorOptions.some((option) => option.value === editorTab)
    ? editorTab
    : "main";
  const previewStructuralSelection = structuralSelectionForEditor(
    section,
    activeEditorTab,
    activeStructuralSelection,
    evaluation.connectors,
  );
  const selectStructuralMember = (member: StructuralMember) => {
    setActiveStructuralSelection({ type: "member", id: member.id });
    setStructuralLayers((current) => ({
      ...current,
      [structuralView]: memberLayerPositionForView(
        section,
        member,
        structuralView,
        tubeWidth,
      ),
    }));
  };
  const selectStructuralConnector = (connector: BbqConnector) => {
    setActiveStructuralSelection({ type: "connector", id: connector.id });
    setStructuralLayers((current) => ({
      ...current,
      [structuralView]: connectorLayerPositionForView(
        section,
        connector,
        structuralView,
        tubeWidth,
      ),
    }));
  };

  return (
    <>
      <DataPanel
        icon={<Box className="h-4 w-4 text-teal-700" />}
        title="Section Preview"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              label="Preview mode"
              options={[
                { label: "Structural", value: "structural" },
                { label: "Layout", value: "layout" },
              ]}
              value={previewMode}
              onChange={(value) => setPreviewMode(value as "structural" | "layout")}
            />
            {previewMode === "structural" ? (
              <SegmentedControl
                label="Structural view"
                options={[
                  { label: "Top", value: "top" },
                  { label: "Front", value: "front" },
                  { label: "Back", value: "back" },
                  { label: "Left", value: "side" },
                  { label: "Right", value: "right" },
                ]}
                value={structuralView}
                onChange={(value) =>
                  setStructuralView(value as SectionView)
                }
              />
            ) : (
              <SegmentedControl
                label="Layout view"
                options={[
                  { label: "Top", value: "top" },
                  { label: "Front", value: "front" },
                ]}
                value={layoutView}
                onChange={(value) => setLayoutView(value as "top" | "front")}
              />
            )}
            <ZoomControl
              value={previewZoom}
              onChange={setPreviewZoom}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {previewMode === "structural" ? (
              <>
                <div className="w-56">
                  <NumberControl
                    label={`${layerAxis.toUpperCase()} layer`}
                    value={structuralLayer}
                    min={tubeWidth / 2}
                    max={sectionDimension(section, layerAxis) - tubeWidth / 2}
                    step={0.125}
                    unit="in"
                    snapStops={layerStops}
                    reverseSlider={structuralView === "top"}
                    onChange={(value) =>
                      setStructuralLayers((current) => ({
                        ...current,
                        [structuralView]: snapToNearestStop(value, layerStops),
                      }))
                    }
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div className="mb-4 grid gap-2 text-xs text-slate-700 md:grid-cols-3">
          <CoordinateNote label="Origin" value="0 = front-left-bottom" />
          <CoordinateNote label="Face index" value="front/back use X, left/right use Y" />
          <CoordinateNote label="Axes" value="+X right, +Y back, +Z up" />
        </div>
        <div className="grid gap-5">
          {previewMode === "structural" ? (
            <BbqSectionView
              title={structuralViewTitle(structuralView)}
              view={structuralView}
              layerPosition={structuralLayer}
              section={section}
              pieces={sectionPieces}
              connectors={evaluation.connectors}
              selectedPieceId={selectedPieceId}
              activeSelection={previewStructuralSelection}
              tubeWidth={tubeWidth}
              connectorSize={connectorSize}
              zoom={previewZoom}
            />
          ) : layoutView === "top" ? (
            <TopLayoutView
              section={section}
              inserts={sectionInserts}
              counterOverhang={parameters.bbqIsland.settings.counter.edgeOverhang}
              zoom={previewZoom}
            />
          ) : (
            <FrontLayoutView
              section={section}
              inserts={sectionInserts}
              footingThickness={parameters.bbqIsland.settings.footingBoard.thickness}
              counterOverhang={parameters.bbqIsland.settings.counter.edgeOverhang}
              counterThickness={parameters.bbqIsland.settings.counter.thickness}
              zoom={previewZoom}
            />
          )}
        </div>
      </DataPanel>

      <DataPanel
        icon={<Ruler className="h-4 w-4 text-teal-700" />}
        title="Section Controls"
      >
        <div className="mb-4">
          <SegmentedControl
            label="Section editor"
            options={editorOptions}
            value={activeEditorTab}
            onChange={(value) => setEditorTab(value as typeof editorTab)}
          />
        </div>
        {activeEditorTab === "main" ? (
          <SectionEditor
            section={section}
            sectionCount={parameters.bbqIsland.sections.length}
          />
        ) : null}
        {activeEditorTab === "vertical" ? (
          <StructuralMembersEditor
            section={section}
            kind="vertical-post"
            structuralView={structuralView}
            layerPosition={structuralLayer}
            connectorSize={connectorSize}
            tubeWidth={tubeWidth}
            selectedMemberId={
              previewStructuralSelection?.type === "member"
                ? previewStructuralSelection.id
                : null
            }
            onSelectMember={selectStructuralMember}
          />
        ) : null}
        {activeEditorTab === "horizontal" ? (
          <StructuralMembersEditor
            section={section}
            kind="horizontal-beam"
            structuralView={structuralView}
            layerPosition={structuralLayer}
            connectorSize={connectorSize}
            tubeWidth={tubeWidth}
            selectedMemberId={
              previewStructuralSelection?.type === "member"
                ? previewStructuralSelection.id
                : null
            }
            onSelectMember={selectStructuralMember}
          />
        ) : null}
        {activeEditorTab === "rafter" ? (
          <StructuralMembersEditor
            section={section}
            kind="rafter"
            structuralView={structuralView}
            layerPosition={structuralLayer}
            connectorSize={connectorSize}
            tubeWidth={tubeWidth}
            selectedMemberId={
              previewStructuralSelection?.type === "member"
                ? previewStructuralSelection.id
                : null
            }
            onSelectMember={selectStructuralMember}
          />
        ) : null}
        {activeEditorTab === "connectors" ? (
          <StructuralConnectorsEditor
            section={section}
            evaluatedConnectors={evaluation.connectors}
            tubeWidth={tubeWidth}
            connectorSize={connectorSize}
            structuralView={structuralView}
            layerPosition={structuralLayer}
            selectedConnectorId={
              previewStructuralSelection?.type === "connector"
                ? previewStructuralSelection.id
                : null
            }
            onSelectConnector={selectStructuralConnector}
          />
        ) : null}
        {activeEditorTab === "inserts" ? (
          <InsertsEditorPanel
            sectionId={section.id}
            inserts={sectionInserts}
          />
        ) : null}
      </DataPanel>

      <section className="grid gap-5 xl:grid-cols-2">
        <DataPanel
          icon={<Package className="h-4 w-4 text-teal-700" />}
          title="Assembly Pieces"
        >
          <AssemblyPieceTable pieces={sectionPieces} />
        </DataPanel>

        <DataPanel
          icon={<Grid2X2 className="h-4 w-4 text-teal-700" />}
          title="Connection Graph"
        >
          <SimpleTable
            table={useReactTable({
              data: connectionRowsForSection,
              columns: [
                connectionColumns.accessor("tube", { header: "Piece" }),
                connectionColumns.accessor("start", { header: "Start" }),
                connectionColumns.accessor("end", { header: "End" }),
              ],
              getCoreRowModel: getCoreRowModel(),
            })}
          />
          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
              Connectors
            </h3>
            <SimpleTable
              table={useReactTable({
                data: connectorRowsForSection,
                columns: [
                  connectorColumns.accessor("kind", { header: "Kind" }),
                  connectorColumns.accessor("position", { header: "Position" }),
                  connectorColumns.accessor("type", { header: "Type" }),
                  connectorColumns.accessor("directions", { header: "Directions" }),
                  connectorColumns.accessor("pieces", { header: "Pieces" }),
                ],
                getCoreRowModel: getCoreRowModel(),
              })}
            />
          </div>
        </DataPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DataPanel
          icon={<Grid2X2 className="h-4 w-4 text-teal-700" />}
          title="Evaluated Linear Elements"
        >
          <AssemblyPieceTable pieces={tubePieces} />
        </DataPanel>

        <DataPanel
          icon={<Box className="h-4 w-4 text-teal-700" />}
          title="Inspectable Objects"
        >
          <div className="grid gap-2 text-sm md:grid-cols-2">
            {sectionPieces.map((piece) => (
              <button
                key={piece.id}
                type="button"
                onClick={() => {
                  setSelectedPieceId(piece.id);
                  if (piece.kind === "tube" && piece.sourceId) {
                    setActiveStructuralSelection({
                      type: "member",
                      id: piece.sourceId,
                    });
                  }
                }}
                className={`rounded-md border px-3 py-2 text-left transition ${
                  selectedPieceId === piece.id
                    ? "border-teal-700 bg-teal-50 text-teal-950"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                <span className="block font-medium">{piece.id}</span>
                <span className="text-xs text-slate-500">
                  {piece.kind}
                  {piece.length ? `, ${formatLength(piece.length)} in` : ""}
                </span>
              </button>
            ))}
          </div>
          {selectedPiece ? (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div className="font-semibold text-slate-950">{selectedPiece.id}</div>
              <div className="mt-1 text-slate-700">
                {formatPieceBounds(selectedPiece)}
              </div>
            </div>
          ) : null}
        </DataPanel>
      </section>
    </>
  );
}

function CoordinateNote({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="font-semibold text-slate-900">{label}: </span>
      {value}
    </div>
  );
}

function SegmentedControl<TValue extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ label: string; value: TValue }>;
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <div className="inline-flex rounded-md border border-slate-300 bg-white p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              value === option.value
                ? "bg-teal-700 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ZoomControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const changeZoom = (nextValue: number) => {
    onChange(Math.min(4, Math.max(0.5, Number(nextValue.toFixed(2)))));
  };

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        Zoom
      </span>
      <div className="inline-flex items-center rounded-md border border-slate-300 bg-white p-1">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => changeZoom(value - 0.25)}
          className="rounded p-1.5 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={value <= 0.5}
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => changeZoom(1)}
          className="min-w-16 rounded px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          {Math.round(value * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => changeZoom(value + 0.25)}
          className="rounded p-1.5 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={value >= 4}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function structuralViewTitle(view: SectionView): string {
  if (view === "top") return "Top-down";
  if (view === "front") return "Front face";
  if (view === "back") return "Back face";
  if (view === "right") return "Right side";
  return "Left side";
}

function sectionEditorOptions(
  sectionName: string,
  view: SectionView,
): Array<{ label: string; value: SectionEditorTab }> {
  const options: Array<{ label: string; value: SectionEditorTab }> = [
    { label: sectionName, value: "main" },
  ];
  if (view === "front" || view === "back") {
    options.push(
      { label: "Vertical posts", value: "vertical" },
      { label: "Horizontal beams", value: "horizontal" },
      { label: "Rafters", value: "rafter" },
    );
  } else if (view === "top") {
    options.push(
      { label: "Vertical posts", value: "vertical" },
      { label: "Horizontal beams", value: "horizontal" },
      { label: "Rafters", value: "rafter" },
    );
  } else {
    options.push(
      { label: "Vertical posts", value: "vertical" },
      { label: "Horizontal beams", value: "horizontal" },
      { label: "Rafters", value: "rafter" },
    );
  }
  options.push(
    { label: "Connectors", value: "connectors" },
    { label: "Inserts", value: "inserts" },
  );
  return options;
}

function structuralSelectionForEditor(
  section: IslandSection,
  editorTab: SectionEditorTab,
  selection: StructuralSelection,
  evaluatedConnectors: BbqConnector[] = [],
): StructuralSelection {
  const memberKind = editorTabMemberKind(editorTab);
  if (memberKind) {
    const members = (section.structuralMembers ?? []).filter(
      (member) => member.kind === memberKind,
    );
    if (
      selection?.type === "member" &&
      members.some((member) => member.id === selection.id)
    ) {
      return selection;
    }
    return members[0] ? { type: "member", id: members[0].id } : null;
  }

  if (editorTab === "connectors") {
    const connectors = evaluatedConnectors.filter(
      (connector) => connector.sectionId === section.id,
    );
    if (
      selection?.type === "connector" &&
      connectors.some((connector) => connector.id === selection.id)
    ) {
      return selection;
    }
    return connectors[0] ? { type: "connector", id: connectors[0].id } : null;
  }

  return null;
}

function editorTabMemberKind(
  editorTab: SectionEditorTab,
): StructuralMember["kind"] | null {
  if (editorTab === "vertical") return "vertical-post";
  if (editorTab === "horizontal") return "horizontal-beam";
  if (editorTab === "rafter") return "rafter";
  return null;
}

function localEvaluatedConnectorPosition(
  section: IslandSection,
  connector: BbqConnector,
) {
  return {
    x: connector.position.x - section.origin.x,
    y: connector.position.y - section.origin.y,
    z: connector.position.z - section.origin.z,
  };
}

function AssemblyPieceTable({ pieces }: { pieces: AssemblyPiece[] }) {
  return (
    <SimpleTable
      table={useReactTable({
        data: pieces,
        columns: [
          bbqPieceColumns.accessor("id", { header: "Piece" }),
          bbqPieceColumns.accessor("kind", { header: "Kind" }),
          bbqPieceColumns.accessor("axis", {
            header: "Axis",
            cell: (info) => info.getValue() ?? "n/a",
          }),
          bbqPieceColumns.accessor("length", {
            header: "Length",
            cell: (info) =>
              info.getValue() ? `${formatLength(info.getValue() ?? 0)} in` : "n/a",
          }),
        ],
        getCoreRowModel: getCoreRowModel(),
      })}
    />
  );
}

function BbqSectionView({
  title,
  view,
  layerPosition,
  section,
  pieces,
  connectors,
  selectedPieceId,
  activeSelection,
  tubeWidth,
  connectorSize,
  zoom,
}: {
  title: string;
  view: SectionView;
  layerPosition: number;
  section: IslandSection;
  pieces: AssemblyPiece[];
  connectors: BbqConnector[];
  selectedPieceId: string | null;
  activeSelection: StructuralSelection;
  tubeWidth: number;
  connectorSize: number;
  zoom: number;
}) {
  const visiblePieces = pieces.filter((piece) =>
    isPieceVisibleInStructuralView(piece, section, view, layerPosition, tubeWidth),
  ).sort(
    (first, second) =>
      pieceDrawOrder(first, section, view, tubeWidth) -
      pieceDrawOrder(second, section, view, tubeWidth),
  );
  const sectionConnectors = connectors.filter(
    (connector) => connector.sectionId === section.id,
  );
  const visibleConnectorVisuals = connectorVisualsForView(
    section,
    sectionConnectors,
    view,
    layerPosition,
    tubeWidth,
    connectorSize,
  );
  const box = zoomViewBox(assemblyViewBox(visiblePieces, view, section), zoom);

  return (
    <figure>
      <figcaption className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
        {title}
      </figcaption>
      <svg
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        role="img"
        aria-label={`${title} section preview`}
        className="aspect-[16/7] min-h-80 w-full rounded-md border border-slate-300 bg-slate-50"
      >
        <SectionDatumOverlay section={section} view={view} />
        {visiblePieces.map((piece) => {
          const inspected = selectedPieceId === piece.id;
          const active = isPieceActiveSelection(piece, activeSelection);
          const color = piece.color ?? assemblyPieceColor(piece.kind);
          const projected = projectAssemblyPiece(piece, view);
          return (
            <g key={`${view}:${piece.id}`}>
              {active ? (
                <SelectionRing
                  rect={projected}
                  inset={0.75}
                  strokeWidth={2.4}
                />
              ) : null}
              <rect
                x={projected.x}
                y={projected.y}
                width={Math.max(0.75, projected.width)}
                height={Math.max(0.75, projected.height)}
                fill={color}
                fillOpacity={piece.kind === "counter" || piece.kind === "footing-board" ? 0.25 : 0.75}
                stroke={inspected ? "#0f172a" : color}
                strokeWidth={inspected ? 2 : 0.45}
                vectorEffect="non-scaling-stroke"
              >
                <title>{piece.id}</title>
              </rect>
            </g>
          );
        })}
        {visibleConnectorVisuals.map((visual) => {
          const selected =
            activeSelection?.type === "connector" &&
            visual.connectorIds.includes(activeSelection.id);
          if (visual.kind === "surface") {
            return (
              <g key={`${view}:connector:${visual.id}`}>
                {selected ? (
                  <SelectionRing
                    rect={visual.rect}
                    inset={0.55}
                    strokeWidth={2.2}
                  />
                ) : null}
                <rect
                  x={visual.rect.x}
                  y={visual.rect.y}
                  width={Math.max(0.35, visual.rect.width)}
                  height={Math.max(0.35, visual.rect.height)}
                  fill="#64748b"
                  fillOpacity={0.95}
                  stroke={selected ? "#f97316" : "none"}
                  strokeWidth={selected ? 0.7 : 0}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{visual.title}</title>
                </rect>
              </g>
            );
          }

          const connectorRect = drawnConnectorRect(visual.rect, 0.75);
          return (
            <g key={`${view}:connector:${visual.id}`}>
              {selected ? (
                <SelectionRing
                  rect={connectorRect}
                  inset={0.65}
                  strokeWidth={2.4}
                />
              ) : null}
              <rect
                x={connectorRect.x}
                y={connectorRect.y}
                width={connectorRect.width}
                height={connectorRect.height}
                fill={visual.kind === "node" ? "#cbd5e1" : "#d1d5db"}
                stroke="#020617"
                strokeOpacity={visual.kind === "node" ? 1 : 0.75}
                strokeWidth={visual.kind === "node" ? 1.5 : 1.1}
                vectorEffect="non-scaling-stroke"
              >
                <title>{visual.title}</title>
              </rect>
              {freePortIndicatorRects(connectorRect, view, visual.freeDirections).map(
                (rect) => (
                  <rect
                    key={`${visual.id}:${rect.direction}`}
                    x={rect.x}
                    y={rect.y}
                    width={rect.size}
                    height={rect.size}
                    fill={rect.hidden && rect.awayFromViewer ? "none" : "#020617"}
                    stroke="#020617"
                    strokeWidth={rect.hidden ? 0.14 : 0}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  >
                    <title>{rect.direction} free port</title>
                  </rect>
                ),
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function SelectionRing({
  rect,
  inset,
  strokeWidth,
}: {
  rect: { x: number; y: number; width: number; height: number };
  inset: number;
  strokeWidth: number;
}) {
  return (
    <rect
      x={rect.x - inset}
      y={rect.y - inset}
      width={Math.max(0.75, rect.width + inset * 2)}
      height={Math.max(0.75, rect.height + inset * 2)}
      fill="none"
      stroke="#f97316"
      strokeOpacity={0.95}
      strokeWidth={strokeWidth}
      strokeDasharray="2.4 1.5"
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}

function drawnConnectorRect(
  rect: { x: number; y: number; width: number; height: number },
  minSize: number,
) {
  const width = Math.max(minSize, rect.width);
  const height = Math.max(minSize, rect.height);
  return {
    x: rect.x + rect.width / 2 - width / 2,
    y: rect.y + rect.height / 2 - height / 2,
    width,
    height,
  };
}

function freePortIndicatorRects(
  rect: { x: number; y: number; width: number; height: number },
  view: SectionView,
  directions: StructuralConnectorDirection[],
) {
  const visibleAxes = visibleAxesForView(view);
  const layerAxis = layerAxisForView(view);
  const size = Math.max(0.34, Math.min(rect.width, rect.height) * 0.5);
  const inset = Math.max(0.08, Math.min(rect.width, rect.height) * 0.18);

  return directions.flatMap((direction) => {
    const axis = direction.slice(1).toLowerCase() as StructuralAxis;
    const sign = direction.startsWith("+") ? "+" : "-";
    const horizontal = axis === visibleAxes.horizontal;
    const vertical = axis === visibleAxes.vertical;

    if (!horizontal && !vertical) {
      if (axis !== layerAxis) return [];
      const towardViewer = directionPointsTowardViewer(view, direction);
      const hiddenSize = size * 0.72;
      return [
        {
          direction,
          hidden: true,
          awayFromViewer: !towardViewer,
          size: hiddenSize,
          x: towardViewer
            ? rect.x + inset
            : rect.x + rect.width - hiddenSize - inset,
          y: towardViewer
            ? rect.y + inset
            : rect.y + rect.height - hiddenSize - inset,
        },
      ];
    }

    if (horizontal) {
      return [
        {
          direction,
          hidden: false,
          awayFromViewer: false,
          size,
          x: sign === "+" ? rect.x + rect.width - size - inset : rect.x + inset,
          y: rect.y + rect.height / 2 - size / 2,
        },
      ];
    }

    const positiveVerticalMovesUp =
      visibleAxes.vertical === "z" || visibleAxes.vertical === "y";
    const positiveIsTop = positiveVerticalMovesUp;
    return [
      {
        direction,
        hidden: false,
        awayFromViewer: false,
        size,
        x: rect.x + rect.width / 2 - size / 2,
        y:
          sign === "+"
            ? positiveIsTop
              ? rect.y + inset
              : rect.y + rect.height - size - inset
            : positiveIsTop
              ? rect.y + rect.height - size - inset
              : rect.y + inset,
      },
    ];
  });
}

function directionPointsTowardViewer(
  view: SectionView,
  direction: StructuralConnectorDirection,
) {
  if (view === "front") return direction === "-Y";
  if (view === "back") return direction === "+Y";
  if (view === "side") return direction === "-X";
  if (view === "right") return direction === "+X";
  return false;
}

function isPieceActiveSelection(
  piece: AssemblyPiece,
  activeSelection: StructuralSelection,
) {
  return (
    activeSelection?.type === "member" &&
    piece.kind === "tube" &&
    piece.sourceId === activeSelection.id
  );
}

function pieceDrawOrder(
  piece: AssemblyPiece,
  section: IslandSection,
  view: SectionView,
  tubeWidth: number,
): number {
  if (piece.kind === "tube") {
    const member = section.structuralMembers.find(
      (candidate) => candidate.id === piece.sourceId,
    );
    return member && structuralMemberAxisName(member) === layerAxisForView(view)
      ? 3
      : 1;
  }
  return 1;
}

function TopLayoutView({
  section,
  inserts,
  counterOverhang,
  zoom,
}: {
  section: IslandSection;
  inserts: InsertDefinition[];
  counterOverhang: number;
  zoom: number;
}) {
  const counter = {
    x: section.origin.x - counterOverhang,
    y: section.origin.y - counterOverhang,
    width: section.length + counterOverhang * 2,
    height: section.depth + counterOverhang * 2,
  };
  const cabinet = {
    x: section.origin.x,
    y: section.origin.y,
    width: section.length,
    height: section.depth,
  };
  const projectedInserts = inserts.map((insert) => ({
    insert,
    ...insertTopLayoutBounds(section, insert),
  }));
  const shapes = [counter, cabinet, ...projectedInserts];
  const minX = Math.min(...shapes.map((shape) => shape.x));
  const minY = Math.min(...shapes.map((shape) => shape.y));
  const maxX = Math.max(...shapes.map((shape) => shape.x + shape.width));
  const maxY = Math.max(...shapes.map((shape) => shape.y + shape.height));
  const pad = 8;
  const box = zoomViewBox({
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  }, zoom);

  return (
    <figure>
      <figcaption className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
        Top layout
      </figcaption>
      <svg
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        role="img"
        aria-label="Top layout counter and inserts"
        className="aspect-[16/7] min-h-80 w-full rounded-md border border-slate-300 bg-slate-50"
      >
        <rect x={counter.x} y={counter.y} width={counter.width} height={counter.height} fill="#a855f7" fillOpacity={0.22} stroke="#7e22ce" strokeWidth={0.7} />
        <rect x={cabinet.x} y={cabinet.y} width={cabinet.width} height={cabinet.height} fill="#e2e8f0" fillOpacity={0.32} stroke="#0f172a" strokeDasharray="3 2" strokeWidth={0.7} />
        {projectedInserts.map((shape) => (
          <g key={shape.insert.id}>
            <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} fill={shape.insert.color} fillOpacity={0.24} stroke={shape.insert.color} strokeWidth={0.9} />
            <text x={shape.x + 1.5} y={shape.y + 3} fontSize={1.8} fill="#334155">
              {shape.insert.name}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

function insertTopLayoutBounds(section: IslandSection, insert: InsertDefinition) {
  if (insert.face === "front" || insert.face === "back") {
    return {
      x: section.origin.x + insert.offsetFromLeft,
      y: insert.face === "front" ? section.origin.y : section.origin.y + section.depth - insert.body.depth,
      width: insert.body.width,
      height: insert.body.depth,
    };
  }

  return {
    x: insert.face === "left" ? section.origin.x : section.origin.x + section.length - insert.body.depth,
    y: section.origin.y + insert.offsetFromLeft,
    width: insert.body.depth,
    height: insert.body.width,
  };
}

function FrontLayoutView({
  section,
  inserts,
  footingThickness,
  counterOverhang,
  counterThickness,
  zoom,
}: {
  section: IslandSection;
  inserts: InsertDefinition[];
  footingThickness: number;
  counterOverhang: number;
  counterThickness: number;
  zoom: number;
}) {
  const frontInserts = inserts.filter((insert) => insert.face === "front");
  const frame = projectSectionFrame(section, "front");
  const footing = {
    x: section.origin.x,
    y: -section.origin.z,
    width: section.length,
    height: footingThickness,
  };
  const counter = {
    x: section.origin.x - counterOverhang,
    y: -(section.origin.z + section.height + counterThickness),
    width: section.length + counterOverhang * 2,
    height: counterThickness,
  };
  const projectedInserts = frontInserts.map((insert) => {
    return {
      insert,
      x: section.origin.x + insert.offsetFromLeft,
      y: -(section.origin.z + insert.offsetFromBottom + insert.faceFrame.height),
      width: insert.faceFrame.width,
      height: insert.faceFrame.height,
    };
  });
  const shapes = [frame, footing, counter, ...projectedInserts];
  const minX = Math.min(...shapes.map((shape) => shape.x));
  const minY = Math.min(...shapes.map((shape) => shape.y));
  const maxX = Math.max(...shapes.map((shape) => shape.x + shape.width));
  const maxY = Math.max(...shapes.map((shape) => shape.y + shape.height));
  const pad = 8;
  const overlaps = insertFrameOverlaps(projectedInserts);
  const box = zoomViewBox({
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  }, zoom);

  return (
    <figure>
      <figcaption className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
        Front layout
      </figcaption>
      <svg
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        role="img"
        aria-label="Front layout clearances and face frames"
        className="aspect-[16/7] min-h-80 w-full rounded-md border border-slate-300 bg-slate-50"
      >
        <rect
          x={frame.x}
          y={frame.y}
          width={frame.width}
          height={frame.height}
          fill="#e2e8f0"
          fillOpacity={0.28}
          stroke="#0f172a"
          strokeDasharray="3 2"
          strokeWidth={0.7}
        />
        <rect
          x={footing.x}
          y={footing.y}
          width={footing.width}
          height={footing.height}
          fill="#64748b"
          fillOpacity={0.28}
          stroke="#475569"
          strokeWidth={0.7}
        />
        <rect
          x={counter.x}
          y={counter.y}
          width={counter.width}
          height={counter.height}
          fill="#a855f7"
          fillOpacity={0.22}
          stroke="#7e22ce"
          strokeWidth={0.7}
        />
        <text x={counter.x + 1.5} y={counter.y - 1.5} fontSize={1.8} fill="#7e22ce">
          counter overhang
        </text>
        {projectedInserts.map((shape) => {
          const isOverlapping = overlaps.has(shape.insert.id);
          return (
            <g key={shape.insert.id}>
              <rect
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                fill={shape.insert.color}
                fillOpacity={0.2}
                stroke={isOverlapping ? "#dc2626" : shape.insert.color}
                strokeWidth={isOverlapping ? 1.4 : 0.9}
              />
              <text
                x={shape.x + 1.5}
                y={shape.y + 3}
                fontSize={1.8}
                fill={isOverlapping ? "#991b1b" : "#334155"}
              >
                {shape.insert.name}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function insertFrameOverlaps(
  frames: Array<{
    insert: InsertDefinition;
    x: number;
    y: number;
    width: number;
    height: number;
  }>,
) {
  const overlapping = new Set<string>();
  for (let i = 0; i < frames.length; i += 1) {
    for (let j = i + 1; j < frames.length; j += 1) {
      if (rectsOverlap(frames[i], frames[j])) {
        overlapping.add(frames[i].insert.id);
        overlapping.add(frames[j].insert.id);
      }
    }
  }
  return overlapping;
}

function rectsOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function isPieceVisibleInStructuralView(
  piece: AssemblyPiece,
  section: IslandSection,
  view: SectionView,
  layerPosition: number,
  tubeWidth: number,
) {
  if (piece.kind !== "tube") {
    return false;
  }

  const member = section.structuralMembers.find(
    (candidate) => candidate.id === piece.sourceId,
  );
  if (member) {
    return isStructuralMemberVisibleInView(
      section,
      member,
      view,
      layerPosition,
      tubeWidth,
    );
  }

  return false;
}

function isStructuralConnectorVisibleInView(
  section: IslandSection,
  connector: StructuralConnector,
  view: SectionView,
  layerPosition: number,
  tubeWidth: number,
  connectorSize: number,
) {
  if (connector.kind === "surface") {
    return isSurfaceConnectorVisibleInView(
      section,
      connector,
      view,
      layerPosition,
      tubeWidth,
    );
  }

  return localBoundsIntersectsLayer(
    section,
    nodeConnectorCubeBounds(section, connector, connectorSize),
    view,
    layerPosition,
  );
}

interface ConnectorVisual {
  id: string;
  connectorIds: string[];
  kind: "node" | "surface";
  freeDirections: StructuralConnectorDirection[];
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  title: string;
}

function connectorVisualsForView(
  section: IslandSection,
  connectors: BbqConnector[],
  view: SectionView,
  layerPosition: number,
  tubeWidth: number,
  connectorSize: number,
): ConnectorVisual[] {
  const visuals = new Map<string, ConnectorVisual>();

  for (const connector of connectors) {
    const authoredConnector = (section.structuralConnectors ?? []).find(
      (candidate) => candidate.id === connector.id,
    );
    if (!authoredConnector) continue;

    if (authoredConnector.kind === "surface") {
      if (!isSurfaceConnectorVisibleInView(section, authoredConnector, view, layerPosition, tubeWidth)) {
        continue;
      }
      visuals.set(`surface:${connector.id}`, {
        id: connector.id,
        connectorIds: [connector.id],
        kind: "surface",
        freeDirections: [],
        rect: surfaceConnectorPlateRect(section, authoredConnector, view, tubeWidth),
        title: authoredConnector.name,
      });
      continue;
    }

    const bounds = nodeConnectorCubeBounds(section, authoredConnector, connectorSize);

    if (!localBoundsIntersectsLayer(section, bounds, view, layerPosition)) {
      continue;
    }

    const key = `cube:${boundsKey(bounds)}`;
    const existing = visuals.get(key);
    if (existing?.kind === "node") continue;

    visuals.set(key, {
      id: existing ? `${existing.id}+${connector.id}` : connector.id,
      connectorIds: existing
        ? [...existing.connectorIds, connector.id]
        : [connector.id],
      kind: "node",
      freeDirections: existing
        ? [
            ...existing.freeDirections,
            ...nodeConnectorFreeDirections(section, authoredConnector),
          ]
        : nodeConnectorFreeDirections(section, authoredConnector),
      rect: projectLocalBounds(section, view, bounds),
      title: existing ? `${existing.title}, ${connector.id}` : authoredConnector.name,
    });
  }

  return [...visuals.values()];
}

function isSurfaceConnectorVisibleInView(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "surface" }>,
  view: SectionView,
  layerPosition: number,
  tubeWidth: number,
) {
  const position = structuralConnectorPosition(section, connector, tubeWidth);
  const layerAxis = layerAxisForView(view);
  return Math.abs(position[layerAxis] - layerPosition) <= tubeWidth;
}

function localBoundsIntersectsLayer(
  section: IslandSection,
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  },
  view: SectionView,
  layerPosition: number,
) {
  const layerAxis = layerAxisForView(view);
  const globalLayer = section.origin[layerAxis] + layerPosition;
  const min = section.origin[layerAxis] + bounds.min[layerAxis];
  const max = section.origin[layerAxis] + bounds.max[layerAxis];
  return globalLayer >= min - 0.001 && globalLayer <= max + 0.001;
}

function boundsKey(bounds: {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}) {
  return [
    bounds.min.x,
    bounds.min.y,
    bounds.min.z,
    bounds.max.x,
    bounds.max.y,
    bounds.max.z,
  ]
    .map((value) => formatLength(value))
    .join(":");
}

function pieceIntersectsLayer(
  piece: AssemblyPiece,
  section: IslandSection,
  view: SectionView,
  layerPosition: number,
  epsilon = 0.01,
) {
  const axis = layerAxisForView(view);
  const globalLayer = section.origin[axis] + layerPosition;
  return (
    piece.bounds.min[axis] <= globalLayer + epsilon &&
    piece.bounds.max[axis] >= globalLayer - epsilon
  );
}

function SectionDatumOverlay({
  section,
  view,
}: {
  section: IslandSection;
  view: SectionView;
}) {
  const frame = projectSectionFrame(section, view);
  const origin = projectLocalPoint(section, view, { x: 0, y: 0, z: 0 });
  const xEnd = projectLocalPoint(section, view, {
    x: section.length,
    y: 0,
    z: 0,
  });
  const yEnd = projectLocalPoint(section, view, {
    x: 0,
    y: section.depth,
    z: 0,
  });
  const topRight = projectLocalPoint(section, view, {
    x: section.length,
    y: section.depth,
    z: 0,
  });

  return (
    <g>
      <rect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        fill="none"
        stroke="#cbd5e1"
        strokeDasharray="2 3"
        strokeWidth={0.45}
        vectorEffect="non-scaling-stroke"
      />
      <text x={origin.x - 1.4} y={origin.y + 2.8} fontSize={1.8} fill="#94a3b8" textAnchor="end">
        0
      </text>
      {view === "top" ? (
        <>
          <ViewLabel point={midpoint(origin, xEnd)} label="front / X index" dy={5.5} anchor="middle" />
          <ViewLabel point={midpoint(origin, yEnd)} label="Y index" dx={-2} dy={1} anchor="end" />
        </>
      ) : null}
      {view === "front" || view === "back" ? (
        <>
          <ViewLabel
            point={midpoint(origin, xEnd)}
            label={`${view} / X index`}
            dy={5.5}
            anchor="middle"
          />
          <ViewLabel
            point={midpoint(
              origin,
              projectLocalPoint(section, view, { x: 0, y: 0, z: section.height }),
            )}
            label="Z index"
            dx={-2}
            dy={1}
            anchor="end"
          />
        </>
      ) : null}
      {view === "side" || view === "right" ? (
        <>
          <ViewLabel
            point={midpoint(origin, yEnd)}
            label={`${view === "right" ? "right" : "left"} / Y index`}
            dy={5.5}
            anchor="middle"
          />
          <ViewLabel
            point={midpoint(
              origin,
              projectLocalPoint(section, view, { x: 0, y: 0, z: section.height }),
            )}
            label="Z index"
            dx={-2}
            dy={1}
            anchor="end"
          />
        </>
      ) : null}
    </g>
  );
}

function midpoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

function ViewLabel({
  point,
  label,
  dx = 0,
  dy = 0,
  anchor = "start",
}: {
  point: { x: number; y: number };
  label: string;
  dx?: number;
  dy?: number;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text
      x={point.x + dx}
      y={point.y + dy}
      fontSize={1.7}
      fill="#64748b"
      textAnchor={anchor}
    >
      {label}
    </text>
  );
}

function pieceConnectionRow(piece: AssemblyPiece): ConnectionRow {
  const bounds = piece.bounds;
  if (piece.axis === "x") {
    return {
      id: piece.id,
      tube: piece.id,
      start: `x ${formatLength(bounds.min.x)}`,
      end: `x ${formatLength(bounds.max.x)}`,
    };
  }
  if (piece.axis === "y") {
    return {
      id: piece.id,
      tube: piece.id,
      start: `y ${formatLength(bounds.min.y)}`,
      end: `y ${formatLength(bounds.max.y)}`,
    };
  }
  return {
    id: piece.id,
    tube: piece.id,
    start: `z ${formatLength(bounds.min.z)}`,
    end: `z ${formatLength(bounds.max.z)}`,
  };
}

function GardenPlanner({ evaluation }: { evaluation: GardenEvaluation }) {
  const parameters = usePlannerState();

  return (
    <>
      <section className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-md border border-slate-300 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Leaf className="h-4 w-4 text-teal-700" />
              <h2 className="text-base font-semibold">Garden Parameters</h2>
            </div>
            <button
              type="button"
              onClick={resetPlannerParameters}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              aria-label="Reset parameters"
              title="Reset parameters"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <NumberControl
              label="Yard width"
              value={parameters.garden.yardWidth}
              min={48}
              max={600}
              step={6}
              unit="in"
              onChange={(value) => updateGardenParameter("yardWidth", value)}
            />
            <NumberControl
              label="Yard depth"
              value={parameters.garden.yardDepth}
              min={48}
              max={600}
              step={6}
              unit="in"
              onChange={(value) => updateGardenParameter("yardDepth", value)}
            />
            <NumberControl
              label="Bed width"
              value={parameters.garden.bedWidth}
              min={24}
              max={144}
              step={12}
              unit="in"
              onChange={(value) => updateGardenParameter("bedWidth", value)}
            />
            <NumberControl
              label="Bed depth"
              value={parameters.garden.bedDepth}
              min={24}
              max={192}
              step={12}
              unit="in"
              onChange={(value) => updateGardenParameter("bedDepth", value)}
            />
            <NumberControl
              label="Bed count"
              value={parameters.garden.bedCount}
              min={1}
              max={12}
              step={1}
              unit="ea"
              onChange={(value) => updateGardenParameter("bedCount", value)}
            />
            <NumberControl
              label="Walkway"
              value={parameters.garden.walkway}
              min={12}
              max={72}
              step={3}
              unit="in"
              onChange={(value) => updateGardenParameter("walkway", value)}
            />
            <NumberControl
              label="Panel width"
              value={parameters.garden.panelWidth}
              min={12}
              max={48}
              step={6}
              unit="in"
              onChange={(value) => updateGardenParameter("panelWidth", value)}
            />
            <NumberControl
              label="Available panels"
              value={parameters.garden.availablePanels}
              min={0}
              max={96}
              step={1}
              unit="ea"
              onChange={(value) => updateGardenParameter("availablePanels", value)}
            />
            <NumberControl
              label="Rounded corners"
              value={parameters.garden.availableRoundedCorners}
              min={0}
              max={48}
              step={1}
              unit="ea"
              onChange={(value) =>
                updateGardenParameter("availableRoundedCorners", value)
              }
            />
            <label className="flex items-center justify-between gap-3 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
              <span className="font-medium">Arched trellis</span>
              <input
                type="checkbox"
                checked={parameters.garden.includeTrellis}
                onChange={(event) =>
                  updateGardenParameter("includeTrellis", event.target.checked)
                }
                className="h-4 w-4 accent-teal-700"
              />
            </label>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          <GardenValidationPanel evaluation={evaluation} />
          <GardenPreview evaluation={evaluation} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DataPanel
          icon={<ShoppingCart className="h-4 w-4 text-teal-700" />}
          title="Garden Kit Inventory"
        >
          <SimpleTable
            table={useReactTable({
              data: evaluation.inventory,
              columns: [
                gardenInventoryColumns.accessor("item", { header: "Item" }),
                gardenInventoryColumns.accessor("required", { header: "Required" }),
                gardenInventoryColumns.accessor("available", { header: "Available" }),
                gardenInventoryColumns.accessor("delta", {
                  header: "Delta",
                  cell: (info) =>
                    info.getValue() >= 0
                      ? `+${info.getValue()}`
                      : `${info.getValue()}`,
                }),
              ],
              getCoreRowModel: getCoreRowModel(),
            })}
          />
        </DataPanel>

        <DataPanel
          icon={<Grid2X2 className="h-4 w-4 text-teal-700" />}
          title="Bed Panel Runs"
        >
          <SimpleTable
            table={useReactTable({
              data: evaluation.beds,
              columns: [
                gardenBedColumns.accessor("id", { header: "Bed" }),
                gardenBedColumns.accessor("width", {
                  header: "Actual width",
                  cell: (info) => `${formatLength(info.getValue())} in`,
                }),
                gardenBedColumns.accessor("depth", {
                  header: "Actual depth",
                  cell: (info) => `${formatLength(info.getValue())} in`,
                }),
                gardenBedColumns.accessor("panelRuns", {
                  header: "Panels",
                  cell: (info) =>
                    info
                      .getValue()
                      .map((run: GardenPanelRun) => `${run.side}: ${run.panelCount}`)
                      .join(", "),
                }),
              ],
              getCoreRowModel: getCoreRowModel(),
            })}
          />
        </DataPanel>
      </section>
    </>
  );
}

function GardenValidationPanel({
  evaluation,
}: {
  evaluation: GardenEvaluation;
}) {
  if (evaluation.validationIssues.length === 0) {
    return (
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4" />
          Garden layout fits current constraints
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-950">
        <AlertTriangle className="h-4 w-4" />
        Garden validation
      </div>
      <ul className="space-y-2">
        {evaluation.validationIssues.map((issue) => (
          <li
            key={issue.id}
            className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800"
          >
            <span className="font-medium">{issue.severity}</span>: {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GardenPreview({ evaluation }: { evaluation: GardenEvaluation }) {
  const pad = 8;

  return (
    <div className="rounded-md border border-slate-300 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Leaf className="h-4 w-4 text-teal-700" />
        <h2 className="text-base font-semibold">Raised Bed Layout</h2>
      </div>
      <svg
        viewBox={`${-pad} ${-pad} ${evaluation.yard.width + pad * 2} ${evaluation.yard.depth + pad * 2}`}
        role="img"
        aria-label="Raised bed layout preview"
        className="aspect-[16/9] w-full rounded-md border border-slate-300 bg-slate-50"
      >
        <rect
          x={0}
          y={0}
          width={evaluation.yard.width}
          height={evaluation.yard.depth}
          fill="none"
          stroke="#0f172a"
          strokeWidth={1}
        />
        {evaluation.beds.map((bed) => (
          <g key={bed.id}>
            <rect
              x={bed.x}
              y={bed.y}
              width={bed.width}
              height={bed.depth}
              fill="#d9f99d"
              fillOpacity={0.75}
              stroke="#3f6212"
              strokeWidth={1.5}
            />
            <text x={bed.x + 4} y={bed.y + 10} fontSize={7} fill="#1f2937">
              {bed.id}
            </text>
          </g>
        ))}
        {evaluation.trellis ? (
          <rect
            x={evaluation.trellis.x}
            y={evaluation.trellis.y}
            width={evaluation.trellis.width}
            height={evaluation.trellis.depth}
            fill="#38bdf8"
            fillOpacity={0.24}
            stroke="#0369a1"
            strokeDasharray="4 3"
            strokeWidth={1}
          />
        ) : null}
      </svg>
    </div>
  );
}

function TracePanel({
  evaluated,
  selectedId,
}: {
  evaluated: EvaluatedConfiguration;
  selectedId: string | null;
}) {
  const target =
    evaluated.elements.find((element) => element.id === selectedId) ??
    evaluated.assemblyArtifacts.find((artifact) => artifact.id === selectedId);

  if (!target) {
    return (
      <div className="rounded-md border border-slate-300 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Select a preview object to inspect its dimensions, connector ports, and
        allocation trace.
      </div>
    );
  }

  const isArtifact = "assemblyId" in target;
  const bounds = target.bounds;
  const linear =
    !isArtifact && target.kind === "linear" ? target : undefined;
  const allocation = linear
    ? evaluated.inventoryAllocations.find((item) =>
        item.cuts.some((cut) => cut.id === linear.id),
      )
    : undefined;

  return (
    <div className="rounded-md border border-slate-300 bg-white p-4 text-sm shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{target.id}</h2>
          <p className="text-xs text-slate-600">
            {isArtifact ? target.kind : target.kind}
          </p>
        </div>
        {linear ? (
          <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-950">
            {formatLength(linear.cutLength)} in cut
          </span>
        ) : null}
      </div>
      <dl className="grid gap-2 md:grid-cols-2">
        <TraceItem label="Bounds" value={formatBounds(bounds)} />
        {linear ? (
          <>
            <TraceItem
              label="Start"
              value={formatTerminal(linear.connections.start)}
            />
            <TraceItem label="End" value={formatTerminal(linear.connections.end)} />
            <TraceItem
              label="Inventory"
              value={
                allocation
                  ? `${allocation.inventoryLabel}, ${formatLength(allocation.remainingLength)} in remaining`
                  : "Unallocated"
              }
            />
          </>
        ) : null}
        {isArtifact ? (
          <>
            <TraceItem label="Name" value={(target as AssemblyArtifact).name} />
            <TraceItem
              label="Source"
              value={(target as AssemblyArtifact).sourceId}
            />
          </>
        ) : null}
      </dl>
    </div>
  );
}

function TraceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-slate-900">{value}</dd>
    </div>
  );
}

function AssemblySummary({ evaluated }: { evaluated: EvaluatedConfiguration }) {
  return (
    <div className="grid gap-3 text-sm md:grid-cols-3">
      <SummaryBlock
        label="Connectors"
        value={`${evaluated.connectionGraph.nodes.length} nodes`}
        detail={`${evaluated.connectionGraph.edges.length} tube connections`}
      />
      <SummaryBlock
        label="Inventory"
        value={`${evaluated.inventoryAllocations.length} usable pieces`}
        detail={`${evaluated.unallocatedCuts.length} unallocated cuts`}
      />
      <SummaryBlock
        label="Traceability"
        value="Piece-level"
        detail="Each tube maps to ports, cut length, and inventory"
      />
    </div>
  );
}

function SummaryBlock({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-600">{detail}</div>
    </div>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  orientation = "horizontal",
  disabled = false,
  reverseSlider = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  snapStops?: number[];
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  reverseSlider?: boolean;
  onChange: (value: number) => void;
}) {
  if (orientation === "vertical") {
    return (
      <div className="flex h-full min-h-64 min-w-0 flex-col rounded-md border border-slate-200 bg-white p-3">
        <label className="block text-sm font-medium text-slate-800">{label}</label>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-2">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(event) => onChange(Number(event.target.value))}
            className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-right text-sm outline-none focus:border-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
          />
          <span className="text-xs text-slate-500">{unit}</span>
        </div>
        <div className="flex min-h-44 flex-1 justify-center py-3">
          <Slider
            orientation="vertical"
            value={[value]}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onValueChange={([nextValue]) => onChange(nextValue)}
            className="[&_[data-slot=slider-range]]:bg-teal-700 [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-teal-700 [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-thumb]]:ring-teal-700/30"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2">
      <label className="block text-sm font-medium text-slate-800">{label}</label>
      <div className="grid grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-right text-sm outline-none focus:border-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        />
        <span className="text-xs text-slate-500">{unit}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ direction: reverseSlider ? "rtl" : "ltr" }}
        className="w-full accent-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

function DualRangeControl({
  label,
  startLabel,
  endLabel,
  startValue,
  endValue,
  min,
  max,
  step,
  unit,
  snapStops,
  onStartChange,
  onEndChange,
}: {
  label: string;
  startLabel: string;
  endLabel: string;
  startValue: number;
  endValue: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  snapStops?: number[];
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
}) {
  const span = Math.max(step, max - min);
  const stopPercents = snapStops
    ? [...new Set(snapStops)].filter((stop) => stop >= min && stop <= max).sort((a, b) => a - b)
        .map((stop) => ((stop - min) / span) * 100)
    : [];
  const handleRangeChange = ([nextStart, nextEnd]: number[]) => {
    if (nextStart !== startValue) {
      onStartChange(nextStart);
    }
    if (nextEnd !== endValue) {
      onEndChange(nextEnd);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-800">{label}</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <CompactNumberInput
          label={startLabel}
          value={startValue}
          min={min}
          max={endValue}
          step={step}
          unit={unit}
          onChange={onStartChange}
        />
        <CompactNumberInput
          label={endLabel}
          value={endValue}
          min={startValue}
          max={max}
          step={step}
          unit={unit}
          onChange={onEndChange}
        />
      </div>
      <div className="space-y-2 px-1 py-2">
        <Slider
          aria-label={label}
          value={[startValue, endValue]}
          min={min}
          max={max}
          step={step}
          minStepsBetweenThumbs={0}
          onValueChange={handleRangeChange}
          className="[&_[data-slot=slider-range]]:bg-teal-700 [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-teal-700 [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-thumb]]:ring-teal-700/30"
        />
        {stopPercents.length > 0 ? (
          <div className="relative h-3">
            {stopPercents.map((percent) => (
              <span
                key={percent}
                className="absolute top-0 h-2 w-px bg-slate-400/70"
                style={{ left: `${Math.max(0, Math.min(100, percent))}%` }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CompactNumberInput({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <div className="grid grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-right text-sm outline-none focus:border-teal-700"
        />
        <span className="text-xs text-slate-500">{unit}</span>
      </div>
    </label>
  );
}

function TextControl({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function SelectControl<T extends string>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ColorControl({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-10 rounded-md border border-slate-300 bg-white p-1 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60"
        />
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm font-mono outline-none focus:border-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        />
      </div>
    </label>
  );
}

function addExtraPost(section: IslandSection, face: IslandFace = "front") {
  const id = nextLocalId(
    "post",
    section.extraVerticalPosts.map((post) => post.id),
  );
  const maxOffset = face === "front" || face === "back" ? section.length : section.depth;
  updateBbqSection(section.id, {
    extraVerticalPosts: [
      ...section.extraVerticalPosts,
      {
        id,
        color: "#0891b2",
        face,
        offset: Math.min(maxOffset, Math.max(0, maxOffset / 2)),
      },
    ],
  });
}

function defaultExtraPostFaceForView(view: SectionView): IslandFace {
  if (view === "back") return "back";
  if (view === "right") return "right";
  if (view === "side") return "left";
  return "front";
}

function isExtraPostVisibleInStructuralView(
  post: ExtraVerticalPost,
  view: SectionView,
) {
  if (view === "top") return true;
  if (view === "side") return post.face === "left";
  if (view === "right") return post.face === "right";
  return post.face === view;
}

function updateExtraPost(
  section: IslandSection,
  postId: string,
  updates: Partial<ExtraVerticalPost>,
) {
  updateBbqSection(section.id, {
    extraVerticalPosts: section.extraVerticalPosts.map((post) =>
      post.id === postId ? { ...post, ...updates } : post,
    ),
  });
}

function deleteExtraPost(section: IslandSection, postId: string) {
  updateBbqSection(section.id, {
    extraVerticalPosts: section.extraVerticalPosts.filter(
      (post) => post.id !== postId,
    ),
  });
}

function nextLocalId(prefix: string, existingIds: string[]): string {
  let index = existingIds.length + 1;
  let id = `${prefix}-${index}`;
  while (existingIds.includes(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }
  return id;
}

function parseNumberList(value: string): number[] {
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function ValidationPanel({ evaluated }: { evaluated: EvaluatedConfiguration }) {
  if (evaluated.validationIssues.length === 0) {
    return (
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4" />
          Configuration passes current constraints
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-950">
        <AlertTriangle className="h-4 w-4" />
        Constraint validation
      </div>
      <ul className="space-y-2">
        {evaluated.validationIssues.map((issue) => (
          <li
            key={issue.id}
            className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800"
          >
            <span className="font-medium">{issue.code}</span>: {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreviewPanel({
  evaluated,
  selectedId,
}: {
  evaluated: EvaluatedConfiguration;
  selectedId: string | null;
}) {
  return (
    <div className="rounded-md border border-slate-300 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Box className="h-4 w-4 text-teal-700" />
        <h2 className="text-base font-semibold">Structural Preview</h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <OrthographicView
          title="Top-down"
          evaluated={evaluated}
          selectedId={selectedId}
          view="top"
        />
        <OrthographicView
          title="Front-face"
          evaluated={evaluated}
          selectedId={selectedId}
          view="front"
        />
      </div>
    </div>
  );
}

function OrthographicView({
  title,
  evaluated,
  view,
  selectedId,
}: {
  title: string;
  evaluated: EvaluatedConfiguration;
  view: "top" | "front";
  selectedId: string | null;
}) {
  const viewBox = viewBoxFor(evaluated, view);

  return (
    <figure>
      <figcaption className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
        {title}
      </figcaption>
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        role="img"
        aria-label={`${title} structural preview`}
        className="aspect-[16/9] w-full rounded-md border border-slate-300 bg-slate-50"
      >
        <Grid
          minX={viewBox.x}
          minY={viewBox.y}
          width={viewBox.width}
          height={viewBox.height}
        />
        <rect
          x={0}
          y={0}
          width={evaluated.boundary.dimensions.width}
          height={
            view === "top"
              ? evaluated.boundary.dimensions.depth
              : evaluated.boundary.dimensions.height
          }
          fill="none"
          stroke="#0f172a"
          strokeWidth={1}
        />
        {evaluated.assemblyArtifacts.map((artifact) => (
          <ArtifactShape
            key={`${view}-${artifact.id}`}
            artifact={artifact}
            selected={artifact.id === selectedId}
            view={view}
          />
        ))}
        {evaluated.elements.map((element) => (
          <ElementShape
            key={`${view}-${element.id}`}
            element={element}
            selected={element.id === selectedId}
            view={view}
          />
        ))}
      </svg>
    </figure>
  );
}

function Grid({
  minX,
  minY,
  width,
  height,
}: {
  minX: number;
  minY: number;
  width: number;
  height: number;
}) {
  const step = 12;
  const startX = Math.floor(minX / step) * step;
  const startY = Math.floor(minY / step) * step;
  const vertical = Array.from(
    { length: Math.ceil(width / step) + 2 },
    (_, i) => startX + i * step,
  );
  const horizontal = Array.from(
    { length: Math.ceil(height / step) + 2 },
    (_, i) => startY + i * step,
  );

  return (
    <>
      {vertical.map((x) => (
        <line key={`v-${x}`} x1={x} x2={x} y1={minY} y2={minY + height} stroke="#cbd5e1" strokeWidth={0.35} />
      ))}
      {horizontal.map((y) => (
        <line key={`h-${y}`} x1={minX} x2={minX + width} y1={y} y2={y} stroke="#cbd5e1" strokeWidth={0.35} />
      ))}
    </>
  );
}

function ElementShape({
  element,
  view,
  selected,
}: {
  element: EvaluatedElement;
  view: "top" | "front";
  selected: boolean;
}) {
  const x = element.bounds.min.x;
  const y = view === "top" ? element.bounds.min.y : element.bounds.min.z;
  const w = Math.max(0.8, element.bounds.max.x - element.bounds.min.x);
  const h = Math.max(
    0.8,
    view === "top"
      ? element.bounds.max.y - element.bounds.min.y
      : element.bounds.max.z - element.bounds.min.z,
  );
  const fill =
    element.kind === "linear"
      ? "#2563eb"
      : element.kind === "connector"
        ? "#0f766e"
        : "#f59e0b";

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={fill}
        fillOpacity={element.kind === "fixed" ? 0.42 : 0.78}
        stroke={selected ? "#0f172a" : fill}
        strokeWidth={selected ? 2 : 0.5}
      />
      {selected ? (
        <text x={x} y={Math.max(4, y - 1)} fontSize={4} fill="#0f172a">
          {element.id}
        </text>
      ) : null}
    </g>
  );
}

function ArtifactShape({
  artifact,
  view,
  selected,
}: {
  artifact: AssemblyArtifact;
  view: "top" | "front";
  selected: boolean;
}) {
  const x = artifact.bounds.min.x;
  const y = view === "top" ? artifact.bounds.min.y : artifact.bounds.min.z;
  const w = Math.max(0.8, artifact.bounds.max.x - artifact.bounds.min.x);
  const h = Math.max(
    0.8,
    view === "top"
      ? artifact.bounds.max.y - artifact.bounds.min.y
      : artifact.bounds.max.z - artifact.bounds.min.z,
  );
  const fill = artifactColor(artifact.kind);

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={fill}
        fillOpacity={artifact.kind === "support-rail" ? 0.72 : 0.22}
        stroke={selected ? "#0f172a" : fill}
        strokeDasharray={artifact.kind === "masonry-skin" ? "2 1.5" : undefined}
        strokeWidth={selected ? 2 : 0.6}
      />
      {selected ? (
        <text x={x} y={Math.max(4, y - 1)} fontSize={4} fill="#0f172a">
          {artifact.name}
        </text>
      ) : null}
    </g>
  );
}

function DataPanel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-300 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SimpleTable<T>({ table }: { table: ReturnType<typeof useReactTable<T>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-slate-300">
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="px-3 py-2 font-semibold text-slate-700">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-200 last:border-0">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 align-top text-slate-800">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ issueCount }: { issueCount: number }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
        issueCount === 0
          ? "border-emerald-300 bg-emerald-50 text-emerald-950"
          : "border-amber-300 bg-amber-50 text-amber-950"
      }`}
    >
      {issueCount === 0 ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <AlertTriangle className="h-4 w-4" />
      )}
      {issueCount === 0 ? "No validation issues" : `${issueCount} issue(s)`}
    </div>
  );
}

function buildShoppingRows(
  procurement: ProcurementLine[],
  stock: InventoryAllocation[],
  unplacedCuts: CutPiece[],
): ShoppingRow[] {
  const stockBySpec = stock.reduce<Map<string, number>>((map, plan) => {
    map.set(plan.specId, (map.get(plan.specId) ?? 0) + 1);
    return map;
  }, new Map());
  const blockedBySpec = unplacedCuts.reduce<Map<string, number>>((map, cut) => {
    map.set(cut.specId, (map.get(cut.specId) ?? 0) + 1);
    return map;
  }, new Map());

  return procurement.map((line) => {
    if (line.category === "linear") {
      const rawStockCount = stockBySpec.get(line.specId) ?? 0;
      const blockedCount = blockedBySpec.get(line.specId) ?? 0;
      return {
        id: line.id,
        item: line.name,
        category: "Raw stock",
        quantity: `${rawStockCount}`,
        detail:
          blockedCount > 0
            ? `${line.quantity - blockedCount} placed, ${blockedCount} over stock limit`
            : `${line.quantity} cuts, ${formatLength(line.totalCutLength ?? 0)} in total`,
      };
    }

    return {
      id: line.id,
      item: line.name,
      category: line.category === "fixed" ? "Fixed primitive" : "Connector",
      quantity: `${line.quantity}`,
      detail: line.category === "connector" ? "Deducts from attached members" : "Static dimensions",
    };
  });
}

function summarizeCuts(lengths: number[]): string {
  const counts = lengths.reduce<Map<number, number>>((map, length) => {
    map.set(length, (map.get(length) ?? 0) + 1);
    return map;
  }, new Map());

  return [...counts.entries()]
    .map(([length, count]) => `${count} x ${formatLength(length)} in`)
    .join(", ");
}

function formatLength(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function formatStructuralMembers(members: StructuralMember[]): string {
  const counts = members.reduce<Record<StructuralMember["kind"], number>>(
    (summary, member) => ({
      ...summary,
      [member.kind]: summary[member.kind] + 1,
    }),
    { "vertical-post": 0, "horizontal-beam": 0, rafter: 0 },
  );

  return `${counts["vertical-post"]} posts, ${counts["horizontal-beam"]} beams, ${counts.rafter} rafters`;
}

function formatBounds(bounds: EvaluatedElement["bounds"]): string {
  return `x ${formatLength(bounds.min.x)}-${formatLength(bounds.max.x)}, y ${formatLength(bounds.min.y)}-${formatLength(bounds.max.y)}, z ${formatLength(bounds.min.z)}-${formatLength(bounds.max.z)}`;
}

function formatPieceBounds(piece: AssemblyPiece): string {
  const { bounds } = piece;
  return `Bounds: x ${formatLength(bounds.min.x)}-${formatLength(bounds.max.x)}, y ${formatLength(bounds.min.y)}-${formatLength(bounds.max.y)}, z ${formatLength(bounds.min.z)}-${formatLength(bounds.max.z)}`;
}

function formatTerminal(
  terminal: EvaluatedConfiguration["connectionGraph"]["edges"][number]["start"],
): string {
  if (!terminal) return "Unconnected";
  return `${terminal.connectorId}:${terminal.portId ?? terminal.axis} (-${formatLength(terminal.deduction)} in)`;
}

function artifactColor(kind: AssemblyArtifact["kind"]): string {
  if (kind === "counter-slab" || kind === "counter-lip") return "#a855f7";
  if (kind === "masonry-skin") return "#64748b";
  if (kind === "face-frame") return "#f97316";
  if (kind === "support-rail") return "#dc2626";
  return "#f59e0b";
}

function assemblyPieceColor(kind: AssemblyPiece["kind"]): string {
  if (kind === "insert-body") return "#64748b";
  if (kind === "insert-face-frame") return "#f97316";
  if (kind === "insert-sleeve-frame") return "#f97316";
  if (kind === "counter") return "#a855f7";
  if (kind === "footing-board") return "#64748b";
  return "#2563eb";
}

function projectAssemblyPiece(
  piece: AssemblyPiece,
  view: SectionView,
) {
  if (view === "top") {
    return {
      x: piece.bounds.min.x,
      y: -piece.bounds.max.y,
      width: piece.bounds.max.x - piece.bounds.min.x,
      height: piece.bounds.max.y - piece.bounds.min.y,
    };
  }

  if (view === "front" || view === "back") {
    return {
      x: piece.bounds.min.x,
      y: -piece.bounds.max.z,
      width: piece.bounds.max.x - piece.bounds.min.x,
      height: piece.bounds.max.z - piece.bounds.min.z,
    };
  }

  return {
    x: piece.bounds.min.y,
    y: -piece.bounds.max.z,
    width: piece.bounds.max.y - piece.bounds.min.y,
    height: piece.bounds.max.z - piece.bounds.min.z,
  };
}

function nodeConnectorCubeBounds(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "node" }>,
  connectorSize: number,
) {
  return connectorCubeBoundsAtLocalPosition(section, connector.position, connectorSize);
}

function connectorCubeBoundsAtLocalPosition(
  section: IslandSection,
  position: { x: number; y: number; z: number },
  connectorSize: number,
) {
  const min = {
    x: connectorCubeMin(position.x, section.length, connectorSize),
    y: connectorCubeMin(position.y, section.depth, connectorSize),
    z: connectorCubeMin(position.z, section.height, connectorSize),
  };

  return {
    min,
    max: {
      x: min.x + connectorSize,
      y: min.y + connectorSize,
      z: min.z + connectorSize,
    },
  };
}

function connectorCubeMin(
  value: number,
  sectionDimensionValue: number,
  connectorSize: number,
) {
  if (value <= 0) return 0;
  if (value >= sectionDimensionValue - connectorSize) {
    return Math.max(0, sectionDimensionValue - connectorSize);
  }
  return value;
}

function surfaceConnectorPlateRect(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "surface" }>,
  view: SectionView,
  tubeWidth: number,
) {
  const position = surfaceConnectorVisualPosition(section, connector, tubeWidth);
  const hostMember = section.structuralMembers.find(
    (member) => member.id === connector.hostMemberId,
  );
  const hostAxis = hostMember ? structuralMemberAxisName(hostMember) : undefined;
  const normalAxis = connector.hostFace.slice(1).toLowerCase() as StructuralAxis;
  const faceThickness = Math.max(0.1875, tubeWidth * 0.2);
  const runLength = Math.max(0.75, tubeWidth * 1.25);
  const surfaceWidth = Math.max(0.5, tubeWidth * 0.75);
  const visibleAxes = visibleAxesForView(view);
  const sizeByAxis = Object.fromEntries(
    (["x", "y", "z"] as const).map((axis) => {
      if (axis === normalAxis) return [axis, faceThickness];
      if (axis === hostAxis) return [axis, runLength];
      return [axis, surfaceWidth];
    }),
  ) as Record<StructuralAxis, number>;
  const projectedCenter = projectLocalPoint(section, view, position);
  const width = sizeByAxis[visibleAxes.horizontal];
  const height = sizeByAxis[visibleAxes.vertical];

  return {
    x: projectedCenter.x - width / 2,
    y: projectedCenter.y - height / 2,
    width,
    height,
  };
}

function surfaceConnectorVisualPosition(
  section: IslandSection,
  connector: Extract<StructuralConnector, { kind: "surface" }>,
  tubeWidth: number,
) {
  const position = structuralConnectorPosition(section, connector, tubeWidth);
  if (!connector.attached) return position;

  const attachedMember = section.structuralMembers.find(
    (member) => member.id === connector.attached?.memberId,
  );
  if (!attachedMember) return position;

  const attachedAxis = structuralMemberAxisName(attachedMember);
  const attachedBounds = structuralMemberLocalBounds(attachedMember, tubeWidth);

  return {
    ...position,
    ...Object.fromEntries(
      (["x", "y", "z"] as const)
        .filter((axis) => axis !== attachedAxis)
        .map((axis) => [
          axis,
          (attachedBounds.min[axis] + attachedBounds.max[axis]) / 2,
        ]),
    ),
  } as StructuralMember["start"];
}

function visibleAxesForView(view: SectionView): {
  horizontal: StructuralAxis;
  vertical: StructuralAxis;
} {
  if (view === "top") return { horizontal: "x", vertical: "y" };
  if (view === "front" || view === "back") return { horizontal: "x", vertical: "z" };
  return { horizontal: "y", vertical: "z" };
}

function assemblyViewBox(
  pieces: AssemblyPiece[],
  view: SectionView,
  section?: IslandSection,
) {
  const projected = [
    ...pieces.map((piece) => projectAssemblyPiece(piece, view)),
    ...(section ? [projectSectionFrame(section, view)] : []),
  ];
  const minX = Math.min(...projected.map((piece) => piece.x));
  const minY = Math.min(...projected.map((piece) => piece.y));
  const maxX = Math.max(...projected.map((piece) => piece.x + piece.width));
  const maxY = Math.max(...projected.map((piece) => piece.y + piece.height));
  const pad = 8;

  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

function zoomViewBox(
  box: { x: number; y: number; width: number; height: number },
  zoom: number,
) {
  const width = box.width / zoom;
  const height = box.height / zoom;

  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

function projectSectionFrame(
  section: IslandSection,
  view: SectionView,
) {
  if (view === "top") {
    return {
      x: section.origin.x,
      y: -(section.origin.y + section.depth),
      width: section.length,
      height: section.depth,
    };
  }

  if (view === "front" || view === "back") {
    return {
      x: section.origin.x,
      y: -(section.origin.z + section.height),
      width: section.length,
      height: section.height,
    };
  }

  return {
    x: section.origin.y,
    y: -(section.origin.z + section.height),
    width: section.depth,
    height: section.height,
  };
}

function projectLocalPoint(
  section: IslandSection,
  view: SectionView,
  point: { x: number; y: number; z: number },
) {
  const world = {
    x: section.origin.x + point.x,
    y: section.origin.y + point.y,
    z: section.origin.z + point.z,
  };

  if (view === "top") {
    return projectWorldPoint(view, world);
  }

  if (view === "front" || view === "back") {
    return projectWorldPoint(view, world);
  }

  return projectWorldPoint(view, world);
}

function projectWorldPoint(
  view: SectionView,
  point: { x: number; y: number; z: number },
) {
  if (view === "top") {
    return { x: point.x, y: -point.y };
  }

  if (view === "front" || view === "back") {
    return { x: point.x, y: -point.z };
  }

  return { x: point.y, y: -point.z };
}

function projectLocalBounds(
  section: IslandSection,
  view: SectionView,
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  },
) {
  const min = {
    x: section.origin.x + bounds.min.x,
    y: section.origin.y + bounds.min.y,
    z: section.origin.z + bounds.min.z,
  };
  const max = {
    x: section.origin.x + bounds.max.x,
    y: section.origin.y + bounds.max.y,
    z: section.origin.z + bounds.max.z,
  };

  if (view === "top") {
    return {
      x: min.x,
      y: -max.y,
      width: max.x - min.x,
      height: max.y - min.y,
    };
  }

  if (view === "front" || view === "back") {
    return {
      x: min.x,
      y: -max.z,
      width: max.x - min.x,
      height: max.z - min.z,
    };
  }

  return {
    x: min.y,
    y: -max.z,
    width: max.y - min.y,
    height: max.z - min.z,
  };
}

function viewBoxFor(
  evaluated: EvaluatedConfiguration,
  view: "top" | "front",
) {
  const projected = [
    ...evaluated.elements.map((element) => element.bounds),
    ...evaluated.assemblyArtifacts.map((artifact) => artifact.bounds),
    {
      min: { x: 0, y: 0, z: 0 },
      max: {
        x: evaluated.boundary.dimensions.width,
        y: evaluated.boundary.dimensions.depth,
        z: evaluated.boundary.dimensions.height,
      },
    },
  ].map((bounds) => ({
    minX: bounds.min.x,
    maxX: bounds.max.x,
    minY: view === "top" ? bounds.min.y : bounds.min.z,
    maxY: view === "top" ? bounds.max.y : bounds.max.z,
  }));

  const minX = Math.min(...projected.map((bounds) => bounds.minX));
  const maxX = Math.max(...projected.map((bounds) => bounds.maxX));
  const minY = Math.min(...projected.map((bounds) => bounds.minY));
  const maxY = Math.max(...projected.map((bounds) => bounds.maxY));
  const pad = 4;

  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}
