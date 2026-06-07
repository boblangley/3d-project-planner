---
relationships:
  references:
    - bbq-structural-connector-lifecycle-rules-125f4d06
    - bbq-insert-supports-are-explicit-structure-only-6bc0002a
    - structural-placement-derives-run-span-after-movement-dba92b61
---

# CAD Assembly Kernel

The BBQ island planner should move toward a CAD assembly model built from physical parts, attachment features, and mates. The current structural member and connector rules have exposed the needed concepts, but the future model should make valid behavior fall out of correctly modeled parts rather than accumulating procedural exceptions.

## Intent

The planner is closer to a CAD assembly planner than a physics sandbox. The source of truth should be a deterministic assembly made of part instances and explicit mates. A 3D engine such as Three.js can provide scene graph transforms, camera control, picking, visual handles, and generated meshes, but it should host the model rather than define the domain rules.

The product family has finite needs. Most geometry can be generated algorithmically from part definitions because the dimensions and feature layouts are known.

The initial product survey for the DIY Outdoor Kitchen "Needed Extras" catalog lives in [DIY Outdoor Kitchen Needed Extras Part Survey](diyok-needed-extras-parts.md). That survey should inform the first data-driven part catalog and kit templates.

The first implementation slice is [Assembly-Backed Frame Editor Slice](assembly-backed-frame-editor-slice.md). That slice is decided and should be executed without re-scoping it smaller.

## Primitive Attachment Types

There are two primitive attachment types.

### Surface Mate

A surface mate connects two planes. Each participating surface exposes a single local slide vector. The two planes can connect only when their planes and slide vectors are compatible. Once connected, the moving part may slide along the supported one-dimensional axis within the bounds of the host surface.

For surface anchors, `localDirection` is the surface normal. The bracket mount normal and tube face normal must be inverse in world space. The slide axis is parallel to the tube's long axis and is exposed on all four tube faces.

Examples:

- A bracket mounting surface connects to a tube face.
- A bracket may slide along the tube face axis.
- A tube face should expose one slide vector aligned with the tube length.
- A bracket surface connection should expose one slide vector aligned with its allowed travel direction.

Surface mates should be represented as continuous placement along a one-dimensional parameter, not as a fixed point unless the surface definition itself has zero travel.

### Insert Mate

An insert mate connects directional features. It is all-or-nothing: connector or no connector. The inserted part must align to the exact 3D direction defined by the receiving feature.

Examples:

- A tube end inserts into a node connector socket.
- A tube end inserts into a bracket's perpendicular or angled connector socket.
- A node connector provides a finite set of directional insert features.

Insert mates should be represented as discrete feature-to-feature connections with compatible profiles, opposing/aligned directions as required, and occupancy constraints.

Insert anchors are chiral. Tube ends use a `tube-end` role. Node couplers, inline unions, and surface brackets expose `tube-host` anchors. A tube end can mate only with a tube host, and their world-space directions must be inverse. Insert anchors are single occupancy.


## Physical Part Model

Each part definition should generate visible geometry, collision geometry, attachment features, and selection/manipulation metadata.

### Tube

A tube is a 25mm square rectangular prism with variable length.

It has:

- two insert features, one at each end
- four surface features, one for each outside face
- each surface feature has one slide vector along the tube's length

The tube should not be modeled primarily as an abstract structural member with procedural endpoint rules. It is a physical part whose usable attachment features are generated from its dimensions and transform.

### Node Connector

A node connector is a one-inch square core with a finite set of directional insert features. Each connector type is a part definition with 2+ insert nodes/sockets.

The connector's validity comes from its available insert feature layout. If a 4-way or 5-way connector shape does not exist in the catalog, the planner cannot create that topology.

### Bracket Connector

A bracket connector has:

- one surface feature that mounts to a tube face
- one insert feature that accepts a tube end

The insert feature may be perpendicular to the surface mount or at a known angle such as 45 degrees. For angled brackets, the insert direction is defined relative to the surface mate's slide axis and may be flippable so it points either forward or backward along that axis.

The one-way couplers are concrete 90 degree surface bracket connectors in the DIY Outdoor Kitchen catalog. The machine-made variant has a 3 inch x 24mm x 1mm plate, and the welded variant has a 4 inch x 24mm x 1mm plate. Each mounts to the outside face of a tube and hosts one centered perpendicular tube. The 45 degree coupler uses the welded-style 4 inch plate with a centered insert angled 45 degrees toward the long axis. These should be modeled as surface bracket variants, not as free node connectors.

The 45 degree bracket's direction should be controlled by an instance-level `flip` parameter so one catalog/inventory item can point either direction along the host slide axis.

## Assembly Model

The assembly should be represented as part instances plus mate records.

```ts
type Assembly = {
  parts: PartInstance[];
  mates: Mate[];
};

type PartInstance = {
  id: string;
  definitionId: string;
  transform: Transform3;
  parameters?: {
    length?: number;
  };
};

type Mate = SurfaceMate | InsertMate;
```

