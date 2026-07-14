const BASE = "http://localhost:8080/api";

export interface ColumnDef { name: string; type: string; }
export interface TableDef { name: string; columns: ColumnDef[]; rows: string[][]; }
export interface VisualizeRequest { problemStatement: string; tables: TableDef[]; sql: string; }
export interface JoinMeta { leftTable: string; rightTable: string; leftKey: string; rightKey: string; }
export interface ExecutionStep {
  stepNumber: number; clause: string; title: string; explanation: string;
  sqlFragment: string; columns: string[]; rows: string[][]; rowCount: number; joinMeta?: JoinMeta;
}
export interface VisualizeResponse { steps: ExecutionStep[]; success: boolean; error?: string; }

export async function visualizeQuery(req: VisualizeRequest): Promise<VisualizeResponse> {
  const res = await fetch(`${BASE}/visualize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json();
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}
