/* ClearKYC Workstation — interactive analyst prototype */
const { useState, useEffect, useRef, useCallback } = React;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASE = window.CK_CASE;
const DOC = window.CK_DOC;
const GROUPS = window.CK_FIELDS;
const ALL_ITEMS = GROUPS.flatMap((g) => g.items);
const REQUIRED_IDS = ALL_ITEMS.filter((i) => i.required).map((i) => i.id);

/* ---------------------------------------------------------------- icons */
function Glyph({ d }) {
  // tiny monospace/unicode glyphs to avoid an icon dependency
  return <span className="gly" aria-hidden="true">{d}</span>;
}

/* ---------------------------------------------------------------- top bar */
function TopBar({ status, onReset }) {
  return (
    <header className="topbar">
      <div className="tb-left">
        <div className="brand-mark">CK</div>
        <div className="tb-doc">
          <div className="tb-entity">{CASE.entity}</div>
          <div className="tb-meta">
            <span className="mono">{CASE.caseId}</span>
            <span className="dot">·</span>
            <span>{CASE.docName}</span>
            <span className="dot">·</span>
            <span>Uploaded {CASE.uploaded}</span>
          </div>
        </div>
      </div>
      <div className="tb-right">
        <span className={"run-state " + status}>
          <span className="rs-dot" />
          {status === "idle" ? "Awaiting analysis" : status === "running" ? "Analysing…" : "Extraction complete"}
        </span>
        <div className="tb-analyst">
          <div className="av">AW</div>
          <div className="tb-an-meta">
            <div className="an-name">{CASE.analyst}</div>
            <div className="an-role">{CASE.analystRole}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- doc viewer */
function DocViewer({ activeCite, onClearCite }) {
  const scrollRef = useRef(null);
  const markRef = useRef(null);

  useEffect(() => {
    if (activeCite && markRef.current && scrollRef.current) {
      const el = markRef.current;
      const container = scrollRef.current;
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      container.scrollTop += (eRect.top - cRect.top) - 80;
    }
  }, [activeCite]);

  const renderBlock = (block, page, idx) => {
    const key = page + "-" + idx;
    const isCiteHere = activeCite && activeCite.page === page && block.text && block.text.includes(activeCite.quote);

    const content = (text) => {
      if (!isCiteHere) return text;
      const i = text.indexOf(activeCite.quote);
      return (
        <>
          {text.slice(0, i)}
          <mark className="cite-hl" ref={markRef}>{activeCite.quote}</mark>
          {text.slice(i + activeCite.quote.length)}
        </>
      );
    };

    if (block.type === "spacer") return <div key={key} className="pg-spacer" />;
    if (block.type === "h") return <div key={key} className="pg-h">{content(block.text)}</div>;
    if (block.type === "h2") return <div key={key} className="pg-h2">{content(block.text)}</div>;
    if (block.type === "note") return <div key={key} className="pg-note">{content(block.text)}</div>;
    if (block.type === "clause")
      return (
        <div key={key} className="pg-clause">
          <span className="pg-num">{block.num}</span>
          <span className="pg-ctext">{content(block.text)}</span>
        </div>
      );
    return <p key={key} className="pg-p">{content(block.text)}</p>;
  };

  return (
    <div className="pane pane-doc">
      <div className="pane-head">
        <span className="ph-title">Source document</span>
        <div className="ph-tools">
          {activeCite && (
            <button className="chip-btn active" onClick={onClearCite}>
              <Glyph d="◎" /> Showing p.{activeCite.page} · {activeCite.clause}
              <span className="x">✕</span>
            </button>
          )}
          <span className="ph-pages mono">{DOC.length} pp</span>
        </div>
      </div>
      <div className="pane-body doc-body" ref={scrollRef}>
        {DOC.map((pg) => (
          <div className="pdf-page" data-page={pg.n} key={pg.n}>
            <div className="pdf-page-no mono">p.{pg.n}</div>
            <div className="pdf-content">{pg.blocks.map((b, i) => renderBlock(b, pg.n, i))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- override form */
function OverrideForm({ item, current, onSave, onCancel }) {
  const [value, setValue] = useState(current || "");
  const [note, setNote] = useState("");
  const taRef = useRef(null);
  useEffect(() => { if (taRef.current) taRef.current.focus(); }, []);
  const valid = note.trim().length >= 4 && value.trim().length > 0;
  return (
    <div className="override-form">
      <div className="of-head"><Glyph d="✎" /> Override · {item.label}</div>
      <div className="of-field">
        <label>New value</label>
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Enter corrected / supplied value" />
      </div>
      <div className="of-field">
        <label>Justification <span className="req-tag">— required</span></label>
        <textarea ref={taRef} className="input ta" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Explain the basis for this override — source, verification step, rationale…" />
        <div className="of-help">Recorded against {CASE.analyst} and written to the immutable audit trail.</div>
      </div>
      <div className="of-actions">
        <button className="btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn-sm primary" disabled={!valid} onClick={() => onSave(value.trim(), note.trim())}>Save override</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- field row */
function FieldRow({ item, stream, override, editing, locked, onCite, onEdit, onSaveOverride, onCancelEdit, activeRef }) {
  const st = stream || { status: "empty", text: "" };
  const isOverridden = !!override;
  const res = item.result;
  const cited = res.kind === "value" && res.citation;

  let rowClass = "field-row";
  if (isOverridden) rowClass += " overridden";

  const renderValue = () => {
    if (isOverridden) {
      return (
        <div className="fv">
          {res.kind === "value" && <span className="replaced">{res.value}</span>}
          <span className="fv-text">{override.value}</span>
          {cited && (
            <sup className="cite-sup" title="View source" onClick={() => onCite(res.citation)}>[{res.ref}]</sup>
          )}
          <span className="state-tag override-tag"><Glyph d="✎" /> Overridden</span>
        </div>
      );
    }
    if (st.status === "empty") return <span className="val-empty">Not yet extracted</span>;
    if (st.status === "streaming")
      return <span className="val-streaming">{st.text}<span className="cursor" /></span>;
    if (st.status === "missing")
      return (
        <span className="val-missing"><span className="mark mono">∅</span> {res.reason || "Not disclosed / inferred missing"}</span>
      );
    // done value
    return (
      <span className="fv">
        <span className="fv-text">{res.value}</span>
        {cited && (
          <sup className="cite-sup" title="View source" onClick={() => onCite(res.citation)}>[{res.ref}]</sup>
        )}
      </span>
    );
  };

  const canEdit = !locked && (st.status === "done" || st.status === "missing" || isOverridden);
  const showCitation = !isOverridden && st.status === "done" && cited;

  return (
    <div className={rowClass} ref={activeRef}>
      <div className="field-label">
        {item.label}{item.required && <span className="req">*</span>}
      </div>
      <div className="field-value">
        <div className="fv-line">
          {renderValue()}
          {canEdit && editing !== item.id && (
            <button className="edit-btn" title="Override value" onClick={() => onEdit(item.id)}><Glyph d="✎" /></button>
          )}
        </div>

        {showCitation && (
          <button className="citation" onClick={() => onCite(res.citation)}>
            <span className="cq">“{res.citation.quote}”</span>
            <span className="src">{CASE.docName.replace(".pdf","")} · p.{res.citation.page} {res.citation.clause}</span>
          </button>
        )}

        {isOverridden && (
          <div className="override-note">
            {override.note}
            <span className="who mono">{CASE.analyst} · {CASE.analystRole} · {override.at}</span>
          </div>
        )}

        {editing === item.id && (
          <OverrideForm item={item} current={isOverridden ? override.value : (res.kind === "value" ? res.value : "")}
            onSave={(v, n) => onSaveOverride(item.id, v, n)} onCancel={onCancelEdit} />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- extraction panel */
function ExtractionPanel(props) {
  const { status, stream, overrides, editing, locked, citeRef, ...rest } = props;
  const doneCount = ALL_ITEMS.filter((i) => (stream[i.id] && stream[i.id].status === "done") || overrides[i.id]).length;
  const missingCount = ALL_ITEMS.filter((i) => stream[i.id] && stream[i.id].status === "missing" && !overrides[i.id]).length;
  const citedCount = ALL_ITEMS.filter((i) => i.result.kind === "value" && stream[i.id] && stream[i.id].status === "done").length;

  return (
    <div className="pane pane-form">
      <div className="pane-head">
        <span className="ph-title">Extraction</span>
        <div className="ph-tools">
          {status !== "idle" && (
            <span className="ph-stat mono">{doneCount}/{ALL_ITEMS.length} fields · {citedCount} cited · {missingCount} missing</span>
          )}
          {status === "idle" && (
            <button className="run-btn" onClick={props.onRun}><Glyph d="▶" /> Run analysis</button>
          )}
          {status === "running" && (
            <button className="chip-btn" onClick={props.onFinish}><Glyph d="⏩" /> Finish</button>
          )}
        </div>
      </div>
      <div className="pane-body form-body">
        {GROUPS.map((g) => (
          <div className={"fgroup" + (g.critical ? " critical" : "")} key={g.group}>
            <div className="fgroup-head">
              {g.group}
              {g.critical && <span className="crit-tag">Control gap</span>}
            </div>
            <div className="field-list">
              {g.items.map((item) => (
                <FieldRow key={item.id} item={item}
                  stream={stream[item.id]} override={overrides[item.id]}
                  editing={editing} locked={locked}
                  activeRef={null}
                  onCite={rest.onCite} onEdit={rest.onEdit}
                  onSaveOverride={rest.onSaveOverride} onCancelEdit={rest.onCancelEdit} />
              ))}
            </div>
          </div>
        ))}
        <div className="form-footnote">
          Citations link to the source document. Missing required fields must be resolved by override or the case escalated.
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- decision bar */
const DECISIONS = [
  { id: "approve", label: "Approve", glyph: "✓" },
  { id: "reject", label: "Reject", glyph: "✕" },
  { id: "escalate", label: "Escalate", glyph: "▲" },
];

function DecisionBar({ requiredUnresolved, decision, locked, onPick, onCommit }) {
  return (
    <footer className="decision-bar">
      <div className="decision-meta">
        <div className="t">Compliance decision</div>
        <div className="s">
          {requiredUnresolved > 0 ? (
            <span className="warn"><Glyph d="▲" /> {requiredUnresolved} required field{requiredUnresolved > 1 ? "s" : ""} unresolved — Approve is blocked</span>
          ) : (
            <span>All required fields resolved — writes to immutable audit record</span>
          )}
        </div>
      </div>
      <div className="decision-actions">
        {DECISIONS.map((d) => {
          const blocked = d.id === "approve" && requiredUnresolved > 0;
          return (
            <button key={d.id}
              className={"btn btn-" + d.id + (decision === d.id ? " active" : "")}
              disabled={locked || blocked}
              title={blocked ? "Resolve required fields to approve" : ""}
              onClick={() => onPick(d.id)}>
              <Glyph d={d.glyph} /> {d.label}
            </button>
          );
        })}
        <button className="commit-btn" disabled={!decision || locked} onClick={onCommit}>Commit decision</button>
      </div>
    </footer>
  );
}

/* ---------------------------------------------------------------- audit record */
function AuditRecord({ record, onClose }) {
  const tone = record.decision;
  return (
    <div className="audit-overlay">
      <div className={"audit-card " + tone}>
        <div className="audit-head">
          <span className={"audit-dot " + tone} />
          Decision committed · {record.decisionLabel}
        </div>
        <div className="audit-body">
          <div className="ar-row"><span>Audit ID</span><b className="mono">{record.auditId}</b></div>
          <div className="ar-row"><span>Case</span><b className="mono">{CASE.caseId}</b></div>
          <div className="ar-row"><span>Entity</span><b>{CASE.entity}</b></div>
          <div className="ar-row"><span>Decided by</span><b>{CASE.analyst} · {CASE.analystRole}</b></div>
          <div className="ar-row"><span>Timestamp</span><b className="mono">{record.ts}</b></div>
          <div className="ar-row"><span>Fields extracted</span><b>{record.fields} ({record.cited} cited)</b></div>
          <div className="ar-row"><span>Analyst overrides</span><b>{record.overrides}</b></div>
          <div className="ar-row"><span>Unresolved required</span><b>{record.unresolved}</b></div>
        </div>
        <div className="audit-foot">
          <span className="mono lock"><Glyph d="🔒" /> Record is immutable</span>
          <button className="btn-sm primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- app */
function App() {
  const [status, setStatus] = useState("idle"); // idle | running | complete
  const [stream, setStream] = useState({});
  const [overrides, setOverrides] = useState({});
  const [editing, setEditing] = useState(null);
  const [activeCite, setActiveCite] = useState(null);
  const [decision, setDecision] = useState(null);
  const [record, setRecord] = useState(null);
  const [splitPct, setSplitPct] = useState(48);
  const finishRef = useRef(false);
  const dragRef = useRef(false);

  const locked = !!record;

  /* streaming */
  const runAnalysis = useCallback(async () => {
    setStatus("running");
    finishRef.current = false;
    const next = {};
    for (const item of ALL_ITEMS) {
      if (finishRef.current) break;
      next[item.id] = { status: "streaming", text: "" };
      setStream({ ...next });
      await sleep(160);
      if (item.result.kind === "value") {
        const full = item.result.value;
        const steps = 5;
        for (let s = 1; s <= steps; s++) {
          if (finishRef.current) break;
          next[item.id] = { status: "streaming", text: full.slice(0, Math.ceil((full.length * s) / steps)) };
          setStream({ ...next });
          await sleep(55);
        }
        next[item.id] = { status: "done", text: full };
      } else {
        await sleep(320);
        next[item.id] = { status: "missing", text: "" };
      }
      setStream({ ...next });
      await sleep(90);
    }
    // ensure all settled
    const done = {};
    for (const item of ALL_ITEMS) done[item.id] = item.result.kind === "value" ? { status: "done", text: item.result.value } : { status: "missing", text: "" };
    setStream(done);
    setStatus("complete");
  }, []);

  const finishNow = () => { finishRef.current = true; };

  /* citations */
  const onCite = (c) => setActiveCite(c);
  const clearCite = () => setActiveCite(null);

  /* overrides */
  const saveOverride = (id, value, note) => {
    const at = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
    setOverrides((o) => ({ ...o, [id]: { value, note, at } }));
    setEditing(null);
  };

  /* required-field validation */
  const currentValue = (item) => {
    if (overrides[item.id]) return overrides[item.id].value;
    const s = stream[item.id];
    if (s && s.status === "done" && item.result.kind === "value") return item.result.value;
    return null;
  };
  const requiredUnresolved = status === "complete"
    ? REQUIRED_IDS.filter((id) => {
        const item = ALL_ITEMS.find((i) => i.id === id);
        return !currentValue(item);
      }).length
    : REQUIRED_IDS.length;

  /* commit */
  const commit = () => {
    const cited = ALL_ITEMS.filter((i) => i.result.kind === "value" && currentValue(i)).length;
    const fields = ALL_ITEMS.filter((i) => currentValue(i)).length;
    const auditId = "AR-" + Math.random().toString(36).slice(2, 8).toUpperCase() + "-" + Math.floor(Math.random() * 9000 + 1000);
    const ts = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) + " UTC";
    setRecord({
      decision, decisionLabel: DECISIONS.find((d) => d.id === decision).label,
      auditId, ts, fields, cited, overrides: Object.keys(overrides).length, unresolved: requiredUnresolved,
    });
  };

  /* resizer drag */
  useEffect(() => {
    const move = (e) => {
      if (!dragRef.current) return;
      const total = window.innerWidth;
      let pct = (e.clientX / total) * 100;
      pct = Math.max(26, Math.min(74, pct));
      setSplitPct(pct);
    };
    const up = () => { dragRef.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  return (
    <div className="app">
      <TopBar status={status} />
      <div className="workspace">
        <div className="split" style={{ gridTemplateColumns: `${splitPct}% var(--split-resizer) 1fr` }}>
          <DocViewer activeCite={activeCite} onClearCite={clearCite} />
          <div className="split-resizer" onMouseDown={() => { dragRef.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }} />
          <ExtractionPanel
            status={status} stream={stream} overrides={overrides} editing={editing} locked={locked}
            onRun={runAnalysis} onFinish={finishNow}
            onCite={onCite} onEdit={setEditing} onSaveOverride={saveOverride} onCancelEdit={() => setEditing(null)} />
        </div>
      </div>
      <DecisionBar requiredUnresolved={requiredUnresolved} decision={decision} locked={locked}
        onPick={setDecision} onCommit={commit} />
      {locked && (
        <div className="locked-banner"><Glyph d="🔒" /> Case decided — {record.decisionLabel}. Workstation is read-only.</div>
      )}
      {record && <AuditRecord record={record} onClose={() => {}} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
