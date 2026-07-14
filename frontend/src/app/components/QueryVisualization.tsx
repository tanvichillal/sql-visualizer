import { useState } from "react";
import { useTheme } from "./ThemeContext";
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Moon, Sun, ArrowRight, Database } from "lucide-react";

interface QueryVisualizationProps {
  onNavigate: (page: string) => void;
}

const allEmployees = [
  { id: 1, name: "Alice Johnson", dept_id: 1, dept: "Engineering", salary: 85000, highlight: true },
  { id: 2, name: "Bob Smith", dept_id: 2, dept: "Marketing", salary: 72000, highlight: true },
  { id: 3, name: "Carol White", dept_id: 1, dept: "Engineering", salary: 91000, highlight: true },
  { id: 4, name: "David Lee", dept_id: 3, dept: "Support", salary: 38000, highlight: false },
  { id: 5, name: "Emma Davis", dept_id: 2, dept: "Marketing", salary: 67000, highlight: true },
  { id: 6, name: "Frank Wilson", dept_id: 1, dept: "Engineering", salary: 79000, highlight: true },
];

type StepId = "original" | "join" | "where" | "groupby" | "having" | "select" | "orderby";

const steps: { id: StepId; label: string; clause: string; color: string; bg: string; border: string; description: string; details: string[] }[] = [
  {
    id: "original",
    label: "Source Tables",
    clause: "FROM",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/30",
    description: "Loading tables into memory",
    details: [
      "employees table: 6 rows loaded",
      "departments table: 3 rows loaded",
      "Total rows: 9 rows in memory",
    ],
  },
  {
    id: "join",
    label: "JOIN Applied",
    clause: "JOIN",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    description: "INNER JOIN on dept_id = departments.id",
    details: [
      "Matching employees to departments",
      "Each employee row combined with department row",
      "Result: 6 combined rows",
    ],
  },
  {
    id: "where",
    label: "WHERE Filtered",
    clause: "WHERE",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/30",
    description: "Filtering: salary > 40,000",
    details: [
      "❌ David Lee ($38,000) — EXCLUDED",
      "✓ 5 rows pass the filter",
      "1 row eliminated",
    ],
  },
  {
    id: "groupby",
    label: "GROUP BY",
    clause: "GROUP BY",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    description: "Grouping by department_name",
    details: [
      "Engineering group: Alice, Carol, Frank (3 rows)",
      "Marketing group: Bob, Emma (2 rows)",
      "Support group: (0 rows after WHERE)",
    ],
  },
  {
    id: "having",
    label: "HAVING Filter",
    clause: "HAVING",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    description: "COUNT(e.id) >= 2 — filters groups",
    details: [
      "Engineering: COUNT=3 ✓ passes",
      "Marketing: COUNT=2 ✓ passes",
      "No other groups remain",
    ],
  },
  {
    id: "select",
    label: "SELECT Computed",
    clause: "SELECT",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    description: "Computing aggregate values per group",
    details: [
      "Engineering: COUNT=3, AVG=$85,000, MAX=$91,000",
      "Marketing: COUNT=2, AVG=$69,500, MAX=$72,000",
      "Projection applied to 2 groups",
    ],
  },
  {
    id: "orderby",
    label: "ORDER BY",
    clause: "ORDER BY",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    description: "Sorting by avg_salary DESC",
    details: [
      "Engineering avg $85,000 → row 1",
      "Marketing avg $69,500 → row 2",
      "Final result: 2 rows",
    ],
  },
];

const stepData: Record<StepId, { headers: string[]; rows: (string | number)[][] }> = {
  original: {
    headers: ["id", "name", "dept_id", "salary"],
    rows: allEmployees.map(e => [e.id, e.name, e.dept_id, `$${e.salary.toLocaleString()}`]),
  },
  join: {
    headers: ["e.id", "e.name", "department_name", "salary"],
    rows: allEmployees.map(e => [e.id, e.name, e.dept, `$${e.salary.toLocaleString()}`]),
  },
  where: {
    headers: ["e.id", "e.name", "department_name", "salary"],
    rows: allEmployees.filter(e => e.highlight).map(e => [e.id, e.name, e.dept, `$${e.salary.toLocaleString()}`]),
  },
  groupby: {
    headers: ["department_name", "members"],
    rows: [
      ["Engineering", "Alice, Carol, Frank"],
      ["Marketing", "Bob, Emma"],
    ],
  },
  having: {
    headers: ["department_name", "count", "passes?"],
    rows: [
      ["Engineering", 3, "✓ YES"],
      ["Marketing", 2, "✓ YES"],
    ],
  },
  select: {
    headers: ["department_name", "headcount", "avg_salary", "max_salary"],
    rows: [
      ["Engineering", 3, "$85,000", "$91,000"],
      ["Marketing", 2, "$69,500", "$72,000"],
    ],
  },
  orderby: {
    headers: ["department_name", "headcount", "avg_salary", "max_salary"],
    rows: [
      ["Engineering", 3, "$85,000", "$91,000"],
      ["Marketing", 2, "$69,500", "$72,000"],
    ],
  },
};

