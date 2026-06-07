export type Axis = "x" | "y" | "z";

export type Severity = "error" | "warning" | "info";

export type InventoryStatus = "available" | "partial" | "allocated" | "consumed";

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Dimensions3 {
  width: number;
  depth: number;
  height: number;
}

export interface Box3 {
  min: Vector3;
  max: Vector3;
}

export interface BoundarySpace {
  id: string;
  name: string;
  origin: Vector3;
  dimensions: Dimensions3;
}

export interface LinearPrimitiveSpec {
  category: "linear";
  id: string;
  name: string;
  material: string;
  profile: string;
  profileDimensions: Dimensions3;
  rawStockLength: number;
  maxCutLength: number;
}

export interface ConnectorPort {
  id: string;
  label: string;
  axis: Axis;
  deduction: number;
}

export interface FixedPrimitiveSpec {
  category: "fixed";
  id: string;
  name: string;
  dimensions: Dimensions3;
}

export interface ConnectorSpec {
  category: "connector";
  id: string;
  name: string;
  dimensions: Dimensions3;
  connectorType?: "1-way" | "2-way-inline" | "2-way-l" | "3-way" | "4-way" | "custom";
  ports?: ConnectorPort[];
  defaultDeduction: number;
  deductionByAxis?: Partial<Record<Axis, number>>;
}

export type ComponentSpec =
  | LinearPrimitiveSpec
  | FixedPrimitiveSpec
  | ConnectorSpec;

export interface LinearEndpoint {
  point: Vector3;
  connectorId?: string;
  portId?: string;
}

export interface PlacedLinearElement {
  kind: "linear";
  id: string;
  specId: string;
  axis: Axis;
  start: LinearEndpoint;
  end: LinearEndpoint;
}

export interface PlacedFixedElement {
  kind: "fixed";
  id: string;
  specId: string;
  position: Vector3;
}

export interface PlacedConnectorElement {
  kind: "connector";
  id: string;
  specId: string;
  position: Vector3;
}

export type PlacedElement =
  | PlacedLinearElement
  | PlacedFixedElement
  | PlacedConnectorElement;

export interface ClearanceZone {
  id: string;
  name: string;
  bounds: Box3;
  minimumWidth?: number;
}

export interface InventoryItem {
  id: string;
  specId: string;
  label: string;
  length: number;
  status: InventoryStatus;
  reservedForCutIds?: string[];
}

export interface CounterProfile {
  id: string;
  name: string;
  slabThickness: number;
  frontLipHeight: number;
  overhang: {
    front: number;
    back: number;
    left: number;
    right: number;
  };
}

export interface MasonrySkin {
  id: string;
  name: string;
  thickness: number;
  faces: Array<"front" | "back" | "left" | "right" | "top">;
}

export interface InsertSupportRail {
  id: string;
  face: "front" | "back" | "left" | "right";
  axis: Axis;
  offsetFromFloor: number;
  insetFromFace: number;
}

export interface ApplianceOrCabinetInsert {
  id: string;
  placedElementId?: string;
  name: string;
  body: Dimensions3;
  faceFrame: {
    width: number;
    height: number;
    projection: number;
  };
  requiredClearance: {
    side: number;
    rear: number;
    top: number;
  };
  supportRails: InsertSupportRail[];
}

export interface DomainAssembly {
  id: string;
  kind: "bbq-island" | "raised-bed";
  name: string;
  counterProfiles?: CounterProfile[];
  masonrySkins?: MasonrySkin[];
  inserts?: ApplianceOrCabinetInsert[];
}

export interface SpatialConfiguration {
  boundary: BoundarySpace;
  specs: ComponentSpec[];
  elements: PlacedElement[];
  inventory?: InventoryItem[];
  assemblies?: DomainAssembly[];
  clearanceZones?: ClearanceZone[];
}

