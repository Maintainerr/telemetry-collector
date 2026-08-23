/**
 * The public dashboard, served at "/". One self-contained page:
 * no frameworks, no CDNs, no fonts, no third-party requests of any kind:
 * it fetches /v1/stats (same origin) and renders it. What you see here is
 * exactly what anyone can curl.
 */
export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Maintainerr Telemetry - public stats</title>
<style>
  :root { --bg:#18181b; --card:#27272a; --line:#3f3f46; --text:#e4e4e7;
          --dim:#a1a1aa; --accent:#f59e0b; }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--bg); color:var(--text);
         font:15px/1.5 system-ui, sans-serif; padding:24px; }
  .wrap { max-width:1080px; margin:0 auto; }
  h1 { font-size:22px; margin-bottom:4px; }
  .sub { color:var(--dim); margin-bottom:24px; }
  .sub a { color:var(--accent); }
  .headline { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:24px; }
  .big { background:var(--card); border:1px solid var(--line);
         border-radius:10px; padding:16px 22px; }
  .big .n { font-size:30px; font-weight:700; color:var(--accent); }
  .big .l { color:var(--dim); font-size:13px; }
  .grid { display:grid; gap:16px;
          grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); }
  .card { background:var(--card); border:1px solid var(--line);
          border-radius:10px; padding:16px; }
  .card h2 { font-size:14px; text-transform:uppercase; letter-spacing:.04em;
             color:var(--dim); margin-bottom:12px; }
  .row { display:flex; align-items:center; gap:8px; margin:5px 0;
         font-size:13px; }
  .row .k { flex:0 0 44%; overflow:hidden; text-overflow:ellipsis;
            white-space:nowrap; }
  .row .bar { flex:1; height:8px; background:var(--line); border-radius:4px;
              overflow:hidden; }
  .row .bar i { display:block; height:100%; background:var(--accent); }
  .row .v { flex:0 0 74px; text-align:right; color:var(--dim);
            font-variant-numeric:tabular-nums; }
  .trend { display:flex; align-items:flex-end; gap:4px; height:70px;
           margin-top:6px; }
  .trend div { flex:1; background:var(--accent); border-radius:3px 3px 0 0;
               min-height:2px; }
  .trend div.partial { opacity:.35; }
  .foot { color:var(--dim); font-size:12px; margin-top:28px;
          border-top:1px solid var(--line); padding-top:14px; }
  .err { color:#f87171; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Maintainerr Telemetry</h1>
  <p class="sub">Anonymous usage statistics. This page has no trackers and
    makes no third-party requests; it renders
    <a href="/v1/stats">/v1/stats</a>, the same public JSON anyone can fetch.
    How it works: <a href="https://github.com/Maintainerr/telemetry-collector"
    rel="noopener">collector source</a>.</p>
  <div class="headline" id="headline"></div>
  <div class="card" id="trendcard" style="margin-bottom:16px; display:none">
    <h2>Active instances per week</h2><div class="trend" id="trend"></div>
  </div>
  <div class="grid" id="grid"></div>
  <p class="foot" id="foot"></p>
</div>
<script>
(async () => {
  const $ = (id) => document.getElementById(id);
  let d;
  try { d = await (await fetch('/v1/stats')).json(); }
  catch { $('headline').innerHTML = '<p class="err">Could not load stats.</p>'; return; }

  // Current ISO week (to flag the in-progress, partially-counted week).
  const now = new Date();
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const w = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
  const currentWeek = t.getUTCFullYear() + '-W' + String(w).padStart(2, '0');

  const totals = d.census?.totalInstances ?? {};
  const weeks = Object.keys(totals).sort();
  const fullWeeks = weeks.filter((x) => x !== currentWeek);
  const wk = fullWeeks[fullWeeks.length - 1] ?? weeks[weeks.length - 1];
  if (!wk) { $('headline').innerHTML = '<p class="err">No data yet.</p>'; return; }
  const total = totals[wk];

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => n.toLocaleString('en-US');
  const big = (n, l) =>
    '<div class="big"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>';
  const rows = (pairs, denom, prefix) => pairs.map(([k, v]) =>
    '<div class="row"><span class="k" title="' + esc(k) + '">' + esc(k) +
    '</span><span class="bar"><i style="width:' +
    Math.max(1, Math.round((v / denom) * 100)) + '%"></i></span><span class="v">' +
    (prefix ?? '') + fmt(v) + '</span></div>').join('');
  const card = (title, html) =>
    '<div class="card"><h2>' + esc(title) + '</h2>' + html + '</div>';

  // Headline + trend (partial current week rendered dimmed).
  $('headline').innerHTML =
    big(fmt(total), 'active instances (week ' + esc(wk) + ')');
  if (weeks.length > 1) {
    const max = Math.max(...weeks.map((x) => totals[x]));
    $('trend').innerHTML = weeks.map((x) =>
      '<div title="' + esc(x) + ': ' + fmt(totals[x]) + '"' +
      (x === currentWeek ? ' class="partial"' : '') +
      ' style="height:' + Math.round((totals[x] / max) * 100) + '%"></div>').join('');
    $('trendcard').style.display = '';
  }

  let html = '';

  // Census marginals: exact counts.
  const DIMS = { version: 'Version', version_tag: 'Release channel',
    media_server: 'Media server', platform: 'Platform', arch: 'Architecture',
    is_docker: 'Docker', node_major: 'Node.js major' };
  const margs = d.census?.byDimension?.[wk] ?? {};
  for (const [dim, label] of Object.entries(DIMS)) {
    const m = margs[dim];
    if (!m) continue;
    const pairs = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12);
    html += card(label + ' (exact)', rows(pairs, total));
  }

  // Sample facts: estimates, scaled to instances via the census total.
  const facts = (d.facts ?? []).filter((f) => f.week === wk);
  const sampleAll = facts.find((f) => f.metric === 'sample')?.count ?? 0;
  if (sampleAll > 0) {
    const groups = {};
    for (const f of facts) {
      if (f.metric === 'sample') continue;
      (groups[f.metric] ??= []).push([f.value, f.count]);
    }
    const LABELS = { rules_app: 'Rules target (apps)',
      rule_prop: 'Rule properties in use', integration: 'Integrations configured',
      feature: 'Features in use', notif_agent: 'Notification agents',
      locale: 'Locale', media_type: 'Rule media types',
      arr_action: 'Collection *arr actions',
      usage_collectionItems: 'Items in collections' };
    // arr_action arrives as Maintainerr's action names in upper case. The
    // stored token is left verbatim; only the display is normalised, so every
    // card reads the same way.
    const display = (metric, value) =>
      metric === 'arr_action' ? String(value).toLowerCase() : value;
    for (const [metric, pairs] of Object.entries(groups)) {
      pairs.sort((a, b) => b[1] - a[1]);
      const est = pairs.slice(0, 12).map(([k, v]) =>
        [display(metric, k), Math.round((v / sampleAll) * total)]);
      html += card((LABELS[metric] ?? metric) + ' (estimated)',
        rows(est, total, '~'));
    }
  }

  $('grid').innerHTML = html;
  $('foot').textContent =
    'Estimates come from a random 1-in-' + (d.meta?.sampleDivisor ?? '?') +
    ' weekly sample (' + fmt(sampleAll) + ' sampled instances this week), ' +
    'scaled by the exact census total. Groups smaller than ' +
    (d.meta?.kThreshold ?? '?') + ' instances are not published. ' +
    'No identifiers, IP addresses, or per-server records are collected or stored.';
})();
</script>
</body>
</html>`;
