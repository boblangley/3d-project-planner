---
title: Initial cuboid cannot be built from two-host coupler-90 parts
tags:
  - assembly-kernel
  - catalog
  - cuboid
lifecycle: permanent
createdAt: '2026-06-07T03:15:47.654Z'
updatedAt: '2026-06-07T03:15:47.654Z'
role: decision
alwaysLoad: false
project: github-com-boblangley-3d-project-planner
projectName: 3d-project-planner
memoryVersion: 1
---
The assembly-backed frame editor slice contains an internal catalog/operation conflict: `create initial cuboid` asks for eight `coupler-90` corner instances plus twelve tubes with every tube end insert-mated, but the same slice defines `coupler-90` as a node connector with only two 25mm tube-host anchors at 90 degrees.

A rectangular cuboid corner needs three orthogonal tube-host anchors. The first implementation worktree therefore creates the working cuboid with eight `coupler-3way-corner` instances and records a warning explaining that `coupler-90` cannot satisfy the topology. This preserves the physical assembly/mate model instead of adding hidden connector behavior.
