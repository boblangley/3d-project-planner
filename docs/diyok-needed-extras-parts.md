---
relationships:
  supports:
    - cad-assembly-kernel
  references:
    - bbq-structural-connector-lifecycle-rules-125f4d06
    - bbq-insert-supports-are-explicit-structure-only-6bc0002a
    - structural-placement-derives-run-span-after-movement-dba92b61
---

# DIY Outdoor Kitchen Needed Extras Part Survey

This document summarizes the relevant modelable parts found in the DIY Outdoor Kitchen "Needed Extras" catalog pages 1 through 4, scanned on 2026-06-06.

Source category pages:

- <https://diyoutdoorkitchen.com/diy-bbq-island-modules/needed-extras/?page=1>
- <https://diyoutdoorkitchen.com/diy-bbq-island-modules/needed-extras/?page=2>
- <https://diyoutdoorkitchen.com/diy-bbq-island-modules/needed-extras/?page=3>
- <https://diyoutdoorkitchen.com/diy-bbq-island-modules/needed-extras/?page=4>

The extraction is intentionally model-facing. Product pricing, shipping, and marketing copy are ignored except where a kit bill of materials clarifies part geometry.

## Catalog Takeaways

The core assembly system is built around 25mm square galvanized steel tube. Most structural products are combinations of a small number of geometric primitives:

- fixed-length 25mm square tubes
- inline union sleeves for joining tube ends
- insert couplers with finite direction sets
- surface-mounted or plate-like accessories
- kit products that bundle the primitives into a named operation or module shape

Use millimeters internally for geometry and transforms. Tube cutting inputs may still be entered in inches because that is how physical tube lengths are measured and cut.

The important modeling decision is to keep primitive part definitions separate from kit definitions. A kit should instantiate, constrain, or suggest multiple primitive parts; it should not introduce a separate magic geometry unless the physical kit includes a unique part.

## Structural Primitives

### 25mm Square Tube

