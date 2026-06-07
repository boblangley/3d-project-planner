---
title: Structural placement derives run span after movement
tags:
  - bbq-island
  - structural-modeling
  - controls
lifecycle: permanent
createdAt: '2026-06-03T03:55:59.331Z'
updatedAt: '2026-06-05T04:22:33.325Z'
role: decision
alwaysLoad: false
project: github-com-boblangley-3d-project-planner
projectName: 3d-project-planner
memoryVersion: 1
---
Structural member placement controls should treat the placement axis as movable across any region where at least one valid run-axis support span exists. After a placement move, the member's run-axis span is automatically normalized to the best available supported span at the new placement.

This resolves the pre-alpha BBQ island control behavior where a vertical post could become trapped after selecting a partial Z span. For example, when moving a front vertical post along X into a section with a middle horizontal beam, the post may automatically select either available Z span. When moving back into a section with only the full-height Z span, it should automatically return to that span.

The same rule should extrapolate across structural member kinds: vertical posts derive Z spans after X/Y placement, horizontal beams derive X spans after Y/Z placement, and rafters derive Y spans after X/Z placement.

Explicit connector topology rule: geometry may suggest possible snaps, but connector records define topology. Node connectors are topological graph nodes and always split an inserted member into member segments. Surface connectors are fastened brackets hosted by a member; they do not split the host and provide one connection point for one attached member endpoint. A surface connector can be converted into a node connector, which splits the host member and reattaches the branch endpoint to the node.

Add-member creation follows the same rule as movement: before endpoint surface connectors are created, the new member's run-axis span is normalized against blockers at its default placement. This prevents a newly added vertical post from spawning full-height through a middle horizontal beam; in the verified front/back case, adding a post in a bay with a beam at Z 18 produced `Z 1-18` with surface connectors to the bottom beam and the middle beam.
