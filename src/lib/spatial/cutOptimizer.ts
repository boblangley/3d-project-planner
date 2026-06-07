import type {
  CutOptimizationResult,
  CutPiece,
  InventoryItem,
  LinearPrimitiveSpec,
  StockCutPlan,
} from "./types";

interface GroupedCuts {
  spec: LinearPrimitiveSpec;
  cuts: CutPiece[];
}

export function optimizeCuts(
  groups: GroupedCuts[],
  inventory: InventoryItem[] = [],
): CutOptimizationResult {
  const stock: StockCutPlan[] = [];
  const unplacedCuts: CutPiece[] = [];

  for (const group of groups) {
    const sortedCuts = [...group.cuts].sort((a, b) => b.length - a.length);
    const hasPhysicalInventory = inventory.length > 0;
    const plansForSpec =
      hasPhysicalInventory
        ? buildInventoryPlans(group.spec.id, inventory)
        : ([] as StockCutPlan[]);

    for (const cut of sortedCuts) {
      const explicitlyAllocatedPlan = cut.allocatedInventoryItemId
        ? plansForSpec.find(
            (plan) => plan.stockItemId === cut.allocatedInventoryItemId,
          )
        : undefined;

      if (explicitlyAllocatedPlan) {
        if (explicitlyAllocatedPlan.scrapLength >= cut.length) {
          explicitlyAllocatedPlan.cuts.push(cut);
          explicitlyAllocatedPlan.scrapLength = roundLength(
            explicitlyAllocatedPlan.scrapLength - cut.length,
          );
        } else {
          unplacedCuts.push(cut);
        }
        continue;
      }

      if (cut.length > group.spec.rawStockLength && plansForSpec.length === 0) {
        unplacedCuts.push(cut);
        continue;
      }

      const bestFit = plansForSpec
        .filter((plan) => {
          if (plan.scrapLength < cut.length) return false;
          const inventoryItem = inventory.find(
            (item) => item.id === plan.sourceInventoryItemId,
          );
          return (
            !inventoryItem?.reservedForCutIds ||
            inventoryItem.reservedForCutIds.includes(cut.id)
          );
        })
        .sort((a, b) => a.scrapLength - b.scrapLength)[0];

      if (bestFit) {
        bestFit.cuts.push(cut);
        bestFit.scrapLength = roundLength(bestFit.scrapLength - cut.length);
        continue;
      }

      if (hasPhysicalInventory) {
        unplacedCuts.push(cut);
        continue;
      }

      plansForSpec.push({
        stockItemId: `${group.spec.id}-stock-${plansForSpec.length + 1}`,
        specId: group.spec.id,
        rawStockLength: group.spec.rawStockLength,
        cuts: [cut],
        scrapLength: roundLength(group.spec.rawStockLength - cut.length),
      });
    }

    stock.push(...plansForSpec);
  }

  return {
    stock,
    unplacedCuts,
    totalScrapLength: roundLength(
      stock.reduce((total, plan) => total + plan.scrapLength, 0),
    ),
  };
}

function buildInventoryPlans(
  specId: string,
  inventory: InventoryItem[],
): StockCutPlan[] {
  return inventory
    .filter(
      (item) =>
        item.specId === specId &&
        (item.status === "available" || item.status === "partial"),
    )
    .sort((a, b) => a.length - b.length)
    .map((item) => ({
      stockItemId: item.id,
      specId: item.specId,
      rawStockLength: item.length,
      cuts: [],
      scrapLength: item.length,
      sourceInventoryItemId: item.id,
      sourceLabel: item.label,
      sourceStatus: item.status,
    }));
}

function roundLength(value: number): number {
  return Number(value.toFixed(4));
}
