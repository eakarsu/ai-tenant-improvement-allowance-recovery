// Feature pack: record search/filter helpers, CSV export, deterministic AI fallback.
// Fallback is local rules over the app's own records only; it never calls a provider.
export function displayValue(value) {
  if (value === false) return "false";
  if (value === 0) return "0";
  if (value === "" || value == null) return "— (empty)";
  return String(value);
}
export function filterRecords(items, { q = "", status = "", risk = "" } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  return (items || []).filter((item) => {
    if (status && String(item.status || "") !== status) return false;
    if (risk && String(item.risk || "") !== risk) return false;
    if (!needle) return true;
    return JSON.stringify(item).toLowerCase().includes(needle);
  });
}
function csvCell(value) {
  if (value == null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function recordsToCsv(items) {
  const rows = items || [];
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
  if (!columns.length) return "";
  return [columns.join(","), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(","))].join("\n") + "\n";
}
export function buildFallback(feature, items, insight, insights, disclaimer) {
  const rows = items || [];
  const totalAmount = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const highRisk = rows.filter((r) => ["High", "Critical"].includes(r.risk)).length;
  const open = rows.filter((r) => !["Approved", "Closed"].includes(r.status)).length;
  const now = Date.now();
  const overdue = rows.filter((r) => r.due_date && new Date(r.due_date).getTime() < now && !["Approved", "Closed"].includes(r.status)).length;
  const incomplete = rows.filter((r) => {
    const p = r.payload || {};
    return p.evidenceState === "Incomplete" || p.evidenceState === "Exception";
  }).length;
  const byStatus = {};
  for (const r of rows) byStatus[r.status || "— (empty)"] = (byStatus[r.status || "— (empty)"] || 0) + 1;
  const chosen = insights.includes(insight) ? insight : insights[0];
  let detail;
  if (chosen === insights[1]) {
    detail = `Deterministic variance view over ${rows.length} own record(s): represented value ${totalAmount}, ${overdue} overdue open record(s), largest single amount ${rows.length ? Math.max(...rows.map((r) => Number(r.amount) || 0)) : 0}. Zero and empty values are preserved, not hidden.`;
  } else if (chosen === insights[2]) {
    detail = `Evidence completeness over ${rows.length} own record(s): ${incomplete} record(s) flagged Incomplete/Exception in their payload, ${open} still open, ${highRisk} high/critical risk. Records with false, 0, or empty fields remain listed in exports.`;
  } else {
    detail = `Deterministic summary over ${rows.length} own record(s) for ${feature.title}: ${open} open, ${highRisk} high/critical risk, represented value ${totalAmount}. Status breakdown: ${Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(", ") || "— (empty)"}.`;
  }
  return {
    aiGenerated: false,
    provider: "deterministic-fallback",
    model: "local-rules",
    insight: chosen,
    headline: `${chosen} — deterministic fallback (not AI-generated)`,
    metrics: [
      { label: "Records reviewed", value: displayValue(rows.length) },
      { label: "Open records", value: displayValue(open) },
      { label: "High / critical risk", value: displayValue(highRisk) },
      { label: "Overdue open", value: displayValue(overdue) },
      { label: "Represented value", value: displayValue(totalAmount) },
      { label: "Incomplete / exception evidence", value: displayValue(incomplete) },
    ],
    sections: [
      { title: chosen, detail },
      { title: "How this was produced", detail: "Local deterministic rules over this workspace's own saved records. No provider was called and no external data was used." },
      { title: "Review required", detail: "A qualified reviewer must validate source evidence before any operational, billing, or filing action." },
    ],
    actions: ["Validate the flagged records against source evidence", "Assign an accountable owner for open and overdue items", "Retain this fallback output with the case audit history"],
    disclaimer,
    recordCount: rows.length,
  };
}
export function mountFeaturePack(app, { pool, auth, featureById, insights, disclaimer }) {
  app.get("/api/features/:id/export", auth, async (req, res, next) => {
    try {
      const feature = featureById(req.params.id);
      const format = String(req.query.format || "json").toLowerCase();
      if (!["csv", "json"].includes(format)) return res.status(422).json({ error: "Choose CSV or JSON" });
      const rows = (await pool.query("SELECT * FROM feature_records WHERE feature_id=$1 ORDER BY updated_at DESC,id DESC", [feature.id])).rows;
      const filtered = filterRecords(rows, { q: req.query.q, status: req.query.status, risk: req.query.risk });
      res.setHeader("Content-Disposition", `attachment; filename="${feature.id}-records.${format}"`);
      if (format === "csv") return res.type("text/csv").send(recordsToCsv(filtered));
      return res.json({ items: filtered });
    } catch (error) { next(error); }
  });
  app.get("/api/features/:id/ai-fallback", auth, async (req, res, next) => {
    try { featureById(req.params.id); res.json({ insights, aiGenerated: false }); } catch (error) { next(error); }
  });
  app.post("/api/features/:id/ai-fallback", auth, async (req, res, next) => {
    try {
      const feature = featureById(req.params.id);
      const rows = (await pool.query("SELECT * FROM feature_records WHERE feature_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 500", [feature.id])).rows;
      res.json({ result: buildFallback(feature, rows, String(req.body?.insight || ""), insights, disclaimer) });
    } catch (error) { next(error); }
  });
}
