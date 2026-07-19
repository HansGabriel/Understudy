import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { aiStructuredOutputSchemas, planFeedback } from "@/lib/ai";
import { listChallenges } from "@/lib/challenges";
import { coachingResultSchema } from "@/lib/schemas";

describe("coaching source labels", () => {
  it("keeps every Responses structured-output schema strict-mode compatible", () => {
    for (const { name, schema } of aiStructuredOutputSchemas) {
      expect(() => zodTextFormat(schema, name)).not.toThrow();
    }
  });

  it("marks the authored fallback when no API key is available", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const [challenge] = await listChallenges();
      const result = await planFeedback(["behavior", "investigation", "edge case"], challenge);
      expect(coachingResultSchema.parse(result).source).toBe("authored");
      expect(result.text).toMatch(/\?/);
    } finally {
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
    }
  });

  it("gives an explicit plan assessment when the answers are too vague", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const [challenge] = await listChallenges();
      const result = await planFeedback(["I have no idea", "Maybe repository layer", "The task details"], challenge);
      expect(result.source).toBe("authored");
      expect(result.text).toMatch(/^Plan check: needs revision/);
      expect(result.text).toContain("tests");
      expect(result.text).toMatch(/\?/);
    } finally {
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
    }
  });
});
