import { describe, expect, it } from "vitest";
import { evaluateGardenBeds, initialGardenParameters } from "./gardenBeds";

describe("evaluateGardenBeds", () => {
  it("computes panel runs, corner counts, and kit inventory", () => {
    const result = evaluateGardenBeds(initialGardenParameters);

    expect(result.validationIssues).toEqual([]);
    expect(result.beds).toHaveLength(2);
    expect(result.requiredPanels).toBe(24);
    expect(result.requiredRoundedCorners).toBe(8);
    expect(result.inventory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "panels",
          required: 24,
          available: 24,
          delta: 0,
        }),
      ]),
    );
  });

  it("flags yard fit, walkway, and inventory problems", () => {
    const result = evaluateGardenBeds({
      ...initialGardenParameters,
      yardWidth: 96,
      yardDepth: 96,
      bedCount: 4,
      walkway: 12,
      availablePanels: 4,
      availableRoundedCorners: 4,
    });

    expect(result.validationIssues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        "walkway:min",
        "inventory:panels",
        "inventory:rounded-corners",
      ]),
    );
    expect(
      result.validationIssues.some((issue) => issue.id.startsWith("yard-fit:")),
    ).toBe(true);
  });
});
