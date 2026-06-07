---
relationships:
  implements:
    - cad-assembly-kernel
  references:
    - diyok-needed-extras-parts
    - bbq-structural-connector-lifecycle-rules-125f4d06
    - bbq-insert-supports-are-explicit-structure-only-6bc0002a
    - structural-placement-derives-run-span-after-movement-dba92b61
---

# Assembly-Backed Frame Editor Slice

This is the first implementation slice for replacing the current BBQ island structural rule model with a CAD-style assembly kernel. The decision has been made: build this slice, do not reopen whether the slice should be smaller.

The purpose of this slice is to prove and begin adopting the new foundation: physical part instances, generated anchors, explicit mates, procedural geometry, and validated operations.

## Working Instruction

Create a fresh worktree for this implementation and carry the slice through to a working, testable state. Do not stop after a narrow proof such as rendering a cuboid. The target is an assembly-backed frame editor that can create, render, inspect, and edit a real part/mate assembly.

Treat the existing app as a spike. Do not preserve the current structural rule model, do not port its abstractions, and do not use it as the controlling design. The new assembly kernel is the source of truth for this slice.

Do not inspect the existing structural-model implementation unless a concrete integration issue requires it. If inspection is unavoidable, use it only to understand the old behavior being replaced, then return to this document and the assembly-kernel docs as the authority.

## Carry Forward From The Spike

Carry forward these product and workflow lessons:

- start from a rectangular cuboid frame
- support 3D view rotation/orbit
- support selecting physical members/parts
- support changing tube lengths
- support inserting perpendicular tubes between two parallel aligned tubes
- use surface brackets by default for perpendicular tube insertion
- support sliding brackets along host tubes
- support sliding tube-and-bracket assemblies together
- keep operations visible enough that invalid states are explainable

Do not carry forward:

- the old structural rule model
- inferred hidden connector behavior
- UI behaviors that depend on the old model's abstractions
- procedural exceptions that are better represented as part anchors, mates, or assembly operations
- existing interaction code if it fights the assembly model

## Definition Of Done

This slice is done when the app has a usable assembly-backed path that:

- creates an initial rectangular cuboid from real catalog parts and insert mates
- renders the assembly in 3D
- allows part selection and basic inspection of part, anchor, and mate data
- supports the core edit operations listed below
- validates anchor compatibility, occupancy, global `-Z`, and first-pass oriented-box collision
- has focused automated tests for catalog generation, mate compatibility, and operation behavior
- can be run locally from the dev server

The slice does not need beautiful manipulation handles. Correct assembly behavior matters more than polish.

## Build Scope

### Assembly Kernel

Implement the core assembly model:

- `Assembly`
- `PartInstance`
- `PartDefinition`
- generated anchors/features
- `InsertMate`
- `SurfaceMate`
- transforms
- validation result types
- operation result types

Use millimeters internally. User-entered tube lengths may be inches, snapped to the nearest `1/6 in`, then converted to stored millimeters.

Reject any operation that would make a hosted tube point in global `-Z`.

### Anchors

Implement anchor generation from part definitions.

Insert anchors:

- use roles: `tube-end` and `tube-host`
- are chiral
- mate only when roles are complementary
- require inverse world-space directions
- are single occupancy
- are compatible only with 25mm tube ends in the first catalog

Surface anchors:

- use roles: `tube-face` and `bracket-mount`
- use `localDirection` as the surface normal
- mate only when normals are inverse in world space
- expose a slide axis parallel to tube local X
- reserve the bracket center `25mm` square on the host interval
- require placement/occupancy accuracy within `1/8 in` (`3.175mm`)

45 degree brackets use an instance-level `flip` parameter so one inventory item can point either direction along the host slide axis.

### Initial Catalog

Implement these part definitions:

| Definition | Kind | Required behavior |
| --- | --- | --- |
| `tube-25mm-square` | tube | variable length, two tube-end anchors, four tube-face anchors |
| `coupler-union-inline` | inline insert connector | 21mm sleeve, 3 in long, two opposite tube-host anchors, no central cube |
| `surface-bracket-one-way-machine` | surface bracket connector | 3 in x 24mm x 1mm plate, centered perpendicular 25mm tube-host anchor |
| `surface-bracket-one-way-welded` | surface bracket connector | 4 in x 24mm x 1mm plate, centered perpendicular 25mm tube-host anchor |
| `surface-bracket-45` | surface bracket connector | 4 in x 24mm x 1mm plate, centered 45 degree tube-host anchor, flippable along slide axis |
| `coupler-90` | node connector | 25mm cube body, two 25mm tube-host anchors at 90 degrees |
| `coupler-3way-corner` | node connector | 25mm cube body, three orthogonal 25mm tube-host anchors |
| `coupler-4way-corner-bespoke` | node connector | 25mm cube body, local +X, -X, +Y, +Z tube-host anchors |
| `coupler-3way-flat` | node connector | 25mm cube body, T-shaped coplanar tube-host anchors |
| `coupler-4way-flat-25mm` | node connector | 25mm cube body, four coplanar tube-host anchors |

Standard node couplers use a first-pass uniform insertion depth of `1.5 in`.