export interface ValidationIssue {
  id: string;
  severity: Severity;
  code:
    | "UNKNOWN_SPEC"
    | "UNKNOWN_CONNECTOR"
    | "NON_AXIS_ALIGNED_LINEAR"
    | "NEGATIVE_CUT_LENGTH"
    | "STOCK_LENGTH_EXCEEDED"
    | "INVENTORY_SHORTAGE"
    | "UNKNOWN_CONNECTOR_PORT"
    | "PORT_AXIS_MISMATCH"
    | "BOUNDARY_EXCEEDED"
    | "CLEARANCE_OBSTRUCTED"
    | "CLEARANCE_TOO_SMALL"
    | "INSERT_SUPPORT_OUTSIDE_FRAME";
  message: string;
  elementId?: string;
  zoneId?: string;
}

export interface EvaluatedLinearElement {
  kind: "linear";
  id: string;
  spec: LinearPrimitiveSpec;
  axis: Axis;
  rawSpanLength: number;
  startDeduction: number;
  endDeduction: number;
  cutLength: number;
  bounds: Box3;
  connections: {
    start?: ConnectionTerminal;
    end?: ConnectionTerminal;
  };
}

export interface EvaluatedFixedElement {
  kind: "fixed";
  id: string;
  spec: FixedPrimitiveSpec;
  bounds: Box3;
}

export interface EvaluatedConnectorElement {
  kind: "connector";
  id: string;
  spec: ConnectorSpec;
  bounds: Box3;
}

export type EvaluatedElement =
  | EvaluatedLinearElement
  | EvaluatedFixedElement
  | EvaluatedConnectorElement;

export interface ProcurementLine {
  id: string;
  category: ComponentSpec["category"];
  specId: string;
  name: string;
  quantity: number;
  totalCutLength?: number;
  rawStockLength?: number;
}

export interface ConnectionTerminal {
  connectorId: string;
  portId?: string;
  axis: Axis;
  deduction: number;
}

export interface ConnectionGraphEdge {
  id: string;
  linearElementId: string;
  start?: ConnectionTerminal;
  end?: ConnectionTerminal;
}

export interface ConnectionGraphNode {
  connectorId: string;
  specId: string;
  ports: Array<{
    portId: string;
    axis: Axis;
    attachedLinearElementIds: string[];
  }>;
}

export interface ConnectionGraph {
  nodes: ConnectionGraphNode[];
  edges: ConnectionGraphEdge[];
}

export interface InventoryAllocation {
  inventoryItemId: string;
  inventoryLabel: string;
  specId: string;
  cuts: CutPiece[];
  remainingLength: number;
}

export interface AssemblyArtifact {
  id: string;
  assemblyId: string;
  kind:
    | "counter-slab"
    | "counter-lip"
    | "masonry-skin"
    | "insert-body"
    | "face-frame"
    | "support-rail";
  name: string;
  bounds: Box3;
  sourceId: string;
}

export interface EvaluatedConfiguration {
  boundary: BoundarySpace;
  elements: EvaluatedElement[];
  linearElements: EvaluatedLinearElement[];
  fixedElements: EvaluatedFixedElement[];
  connectorElements: EvaluatedConnectorElement[];
  validationIssues: ValidationIssue[];
  procurement: ProcurementLine[];
  connectionGraph: ConnectionGraph;
  inventoryAllocations: InventoryAllocation[];
  unallocatedCuts: CutPiece[];
  assemblyArtifacts: AssemblyArtifact[];
}

export interface CutPiece {
  id: string;
  specId: string;
  length: number;
  allocatedInventoryItemId?: string;
}

export interface StockCutPlan {
  stockItemId: string;
  specId: string;
  rawStockLength: number;
  cuts: CutPiece[];
  scrapLength: number;
  sourceInventoryItemId?: string;
  sourceLabel?: string;
  sourceStatus?: InventoryStatus;
}

export interface CutOptimizationResult {
  stock: StockCutPlan[];
  unplacedCuts: CutPiece[];
  totalScrapLength: number;
}
