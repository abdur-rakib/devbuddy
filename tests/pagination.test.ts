import { describe, it, expect } from "vitest";
import { paginate } from "../src/ui/pagination.js";

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => `item-${i}`);

  it("returns first page with 10 items", () => {
    const result = paginate(items, 1, 10);
    expect(result.items).toHaveLength(10);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(3);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(false);
  });

  it("returns last page with remaining items", () => {
    const result = paginate(items, 3, 10);
    expect(result.items).toHaveLength(5);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(true);
  });

  it("clamps page to valid range", () => {
    const result = paginate(items, 99, 10);
    expect(result.page).toBe(3);
  });
});