Do not implement telescoping tubes, connector plates, catcher track, floor supports, leveling feet, hidden bar supports, air vents, electrical boxes, stucco, adhesive, or tooling in this slice.

### Geometry And Collision

Generate simple 3D geometry from the catalog:

- tubes as rectangular prisms
- coupler bodies as cubes plus simple insert geometry or visual anchors
- bracket plates as thin boxes plus simple insert geometry or visual anchors

Collision validation starts with oriented boxes. Do not build exact mesh collision in this slice.

Add a debug overlay or inspection mode for anchors and mates if it helps implementation and testing.

### Rendering And Interaction

Use Three.js for the assembly-backed 3D view. Existing app shell/layout code may be reused if it is mechanically helpful, but the existing structural UI and rendering assumptions should not drive this slice. The UI only needs to be good enough to dogfood the assembly model.

Implement:

- 3D view rotation/orbit
- part selection
- selected part inspection
- mate/anchor inspection
- operation controls through buttons, panels, context actions, or simple debug forms

Do not spend the slice on polished direct-manipulation handles. The interaction priority is correctness and visibility.

## Required Operations

Implement enough operation behavior to make the model meaningfully editable.

### Create Initial Cuboid

Create a rectangular cuboid from dimensions:

- eight `coupler-90` corner instances
- twelve `tube-25mm-square` edge instances
- insert mates for every tube end
- no hosted tube pointing global `-Z`

### Attach Tube To Insert Feature

Create an insert mate when:

- roles are `tube-end` to `tube-host`
- profiles match
- directions are inverse in world space
- both anchors are unoccupied
- global `-Z` is not violated

### Place Bracket On Tube Surface

Create a surface mate when:

- roles are `bracket-mount` to `tube-face`
- normals are inverse in world space
- slide axes align
- offset is within bounds
- the reserved center `25mm` square does not conflict beyond the `3.175mm` tolerance

### Insert Perpendicular Tube Between Parallel Tubes

Given two parallel aligned tubes:

- choose compatible facing surfaces
- place one-way surface brackets by default
- create the perpendicular tube between them
- mate both tube ends to the brackets

This is a required workflow operation, not optional polish.

### Flip 45 Degree Bracket

Toggle the instance `flip` value, recompute the insert anchor, and preserve existing mates only if they remain valid.

### Slide Bracket

Move a bracket along its host tube face by changing the surface mate offset. Move any hosted tube/downstream connected component with it.

### Slide Tube And Bracket Assembly

Move a selected tube plus its bracket-hosted connected component by adjusting the relevant bracket surface mate offsets together.

### Change Tube Length

Accept inch input, snap to nearest `1/6 in`, convert to millimeters, regenerate anchors and geometry, and preserve valid existing mates.

### Rotate Coupler

Rotate a coupler in 90 degree increments and preserve connected tube mates only when compatibility remains valid. Precompute finite rotations if useful.

### Swap Coupler

Replace a coupler with another coupler definition when some rotation of the replacement can preserve all required connected tube ends.

### Promote Surface Bracket To Node Coupler

Replace an attached one-way surface bracket with a node coupler that has:

- a collinear pass-through pair for the host tube
- a compatible anchor for the formerly bracket-hosted perpendicular tube

Split the host tube, remove the bracket, create the coupler, and reattach the relevant tube ends.

### Split Tube With Pass-Through Coupler

Split a tube at an offset with a connector that has a collinear pass-through pair. This excludes `coupler-90` and any connector orientation that cannot host both resulting tube ends.

### Delete Tube

Delete the tube and any surface brackets mounted to it. Delete or detach dependent bracket-hosted tubes according to the operation mode chosen during implementation.

### Join Collinear Tubes By Removing Node Coupler

Remove a node coupler between two collinear tube segments, create one joined tube, rehost surface mates, and replace perpendicular node connections with one-way surface brackets when possible.

### Replace Bracket Variant

Swap compatible surface bracket definitions when the surface footprint and hosted tube direction remain valid.

## Testing Requirements

Add focused automated tests for:

- catalog part definitions generate expected anchors
- tube end and tube host insert anchors require inverse directions
- surface anchors require inverse normals and compatible slide axes
- initial cuboid creates the expected part and mate counts
- inch tube length input snaps to `1/6 in` and stores millimeters
- `-Z` hosted tube placement is rejected
- bracket placement reserves the expected center interval
- 45 degree bracket flip changes the hosted tube direction
- coupler rotation and swap preserve compatible mates and reject incompatible ones
- tube split and join preserve/rehost expected mates

Prefer tests that exercise the assembly kernel directly. UI tests can be lighter unless interaction bugs appear.

## Non-Goals

Do not spend this slice on:

- exact mesh collision
- production-quality manipulation gizmos
- BOM generation
- persistence migrations
- connector plates
- telescoping spacer kits
- floor supports
- leveling feet
- vents or electrical accessories
- visual photorealism

## Worktree Instruction

Start this in a fresh worktree. Suggested path:

```bash
mkdir -p /workspaces/worktrees
git -C /workspaces/3d-project-planner worktree add -b assembly-backed-frame-editor /workspaces/worktrees/assembly-backed-frame-editor
```

If the branch or path already exists, choose a clear equivalent name. The next session should begin from this document and implement, not re-plan the slice.
