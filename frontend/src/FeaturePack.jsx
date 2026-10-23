import React, { useEffect, useState } from 'react';

export function showValue(value) {
  if (value === false) return 'false';
  if (value === 0) return '0';
  if (value === '' || value == null) return '— (empty)';
  return String(value);
}

export async function downloadExport(request, featureId, format, query = '') {
  const token = localStorage.getItem('domain_recovery_token');
  const response = await fetch(`/api/features/${featureId}/export?format=${format}${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `${featureId}-records.${format}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AiFallbackPanel({ request, feature }) {
  const [insights, setInsights] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { request(`/api/features/${feature.id}/ai-fallback`).then((d) => setInsights(d.insights || [])).catch(() => {}); }, [feature.id]);
  async function run(insight) {
    setBusy(insight); setError('');
    try { const data = await request(`/api/features/${feature.id}/ai-fallback`, { method: 'POST', body: JSON.stringify({ insight }) }); setResult(data.result); }
    catch (e) { setError(e.message); } finally { setBusy(''); }
  }
  return <section className="panel"><div className="moduleTitle"><div><h3>Deterministic AI fallback (offline)</h3><p>Local rules over this feature's own saved records. Labelled aiGenerated: false — no provider is called.</p></div><span className="badge">aiGenerated: false</span></div>
    <div className="buttonRow">{insights.map((insight) => <button type="button" className="secondary" key={insight} disabled={!!busy} onClick={() => run(insight)}>{busy === insight ? 'Running…' : insight}</button>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
    {result && <div><h4>{result.headline}</h4><p className="muted">Provider: {result.provider} · Model: {result.model} · aiGenerated: {showValue(result.aiGenerated)} · Records: {showValue(result.recordCount)}</p>
      <div className="metrics">{result.metrics.map((m) => <div className="metric" key={m.label}><span>{m.label}</span><strong>{showValue(m.value)}</strong></div>)}</div>
      {result.sections.map((s) => <div key={s.title}><strong>{s.title}</strong><p>{s.detail}</p></div>)}
      <h4>Recommended actions</h4><ol>{result.actions.map((a) => <li key={a}>{a}</li>)}</ol><small className="muted">{result.disclaimer}</small></div>}
  </section>;
}

export function TasksPanel({ request, notify }) {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  async function load() { const data = await request('/api/tasks'); setTasks(data.tasks || []); }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  async function create(event) {
    event.preventDefault();
    try { await request('/api/tasks', { method: 'POST', body: JSON.stringify({ title }) }); setTitle(''); notify?.('Task created'); await load(); }
    catch (e) { setError(e.message); }
  }
  async function update(task, status) {
    try { await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); }
    catch (e) { setError(e.message); }
  }
  return <><header className="pageTitle"><div><span className="eyebrow">Follow-ups</span><h2>Staff tasks</h2><p>Authenticated task list. Create and update durable follow-ups.</p></div></header>
    {error && <p className="error" role="alert">{error}</p>}
    <form className="panel" onSubmit={create}><label>New task title<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label><button className="primary" type="submit">Create task</button></form>
    <section className="panel"><h3>Tasks ({tasks.length})</h3>{tasks.length ? <div className="tableWrap"><table><thead><tr><th>Title</th><th>Status</th><th>Priority</th><th>Due</th><th>Actions</th></tr></thead><tbody>{tasks.map((t) => <tr key={t.id}><td>{showValue(t.title)}</td><td>{showValue(t.status)}</td><td>{showValue(t.priority)}</td><td>{t.due_at ? String(t.due_at).slice(0, 10) : '— (empty)'}</td><td><button type="button" className="secondary" onClick={() => update(t, 'DONE')}>Done</button> <button type="button" className="secondary" onClick={() => update(t, 'OPEN')}>Reopen</button> <button type="button" className="secondary" onClick={() => update(t, 'CANCELLED')}>Cancel</button></td></tr>)}</tbody></table></div> : <p className="muted">No tasks yet. False, 0, and empty values are shown explicitly above when present.</p>}</section></>;
}
