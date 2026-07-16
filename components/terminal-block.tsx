import type { CheckResult } from "@/lib/schemas";
import { testTone } from "@/lib/status";

export function TerminalBlock({ normal, behavioral, behavioralMode = "hidden" }: { normal?: CheckResult; behavioral?: CheckResult; behavioralMode?: "hidden" | "full-suite" }) {
  const fullSuiteOnly = behavioralMode === "full-suite";
  const lineClass = (line: string, suite: "normal" | "behavioral", passed: boolean | undefined) => {
    if (/pass|✓/i.test(line)) return "pass-line";
    if (/fail|error|expected/i.test(line)) return testTone(suite, passed) === "signal" ? "signal-line" : "fail-line";
    return suite === "behavioral" && /behavioral|challenge/i.test(line) ? "signal-line" : "";
  };
  const block = (command: string, output: string, suite: "normal" | "behavioral", passed: boolean | undefined) => <>{[command, ...output.split("\n")].map((line, index) => <span className={lineClass(line, suite, passed)} key={`${suite}-${index}-${line}`}>{line}{"\n"}</span>)}</>;
  return (
    <section className="terminal" aria-label="Test output">
      <div className="terminal-head"><span>{fullSuiteOnly ? "verification output / project test suite" : "verification output / project tests + edge-case check"}</span><span>{normal || behavioral ? `exit ${normal?.exitCode || behavioral?.exitCode || 0}` : "ready"}</span></div>
      <pre>{normal || behavioral ? <>{block("$ npm run test", normal?.output || "Waiting for the project's own tests...", "normal", normal?.passed)}{"\n"}{fullSuiteOnly ? null : block("$ npm run test:challenge", behavioral?.output || "Waiting for the edge-case check...", "behavioral", behavioral?.passed)}</> : fullSuiteOnly ? "Run checks after you submit your plan. The project's own test suite will appear here." : "Run checks after you submit your plan. The project's own tests and a hidden edge-case check will appear here."}</pre>
    </section>
  );
}