Source: [4 ft Galvanized Steel Tube for Connectubes System](https://diyoutdoorkitchen.com/4-ft-galvanized-steel-tube-for-connectubes-system/)

This is the primary tube profile. The product page identifies it as 25mm galvanized heavy-duty steel tube and 18 gauge steel.

Model as:

- square tube part family
- nominal outer profile: 25mm x 25mm
- variable length, with catalog defaults such as 4 ft
- insert mate at each end
- four surface mate regions along the outer faces
- tube axis slide vector for each surface region

Open modeling detail: the planner can begin with solid rectangular-prism collision even though the physical part is hollow tube. Hollow interior matters for insert fit, but the visual/collision shape can start as a square prism plus end sockets.

Collision validation should use oriented boxes for the first model.

### Union Coupler / Inline Sleeve

Sources:

- [Union Coupler (1 pc)](https://diyoutdoorkitchen.com/adaptor-tube-1-pc/)
- [Adaptor Tube](https://diyoutdoorkitchen.com/adaptor-tube/)

The union coupler is the only smaller insert tube needed for the initial model. The product page describes a 3 inch long x 21mm steel tube that slips into 25mm tube and connects two 25mm tubes together.

Model as:

- single-axis 2-way inline insert connector
- no central 25mm cube body
- 21mm sleeve body
- two opposite 25mm tube-end insert features
- uniform insertion depth: 1.5 in per side
- fixed sleeve length: 3 in

This is a connector, not a telescoping tube family. It joins two collinear 25mm tube ends without adding the 25mm central cube body used by node couplers.

### Telescoping Tubes

Sources:

- [CTT Telescopic](https://diyoutdoorkitchen.com/ctt-telescopic-range-22-75-29/)
- [Below Grill Tubes](https://diyoutdoorkitchen.com/below-grill-tubes-2-pack/)
- [No Cut Long Range Telescoping Spacer](https://diyoutdoorkitchen.com/no-cut-long-range-telescoping-spacer-ne-lr/)

The 21mm and 20mm x 21mm tubes appear in telescoping kits as nested extension members.

Defer as:

- physical kit/BOM details
- possible future adjustable-span implementation
- not part of the initial structural assembly kernel

Do not model telescoping tubes initially. Use fixed-length 25mm tubes and the inline union connector for first-pass tube assembly behavior.

## Surface Bracket Connectors

### One-Way Surface Bracket Coupler, Machine Made

Source: [Connectube 1 Way Coupling (Machine Made)](https://diyoutdoorkitchen.com/connectube-1-way-coupling-machine-made-/)

This is one surface bracket connector variant. It mounts to the outside face of a tube and hosts a single perpendicular tube connection.

Model as:

- thin rectangular sheet-metal mounting plate
- plate length: 3 in
- plate width: 24mm
- plate thickness: 1mm
- one surface mate feature on the bottom of the plate, compatible with a 25mm tube face
- one slide vector along the host tube axis
- one centered perpendicular 25mm-compatible insert feature rising from the plate
- insert occupancy: one hosted tube end
- surface occupancy: the plate footprint reserves a span on the host tube face
- screw holes are not modeled

This should not be modeled as a free node connector. It is a "surface mate plus perpendicular insert mate" part.

### One-Way Surface Bracket Coupler, Welded

Source: [1 Way Coupling (Welded) - Male](https://diyoutdoorkitchen.com/1-way-coupling-welded-male/)

This is the welded surface bracket connector variant. It has the same mate behavior as the machine-made bracket, but the bracket footprint is longer.

Model as:

- thin rectangular sheet-metal mounting plate
- plate length: 4 in
- plate width: 24mm
- plate thickness: 1mm
- one surface mate feature on the bottom of the plate, compatible with a 25mm tube face
- one slide vector along the host tube axis
- one centered perpendicular 25mm-compatible insert feature rising from the plate
- insert occupancy: one hosted tube end
- surface occupancy: the plate footprint reserves a span on the host tube face
- screw holes are not modeled

This should not be modeled as a free node connector. It is the longer-footprint variant of the one-way surface bracket.

### 45 Degree Coupler

Source: [45 Degree Coupler](https://diyoutdoorkitchen.com/45-degree-coupler/)

This is a surface bracket connector whose hosted tube leaves the mounted tube at 45 degrees along the host tube's slide axis. The bracket can be flipped so the 45 degree insert direction points either way along that axis. Its bracket body is the same as the welded one-way surface bracket.

Model as:

- thin rectangular sheet-metal mounting plate
- plate length: 4 in
- plate width: 24mm
- plate thickness: 1mm
- one surface mate feature on the bottom of the plate, compatible with a 25mm tube face
- one slide vector along the host tube axis
- one centered 25mm-compatible insert feature angled 45 degrees toward the surface slide axis
- insert direction has two allowed orientations, flipped forward or backward along the surface slide axis
- surface occupancy: the bracket footprint reserves a span on the host tube face
- possible cut/trim requirements for downstream tube runs
- screw holes are not modeled

This is not a free node connector. It is the angled variant of the surface bracket connector family.

## Insert Couplers

### 90 Degree Coupler

Source: [Connectube 90 Degree Coupling](https://diyoutdoorkitchen.com/connectube-90-degree-coupling/)

This is a steel coupler connecting 25mm steel tubes at a right angle.

Model as:

- 25mm central cube body
- connector body with two 25mm-compatible insert features
- feature directions at 90 degrees
- likely coplanar L shape
- occupancy: each insert feature accepts one tube end
- uniform insertion depth: 1.5 in

This belongs in the finite node connector catalog as a two-direction insert node.

All coupler instances are rotatable. Part definitions only need one canonical local direction set; placement transforms provide the other orientations.

### 3-Way Corner Coupler

Source: [Connectube 3 Way Corner Coupling](https://diyoutdoorkitchen.com/connectube-3-way-corner-coupling/)

This connects 25mm steel tube in a three-axis corner.

Model as:

- cube-like connector body
- 25mm central cube body
- three orthogonal 25mm-compatible insert features
- directions equivalent to a corner of a box, such as +X, +Y, +Z in local coordinates
- no opposite continuation on any axis unless a separate 4-way or 5-way part is chosen
- uniform insertion depth: 1.5 in

This is the core part for module corners and cutout kit corners.

### Bespoke 4-Way Corner Coupler

Source: custom welded part.

This is a custom 25mm-system part. Conceptually, it is a 3-way corner coupler with one additional insert feature in a negative local coordinate direction. Model its canonical local directions as +X, -X, +Y, +Z. Other physical orientations are represented by rotating the coupler instance, not by defining separate part shapes.

Model as:

- cube-like connector body
- 25mm central cube body
- four 25mm-compatible insert features
- three insert features matching a 3-way corner
- one added opposite-direction insert feature on the X axis
- occupancy: each insert feature accepts one tube end
- uniform insertion depth: 1.5 in

This is not the catalog 40mm 4-way coupler. It is a supported bespoke 25mm node connector and should be represented as its own catalog definition.

### 3-Way Flat Coupler

Source: [Connectube 3 way FLAT Coupling](https://diyoutdoorkitchen.com/connectube-3-way-flat-coupling/)

This connects 25mm tubes in a flat three-way layout. Its layout is T-shaped.

Model as:

- 25mm central cube body
- connector body with three 25mm-compatible insert features
- all feature directions coplanar
- T-shaped local direction set, such as +X, -X, +Y
- uniform insertion depth: 1.5 in

This is different from the 3-way corner coupler because it does not introduce the third vertical/depth axis.

### 4-Way Flat Coupler

Source: [4 Way Flat Coupler](https://diyoutdoorkitchen.com/4-way-flat-coupler/)

This coupler works with 25mm x 25mm steel tubes and is made from 18 gauge galvanized structural steel.

Model as:

- 25mm central cube body
- connector body with four 25mm-compatible insert features
- all feature directions coplanar
- cross or X/Y flat-node layout
- no vertical/depth insert unless a distinct connector provides it
- uniform insertion depth: 1.5 in

This is the 25mm-system four-way part.

### 4-Way Coupler For 1 5/8 Inch / 40mm Tube

Source: [Connectube 4 Way Coupling](https://diyoutdoorkitchen.com/connectube-4-way-coupling/)

The product page says this only works with 1 5/8 inch, 40mm tube. That makes it a separate tube-family connector and out of scope for the first planner catalog.

Model as:

- separate 40mm tube family connector
- four insert features compatible with 40mm tube, not 25mm tube
- incompatible with 25mm tube ends unless an adapter part exists

This should be excluded from the first assembly kernel. Do not silently coerce it into the 25mm catalog.

## Plates, Brackets, And Surface Attachments

### Connector Plates

Source: [Connector Plates](https://diyoutdoorkitchen.com/connector-plates/)

Connector plates are used to connect modules. The product page says 2 to 4 plates are used per union of modules, with a minimum purchase of four units.

Treat as:

- real-world fastening/stiffening hardware
- optional BOM item for module unions
- not a topology-bearing part in the first model
- not required for planner validation while physics/load transfer is out of scope

Connector plates are necessary in the physical build, but they do not need to be modeled initially, and may never need geometry in the planner. Module-to-module relationships should be represented by the assembled frames and their intended placement constraints, not by plate physics.

### Floor Supports With Dog Ears

Source: [DIY Outdoor Kitchen Floor Supports](https://diyoutdoorkitchen.com/diy-outdoor-kitchen-floor-supports/)

These are pre-cut for standard 31.5 inch depth modules. The product page says welded dog ears secure them to the inside bottom of the module frame. A four-pack is for 4 ft modules and a six-pack is for 8 ft modules. Placement guidance says each inside bottom close to an end frame, with remaining supports about 16 inches on center. The page warns they are for floor only, not countertop support.

Model as:

- transverse support tube for standard module depth
- length matched to 31.5 inch module depth
- two welded ear/tab surface features at ends
- surface or fastener mates to inside bottom frame tubes
- floor-only semantic tag
- recommended placement pattern generator

This should not be modeled as a generic free tube because the dog ears change the attachment primitive and allowed usage.

### Catcher Track 4ft

Source: [Catcher Track 4ft](https://diyoutdoorkitchen.com/catcher-track-4ft/)

This is a 4 ft heavy-duty galvanized steel track used for platforms and custom-height backsplash kits.

Defer as:

- platform or backsplash support detail
- possible future BOM/accessory item
- not part of the initial structural assembly kernel

Do not model catcher track initially. It does not define the primary tube-frame topology.

### Bar Gap Filler

Source: [Bar Gap Filler](https://diyoutdoorkitchen.com/bar-gap-filler/)

The product page describes steel track pre-cut to bend and slip over an existing overhang at an angle. It has two size variants: 2.5 inch for stud-and-track overhangs and 1.5 inch for steel-tube overhangs. The opposite side is cut depending on the angle.

Model as:

- bendable/pre-notched track or sheet part
- variant width: 2.5 inch or 1.5 inch
- angle parameter
- surface mate to existing overhang/tube run
- trim-side parameter based on corner angle

This is likely a later-stage finish/support part, not needed for the first structural kernel unless bar overhang modeling is in scope.

### Structural Hidden Bar Supports

Source: [Structural Hidden Bar Supports](https://diyoutdoorkitchen.com/structural-hidden-bar-supports-sold-out/)

These are special L supports for the system. The product page gives size 12 inches x 12 inches x 1.5 inches and says they support split bar counter overhangs and level 12 inch overhang kits.

Model as:

- L-shaped support bracket
- dimensions: 12 in x 12 in x 1.5 in
- two perpendicular support arms or faces
- surface mates to frame and countertop/overhang structure
- load/support semantic tag

This is a good example of a surface-attachment bracket whose validation may eventually involve overhang span and support requirements, not just geometric fit.

### Leveling Foot

Source: [New No Drill Leveling Foot for DIY Outdoor Kitchen Frames](https://diyoutdoorkitchen.com/new-no-drill-leveling-foot-for-diy-outdoor-kitchen-frames/)

The leveling foot has a 1/2 inch to 6 inch range and is described as heavy-duty zinc-coated steel. It is designed to install without drilling.

Model as:

- adjustable foot assembly
- vertical extension parameter with range 0.5 in to 6 in
- bottom ground-contact pad
- top attachment feature compatible with bottom frame/tube
- no-drill attachment metadata

This is a support/leveling accessory rather than a tube connector, but it affects module elevation and ground contact.

## Telescoping And Spacer Assemblies

### No-Cut 22 Piece Spacer Kit

Source: [No-Cut 22 PC Spacer Kit for DIY Frame Kits - NE-SP22](https://diyoutdoorkitchen.com/no-cut-22-pc-spacer-kit-for-diy-frame-kits-ne-sp22/)

This kit makes the framing system a no-cut system. It includes a pair of each telescoping range set. The listed ranges are 4.5 to 6 inches, 5.75 to 7 inches, 7.75 to 9 inches, 9.5 to 12 inches, and 10.75 to 13 inches. The page notes that 3-way corners come with cutout kits, not this spacer kit.

Model as:

- kit definition made of telescoping spacer assemblies
- range-constrained tube/sleeve pairs
- selectable variant by required span
- no included 3-way corner connector

The planner operation is "fill span without cutting" by choosing the shortest compatible telescoping assembly range.

### No Cut Long Range Telescoping Spacer

Source: [No Cut Long Range Telescoping Spacer - NE-LR](https://diyoutdoorkitchen.com/no-cut-long-range-telescoping-spacer-ne-lr/)

This is a single telescoping section, not a pair. The page lists a standard range of 24.75 inches to 41.5 inches and an XL range of 37.5 inches to 55 inches. It telescopes between two 3-way corners and includes a 3 inch x 25mm steel tube, a 20mm x 21mm steel tube, and a 21mm x 25mm steel tube. The range is measured outside of the 3-way corners.

Model as:

- telescoping assembly part or subassembly
- variant: standard range 24.75 in to 41.5 in
- variant: XL range 37.5 in to 55 in
- components: 25mm tube, 21mm intermediate tube, 20mm x 21mm inner tube
- endpoint insert compatibility with 3-way corner couplers
- span measured outside connector bodies

This is a strong candidate for a first-class adjustable subassembly because it has several nested physical members but behaves as one length-adjustable span during planning.

### Countertop Tube, Non-Telescoping

Source: [CTT (Non-Telescoping) Countertop Support w/ 1 way couplers](https://diyoutdoorkitchen.com/ctt-non-telescoping-countertop-support-w-1-way-couplers/)

This countertop tube is pre-cut for 32 inch depth modules. The page says it includes two one-way couplers and one 29.75 inch steel tube for 31.5 inch depth.

Model as:

- support subassembly
- one 29.75 inch 25mm tube
- one one-way coupler at each end
- intended span: standard 31.5 inch depth module
- countertop-support semantic tag

This can be generated as two insert mates from the tube ends to one-way couplers.

### Countertop Tube, Telescopic

Source: [CTT Telescopic (range 22.75"-29")](https://diyoutdoorkitchen.com/ctt-telescopic-range-22-75-29/)

This is for custom modules trimmed smaller than the standard 31.5 inch depth. The page lists a range of 22.75 inches to 29 inches and includes one 12 inch x 21mm tube, one 21 inch x 25mm tube, and two one-way couplers, one male and one female.

Model as:

- adjustable countertop support subassembly
- extension range: 22.75 in to 29 in
- components: 12 in x 21mm tube, 21 in x 25mm tube, one male one-way coupler, one female one-way coupler
- one telescoping overlap mate
- two end insert mates
- countertop-support semantic tag

This is the smaller-depth counterpart to the fixed CTT.

### Below Grill Tubes

Source: [Below Grill Tubes (2 pack)](https://diyoutdoorkitchen.com/below-grill-tubes-2-pack/)

This two-pack is described as 1 inch vertical tubes for doors below a grill. The page gives 25mm x 25mm, 32.75 inch height, cut to fit, and includes two 21 inch x 25mm tubes, two 20 inch x 21mm tubes, two one-way male couplers, and two one-way female couplers.

Model as:

- pair of telescoping vertical support subassemblies
- nominal height: 32.75 in, cut/adjusted to fit
- per support: 25mm outer tube, 20mm x 21mm inner tube, male one-way, female one-way
- insert mates at top and bottom
- vertical-support semantic tag
- association with door/grill cutout placement

This looks similar to a telescoping VT support but with grill/door-specific placement.

## Vertical Tubes And Module Supports

### Standard Vertical Tube With One-Way Couplers

Source: [VT (Vertical Tube) w/ 1 Way Couplers](https://diyoutdoorkitchen.com/vtt-vertical-tubes/)

This includes two one-way couplers and one vertical tube 32.75 inches long to fit standard 35 inch module height.

Model as:

- vertical support subassembly
- one 32.75 inch 25mm tube
- one one-way coupler at each end
- intended module height: 35 in
- vertical-support semantic tag

The difference between physical tube length and module height implies connector bodies account for the remaining height.

### Bar-Height Vertical Tube With One-Way Couplers

Source: [VERTICAL TUBE BAR HEIGHT with 2 one way couplers](https://diyoutdoorkitchen.com/vertical-tube-bar-height-with-2-one-way-couplers/)

This is a bar-height vertical tube with two one-way couplers. The page says the tube is 37.75 inches tall and is for bar-height modules that stand 41 inches. It is used for cement board seams or extra vertical support.

Model as:

- vertical support subassembly
- one 37.75 inch 25mm tube
- one one-way coupler at each end
- intended module height: 41 in
- vertical-support semantic tag
- placement use: cement-board seam or extra support

This can share a generator with the standard VT, parameterized by tube length and target module height.

### 24 Inch Module Adapter Kit

Source: [DIY Outdoor Kitchen 24" Module Adapter Kit](https://diyoutdoorkitchen.com/diy-outdoor-kitchen-24-module-adapter-kit/)

This kit converts a 31.5 inch depth module into a 24 inch depth frame without cutting. The page says it is for return wings in L or U designs, that cutout kits need depth tubes trimmed or more adapters, and that it is not recommended for grills or large appliances. It includes four tubes to make a 24 inch depth module.

Model as:

- kit operation that replaces standard depth spans with shorter depth spans
- four depth tubes sized for 24 inch module depth
- compatibility constraint: not recommended for grills or large appliances
- design-pattern semantic tag: L/U return wing

This is not a new primitive, but it encodes a useful assembly transformation.

### Custom Angle Tube Kit

Source: [DIY Outdoor Kitchen Custom Angle Tube Kit](https://diyoutdoorkitchen.com/diy-outdoor-kitchen-custom-angle-tube-kit/)

This kit makes a turn at any angle between two modules. The page says the front corners of modules touch and are secured with two connector plates, while the rear wall is filled with bending top and bottom tubes cut to fit. It includes eight one-way couplers, four vertical tubes, two angle tubes cut at 24 inches in the center, and six connector plates.

Model as:

- kit operation for arbitrary-angle module turn
- parametric angle between module coordinate frames
- front-corner contact constraint
- connector plates at the front union
- rear-wall spans generated from angle and module spacing
- components: 8 one-way couplers, 4 VTs, 2 bend/cut angle tubes, 6 connector plates

This is an assembly pattern more than a single part. It belongs in operation-level requirements for module-to-module relationships.

### 90 Degree Corner Kit

Source: [DIY Outdoor Kitchen 90 Degree Corner Kit (Not a Module)](https://diyoutdoorkitchen.com/diy-outdoor-kitchen-90-degree-corner-kit-not-a-module/)

This kit connects two modules in a 90 degree corner area without buying a full module. The page says a CTT must be added separately if there is no appliance cutout in the area. It includes four CTT/EF tubes 29.75 inches pre-cut for 31.5 inch depth modules, five vertical tubes, two 3-way corner couplers, four 90 degree couplers, four one-ways, and six connector plates.

Model as:

- kit operation for 90 degree module corner
- two module coordinate frames at right angle
- generated intermediate frame members
- components:
  - 4 CTT/EF tubes, 29.75 in
  - 5 vertical tubes
  - 2 3-way corner couplers
  - 4 90 degree couplers
  - 4 one-way couplers
  - 6 connector plates
- optional additional CTT when no appliance cutout exists
- variants: standard height and bar height

This kit should be represented as an assembly template that expands into primitives and mates.

## Appliances, Vents, Electrical, Fasteners, And Materials

These products are not primary structural connectors, but some still matter to the planner.

### Stainless Steel Air Vent

Source: [Stainless Steel Air Vent](https://diyoutdoorkitchen.com/stainless-steel-air-vent/)

The vent is 14 inches x 4.5 inches and is used for outdoor kitchen venting.

Model as:

- rectangular accessory/cutout
- face-mounted insert into cement board or side panel
- footprint: 14 in x 4.5 in
- ventilation semantic tag

This belongs more to appliance safety/layout validation than the tube assembly kernel.

### Electrical Box

Source: [Electrical Box](https://diyoutdoorkitchen.com/electrical-box/)

The electrical box is designed for steel framing and installs onto the steel frame. The page notes that when installed into a 6 inch high backsplash frame, it must be installed horizontally under the top backsplash tube.

Model as:

- rectangular accessory box
- surface/fastener mate to tube frame
- orientation constraint for 6 inch backsplash: horizontal under top backsplash tube
- electrical semantic tag

This is not a structural connector, but it requires placement rules against the frame.

### Composite Shims

Source: [Composite Shims](https://diyoutdoorkitchen.com/composite-shims-1-pack-of-10-pcs/)

Composite shims are sold in packs of ten and described as useful for installing cement board.

Model as:

- optional thin wedge/spacer accessory
- placement against panels or frame

This is probably out of scope for the initial structural assembly kernel.

### Screws And Tooling

Sources:

- [Hex Head Self Tapping Framing Screws](https://diyoutdoorkitchen.com/hex-head-framing-screws-1lb-box/)
- [Cement Board Screws](https://diyoutdoorkitchen.com/cement-board-screws-1-lbs-box-self-tapping-solt-out/)
- [Square Drill Bit for Cement Board Screws](https://diyoutdoorkitchen.com/square-drill-bit-for-cement-board-screws/)
- [Screw Socket for Hex Head Screws](https://diyoutdoorkitchen.com/screw-socket-for-hex-head-screws/)

Screws matter as fastener metadata and bill-of-material quantities, but they should not drive the first structural model. Drill bits and sockets are tools, not modeled assembly parts.

Represent screws initially as:

- fastener compatibility metadata on parts that require them
- BOM count estimation
- optional visual points if later needed

### Stucco And Adhesive

Sources:

- [Cement Board Stucco for BBQ Islands](https://diyoutdoorkitchen.com/cement-board-stucco-for-bbq-islands-5-gallons/)
- [1 Gallon Stucco Adhesive](https://diyoutdoorkitchen.com/1-gallon-stucco-adhesive/)

These are finish materials. They may matter for BOM and surface-area calculations, but they are not CAD assembly primitives for the tube frame.

### Services And Non-Parts

Sources:

- [DIY Outdoor Kitchen Shopping List Service](https://diyoutdoorkitchen.com/shoppinglist)
- [Expedited Shipping](https://diyoutdoorkitchen.com/expedited-shipping/)

These should not be represented as geometry.

## Initial Model Configuration Candidates

The first catalog configuration should include:

| Definition | Kind | Key parameters |
| --- | --- | --- |
| `tube-25mm-square` | tube | length, outer profile 25mm x 25mm |
| `coupler-union-inline` | inline insert connector | 21mm sleeve, 3 in long, two opposite tube inserts, no central cube |
| `surface-bracket-one-way-machine` | surface bracket connector | 3 in x 24mm x 1mm plate, centered perpendicular 25mm insert |
| `surface-bracket-one-way-welded` | surface bracket connector | 4 in x 24mm x 1mm plate, centered perpendicular 25mm insert |
| `surface-bracket-45` | surface bracket connector | 4 in x 24mm x 1mm plate, centered 45 degree 25mm insert, flippable along slide axis |
| `coupler-90` | node connector | 25mm cube body, two 25mm insert directions at 90 degrees |
| `coupler-3way-corner` | node connector | 25mm cube body, three orthogonal 25mm insert directions |
| `coupler-4way-corner-bespoke` | node connector | 25mm cube body, local +X, -X, +Y, +Z insert directions |
| `coupler-3way-flat` | node connector | 25mm cube body, T-shaped coplanar 25mm insert directions |
| `coupler-4way-flat-25mm` | node connector | 25mm cube body, four coplanar 25mm insert directions |

Subassemblies and kits should be configured separately:

| Definition | Kind | Key behavior |
| --- | --- | --- |
| `spacer-kit-ne-sp22` | kit | choose telescoping range set for no-cut span |
| `telescoping-spacer-ne-lr` | adjustable span | standard and XL ranges between 3-way corners |
| `ctt-fixed-standard-depth` | support subassembly | 29.75 in tube plus two one-way couplers |
| `ctt-telescopic` | adjustable support | 22.75 in to 29 in range |
| `vt-standard-height` | vertical support | 32.75 in tube plus two one-way couplers |
| `vt-bar-height` | vertical support | 37.75 in tube plus two one-way couplers |
| `below-grill-tubes` | pair of adjustable supports | grill/door cutout vertical supports |
| `module-adapter-24in` | kit operation | convert standard depth to 24 in depth |
| `custom-angle-kit` | kit operation | arbitrary-angle module turn |
| `corner-kit-90` | kit operation | 90 degree module corner frame |

## Remaining Implementation Notes

### O1: Anchors

Define the generated anchor/feature representation for tube ends, tube faces, node-coupler insert points, inline-union insert points, and surface-bracket mount/insert points.

This should specify:

- local position
- local direction
- compatible profile
- mate kind: insert or surface
- occupancy behavior
- surface slide axis where applicable
- bracket flip behavior where applicable

#### Anchor Shape

Every generated anchor should have:

- stable id within the part definition
- mate kind: insert or surface
- local position
- local direction
- compatible profile
- occupancy behavior

#### Insert Anchors

Insert anchors are chiral. A tube end anchor and a hosting insert anchor are different roles under the same insert mate kind, similar to positive and negative magnets.

Use:

- `role: tube-end` for tube end anchors
- `role: tube-host` for anchors on node couplers, inline unions, and surface brackets that accept tube ends

Rules:

- `localDirection` is the direction the hosted tube points away from the hosting part.
- Tube end anchors point outward along the tube's long axis, one in each direction.
- Hosting insert anchors point outward from the hosting part.
- A tube end anchor can mate only with a tube-host anchor.
- The two anchor directions must be inverse in world space at the mate.
- Insert anchors are single occupancy.
- Insert anchors are compatible only with 25mm tube ends in the first catalog.

For node couplers, hosting insert anchors point out from faces of the 25mm central cube. For inline union connectors, the two hosting insert anchors are collinear and point in inverse directions, with no central cube body.

#### Surface Anchors

Surface anchors connect planes. `localDirection` is the surface normal.

Use:

- `role: tube-face` for tube side faces
- `role: bracket-mount` for the underside of surface brackets

Rules:

- A bracket-mount anchor can mate only with a tube-face anchor.
- The two surface normals must be inverse in world space at the mate.
- Tube face anchors expose one slide axis parallel to the tube's long axis.
- Surface bracket mount anchors expose the same one-dimensional slide axis.
- The slide axis is parallel to the same local axis as the tube end anchors, even though it is exposed on all four side faces.
- Surface anchors reserve only the center 25mm square of the bracket footprint on the host interval.
- Surface placement and occupancy should be accurate within `1/8 in` (`3.175mm`).
- Screw holes are not modeled.

#### Part Anchor Generation

Tubes:

- local X axis is the tube length axis
- negative end tube-end anchor at `[-length / 2, 0, 0]`, direction `[-1, 0, 0]`
- positive end tube-end anchor at `[length / 2, 0, 0]`, direction `[1, 0, 0]`
- four tube-face surface anchors, one per side face
- each tube-face surface anchor has a slide axis parallel to local X

Node couplers:

- only generate tube-host insert anchors
- local directions define the default unrotated orientation in 3D space
- coupler instances can rotate, so each definition needs only one canonical local direction set

Surface brackets:

- generate one bracket-mount surface anchor
- generate one tube-host insert anchor
- one-way brackets have a centered perpendicular insert anchor
- 45 degree brackets have a centered insert anchor angled toward the bracket long axis
- 45 degree brackets use an instance-level `flip` parameter so one inventory item can point either direction along the slide axis

### O2: Tube Length Units

Tube lengths may be entered by the user in inches because physical tube cutting is done in inches. Snap inch-based tube lengths to the nearest `1/6 in`, then store internal geometry and transforms in millimeters.

### Possible Follow-On Specs

These are not blocking catalog requirements, but are likely to become useful when the first implementation slice is chosen:

- first-slice operation priority