Part definitions generate their attachment features in local coordinates. A Three.js representation can mirror this with a `THREE.Group` per part and child `Object3D` anchors for the generated features. The assembly kernel should still own the feature compatibility and mate semantics.

## Part Catalog

The initial part catalog can be finite and data driven:

- square tube, 25mm profile, variable length
- inline union connector, 21mm sleeve with two opposite tube inserts and no central cube
- node connector, L 2-way
- node connector, 3-way corner
- node connector, bespoke 4-way corner with local +X, -X, +Y, +Z inserts
- node connector, 3-way flat T
- node connector, 4-way flat
- surface bracket connector, 90 degree machine-made variant
- surface bracket connector, 90 degree welded variant
- surface bracket connector, 45 degree welded-style variant

Each definition should specify dimensions, generated geometry, generated features, and compatibility metadata. The 3D meshes can be generated procedurally from the same definition data.

Use millimeters internally for geometry and transforms. Tube length entry may accept inches because physical tube cutting is usually measured that way. Inch-based tube lengths snap to the nearest `1/6 in` before conversion to stored millimeters. Standard node couplers use a 25mm central cube body and a first-pass uniform insertion depth of 1.5 inches. Coupler instances are rotatable, so a catalog definition only needs one canonical local direction set.

Collision validation should start with oriented boxes. The parts are mostly rectangular tubes, plates, and cubes, so oriented boxes should be accurate enough for the first model without requiring exact mesh collision.

## Operations

The real domain rules should become a finite set of assembly operations over parts, features, and mates.

### Create Initial Cuboid

Create the starting rectangular cuboid frame from dimensions:

1. Create eight `coupler-90` corner instances.
2. Create twelve `tube-25mm-square` edge instances.
3. Mate each tube end to the matching corner coupler tube-host anchor.
4. Orient the cuboid in the global coordinate system.
5. Reject any configuration that would require a tube to point in global `-Z`.

This matches the current planner's starting frame, but represents it as real parts and insert mates.

### Attach Tube To Insert Feature

Given a tube end anchor and a tube-host anchor on a connector or bracket:

1. Check insert roles: `tube-end` can mate only to `tube-host`.
2. Check profile compatibility.
3. Align the anchors so their world-space directions are inverse.
4. Check single occupancy.
5. Reject the operation if the hosted tube would point in global `-Z`.
6. Validate collision and clearance.
7. Create an insert mate.

### Place Bracket On Tube Surface

Given a tube-face surface anchor, bracket-mount surface anchor, and slide offset:

1. Align the bracket mounting plane to the tube face.
2. Align the surface normals so they are inverse in world space.
3. Align the two surface slide axes.
4. Apply the slide offset within the tube surface bounds.
5. Reserve the bracket's center 25mm square on the host interval, with placement/occupancy tolerance within `1/8 in` (`3.175mm`).
6. Validate collision and occupancy rules.
7. Create a surface mate.

### Insert Perpendicular Tube Between Parallel Tubes

Given two parallel, aligned host tubes and a desired offset:

1. Select compatible facing tube surfaces.
2. Place a one-way surface bracket on each host tube by default.
3. Create a new tube spanning between the two bracket insert anchors.
4. Mate the new tube ends to the two brackets.
5. Validate that the span direction is not global `-Z`.

This operation captures the common "add a support between two aligned tubes" workflow without requiring the user to manually place two brackets and a tube.

### Flip 45 Degree Bracket

Given a mounted `surface-bracket-45` instance:

1. Toggle its instance-level `flip` parameter.
2. Recompute the bracket's tube-host insert anchor direction.
3. Preserve the surface mate.
4. Preserve any hosted tube insert mate only if the hosted tube can remain compatible after the flip.

The flip is an instance parameter, not a separate bracket type, so inventory can track one 45 degree bracket item.

### Slide Bracket

Given a surface-mounted bracket:

1. Adjust the surface mate offset along the host tube's slide axis.
2. Preserve the bracket's insert mate, if any.
3. Move the hosted tube and any connected downstream assembly with the bracket.
4. Validate host bounds, surface occupancy, collision, and global `-Z`.

### Slide Tube And Bracket Assembly

Given a tube attached to one or more surface brackets:

1. Treat the selected tube and its bracket-hosted connected component as a rigid selection.
2. Adjust the bracket surface mate offsets together.
3. Preserve all insert mates inside the selected component.
4. Validate that every moved bracket remains in bounds and does not collide or overlap occupied host intervals.

### Change Tube Length

Given a tube and a new length entered by the user:

1. Convert the entered inch value to internal millimeters.
2. Recompute the tube geometry and generated anchors.
3. Preserve compatible endpoint insert mates when their connected anchors can move with the endpoint.
4. Preserve surface brackets by equivalent slide offset when they remain within the new bounds.
5. Delete or reject out-of-bounds surface mates according to the chosen editing mode.

### Reorient Tube Axis

Given a tube whose long-axis direction should change:

1. Treat the operation as choosing a different world-space long-axis direction, not as rolling the tube like a drive shaft.
2. Use 90 degree increments against the global axes.
3. Preserve existing insert mates only when the new tube-end directions remain inverse-compatible with their hosts.
4. Preserve surface mates only when their host faces and slide axes remain compatible.
5. Reject any orientation that points the tube in global `-Z`.