export function QueryVisualization({ onNavigate }: QueryVisualizationProps) {
  const { theme, toggle } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const step = steps[currentStep];
  const data = stepData[step.id];

  const next = () => setCurrentStep(s => Math.min(steps.length - 1, s + 1));
  const prev = () => setCurrentStep(s => Math.max(0, s - 1));
  const reset = () => { setCurrentStep(0); setPlaying(false); };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="h-12 flex items-center gap-3 px-4 border-b border-border bg-card/50 flex-shrink-0">
        <button onClick={() => onNavigate("workspace")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Workspace
        </button>
        <div className="w-px h-4 bg-border" />
        <span className="text-sm font-medium">Query Execution Visualization</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={toggle} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 p-6 gap-6">
        {/* Step timeline (left) */}
        <div className="w-52 flex-shrink-0 flex flex-col gap-1 overflow-y-auto pr-2">
          <p className="text-xs text-muted-foreground mb-3 font-medium">Execution Order</p>
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrentStep(i)}
              className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
                currentStep === i
                  ? `${s.bg} ${s.border} border`
                  : i < currentStep
                  ? "border-transparent bg-muted/30 opacity-70"
                  : "border-transparent hover:bg-muted/20"
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold flex-shrink-0 ${
                i < currentStep ? "bg-emerald-500 text-white" :
                currentStep === i ? `${s.bg} ${s.color}` :
                "bg-muted text-muted-foreground"
              }`}>
                {i < currentStep ? "✓" : i + 1}
              </div>
              <div>
                <div className={`text-xs font-medium ${currentStep === i ? s.color : "text-foreground/80"}`}>{s.clause}</div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Center: visualization */}
        <div className="flex-1 flex flex-col min-w-0 gap-4">
          {/* Step header */}
          <div className={`p-5 rounded-2xl border ${step.bg} ${step.border} transition-all duration-300`}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`px-2.5 py-1 rounded-lg text-sm font-mono font-semibold bg-background/50 ${step.color}`}>{step.clause}</span>
              <div>
                <div className="text-sm font-medium text-foreground">{step.description}</div>
                <div className="text-xs text-muted-foreground">Step {currentStep + 1} of {steps.length}</div>
              </div>
            </div>
            <div className="space-y-1.5">
              {step.details.map((d, i) => (
                <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <ArrowRight className={`w-3 h-3 mt-0.5 flex-shrink-0 ${step.color}`} />
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Data table */}
          <div className="flex-1 rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {step.id === "original" ? "employees table" :
                   step.id === "join" ? "After JOIN" :
                   step.id === "where" ? "After WHERE filter" :
                   step.id === "groupby" ? "After GROUP BY" :
                   step.id === "having" ? "After HAVING filter" :
                   step.id === "select" ? "After SELECT aggregation" :
                   "Final Result"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{data.rows.length} row{data.rows.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 sticky top-0">
                  <tr>
                    {data.headers.map(h => (
                      <th key={h} className={`px-5 py-3 text-left text-xs font-medium ${step.color}`} style={{ fontFamily: "var(--font-family-mono)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={`border-t border-border transition-all duration-500 hover:bg-muted/20 ${
                        step.id === "where" ? "opacity-100" : ""
                      }`}
                      style={{ animationDelay: `${ri * 60}ms` }}
                    >
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-5 py-3 text-xs" style={{ fontFamily: ci > 0 && typeof cell === "number" ? "var(--font-family-mono)" : undefined }}>
                          <span className={
                            typeof cell === "number" ? "font-mono text-orange-400" :
                            String(cell).startsWith("$") ? "font-mono text-emerald-400" :
                            String(cell).includes("YES") ? "text-emerald-400" :
                            "text-foreground"
                          }>{cell}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={reset} className="p-2 rounded-xl border border-border hover:bg-muted transition-colors text-muted-foreground">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="flex-1 mx-6">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                />
              </div>
              <div className="text-center text-xs text-muted-foreground mt-1">{currentStep + 1} / {steps.length}</div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={prev} disabled={currentStep === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <button onClick={next} disabled={currentStep === steps.length - 1} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* SQL snippet right */}
        <div className="w-56 flex-shrink-0">
          <div className="p-4 rounded-2xl border border-border bg-card h-full">
            <div className="text-xs font-medium text-muted-foreground mb-3">Query Reference</div>
            <div className="text-xs space-y-0.5" style={{ fontFamily: "var(--font-family-mono)" }}>
              {[
                { text: "SELECT d.department_name,", highlight: step.id === "select" },
                { text: "  COUNT(e.id),", highlight: step.id === "select" },
                { text: "  AVG(e.salary),", highlight: step.id === "select" },
                { text: "  MAX(e.salary)", highlight: step.id === "select" },
                { text: "FROM employees e", highlight: step.id === "original" },
                { text: "JOIN departments d", highlight: step.id === "join" },
                { text: "  ON e.dept_id = d.id", highlight: step.id === "join" },
                { text: "WHERE e.salary > 40000", highlight: step.id === "where" },
                { text: "GROUP BY d.department_name", highlight: step.id === "groupby" },
                { text: "HAVING COUNT(e.id) >= 2", highlight: step.id === "having" },
                { text: "ORDER BY avg_salary DESC;", highlight: step.id === "orderby" },
              ].map((line, i) => (
                <div key={i} className={`px-2 py-0.5 rounded transition-colors ${line.highlight ? `${step.bg} ${step.color}` : "text-muted-foreground"}`}>
                  {line.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
