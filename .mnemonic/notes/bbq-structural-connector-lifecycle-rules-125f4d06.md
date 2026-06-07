---
title: BBQ structural connector lifecycle rules
tags:
  - bbq-island
  - structural-modeling
  - connectors
lifecycle: permanent
createdAt: '2026-06-03T20:16:26.824Z'
updatedAt: '2026-06-06T03:02:58.034Z'
role: decision
alwaysLoad: false
project: github-com-boblangley-3d-project-planner
projectName: 3d-project-planner
memoryVersion: 1
---
BBQ structural connectors have a lifecycle based on whether they host a node or a surface attachment.

Node delete is allowed only when the node has exactly two attached member endpoints and those endpoints are opposing, collinear, same-kind members that can be joined into one member. Three-way nodes are not deleted directly; if they have one perpendicular branch plus a joinable straight-through pair, they can be demoted to a surface bracket. Surface delete is allowed only when the bracket has no attached member endpoint; attached surface brackets remain blocked until explicit detach or reattach behavior exists.

Surface bracket promotion is direction-based. A surface bracket can promote to a node only when splitting the host and attaching the branch produces a valid node direction set. Valid node type derivation is: two opposing directions on one axis become `linear-2-way`; two directions across two axes become `l-2-way`; three directions across three axes become `3-way-corner`; three directions with one opposing pair become `3-way-T`; four directions are valid only across all three axes with exactly one opposing pair and become `4-way`; five directions are valid only across all three axes with exactly two opposing pairs and become `5-way`. Four-way connectors are never just two-dimensional cross connectors in this model.

UI controls should treat connectors like members: list them with visible/off-view state, allow selection highlighting, and disable edit/delete/transform actions when the connector is not on the active view layer. Member endpoint connector cards should show `tee-surface` for surface brackets plus only the valid node type options for that exact direction set; choosing a node option performs the surface-to-node promotion.

The structural model is explicit-only for connectors. Island section creation writes the known box topology directly: eight corner node connectors plus the four beams, four rafters, and four posts wired to those connector IDs. The evaluator does not infer connectors from member intersections; a member passing through or touching another member without the required explicit connector should be treated as invalid geometry/validation, not hidden topology.

Node connector preview rendering follows the same edge-anchored coordinate convention as structural members. A node position is rendered as the lower/outer cube edge on interior coordinates and is clamped only when the cube would exceed the section boundary. Rendering interior node positions as centers makes converted surface-to-node connectors appear offset from the post/beam/rafter they are attached to.

Node connector type edits are constrained by actual member attachments and boundary-valid directions. Attached member directions must remain enabled. Unattached enabled directions are free ports: the preview draws them as inset black squares on visible node faces, and users may remove or rotate them by choosing another valid enabled-port direction set. Deleting a member segment between nodes leaves the endpoint nodes in place and preserves their enabled directions, turning the removed member side into a free port until the user changes the node type/orientation.

Planner edits have undo history. Accidental topology edits such as promoting the wrong surface bracket to a node should be reversible through the app-level Undo control.

BBQ connector vocabulary is constrained to node connector types `5-way`, `4-way`, `3-way-corner`, `3-way-T`, `linear-2-way`, and `l-2-way`, plus the surface connector type `tee-surface`. There is no `cap` connector in the BBQ model. Adding a new member should add the member and both endpoint connectors as one topology operation; by default, new members attach to the nearest legal surfaces with explicit `tee-surface` brackets. Users can later convert a surface bracket to a node when they want that connection to split the host member and become a topology node.

Current implementation detail: deleting a joinable two-way node must preserve surface brackets hosted on either joined member segment by rehosting them onto the resulting joined member at the same world position. Connector and member centering controls are view-contextual: front/back centers along X, side centers along Y, and top centers along X. Nodes with opposing attached member segments center between their attached outer endpoints before falling back to visible structural references. A dedicated Flip Y control should only swap a free Y port to the opposite Y direction when the resulting enabled-port set is valid for the current node type and boundary position.
