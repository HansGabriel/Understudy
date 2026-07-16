import { removeWorktree } from "@/lib/git";
import { assertInside, sessionDirectory, sessionsRoot } from "@/lib/paths";
import { deleteSessionRecord, loadSession, withSessionLock } from "@/lib/sessions";
import type { SessionRecord } from "@/lib/schemas";

type DiscardOptions = {
  onlyIfStatus?: readonly SessionRecord["status"][];
};

export async function discardSession(sessionId: string, options: DiscardOptions = {}) {
  return withSessionLock(sessionId, async () => {
    const session = await loadSession(sessionId);
    if (options.onlyIfStatus && !options.onlyIfStatus.includes(session.status)) return null;
    assertInside(sessionsRoot, sessionDirectory(sessionId));
    assertInside(sessionsRoot, session.worktreePath);
    await removeWorktree(sessionId, session.projectId);
    await deleteSessionRecord(sessionId);
    return session;
  });
}
