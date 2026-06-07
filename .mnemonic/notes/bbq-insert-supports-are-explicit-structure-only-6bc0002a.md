---
title: BBQ insert supports are explicit structure only
tags:
  - bbq
  - structural-model
  - inserts
lifecycle: permanent
createdAt: '2026-06-06T02:33:47.744Z'
updatedAt: '2026-06-06T02:33:47.744Z'
role: decision
alwaysLoad: false
project: github-com-boblangley-3d-project-planner
projectName: 3d-project-planner
memoryVersion: 1
---
BBQ insert supports are no longer modeled as a separate generated concept.

Drawer, door, and sleeve inserts are layout/fixed objects: face frames, bodies, and sleeve frames. Any physical support for those inserts should be modeled using explicit structural members and connectors: vertical posts, horizontal beams, rafters, node connectors, and surface brackets.

Rationale: the separate insert-support generation duplicated the structural member system, hid support geometry from normal connector/member editing, and made the section preview harder to reason about. The explicit structure model can represent the same support rails while preserving layering, connector lifecycle, inventory allocation, and member-level editing semantics.
