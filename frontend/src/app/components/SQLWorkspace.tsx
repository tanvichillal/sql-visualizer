import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "./ThemeContext";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  Database, Play, Zap, RotateCcw, ChevronLeft, ChevronRight,
  Moon, Sun, Table2, Code2, Loader2, AlertCircle, Star, Wifi,
  WifiOff, GripHorizontal, Plus, Trash2, ClipboardPaste, X,
  Check, PenLine
} from "lucide-react";
import { visualizeQuery, healthCheck, type ExecutionStep, type TableDef } from "../api";
import { queryStore } from "../queryStore";
import { useAuth } from "../AuthContext";

interface SQLWorkspaceProps { onNavigate: (page: string) => void; }

// ── syntax highlighter ────────────────────────────────────────────────────────
const C={dml:"#c084fc",clause:"#60a5fa",fn:"#34d399",ddl:"#f472b6",type:"#fb923c",string:"#a3e635",number:"#fbbf24",comment:"#6b7280",op:"#e879f9",punct:"#94a3b8"};
const RULES:{re:RegExp;color:string;bold?:boolean;italic?:boolean}[]=[
  {re:/(\/\*[\s\S]*?\*\/)/g,color:C.comment,italic:true},
  {re:/(--[^\n]*)/g,color:C.comment,italic:true},
  {re:/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g,color:C.string},
  {re:/\b(SELECT|INSERT|UPDATE|DELETE|INTO|VALUES|SET)\b/gi,color:C.dml,bold:true},
  {re:/\b(FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|AS|IN|EXISTS|BETWEEN|LIKE|IS|AND|OR|NOT|CASE|WHEN|THEN|ELSE|END)\b/gi,color:C.clause,bold:true},
  {re:/\b(COUNT|SUM|AVG|MIN|MAX|COALESCE|IFNULL|NULLIF|CONCAT|LENGTH|UPPER|LOWER|TRIM|SUBSTR|SUBSTRING|REPLACE|ROUND|FLOOR|CEIL|NOW|DATE|CAST|ROW_NUMBER|RANK|DENSE_RANK|NTILE|LEAD|LAG|FIRST_VALUE|LAST_VALUE|OVER|PARTITION\s+BY)\b/gi,color:C.fn,bold:true},
  {re:/\b(CREATE|DROP|ALTER|TRUNCATE|TABLE|VIEW|INDEX|PRIMARY|FOREIGN|KEY|DEFAULT|NULL|UNIQUE)\b/gi,color:C.ddl,bold:true},
  {re:/\b(INT|INTEGER|BIGINT|FLOAT|DOUBLE|DECIMAL|VARCHAR|TEXT|DATE|DATETIME|BOOLEAN|BOOL)\b/gi,color:C.type},
  {re:/\b(\d+(?:\.\d+)?)\b/g,color:C.number},
  {re:/([=<>!]+|\|\|)/g,color:C.op},
  {re:/([(),;])/g,color:C.punct},
];
function esc(s:string){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function highlight(sql:string):string{
  type T={start:number;end:number;color:string;bold?:boolean;italic?:boolean};
  const toks:T[]=[];
  for(const{re,color,bold,italic}of RULES){re.lastIndex=0;let m;while((m=re.exec(sql))!==null)toks.push({start:m.index,end:m.index+m[0].length,color,bold,italic});}
  toks.sort((a,b)=>a.start-b.start||b.end-a.end);
  const kept:T[]=[];let cur2=0;
  for(const t of toks){if(t.start>=cur2){kept.push(t);cur2=t.end;}}
  let html="",pos=0;
  for(const t of kept){
    if(t.start>pos)html+=esc(sql.slice(pos,t.start));
    const st=[`color:${t.color}`,t.bold?"font-weight:700":"",t.italic?"font-style:italic":""].filter(Boolean).join(";");
    html+=`<span style="${st}">${esc(sql.slice(t.start,t.end))}</span>`;
    pos=t.end;
  }
  if(pos<sql.length)html+=esc(sql.slice(pos));
  return html+"\n";
}

// ── table parsers ─────────────────────────────────────────────────────────────
function parseHtmlTable(html:string):{headers:string[];rows:string[][];name:string}|null{
  try{
    const doc=new DOMParser().parseFromString(html,"text/html");
    const tbl=doc.querySelector("table");if(!tbl)return null;
    const caption=tbl.querySelector("caption")?.textContent?.trim();
    const nameMatch=html.match(/(?:Table|table)\s*:?\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1]
      ||html.match(/<h[1-6][^>]*>([^<]{1,40})<\/h[1-6]>/)?.[1]?.trim()||caption||"";
    const hEls=Array.from(tbl.querySelectorAll("thead tr th,thead tr td"));
    const headers=hEls.length>0?hEls.map(e=>e.textContent?.trim()||"")
      :Array.from(tbl.querySelectorAll("tr:first-child th,tr:first-child td")).map(e=>e.textContent?.trim()||"");
    const bodyRows=hEls.length>0?tbl.querySelectorAll("tbody tr"):Array.from(tbl.querySelectorAll("tr")).slice(1);
    const rows=Array.from(bodyRows).map(tr=>Array.from(tr.querySelectorAll("td,th")).map(td=>td.textContent?.trim()||"")).filter(r=>r.length>0);
    if(!headers.length)return null;
    return{headers,rows,name:nameMatch};
  }catch{return null;}
}
function parsePlainTable(text:string):{headers:string[];rows:string[][];name:string}|null{
  const lines=text.split("\n").map(l=>l.trim()).filter(Boolean);
  if(lines.length<2)return null;

  // ── LeetCode / MySQL CLI box format: +------+------+ | col | col | +------+------+ | val | val |
  // Detect: lines that are separator rows like +----+----+
  const isSep=(l:string)=>/^\+[-+]+\+$/.test(l);
  const isPipe=(l:string)=>l.startsWith("|")&&l.endsWith("|");
  if(lines.some(isSep)){
    // Extract all pipe rows, skip separator rows
    const pipeLines=lines.filter(l=>isPipe(l)&&!isSep(l));
    const splitPipe=(l:string)=>l.slice(1,-1).split("|").map(c=>c.trim());
    if(pipeLines.length>=2){
      const headers=splitPipe(pipeLines[0]).filter(h=>h!=="");
      const rows=pipeLines.slice(1).map(l=>splitPipe(l).filter((_,i)=>i<headers.length));
      if(headers.length>=1)return{headers,rows,name:""};
    }
  }

  // ── Markdown pipe table: | col | col |
  if(lines[0].includes("|")){
    const sp=(l:string)=>l.split("|").map(c=>c.trim()).filter(c=>c!=="");
    const headers=sp(lines[0]);
    const dataLines=lines.filter(l=>!/^[\s|:-]+$/.test(l)&&!isSep(l)).slice(1);
    const rows=dataLines.map(sp).filter(r=>r.length>0);
    if(headers.length>=2)return{headers,rows,name:""};
  }

  // ── Tab / multi-space separated
  const sp2=(l:string)=>l.split(/\t+|\s{2,}/).map(c=>c.trim()).filter(Boolean);
  const headers=sp2(lines[0]);
  if(headers.length>=2){const rows=lines.slice(1).map(sp2).filter(r=>r.length>0);return{headers,rows,name:""};}
  return null;
}
function inferType(vals:string[]):string{
  const ne=vals.filter(v=>v&&v.toLowerCase()!=="null");
  if(ne.every(v=>/^-?\d+$/.test(v)))return"INT";
  if(ne.every(v=>/^-?\d+\.?\d*$/.test(v)))return"DECIMAL(10,2)";
  return"VARCHAR(255)";
}
function toSQL(name:string,headers:string[],rows:string[][]):string{
  const safe=name.replace(/[^a-zA-Z0-9_]/g,"_").toLowerCase()||"imported_table";
  const cols=headers.map((h,i)=>`  ${h.replace(/[^a-zA-Z0-9_]/g,"_").toLowerCase()} ${inferType(rows.map(r=>r[i]||""))}`);
  const create=`CREATE TABLE ${safe} (\n${cols.join(",\n")}\n);\n`;
  const ins=rows.map(row=>{
    const vals=headers.map((_,i)=>{const v=row[i]??"NULL";if(!v||v.toLowerCase()==="null")return"NULL";return inferType(rows.map(r=>r[i]||""))==="VARCHAR(255)"?`'${v.replace(/'/g,"''")}'`:v;});
    return`INSERT INTO ${safe} VALUES (${vals.join(", ")});`;
  });
  return create+ins.join("\n");
}

// ── clause meta ───────────────────────────────────────────────────────────────
const CLAUSE_META:{[k:string]:{bg:string;border:string;text:string;badge:string}}={
  FROM:      {bg:"bg-indigo-500/10", border:"border-indigo-500/30", text:"text-indigo-400",  badge:"bg-indigo-500"},
  JOIN:      {bg:"bg-amber-500/10",  border:"border-amber-500/30",  text:"text-amber-400",   badge:"bg-amber-500"},
  "LEFT JOIN":{bg:"bg-amber-500/10", border:"border-amber-500/30",  text:"text-amber-400",   badge:"bg-amber-500"},
  "RIGHT JOIN":{bg:"bg-amber-500/10",border:"border-amber-500/30",  text:"text-amber-400",   badge:"bg-amber-500"},
  "INNER JOIN":{bg:"bg-amber-500/10",border:"border-amber-500/30",  text:"text-amber-400",   badge:"bg-amber-500"},
  "FULL JOIN":{bg:"bg-amber-500/10", border:"border-amber-500/30",  text:"text-amber-400",   badge:"bg-amber-500"},
  WHERE:     {bg:"bg-pink-500/10",   border:"border-pink-500/30",   text:"text-pink-400",    badge:"bg-pink-500"},
  "GROUP BY":{bg:"bg-emerald-500/10",border:"border-emerald-500/30",text:"text-emerald-400", badge:"bg-emerald-500"},
  HAVING:    {bg:"bg-cyan-500/10",   border:"border-cyan-500/30",   text:"text-cyan-400",    badge:"bg-cyan-500"},
  SELECT:    {bg:"bg-purple-500/10", border:"border-purple-500/30", text:"text-purple-400",  badge:"bg-purple-500"},
  "ORDER BY":{bg:"bg-orange-500/10", border:"border-orange-500/30", text:"text-orange-400",  badge:"bg-orange-500"},
};
const defMeta={bg:"bg-indigo-500/10",border:"border-indigo-500/30",text:"text-indigo-400",badge:"bg-indigo-500"};

function detectTopic(sql:string):string{
  const u=sql.toUpperCase();
  if(/OVER\s*\(/.test(u))return"Window Functions";
  if(/\bJOIN\b/.test(u)&&/GROUP\s+BY/.test(u))return"JOIN + GROUP BY";
  if(/\bJOIN\b/.test(u))return"JOIN";
  if(/GROUP\s+BY/.test(u))return"GROUP BY";
  if(/SELECT.*SELECT/s.test(u))return"Subqueries";
  if(/WHERE/.test(u))return"WHERE";
  return"General";
}

// ── defaults ──────────────────────────────────────────────────────────────────
const DEFAULT_SQL=`SELECT
  d.department_name,
  COUNT(e.id)    AS headcount,
  AVG(e.salary)  AS avg_salary,
  MAX(e.salary)  AS max_salary
FROM employees e
JOIN departments d ON e.dept_id = d.id
WHERE e.salary > 40000
GROUP BY d.department_name
HAVING COUNT(e.id) >= 2
ORDER BY avg_salary DESC;`;

const DEFAULT_TABLES:TableDef[]=[
  {name:"employees",columns:[{name:"id",type:"INT"},{name:"name",type:"VARCHAR"},{name:"dept_id",type:"INT"},{name:"salary",type:"DECIMAL"}],
   rows:[["1","Alice Johnson","1","85000"],["2","Bob Smith","2","72000"],["3","Carol White","1","91000"],["4","David Lee","3","38000"],["5","Emma Davis","2","67000"],["6","Frank Wilson","1","79000"]]},
  {name:"departments",columns:[{name:"id",type:"INT"},{name:"department_name",type:"VARCHAR"}],
   rows:[["1","Engineering"],["2","Marketing"],["3","Support"]]},
];

// ── EditableTable ─────────────────────────────────────────────────────────────
interface EditableTableProps{table:TableDef;onChange:(t:TableDef)=>void;onRemove:()=>void;}
function EditableTable({table,onChange,onRemove}:EditableTableProps){
  const addRow=()=>onChange({...table,rows:[...table.rows,table.columns.map(()=>"")]});
  const addCol=()=>onChange({...table,columns:[...table.columns,{name:`col${table.columns.length+1}`,type:"VARCHAR"}],rows:table.rows.map(r=>[...r,""])});
  const setCell=(ri:number,ci:number,v:string)=>{const rows=table.rows.map((r,i)=>i===ri?r.map((c,j)=>j===ci?v:c):r);onChange({...table,rows});};
  const setColName=(ci:number,v:string)=>onChange({...table,columns:table.columns.map((c,i)=>i===ci?{...c,name:v}:c)});
  const delRow=(ri:number)=>onChange({...table,rows:table.rows.filter((_,i)=>i!==ri)});
  const delCol=(ci:number)=>onChange({...table,columns:table.columns.filter((_,i)=>i!==ci),rows:table.rows.map(r=>r.filter((_,i)=>i!==ci))});
  return(
    <div className="rounded-xl border border-border bg-card/40 overflow-hidden mb-3">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
        <Table2 className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0"/>
        <input value={table.name} onChange={e=>onChange({...table,name:e.target.value})}
          className="flex-1 text-xs font-semibold bg-transparent text-foreground outline-none border-b border-transparent focus:border-primary/50 transition-colors min-w-0"/>
        <button onClick={addCol} className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors flex items-center gap-1 flex-shrink-0"><Plus className="w-2.5 h-2.5"/>Col</button>
        <button onClick={onRemove} className="p-1 rounded hover:bg-red-500/10 transition-colors flex-shrink-0"><Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-400"/></button>
      </div>
      <div style={{overflowX:"auto",scrollbarWidth:"none"}} className="[&::-webkit-scrollbar]:hidden">
        <table className="text-[11px] whitespace-nowrap w-full">
          <thead>
            <tr className="bg-muted/30">
              {table.columns.map((col,ci)=>(
                <th key={ci} className="px-2 py-1.5 text-left font-medium group">
                  <div className="flex items-center gap-1">
                    <input value={col.name} onChange={e=>setColName(ci,e.target.value)}
                      className="bg-transparent text-muted-foreground outline-none w-20 focus:text-foreground transition-colors border-b border-transparent focus:border-primary/50"/>
                    <button onClick={()=>delCol(ci)} className="opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-2.5 h-2.5 text-muted-foreground hover:text-red-400"/></button>
                  </div>
                </th>
              ))}
              <th className="w-6"/>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row,ri)=>(
              <tr key={ri} className="border-t border-border group hover:bg-muted/20">
                {row.map((cell,ci)=>(
                  <td key={ci} className="px-2 py-1">
                    <input value={cell} onChange={e=>setCell(ri,ci,e.target.value)}
                      className="bg-transparent font-mono text-foreground/80 outline-none w-full focus:text-foreground transition-colors"/>
                  </td>
                ))}
                <td className="px-1"><button onClick={()=>delRow(ri)} className="opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3 text-muted-foreground hover:text-red-400"/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addRow} className="w-full py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors flex items-center justify-center gap-1 border-t border-border">
        <Plus className="w-2.5 h-2.5"/>Add Row
      </button>
    </div>
  );
}

// ── SQL Editor ────────────────────────────────────────────────────────────────
const FONT:React.CSSProperties={fontFamily:"'JetBrains Mono','Fira Code',monospace",fontSize:"13px",lineHeight:"21px",tabSize:2};
interface SqlEditorProps{value:string;onChange:(v:string)=>void;}
function SqlEditor({value,onChange}:SqlEditorProps){
  const taRef=useRef<HTMLTextAreaElement>(null);
  const preRef=useRef<HTMLPreElement>(null);
  const gutRef=useRef<HTMLDivElement>(null);
  const sync=useCallback(()=>{
    if(!taRef.current)return;
    const{scrollTop,scrollLeft}=taRef.current;
    if(preRef.current){preRef.current.scrollTop=scrollTop;preRef.current.scrollLeft=scrollLeft;}
    if(gutRef.current)gutRef.current.scrollTop=scrollTop;
  },[]);
  useEffect(()=>{const el=taRef.current;if(!el)return;el.addEventListener("scroll",sync,{passive:true});return()=>el.removeEventListener("scroll",sync);},[sync]);
  const onKey=(e:React.KeyboardEvent<HTMLTextAreaElement>)=>{
    if(e.key!=="Tab")return;e.preventDefault();
    const ta=e.currentTarget,{selectionStart:s,selectionEnd:end}=ta;
    const next=value.slice(0,s)+"  "+value.slice(end);
    onChange(next);requestAnimationFrame(()=>{ta.selectionStart=ta.selectionEnd=s+2;});
  };
  const lines=value.split("\n");
  const gutW=Math.max(String(lines.length).length*9+28,44);
  const layer:React.CSSProperties={...FONT,position:"absolute",top:0,left:0,right:0,bottom:0,margin:0,padding:"14px 18px 14px 14px",border:"none",outline:"none",resize:"none",whiteSpace:"pre",overflowWrap:"normal",wordBreak:"normal",boxSizing:"border-box",overflow:"auto"};
  return(
    <div style={{display:"flex",width:"100%",height:"100%",overflow:"hidden",background:"var(--background)"}}>
      <div ref={gutRef} style={{width:gutW,flexShrink:0,overflow:"hidden",background:"var(--muted)",borderRight:"1px solid var(--border)",userSelect:"none",paddingTop:14,paddingBottom:14}}>
        {lines.map((_,i)=>(<div key={i} style={{...FONT,height:21,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:10,paddingLeft:6,color:"var(--muted-foreground)",opacity:0.45}}>{i+1}</div>))}
      </div>
      <div style={{flex:1,position:"relative",minWidth:0}}>
        <pre ref={preRef} aria-hidden style={{...layer,color:"var(--foreground)",background:"transparent",pointerEvents:"none",overflow:"hidden",zIndex:1}} dangerouslySetInnerHTML={{__html:highlight(value)}}/>
        <textarea ref={taRef} value={value} onChange={e=>onChange(e.target.value)} onKeyDown={onKey}
          spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
          style={{...layer,color:"transparent",background:"transparent",caretColor:"#818cf8",zIndex:2,WebkitTextFillColor:"transparent"} as React.CSSProperties}/>
      </div>
    </div>
  );
}

// ── JoinVenn — Venn diagram for JOIN types ────────────────────────────────────
interface JoinVennProps{joinType:string;meta:{text:string;badge:string};leftTable:string;rightTable:string;}
function JoinVenn({joinType,meta,leftTable,rightTable}:JoinVennProps){
  const jt=joinType.toUpperCase();
  // Determine which parts are filled
  const fillLeft =jt.includes("LEFT")||jt.includes("FULL");
  const fillRight=jt.includes("RIGHT")||jt.includes("FULL");
  const fillInner=true; // all joins have the intersection
  const fillLeftOnly =fillLeft&&!jt.includes("INNER");
  const fillRightOnly=fillRight&&!jt.includes("INNER");

  // Description text
  const desc=
    jt.includes("INNER")?"Returns only rows where both tables match — the intersection.":
    jt.includes("LEFT") ?"Returns all rows from the left table, plus matching rows from the right. Non-matches are NULL.":
    jt.includes("RIGHT")?"Returns all rows from the right table, plus matching rows from the left. Non-matches are NULL.":
    jt.includes("FULL") ?"Returns all rows from both tables. Non-matching rows get NULL on the missing side.":
    "Combines rows from both tables where the join condition is met.";

  // Color
  const cMatch="#f59e0b"; // amber for matched region
  const cLeft="#6366f1";  // indigo for left-only
  const cRight="#ec4899"; // pink for right-only
  const opacity=0.55;

  return(
    <div className="flex items-center gap-4 w-full">
      {/* SVG Venn */}
      <svg width="130" height="70" viewBox="0 0 130 70" className="flex-shrink-0">
        {/* Left circle fill */}
        <circle cx="42" cy="35" r="28"
          fill={fillLeftOnly||fillLeft?cLeft:"transparent"}
          fillOpacity={fillLeftOnly||fillLeft?opacity:0}
          stroke={cLeft} strokeWidth="1.5" strokeOpacity="0.8"/>
        {/* Right circle fill */}
        <circle cx="88" cy="35" r="28"
          fill={fillRightOnly||fillRight?cRight:"transparent"}
          fillOpacity={fillRightOnly||fillRight?opacity:0}
          stroke={cRight} strokeWidth="1.5" strokeOpacity="0.8"/>
        {/* Intersection highlight */}
        {fillInner&&(
          <path
            d="M65,12 Q80,22 80,35 Q80,48 65,58 Q50,48 50,35 Q50,22 65,12Z"
            fill={cMatch} fillOpacity={0.7}/>
        )}
        {/* Labels */}
        <text x="28" y="38" textAnchor="middle" fontSize="7" fill="white" fontWeight="600" opacity="0.9">{leftTable.slice(0,6)}</text>
        <text x="102" y="38" textAnchor="middle" fontSize="7" fill="white" fontWeight="600" opacity="0.9">{rightTable.slice(0,6)}</text>
        {fillInner&&<text x="65" y="38" textAnchor="middle" fontSize="6" fill="white" fontWeight="700" opacity="0.95">✓</text>}
      </svg>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold ${meta.text} uppercase tracking-wide`}>{joinType}</span>
          <div className="flex items-center gap-1.5">
            {fillLeft&&<span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"/>}
            {fillInner&&<span className="w-2 h-2 rounded-full bg-amber-500 inline-block"/>}
            {fillRight&&<span className="w-2 h-2 rounded-full bg-pink-500 inline-block"/>}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ── StepViz — full page visualization ────────────────────────────────────────
const SPEEDS={Slow:2400,Medium:1500,Fast:700};
type Speed="Slow"|"Medium"|"Fast";

interface StepVizProps{steps:ExecutionStep[];sql:string;onBack:()=>void;}
function StepViz({steps,sql,onBack}:StepVizProps){
  const{theme}=useTheme();
  const[cur,setCur]=useState(0);
  const[playing,setPlaying]=useState(false);
  const[animKey,setAnimKey]=useState(0);
  const[speed,setSpeed]=useState<Speed>("Medium");
  const timerRef=useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(()=>{
    if(!playing)return;
    timerRef.current=setTimeout(()=>{
      if(cur<steps.length-1){setCur(c=>c+1);setAnimKey(k=>k+1);}else setPlaying(false);
    },SPEEDS[speed]);
    return()=>{if(timerRef.current)clearTimeout(timerRef.current);};
  },[playing,cur,steps.length,speed]);

  const go=(i:number)=>{setCur(i);setAnimKey(k=>k+1);setPlaying(false);};
  const step=steps[cur];if(!step)return null;
  const meta=CLAUSE_META[step.clause]||defMeta;

  // theme-matched scrollbar colors
  const isDark=theme==="dark";
  const sbTrack=isDark?"#1a1d2e":"#f1f5f9";
  const sbThumb=isDark?"#374151":"#cbd5e1";
  const sbHover=isDark?"#4b5563":"#94a3b8";

  const sqlLines=sql.split("\n").map(line=>{
    const u=line.toUpperCase().trim();
    let active=false;
    if(step.clause==="SELECT"&&u.startsWith("SELECT"))active=true;
    if(step.clause==="FROM"&&u.startsWith("FROM"))active=true;
    if(step.clause.includes("JOIN")&&(u.includes("JOIN")||u.startsWith("ON")))active=true;
    if(step.clause==="WHERE"&&u.startsWith("WHERE"))active=true;
    if(step.clause==="GROUP BY"&&u.startsWith("GROUP"))active=true;
    if(step.clause==="HAVING"&&u.startsWith("HAVING"))active=true;
    if(step.clause==="ORDER BY"&&u.startsWith("ORDER"))active=true;
    return{line,active};
  });

  return(
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <style>{`
        @keyframes fadeSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .sb-viz::-webkit-scrollbar{width:6px;height:6px;}
        .sb-viz::-webkit-scrollbar-track{background:${sbTrack};}
        .sb-viz::-webkit-scrollbar-thumb{background:${sbThumb};border-radius:3px;}
        .sb-viz::-webkit-scrollbar-thumb:hover{background:${sbHover};}
        .sb-ref::-webkit-scrollbar{width:4px;}
        .sb-ref::-webkit-scrollbar-track{background:${sbTrack};}
        .sb-ref::-webkit-scrollbar-thumb{background:${sbThumb};border-radius:2px;}
      `}</style>

      {/* Header */}
      <header className="h-11 flex items-center gap-3 px-4 border-b border-border bg-card/50 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-3.5 h-3.5"/>Back to Workspace
        </button>
        <div className="w-px h-4 bg-border"/>
        <Zap className="w-4 h-4 text-purple-400"/>
        <span className="text-sm font-semibold">Execution Visualization</span>
        <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400">{steps.length} steps</span>
        <div className="ml-auto flex items-center gap-3">
          {/* Speed control */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-muted/50 border border-border">
            <span className="text-[10px] text-muted-foreground font-medium">Speed</span>
            <div className="w-px h-3 bg-border mx-0.5"/>
            {(["Slow","Medium","Fast"] as Speed[]).map(s=>(
              <button key={s} onClick={()=>setSpeed(s)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${speed===s?"bg-primary text-primary-foreground shadow-sm":"text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                {s==="Slow"?"🐢 Slow":s==="Medium"?"⚡ Med":"🚀 Fast"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 p-4 gap-4">
        {/* Left: step timeline */}
        <div className="w-48 flex-shrink-0 flex flex-col gap-1" style={{overflowY:"auto",scrollbarWidth:"none"}}>
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1 flex-shrink-0">Execution Order</p>
          {steps.map((s,i)=>{
            const m=CLAUSE_META[s.clause]||defMeta;
            return(
              <button key={i} onClick={()=>go(i)}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all border ${cur===i?`${m.bg} ${m.border}`:i<cur?"border-transparent bg-muted/20 opacity-60":"border-transparent hover:bg-muted/20"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-mono font-bold flex-shrink-0 ${i<cur?"bg-emerald-500 text-white":cur===i?`${m.bg} ${m.text}`:"bg-muted text-muted-foreground"}`}>
                  {i<cur?<Check className="w-3 h-3"/>:i+1}
                </div>
                <div className="min-w-0">
                  <div className={`text-[10px] font-semibold truncate ${cur===i?m.text:"text-foreground/70"}`}>{s.clause}</div>
                  <div className="text-[9px] text-muted-foreground leading-tight truncate">{s.title.split(" ").slice(0,4).join(" ")}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Center: step card + table + controls */}
        <div className="flex-1 flex flex-col min-w-0 gap-3">

          {/* Step card */}
          <div key={`card-${animKey}`} className={`p-4 rounded-2xl border ${meta.bg} ${meta.border} flex-shrink-0`} style={{animation:"fadeSlideIn 0.35s ease"}}>
            <div className="flex items-start gap-3">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-background/40 ${meta.text} flex-shrink-0 mt-0.5`}>{step.clause}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-sm font-semibold text-foreground">{step.title}</span>
                  <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted/60">Step {cur+1} of {steps.length}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{step.rowCount} row{step.rowCount!==1?"s":""}</span>
                </div>
                {/* Clean explanation — strip markdown symbols, render key parts */}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {step.explanation
                    .replace(/\*\*([^*]+)\*\*/g, '$1')  // strip **bold**
                    .replace(/`([^`]+)`/g, '$1')          // strip `code`
                  }
                </p>

                {/* JOIN schema connector + Venn */}
                {step.joinMeta&&(
                  <div className={`mt-3 rounded-xl border ${meta.border} bg-background/30 overflow-hidden`}>

                    {/* Schema diagram — two table boxes connected by a keyed line */}
                    <div className="px-4 py-3 flex items-center gap-0">
                      {/* Left table */}
                      <div className="flex-shrink-0">
                        <div className={`text-[9px] font-bold uppercase tracking-widest ${meta.text} mb-1 px-0.5`}>{step.joinMeta.leftTable}</div>
                        <div className={`rounded-lg border ${meta.border} bg-background/60 overflow-hidden`} style={{minWidth:90}}>
                          {/* key column highlighted */}
                          <div className={`px-3 py-1.5 ${meta.bg} border-b ${meta.border} flex items-center gap-2`}>
                            <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0 opacity-80">
                              <circle cx="4" cy="4" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.2" className={meta.text}/>
                              <circle cx="4" cy="4" r="1.5" fill="currentColor" className={meta.text}/>
                            </svg>
                            <span className={`font-mono text-[11px] font-semibold ${meta.text}`}>{step.joinMeta.leftKey}</span>
                          </div>
                          <div className="px-3 py-1 opacity-40">
                            <span className="font-mono text-[10px] text-muted-foreground">···</span>
                          </div>
                        </div>
                      </div>

                      {/* Connector line with ON label */}
                      <div className="flex-1 flex flex-col items-center gap-0.5 px-2 min-w-0">
                        <span className={`text-[9px] font-bold uppercase tracking-widest ${meta.text} opacity-70`}>ON</span>
                        <div className="w-full flex items-center">
                          <div className={`h-px flex-1 ${meta.badge} opacity-60`}/>
                          <div className={`w-2 h-2 rotate-45 border-r border-t ${meta.border} flex-shrink-0`} style={{borderColor:`currentColor`}}/>
                        </div>
                        <span className={`text-[9px] ${meta.text} opacity-60 font-medium`}>{step.rowCount} matched</span>
                      </div>

                      {/* Right table */}
                      <div className="flex-shrink-0">
                        <div className={`text-[9px] font-bold uppercase tracking-widest ${meta.text} mb-1 px-0.5`}>{step.joinMeta.rightTable}</div>
                        <div className={`rounded-lg border ${meta.border} bg-background/60 overflow-hidden`} style={{minWidth:90}}>
                          <div className={`px-3 py-1.5 ${meta.bg} border-b ${meta.border} flex items-center gap-2`}>
                            <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0 opacity-80">
                              <circle cx="4" cy="4" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.2" className={meta.text}/>
                              <circle cx="4" cy="4" r="1.5" fill="currentColor" className={meta.text}/>
                            </svg>
                            <span className={`font-mono text-[11px] font-semibold ${meta.text}`}>{step.joinMeta.rightKey}</span>
                          </div>
                          <div className="px-3 py-1 opacity-40">
                            <span className="font-mono text-[10px] text-muted-foreground">···</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Venn + type description */}
                    <div className={`border-t ${meta.border} px-3 py-2.5 flex items-center gap-4`}>
                      <JoinVenn joinType={step.clause} meta={meta} leftTable={step.joinMeta.leftTable} rightTable={step.joinMeta.rightTable}/>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Data table */}
          <div key={`tbl-${animKey}`} className="flex-1 rounded-2xl border border-border bg-card overflow-hidden flex flex-col min-h-0" style={{animation:"fadeSlideIn 0.4s ease 0.05s both"}}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-muted-foreground"/>
                <span className="text-xs font-medium text-foreground">After {step.clause}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{step.rowCount} row{step.rowCount!==1?"s":""}</span>
            </div>
            <div className="sb-viz flex-1" style={{overflowX:"auto",overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:`${sbThumb} ${sbTrack}`}}>
              <table className="text-xs whitespace-nowrap w-full">
                <thead className="sticky top-0 bg-muted/50" style={{backdropFilter:"blur(4px)"}}>
                  <tr>{step.columns.map(h=>(<th key={h} className={`px-4 py-2 text-left text-xs font-mono font-semibold ${meta.text}`}>{h}</th>))}</tr>
                </thead>
                <tbody>
                  {step.rows.map((row,ri)=>(
                    <tr key={ri} className="border-t border-border hover:bg-muted/20 transition-colors" style={{animation:`fadeSlideIn 0.3s ease ${ri*40}ms both`}}>
                      {row.map((cell,ci)=>(<td key={ci} className="px-4 py-2 font-mono"><span className={/^\d+$/.test(cell)?"text-orange-400":/^\d+\.\d+$/.test(cell)?"text-emerald-400":"text-foreground/85"}>{cell}</span></td>))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button onClick={()=>{setCur(0);setAnimKey(k=>k+1);setPlaying(false);}} className="p-2 rounded-xl border border-border hover:bg-muted transition-colors text-muted-foreground" title="Reset">
              <RotateCcw className="w-4 h-4"/>
            </button>

            {/* Progress + speed label */}
            <div className="flex-1">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500" style={{width:`${((cur+1)/steps.length)*100}%`}}/>
              </div>
              <div className="flex items-center justify-between mt-1 px-0.5">
                <span className="text-[9px] text-muted-foreground/50">Step {cur+1}/{steps.length}</span>
                <span className="text-[9px] text-muted-foreground/50">
                  {speed==="Slow"?"🐢 Slow speed":speed==="Fast"?"🚀 Fast speed":"⚡ Medium speed"}
                </span>
              </div>
            </div>

            <button onClick={()=>setPlaying(p=>!p)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${playing?"border-purple-500/40 bg-purple-500/10 text-purple-400":"border-border hover:bg-muted text-muted-foreground"}`}>
              {playing?<>⏸ Pause</>:<>▶ Play</>}
            </button>
            <button onClick={()=>go(Math.max(0,cur-1))} disabled={cur===0} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-border text-xs hover:bg-muted disabled:opacity-40 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5"/>Prev
            </button>
            <button onClick={()=>go(Math.min(steps.length-1,cur+1))} disabled={cur===steps.length-1} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-40 transition-colors">
              Next<ChevronRight className="w-3.5 h-3.5"/>
            </button>
          </div>
        </div>

        {/* Right: SQL reference */}
        <div className="w-52 flex-shrink-0">
          <div className="h-full p-3 rounded-2xl border border-border bg-card flex flex-col overflow-hidden">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex-shrink-0">Query Reference</div>
            <div className="sb-ref flex-1" style={{overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:`${sbThumb} ${sbTrack}`}}>
              <div className="text-[11px] space-y-0.5" style={{fontFamily:"monospace"}}>
                {sqlLines.map((l,i)=>(
                  <div key={i} className={`px-2 py-0.5 rounded transition-all duration-300 ${l.active?`${meta.bg} ${meta.text} font-semibold`:"text-muted-foreground/55"}`}>
                    {l.line||" "}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main workspace ────────────────────────────────────────────────────────────
export function SQLWorkspace({onNavigate}:SQLWorkspaceProps){
  const{theme,toggle}=useTheme();
  const{user}=useAuth();
  const[problem,setProblem]=useState("Find the department name, headcount, average salary and maximum salary for departments that have at least 2 employees earning more than $40,000. Sort by average salary descending.");
  const[sql,setSql]=useState(DEFAULT_SQL);
  const[tables,setTables]=useState<TableDef[]>(DEFAULT_TABLES);
  const[steps,setSteps]=useState<ExecutionStep[]>([]);
  const[ran,setRan]=useState(false);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[backendOnline,setBackendOnline]=useState<boolean|null>(null);
  const[lastSavedId,setLastSavedId]=useState<string|null>(null);
  const[saveSuccess,setSaveSuccess]=useState(false);
  const[activeTab,setActiveTab]=useState<"tables"|"paste">("tables");
  const[pasteText,setPasteText]=useState("");
  const[pasteError,setPasteError]=useState<string|null>(null);
  const[pasteSuccess,setPasteSuccess]=useState<string|null>(null);
  const[outputHeight,setOutputHeight]=useState(200);
  const[showOutput,setShowOutput]=useState(false);
  const[showViz,setShowViz]=useState(false);

  const isDrag=useRef(false);const dragY=useRef(0);const dragH=useRef(0);

  useEffect(()=>{healthCheck().then(setBackendOnline);},[]);

  const lastStep=steps[steps.length-1];
  const output={columns:lastStep?.columns||[],rows:lastStep?.rows||[]};

  const updateTable=(i:number,t:TableDef)=>setTables(prev=>prev.map((p,idx)=>idx===i?t:p));
  const removeTable=(i:number)=>setTables(prev=>prev.filter((_,idx)=>idx!==i));
  const addTable=()=>setTables(prev=>[...prev,{name:`table${prev.length+1}`,columns:[{name:"id",type:"INT"},{name:"name",type:"VARCHAR"}],rows:[["1","example"]]}]);

  const importParsed=(parsed:{headers:string[];rows:string[][];name:string})=>{
    const name=parsed.name||`table${tables.length+1}`;
    const newTbl:TableDef={name,columns:parsed.headers.map((h,i)=>({name:h.replace(/[^a-zA-Z0-9_]/g,"_").toLowerCase(),type:inferType(parsed.rows.map(r=>r[i]||""))})),rows:parsed.rows};
    setTables(prev=>[...prev,newTbl]);
    // Do NOT inject CREATE TABLE SQL into the editor — tables are sent to backend separately
    setPasteSuccess(`✓ Imported "${name}" — ${parsed.rows.length} rows × ${parsed.headers.length} cols`);
    setPasteError(null);setPasteText("");setTimeout(()=>setPasteSuccess(null),3500);setActiveTab("tables");
  };

  const handlePasteImport=()=>{
    if(!pasteText.trim()){setPasteError("Nothing to import — paste some table content first.");return;}
    const parsed=parseHtmlTable(pasteText)||parsePlainTable(pasteText);
    if(!parsed||parsed.headers.length<2){setPasteError("Could not detect a table. Copy the table cells including the header row.");return;}
    importParsed(parsed);
  };

  const handleTextareaPaste=(e:React.ClipboardEvent<HTMLTextAreaElement>)=>{
    const htmlData=e.clipboardData.getData("text/html");
    const textData=e.clipboardData.getData("text/plain");
    // Try HTML first (rich copy from browser), then plain text (LeetCode box format, markdown, etc.)
    const parsed=(htmlData?parseHtmlTable(htmlData):null)||parsePlainTable(textData);
    if(parsed&&parsed.headers.length>=1&&parsed.rows.length>0){
      e.preventDefault(); // always prevent raw text from landing in textarea
      importParsed(parsed);
    }
    // If we couldn't parse it at all, let it fall through so user sees what they pasted
  };

  const runQuery=async()=>{
    setLoading(true);setError(null);setRan(false);setSteps([]);setShowOutput(false);setShowViz(false);
    try{
      const res=await visualizeQuery({problemStatement:problem,tables,sql});
      if(!res.success||res.error){setError(res.error||"Query failed");}
      else{
        setSteps(res.steps||[]);setRan(true);setShowOutput(true);
        const id=queryStore.add({sql,topic:detectTopic(sql),saved:false,rows:res.steps[res.steps.length-1]?.rowCount??0,duration:`${(Math.random()*0.09+0.01).toFixed(3)}ms`,steps:res.steps});
        setLastSavedId(id);
      }
    }catch(e:any){setError(e?.message||"Could not reach backend at localhost:8080");}
    finally{setLoading(false);}
  };

  const handleSave=()=>{
    if(!lastSavedId)return;
    queryStore.toggleSave(lastSavedId);setSaveSuccess(true);setTimeout(()=>setSaveSuccess(false),2000);
  };

  const handleReset=()=>{setSql(DEFAULT_SQL);setTables(DEFAULT_TABLES);setRan(false);setSteps([]);setError(null);setLastSavedId(null);setShowOutput(false);setShowViz(false);};

  const startDrag=(e:React.MouseEvent)=>{
    isDrag.current=true;dragY.current=e.clientY;dragH.current=outputHeight;
    const onMove=(ev:MouseEvent)=>{if(!isDrag.current)return;setOutputHeight(Math.max(100,Math.min(500,dragH.current-(ev.clientY-dragY.current))));};
    const onUp=()=>{isDrag.current=false;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
  };

  // full-page viz
  if(showViz&&steps.length>0)return <StepViz steps={steps} sql={sql} onBack={()=>setShowViz(false)}/>;

  return(
    <>
      <style>{`@keyframes fadeSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">

        {/* Header */}
        <header className="h-11 flex items-center gap-3 px-4 border-b border-border bg-card/50 flex-shrink-0">
          <button onClick={()=>onNavigate("dashboard")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-3.5 h-3.5"/>Dashboard
          </button>
          <div className="w-px h-4 bg-border"/>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Database className="w-2.5 h-2.5 text-white"/>
            </div>
            <span className="text-sm font-semibold">SQL Workspace</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${backendOnline===true?"bg-emerald-500/10 text-emerald-400":backendOnline===false?"bg-red-500/10 text-red-400":"bg-muted text-muted-foreground"}`}>
              {backendOnline===true?<Wifi className="w-2.5 h-2.5"/>:backendOnline===false?<WifiOff className="w-2.5 h-2.5"/>:<Loader2 className="w-2.5 h-2.5 animate-spin"/>}
              {backendOnline===true?"Backend live":backendOnline===false?"Backend offline":"Connecting…"}
            </div>
            <button onClick={toggle} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              {theme==="dark"?<Sun className="w-3.5 h-3.5"/>:<Moon className="w-3.5 h-3.5"/>}
            </button>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold" title={user?.email ?? ""}>{user?.displayName ? user.displayName.split(" ").map((n:string)=>n[0]).join("").toUpperCase().slice(0,2) : user?.email?.[0]?.toUpperCase()??"U"}</div>
          </div>
        </header>

        <div className="flex-1 min-h-0">
          <PanelGroup direction="horizontal" className="h-full">

            {/* LEFT: Problem + Tables */}
            <Panel defaultSize={26} minSize={18} maxSize={38}>
              <div className="h-full flex flex-col border-r border-border bg-card/10">

                {/* Problem statement — scrollbar HIDDEN */}
                <div className="p-3 border-b border-border flex-shrink-0">
                  <div className="flex items-center gap-1.5 mb-2">
                    <PenLine className="w-3 h-3 text-indigo-400"/>
                    <span className="text-[11px] font-semibold text-foreground">Problem Statement</span>
                  </div>
                  <textarea value={problem} onChange={e=>setProblem(e.target.value)}
                    placeholder="Describe what your SQL query should do…"
                    className="w-full text-[11px] text-foreground/80 bg-muted/30 border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 resize-none leading-relaxed placeholder:text-muted-foreground/50 transition-colors [&::-webkit-scrollbar]:hidden"
                    style={{scrollbarWidth:"none"}}
                    rows={4}/>
                </div>

                {/* Tab bar */}
                <div className="flex border-b border-border flex-shrink-0">
                  <button onClick={()=>setActiveTab("tables")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] transition-colors ${activeTab==="tables"?"text-primary border-b-2 border-primary":"text-muted-foreground hover:text-foreground"}`}>
                    <Table2 className="w-3 h-3"/>Tables
                  </button>
                  <button onClick={()=>setActiveTab("paste")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] transition-colors ${activeTab==="paste"?"text-primary border-b-2 border-primary":"text-muted-foreground hover:text-foreground"}`}>
                    <ClipboardPaste className="w-3 h-3"/>Paste from LeetCode
                  </button>
                </div>

                <div style={{flex:1,overflowY:"scroll",scrollbarWidth:"none"}} className="[&::-webkit-scrollbar]:hidden">

                  {activeTab==="tables"&&(
                    <div className="p-3">
                      {pasteSuccess&&(
                        <div className="flex items-center gap-2 mb-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
                          <Check className="w-3 h-3 flex-shrink-0"/>{pasteSuccess}
                        </div>
                      )}
                      {tables.map((t,i)=>(<EditableTable key={i} table={t} onChange={t=>updateTable(i,t)} onRemove={()=>removeTable(i)}/>))}
                      <button onClick={addTable}
                        className="w-full py-2 rounded-xl border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-muted/20 transition-colors flex items-center justify-center gap-1.5">
                        <Plus className="w-3 h-3"/>Add Table
                      </button>
                    </div>
                  )}

                  {activeTab==="paste"&&(
                    <div className="p-3 space-y-3">
                      <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-[11px] text-muted-foreground leading-relaxed">
                        <div className="text-purple-400 font-semibold mb-1.5 flex items-center gap-1.5">
                          <ClipboardPaste className="w-3 h-3"/>How to import from LeetCode / Codeforces
                        </div>
                        <ol className="space-y-1">
                          <li>1. Open the problem page</li>
                          <li>2. <strong className="text-foreground">Select the input table</strong></li>
                          <li>3. Copy (<kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">Ctrl+C</kbd>)</li>
                          <li>4. Paste below — auto-imports instantly</li>
                        </ol>
                      </div>
                      {pasteError&&(
                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">
                          <AlertCircle className="w-3 h-3 flex-shrink-0"/>{pasteError}
                        </div>
                      )}
                      {pasteSuccess&&(
                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
                          <Check className="w-3 h-3 flex-shrink-0"/>{pasteSuccess}
                        </div>
                      )}
                      <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)} onPaste={handleTextareaPaste}
                        placeholder="Paste your table here (Ctrl+V)…"
                        className="w-full text-[11px] bg-muted/30 border border-border rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-purple-500/30 resize-none text-foreground/80 placeholder:text-muted-foreground/50 transition-colors font-mono [&::-webkit-scrollbar]:hidden"
                        style={{scrollbarWidth:"none"}}
                        rows={8}/>
                      <button onClick={handlePasteImport}
                        className="w-full py-2 rounded-xl bg-purple-600 text-white text-[11px] font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-1.5">
                        <ClipboardPaste className="w-3 h-3"/>Import Table
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="w-[3px] bg-border hover:bg-primary/40 transition-colors cursor-col-resize"/>

            {/* CENTER + RIGHT: Editor + Output */}
            <Panel defaultSize={74} minSize={40}>
              <div className="h-full flex flex-col">

                {/* Editor toolbar */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0 gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Code2 className="w-3.5 h-3.5"/><span>SQL Editor</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {ran&&lastSavedId&&(
                      <button onClick={handleSave}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors ${saveSuccess?"bg-emerald-500/10 border-emerald-500/20 text-emerald-400":"bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20"}`}>
                        <Star className={`w-3 h-3 ${saveSuccess?"fill-amber-400":""}`}/>
                        {saveSuccess?"Saved!":"Save"}
                      </button>
                    )}
                    <button onClick={handleReset} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:bg-muted transition-colors">
                      <RotateCcw className="w-3 h-3"/>Reset
                    </button>
                    {ran&&steps.length>0&&(
                      <button onClick={()=>setShowViz(true)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20 transition-colors">
                        <Zap className="w-3 h-3"/>Visualize
                      </button>
                    )}
                    <button onClick={runQuery} disabled={loading}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow disabled:opacity-50">
                      {loading?<Loader2 className="w-3 h-3 animate-spin"/>:<Play className="w-3 h-3"/>}
                      {loading?"Running…":"Run Query"}
                    </button>
                  </div>
                </div>

                {/* Editor */}
                <div style={{flex:1,minHeight:0,overflow:"hidden",position:"relative"}}>
                  <SqlEditor value={sql} onChange={setSql}/>
                </div>

                {/* Error */}
                {error&&(
                  <div className="border-t border-red-500/20 bg-red-500/5 px-4 py-2.5 flex items-start gap-2 flex-shrink-0">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0"/>
                    <div>
                      <div className="text-[11px] font-semibold text-red-400">Error</div>
                      <div className="text-[11px] text-muted-foreground">{error}</div>
                      {(error.includes("localhost")||error.includes("fetch"))&&(
                        <div className="text-[10px] text-muted-foreground mt-1">Run: <code className="font-mono bg-muted px-1 rounded">cd backend && mvn spring-boot:run</code></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Resizable output */}
                {showOutput&&output.columns.length>0&&(
                  <div style={{height:outputHeight,flexShrink:0}} className="border-t border-border flex flex-col">
                    <div onMouseDown={startDrag}
                      className="flex items-center justify-between px-4 py-1.5 bg-muted/20 cursor-ns-resize select-none border-b border-border flex-shrink-0 group">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-foreground">Output</span>
                        <span className="text-[10px] text-muted-foreground">{output.rows.length} rows · {output.columns.length} cols</span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400">✓ Success</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">drag to resize</span>
                        <GripHorizontal className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors"/>
                      </div>
                    </div>
                    <div style={{flex:1,overflowX:"auto",overflowY:"auto",scrollbarWidth:"thin"}}>
                      <table className="text-xs whitespace-nowrap w-full">
                        <thead className="sticky top-0 bg-muted/60">
                          <tr>{output.columns.map(h=><th key={h} className="px-4 py-2 text-left text-muted-foreground font-mono font-medium border-b border-border">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {output.rows.map((row,i)=>(
                            <tr key={i} className={i%2===0?"bg-background":"bg-muted/10"} style={{animation:`fadeSlideIn 0.25s ease ${i*30}ms both`}}>
                              {row.map((cell,j)=>(
                                <td key={j} className="px-4 py-1.5 font-mono border-b border-border/30">
                                  <span className={/^\d+\.?\d*$/.test(cell)?"text-emerald-400":"text-foreground/90"}>{cell}</span>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Bottom hint */}
                {!ran&&!loading&&(
                  <div className="border-t border-border px-4 py-2 flex items-center gap-3 bg-card/20 flex-shrink-0">
                    <Zap className="w-3.5 h-3.5 text-purple-400 flex-shrink-0"/>
                    <p className="text-[11px] text-muted-foreground">Write your problem, edit the tables on the left, then click <strong className="text-foreground">Run Query</strong>. After running, click <strong className="text-foreground">Visualize</strong> for animated step-by-step execution.</p>
                  </div>
                )}
              </div>
            </Panel>
          </PanelGroup>
        </div>
      </div>
    </>
  );
}
