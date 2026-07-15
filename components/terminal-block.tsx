import type { CheckResult } from "@/lib/schemas";
import { testTone } from "@/lib/status";

export function TerminalBlock({ normal, behavioral }: { normal?: CheckResult; behavioral?: CheckResult }) {
  const lineClass = (line: string, suite: "normal" | "behavioral", passed: boolean | undefined) => {
    if (/pass|✓/i.test(line)) return "pass-line";
    if (/fail|error|expected/i.test(line)) return testTone(suite, passed) === "signal" ? "signal-line" : "fail-line";
    return suite === "behavioral" && /behavioral|challenge/i.test(line) ? "signal-line" : "";
  };
  const block = (command: string, output: string, suite: "normal" | "behavioral", passed: boolean | undefined) => <>{[command, ...output.split("\n")].map((line, index) => <span className={lineClass(line, suite, passed)} key={`${suite}-${index}-${line}`}>{line}{"\n"}</span>)}</>;
  return (
    <section className="terminal" aria-label="Test output">
      <div className="terminal-head"><span>verification output / test + behavioral check</span><span>{normal || behavioral ? `exit ${normal?.exitCode || behavioral?.exitCode || 0}` : "ready"}</span></div>
      <pre>{normal || behavioral ? <>{block("$ npm run test", normal?.output || "Waiting for normal suite...", "normal", normal?.passed)}{"\n"}{block("$ npm run test:challenge", behavioral?.output || "Waiting for behavioral check...", "behavioral", behavioral?.passed)}</> : "Run checks after you submit your plan. Normal tests and the hidden behavioral test will appear here."}</pre>
    </section>
  );
}