Roll around the tube's own long axis is not a primary operation for the first model. The tube's square profile makes roll mostly irrelevant except for already-mounted surface brackets.

### Rotate Coupler

Given a node coupler:

1. Try 90 degree rotations around the local/global axes.
2. For each candidate rotation, recompute tube-host anchors.
3. Check every connected tube-end mate for inverse-direction compatibility.
4. Accept the first user-selected or solver-selected rotation that preserves all required mates.
5. Reject the operation if no rotation works.

Because coupler definitions and rotations are finite, compatible rotations can be precalculated per coupler type and occupied-anchor pattern.

### Swap Coupler

Given an existing node coupler and a replacement coupler definition:

1. Try every canonical orientation of the replacement coupler.
2. Map existing connected tube ends to compatible replacement tube-host anchors.
3. Preserve all possible insert mates.
4. Reject the swap if required connected tube ends cannot be preserved.

This uses the same compatibility check as coupler rotation.

### Promote Surface Bracket To Node Coupler

Given an attached one-way surface bracket on a host tube:

1. Choose a replacement node coupler that has a collinear pass-through pair for the host tube and at least one compatible perpendicular tube-host anchor.
2. Split the host tube at the bracket offset.
3. Delete the surface bracket.
4. Create the selected node coupler at the split.
5. Mate the two new host tube segments to the pass-through pair.
6. Mate the formerly bracket-hosted perpendicular tube to the compatible node anchor.

Valid replacement examples include a T-shaped flat 3-way, the bespoke 4-way corner, or a 4-way flat connector when their rotated anchors can satisfy the existing tube directions.

### Split Tube With Pass-Through Coupler

Given a tube, an offset, and a connector with a collinear pair of tube-host anchors:

1. Remove or replace the original tube instance.
2. Create two tube instances for the resulting segments.
3. Create the connector instance at the requested offset.
4. Mate the two tube segments to the connector's collinear pass-through anchors.
5. Rehost any surface-mounted brackets from the original tube onto the appropriate new tube segment with adjusted offsets.

This operation is valid only for connectors with an opposite-direction pass-through pair. It excludes `coupler-90` and any connector orientation that cannot host both resulting tube ends.

### Delete Tube

Given a tube:

1. Delete the tube.
2. Delete any surface brackets mounted to that tube.
3. Delete or detach any tubes hosted only through those deleted brackets.
4. Leave unrelated connected components intact when their mates remain valid.

### Join Collinear Tubes By Removing Node Coupler

Given a node coupler with two collinear tube connections:

1. Select the two same-vector tube segments to join.
2. Remove the connector.
3. Remove the two tube segment instances.
4. Create one joined tube instance.
5. Rehost surface mates from the removed tube segments onto the joined tube at equivalent offsets.
6. For any perpendicular tube connections on the removed connector, replace the node connection with a one-way surface bracket on the joined tube when the bracket can represent the same direction.

If the connector has attached tubes that cannot be represented by surface brackets after the join, removal is not a valid operation.

### Delete Coupler

Given a node coupler:

1. If it can be reduced to a collinear join, use `Join Collinear Tubes By Removing Node Coupler`.
2. Otherwise reject deletion unless the user explicitly chooses to delete the connected tubes or detach the connected component.

### Replace Bracket Variant

Given a surface bracket:

1. Swap between compatible surface bracket definitions.
2. Preserve the surface mate if the new footprint fits within the host bounds and occupancy interval.
3. Preserve the hosted tube insert mate if the new insert direction remains compatible.

This allows edits such as replacing a one-way bracket with a 45 degree bracket when geometry permits, while preserving the inventory distinction between machine-made, welded, and 45 degree brackets.

## Validation

Invalid states should fall out of general assembly checks:

- no compatible feature is available
- directions or planes do not align
- an insert feature is already occupied
- a surface offset falls outside the host bounds
- two solids collide or violate clearance
- a requested connector layout does not exist in the part catalog
- a transform would break an existing mate
- a hosted tube would point in global `-Z`

The goal is to avoid encoding separate ad hoc prohibitions for every observed invalid BBQ configuration.

## Relationship To Current Implementation

The existing BBQ structural member and connector logic should be treated as evidence for the assembly kernel's needed behavior, not as the final model. Current concepts map roughly as follows:

| Current concept | Assembly kernel concept |
| --- | --- |
| Structural member | Tube part instance |
| Node connector | Node connector part instance with insert features |
| Surface connector | Bracket connector part instance plus surface mate |
| Member endpoint | Tube insert feature |
| Connector direction | Insert feature direction |
| Surface bracket offset | Surface mate slide parameter |

The existing tests and memories are useful migration knowledge. They can become acceptance tests for assembly operations such as inserting a node into a tube, removing a joinable node, placing a bracket on a tube surface, and rehosting brackets during tube splits or joins.

## Open Questions

- Which specified operations are needed in the first usable vertical slice?
