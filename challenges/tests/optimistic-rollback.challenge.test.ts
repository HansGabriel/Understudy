import { expect, it } from "vitest";
import { TaskManager } from "../src/task-manager";

it("restores task state after a rejected save", async () => {
  let rejectSave: (reason?: unknown) => void = () => undefined;
  const saveTask = () => new Promise<void>((_resolve, reject) => { rejectSave = reject; });
  const manager = new TaskManager([{ id: "task-1", title: "Ship replay", done: false }], saveTask);
  const completion = manager.complete("task-1");
  void completion.catch(() => undefined);

  expect(manager.getTask("task-1")?.done).toBe(true);
  rejectSave(new Error("Network rejected save"));
  await completion;
  expect(manager.getTask("task-1")?.done).toBe(false);
  expect(manager.getError()).toMatch(/save|could not/i);
});
