"use client";

import { useState } from "react";
import type { CheckResult } from "@/lib/schemas";
import { testTone } from "@/lib/status";

export function TerminalBlock({ normal, behavioral, behavioralMode = "hidden" }: { normal?: CheckResult; behavioral?: CheckResult; behavioralMode?: "hidden" | "full-suite" }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const fullSuiteOnly = behavioralMode === "full-suite";
  const lineClass = (line: string, suite: "normal" | "behavioral", passed: boolean | undefined) => {
    if (/pass|✓/i.test(line)) return "pass-line";
    if (/fail|error|expected/i.test(line)) return testTone(suite, passed) === "signal" ? "signal-line" : "fail-line";
    return suite === "behavioral" && /behavioral|challenge/i.test(line) ? "signal-line" : "";
  };
  const block = (command: string, output: string, suite: "normal" | "behavioral", passed: boolean | undefined) => <>{[command, ...output.split("\n")].map((line, index) => <span className={lineClass(line, suite, passed)} key={`${suite}-${index}-${line}`}>{line}{"\n"}</span>)}</>;
  const terminalText = normal || behavioral
    ? [`$ npm run test`, normal?.output || "Waiting for the project's own tests...", ...(fullSuiteOnly ? [] : [`$ npm run test:challenge`, behavioral?.output || "Waiting for the edge-case check..."])] .join("\n")
    : fullSuiteOnly ? "Run checks after you submit your plan. The project's own test suite will appear here." : "Run checks after you submit your plan. The project's own tests and a hidden edge-case check will appear here.";
  async function copyOutput() {
    setCopyError("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(terminalText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (reason) {
      setCopyError(reason instanceof Error ? reason.message : "Could not copy test output.");
    }
  }
  return (
    <section className="terminal" aria-label="Test output">
      <div className="terminal-head"><span>{fullSuiteOnly ? "verification output / project test suite" : "verification output / project tests + edge-case check"}</span><span className="terminal-meta"><span>{normal || behavioral ? `exit ${normal?.exitCode || behavioral?.exitCode || 0}` : "ready"}</span><button type="button" className="terminal-copy" onClick={() => void copyOutput()}>{copied ? "Copied" : "Copy output"}</button></span></div>
      <pre>{normal || behavioral ? <>{block("$ npm run test", normal?.output || "Waiting for the project's own tests...", "normal", normal?.passed)}{"\n"}{fullSuiteOnly ? null : block("$ npm run test:challenge", behavioral?.output || "Waiting for the edge-case check...", "behavioral", behavioral?.passed)}</> : fullSuiteOnly ? "Run checks after you submit your plan. The project's own test suite will appear here." : "Run checks after you submit your plan. The project's own tests and a hidden edge-case check will appear here."}</pre>
      {copyError ? <p className="terminal-copy-error" role="status">{copyError}</p> : null}
    </section>
  );
}
