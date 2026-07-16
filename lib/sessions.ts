import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { sessionFilePath, sessionDirectory, sessionsRoot } from "@/lib/paths";
import { sessionSchema, type CoachingSource, type SessionRecord } from "@/lib/schemas";

const locks = new Map<string, Promise<void>>();

export async function withSessionLock<T>(sessionId: string, action: () => Promise<T>) {
  const previous = locks.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  locks.set(sessionId, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(sessionId) === queued) locks.delete(sessionId);
  }
}

export async function saveSession(session: SessionRecord) {
  const dir = sessionDirectory(session.id);
  await fs.mkdir(dir, { recursive: true });
  const target = sessionFilePath(session.id);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function loadSession(sessionId: string): Promise<SessionRecord> {
  try {
    const raw = await fs.readFile(sessionFilePath(sessionId), "utf8");
    return sessionSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Session not found.");
    throw error;
  }
}

export async function listSessions() {
  try {
    const entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
    const records = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try {
        return await loadSession(entry.name);
      } catch {
        return null;
      }
    }));
    return records.filter((record): record is SessionRecord => record !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function deleteSessionRecord(sessionId: string) {
  const file = sessionFilePath(sessionId);
  const directory = sessionDirectory(sessionId);
  await fs.rm(file, { force: true });
  await fs.rm(directory, { recursive: true, force: true });
}

export async function createSessionRecord(input: Omit<SessionRecord, "createdAt">) {
  const session = sessionSchema.parse({
    ...input,
    id: input.id || randomUUID(),
    createdAt: new Date().toISOString(),
  });
  await fs.mkdir(sessionsRoot, { recursive: true });
  await saveSession(session);
  return session;
}

export async function updateSession(sessionId: string, update: (session: SessionRecord) => Promise<SessionRecord> | SessionRecord) {
  return withSessionLock(sessionId, async () => {
    const next = sessionSchema.parse(await update(await loadSession(sessionId)));
    await saveSession(next);
    return next;
  });
}

export function appendTimeline(session: SessionRecord, type: SessionRecord["timeline"][number]["type"], meta: Record<string, unknown> = {}, source?: CoachingSource) {
  session.timeline.push({ type, at: new Date().toISOString(), meta, ...(source ? { source } : {}) });
  return session;
}
