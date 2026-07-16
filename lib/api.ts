import { ZodError } from "zod";

export function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: "Invalid request.", issues: error.flatten() }, { status: 400 });
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  const status = error instanceof Error && error.name === "FixtureUnavailableError"
    ? 503
    : /not found/i.test(message) ? 404 : /Unsafe|only be revealed|not ready|Confirm your plan|coach message limit|repository|package\.json|v1 supports|package manager|test script|Vitest|absolute local|selected path|project path|linked projects|linked project|commit replay|recent commit|root commit|test path|test destination|draft editing|belongs to this project|edge-case check|Forge|variation validation|generated behavioral|built-in task-manager/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}

export async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}
