import { expect, it, vi } from "vitest";
import { TaskManager } from "../src/task-manager";

it("persists a valid task filter and rejects an invalid stored value", () => {
  const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
  const manager = new TaskManager([], vi.fn(), storage);
  manager.setFilter("done");
  expect(storage.setItem).toHaveBeenCalledWith("task-manager:filter", "done");

  storage.getItem.mockReturnValueOnce("not-a-filter");
  const reloaded = new TaskManager([], vi.fn(), storage);
  expect(reloaded.getFilter()).toBe("all");
});
