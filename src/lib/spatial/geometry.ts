import type { Axis, Box3, Dimensions3, Vector3 } from "./types";

export const AXES: Axis[] = ["x", "y", "z"];

export function axisLength(dimensions: Dimensions3, axis: Axis): number {
  if (axis === "x") return dimensions.width;
  if (axis === "y") return dimensions.depth;
  return dimensions.height;
}

export function componentAt(point: Vector3, axis: Axis): number {
  return point[axis];
}

export function boxFromMinAndDimensions(min: Vector3, dimensions: Dimensions3): Box3 {
  return {
    min,
    max: {
      x: min.x + dimensions.width,
      y: min.y + dimensions.depth,
      z: min.z + dimensions.height,
    },
  };
}

export function boundaryToBox(origin: Vector3, dimensions: Dimensions3): Box3 {
  return boxFromMinAndDimensions(origin, dimensions);
}

export function containsBox(container: Box3, candidate: Box3): boolean {
  return (
    candidate.min.x >= container.min.x &&
    candidate.min.y >= container.min.y &&
    candidate.min.z >= container.min.z &&
    candidate.max.x <= container.max.x &&
    candidate.max.y <= container.max.y &&
    candidate.max.z <= container.max.z
  );
}

export function intersectsBox(a: Box3, b: Box3): boolean {
  return (
    a.min.x < b.max.x &&
    a.max.x > b.min.x &&
    a.min.y < b.max.y &&
    a.max.y > b.min.y &&
    a.min.z < b.max.z &&
    a.max.z > b.min.z
  );
}

export function linearBounds(
  start: Vector3,
  end: Vector3,
  axis: Axis,
  profileDimensions: Dimensions3,
): Box3 {
  const min: Vector3 = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    z: Math.min(start.z, end.z),
  };
  const max: Vector3 = {
    x: Math.max(start.x, end.x),
    y: Math.max(start.y, end.y),
    z: Math.max(start.z, end.z),
  };

  if (axis !== "x") {
    min.x -= profileDimensions.width / 2;
    max.x += profileDimensions.width / 2;
  }

  if (axis !== "y") {
    min.y -= profileDimensions.depth / 2;
    max.y += profileDimensions.depth / 2;
  }

  if (axis !== "z") {
    min.z -= profileDimensions.height / 2;
    max.z += profileDimensions.height / 2;
  }

  return { min, max };
}

export function isAxisAligned(start: Vector3, end: Vector3, axis: Axis): boolean {
  return AXES.every((candidate) => {
    if (candidate === axis) return componentAt(start, axis) !== componentAt(end, axis);
    return componentAt(start, candidate) === componentAt(end, candidate);
  });
}
