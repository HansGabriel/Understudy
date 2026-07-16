import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { npmInvocation } from "./npm-runner.mjs";

const root = process.cwd();
const source = path.join(os.tmpdir(), `understudy-fixture-${Date.now()}`);
const fixtureDirectory = path.join(root, "fixtures");
const challengeDirectory = path.join(root, "challenges");

function run(command, args, cwd = source) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function runNpm(args) {
  const invocation = npmInvocation(args);
  return run(invocation.command, invocation.args);
}

async function write(relativePath, content) {
  const target = path.join(source, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

const baselineTaskManager = `export type Task = { id: string; title: string; done: boolean };
export type Filter = "all" | "active" | "done";
export type SaveTask = (task: Task) => Promise<void>;

export class TaskManager {
  private tasks: Task[];
  private filter: Filter = "all";
  private error = "";

  constructor(initialTasks: Task[], private readonly saveTask: SaveTask) {
    this.tasks = initialTasks.map((task) => ({ ...task }));
  }

  getTask(id: string) { return this.tasks.find((task) => task.id === id); }
  getVisibleTasks() { return this.filter === "all" ? this.tasks : this.tasks.filter((task) => this.filter === "done" ? task.done : !task.done); }
  getError() { return this.error; }
  getFilter() { return this.filter; }
  setFilter(filter: Filter) { this.filter = filter; }

  async complete(id: string) {
    const task = this.getTask(id);
    if (!task) throw new Error("Task not found");
    const nextTask = { ...task, done: !task.done };
    await this.saveTask(nextTask);
    this.tasks = this.tasks.map((item) => item.id === id ? nextTask : item);
  }
}
`;

const optimisticTaskManager = `export type Task = { id: string; title: string; done: boolean };
export type Filter = "all" | "active" | "done";
export type SaveTask = (task: Task) => Promise<void>;

export class TaskManager {
  private tasks: Task[];
  private filter: Filter = "all";
  private error = "";

  constructor(initialTasks: Task[], private readonly saveTask: SaveTask) {
    this.tasks = initialTasks.map((task) => ({ ...task }));
  }

  getTask(id: string) { return this.tasks.find((task) => task.id === id); }
  getVisibleTasks() { return this.filter === "all" ? this.tasks : this.tasks.filter((task) => this.filter === "done" ? task.done : !task.done); }
  getError() { return this.error; }
  getFilter() { return this.filter; }
  setFilter(filter: Filter) { this.filter = filter; }

  async complete(id: string) {
    const previous = this.getTask(id);
    if (!previous) throw new Error("Task not found");
    const nextTask = { ...previous, done: !previous.done };
    this.error = "";
    this.tasks = this.tasks.map((item) => item.id === id ? nextTask : item);
    try {
      await this.saveTask(nextTask);
    } catch {
      this.tasks = this.tasks.map((item) => item.id === id ? previous : item);
      this.error = "Could not save task. Try again.";
    }
  }
}
`;

const persistedTaskManager = `export type Task = { id: string; title: string; done: boolean };
export type Filter = "all" | "active" | "done";
export type SaveTask = (task: Task) => Promise<void>;
export type StorageLike = Pick<Storage, "getItem" | "setItem">;
const validFilters = new Set<Filter>(["all", "active", "done"]);

export class TaskManager {
  private tasks: Task[];
  private filter: Filter;
  private error = "";

  constructor(initialTasks: Task[], private readonly saveTask: SaveTask, private readonly storage?: StorageLike) {
    this.tasks = initialTasks.map((task) => ({ ...task }));
    const stored = storage?.getItem("task-manager:filter");
    this.filter = stored && validFilters.has(stored as Filter) ? stored as Filter : "all";
  }

  getTask(id: string) { return this.tasks.find((task) => task.id === id); }
  getVisibleTasks() { return this.filter === "all" ? this.tasks : this.tasks.filter((task) => this.filter === "done" ? task.done : !task.done); }
  getError() { return this.error; }
  getFilter() { return this.filter; }
  setFilter(filter: Filter) { this.filter = filter; this.storage?.setItem("task-manager:filter", filter); }

  async complete(id: string) {
    const previous = this.getTask(id);
    if (!previous) throw new Error("Task not found");
    const nextTask = { ...previous, done: !previous.done };
    this.error = "";
    this.tasks = this.tasks.map((item) => item.id === id ? nextTask : item);
    try {
      await this.saveTask(nextTask);
    } catch {
      this.tasks = this.tasks.map((item) => item.id === id ? previous : item);
      this.error = "Could not save task. Try again.";
    }
  }
}
`;

const normalTests = `import { describe, expect, it, vi } from "vitest";
import { TaskManager } from "../src/task-manager";

describe("TaskManager", () => {
  const task = { id: "a", title: "Write tests", done: false };
  it("completes a task after a successful save", async () => {
    const saveTask = vi.fn().mockResolvedValue(undefined);
    const manager = new TaskManager([task], saveTask);
    await manager.complete("a");
    expect(manager.getTask("a")?.done).toBe(true);
    expect(saveTask).toHaveBeenCalledWith({ ...task, done: true });
  });
  it("filters active tasks", () => {
    const manager = new TaskManager([task, { id: "b", title: "Done", done: true }], vi.fn());
    manager.setFilter("active");
    expect(manager.getVisibleTasks().map((item) => item.id)).toEqual(["a"]);
  });
});
`;

const component = `import type { Task } from "./task-manager";

export function TaskList({ tasks, error }: { tasks: Task[]; error: string }) {
  return <section aria-label="Tasks"><ul>{tasks.map((task) => <li key={task.id}>{task.done ? "Complete" : "Open"}: {task.title}</li>)}</ul>{error ? <p role="alert">{error}</p> : null}</section>;
}
`;

const packageJson = `{
  "name": "task-manager-fixture",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:challenge": "vitest run tests/challenge.test.ts"
  },
  "devDependencies": {}
}
`;

async function commit(message) {
  run("git", ["add", "."]);
  run("git", ["commit", "-m", message]);
  return run("git", ["rev-parse", "HEAD"]);
}

async function main() {
  await fs.rm(source, { recursive: true, force: true });
  await fs.mkdir(source, { recursive: true });
  await write(".gitignore", "node_modules\n");
  await write("package.json", packageJson);
  await write("tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, jsx: "react-jsx", skipLibCheck: true }, include: ["src", "tests"] }, null, 2));
  await write("src/task-manager.ts", baselineTaskManager);
  await write("src/TaskList.tsx", component);
  await write("tests/task-manager.test.ts", normalTests);
  runNpm(["install", "--save-dev", "vitest@latest", "typescript@latest", "@types/node@latest", "@types/react@latest", "--no-audit", "--no-fund"]);
  run("git", ["init"]);
  run("git", ["config", "user.name", "Understudy Fixture"]);
  run("git", ["config", "user.email", "fixture@understudy.local"]);
  const baseCommit = await commit("Baseline task manager with passing tests");

  await write("src/task-manager.ts", optimisticTaskManager);
  const optimisticCommit = await commit("Add optimistic task completion with rollback");

  await write("src/task-manager.ts", persistedTaskManager);
  const persistCommit = await commit("Persist task-filter preference to localStorage with validation");

  await fs.mkdir(fixtureDirectory, { recursive: true });
  await fs.rm(path.join(fixtureDirectory, "task-manager.bundle"), { force: true });
  run("git", ["bundle", "create", path.join(fixtureDirectory, "task-manager.bundle"), "--all"]);

  await fs.mkdir(challengeDirectory, { recursive: true });
  const common = { mode: "replay", testCommand: "test", hiddenTestCommand: "test:challenge" };
  const optimistic = {
    ...common,
    id: "optimistic-rollback",
    title: "Optimistic completion with rollback",
    baseCommit,
    referenceCommit: optimisticCommit,
    hiddenTestFile: "challenges/tests/optimistic-rollback.challenge.test.ts",
    difficulty: 3,
    estimatedTime: "20–30 min",
    learningObjectives: ["optimistic UI", "rollback", "async failure"],
    brief: { desiredBehavior: "You're building the data layer of a task-manager app. When someone completes a task, its state should update immediately. If saving fails, restore the earlier state and make the error available to the app.", acceptanceCriteria: ["Completing a task updates its data immediately, before saving finishes.", "A rejected save returns the task to its earlier state.", "The task manager exposes a clear save error after the rejected save."], constraints: ["Work in the TypeScript task-manager library; this fixture has no browser screen.", "Preserve existing behavior and use the project's patterns."] },
    planQuestions: ["What should someone observe first, and what should happen if saving fails?", "Which task-manager behavior and tests would you inspect before coding?", "What edge case would prove the earlier state is restored?"],
    hints: [{ level: 1, text: "Consider what the task manager should expose if persistence fails." }, { level: 2, text: "What earlier task state would you need to preserve before applying the immediate change?" }, { level: 3, text: "Look at the completion behavior in the task manager — something about the pre-change state matters there." }],
    explainBackQuestion: "Why must the earlier task state be saved before an optimistic update?",
  };
  const persisted = {
    ...common,
    id: "persist-filter",
    title: "Persist task-filter preferences",
    baseCommit: optimisticCommit,
    referenceCommit: persistCommit,
    hiddenTestFile: "challenges/tests/persist-filter.challenge.test.ts",
    difficulty: 2,
    estimatedTime: "15–20 min",
    learningObjectives: ["localStorage", "validation", "state persistence"],
    brief: { desiredBehavior: "You're building the data layer of a task-manager app. Remember the active task filter when the task manager is created again. Read stored data defensively so an unexpected value falls back to all tasks.", acceptanceCriteria: ["Changing the filter writes the selected value to storage.", "A new task manager uses a valid stored filter.", "An absent or invalid stored value falls back to all tasks.", "Existing filtering behavior remains correct."], constraints: ["Work in the TypeScript task-manager library; this fixture has no browser screen.", "Use browser storage defensively and preserve existing behavior."] },
    planQuestions: ["Which preference should still be active when the task manager is created again?", "Where does the task manager read and write that preference?", "Which stored values must fall back safely?"],
    hints: [{ level: 1, text: "Think about when a preference is read versus when it is written." }, { level: 2, text: "What values should storage be allowed to restore?" }, { level: 3, text: "Inspect the filter state initialization and selection method." }],
    explainBackQuestion: "Why should a stored preference be validated before it changes the UI?",
  };
  await fs.writeFile(path.join(challengeDirectory, "optimistic-rollback.json"), `${JSON.stringify(optimistic, null, 2)}\n`);
  await fs.writeFile(path.join(challengeDirectory, "persist-filter.json"), `${JSON.stringify(persisted, null, 2)}\n`);
  console.log(`Fixture ready: ${baseCommit.slice(0, 7)} → ${optimisticCommit.slice(0, 7)} → ${persistCommit.slice(0, 7)}`);
}

main().finally(() => fs.rm(source, { recursive: true, force: true }));
