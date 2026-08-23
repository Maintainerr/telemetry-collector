import { PAGE } from './page';

export interface Env {
  DB: D1Database;
}

/** Minimum group size published by /v1/stats (public endpoint only). */
const K = 10;

/**
 * Rich-sample divisor: an instance includes its detailed `sample` block in
 * 1 week out of this many (~once every 7 months per instance). Must match
 * TELEMETRY_SAMPLE_DIVISOR in the Maintainerr client. Census fields arrive
 * from every instance every week and are exact.
 */
const SAMPLE_DIVISOR = 32;

/** ISO 8601 week of a date (default now), e.g. "2026-W34". */
const week = (t: Date = new Date()): string => {
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const w = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
};

/** Length-capped token: word chars, dots, dashes, plus (buckets like "25+"). */
const tok = (v: unknown, max = 32): string | null =>
  typeof v === 'string' && v.length <= max && /^[\w.\-+]+$/.test(v) ? v : null;

/** Take up to `max` valid tokens from a client-supplied string list. */
const toks = (v: unknown, max: number, len = 48): string[] =>
  Array.isArray(v)
    ? [...new Set(v.map((x) => tok(x, len)).filter((x): x is string => !!x))].slice(0, max)
    : [];

const USAGE = [
  'ruleGroups',
  'activeRuleGroups',
  'collections',
  'manualCollections',
  'exclusions',
  'notifications',
  'collectionItems',
];

interface Census {
  version: string;
  version_tag: string;
  is_docker: number;
  node_major: number;
  arch: string;
  platform: string;
  media_server: string;
}

const pickCensus = (b: Record<string, any> | null): Census | null => {
  const version = tok(b?.version);
  const version_tag = tok(b?.versionTag);
  const arch = tok(b?.arch, 16);
  const platform = tok(b?.platform, 16);
  const media_server = tok(b?.mediaServer, 16) ?? 'none';
  if (!version || !version_tag || !arch || !platform) return null;
  return {
    version,
    version_tag,
    is_docker: b?.isDocker === true ? 1 : 0,
    node_major: Number.isInteger(b?.nodeMajor) ? b.nodeMajor : 0,
    arch,
    platform,
    media_server,
  };
};

/**
 * Explode the optional rich `sample` block into independent (metric, value)
 * counter increments. No payload row, no identifier, no combination of
 * fields is ever stored. Linking a sample to a source (or to another
 * sample) is impossible by construction. The metric names below are also
 * the storage allowlist.
 *
 * When changing this allowlist, update in the same change: the README data
 * table, the LABELS map in page.ts, and the release notes. This sync is
 * deliberately manual: the data table is a privacy commitment, so adding a
 * metric should mean consciously writing its disclosure, not regenerating a
 * file. Derive every value you write there by reading this function, never
 * by inference.
 */
function sampleFacts(s: Record<string, any>): [string, string][] {
  const f: [string, string][] = [['sample', 'all']]; // sampled-ping denominator

  const locale = tok(s?.locale, 8);
  if (locale) f.push(['locale', locale]);

  for (const m of USAGE) {
    const bucket = tok(s?.usage?.[m], 8);
    if (bucket) f.push([`usage_${m}`, bucket]);
  }
  // Cap matches the Application enum size (10). A lower cap would silently
  // drop apps from instances that use every one of them.
  for (const v of toks(s?.rulesApps, 10, 16)) f.push(['rules_app', v]);
  for (const v of toks(s?.ruleProperties, 25)) f.push(['rule_prop', v]);
  // Caps are a per-ping write bound, NOT a list of known services: any token
  // that fits is stored, and weekly_facts is keyed by (metric, value), so a
  // service added to Maintainerr shows up here with no change to this repo
  // and no migration. They carry headroom over the current counts (10
  // integrations, 10 notification agents) so adding one is not a chore here.
  for (const v of toks(s?.integrations, 16, 24)) f.push(['integration', v]);
  for (const v of toks(s?.features, 10, 32)) f.push(['feature', v]);
  for (const v of toks(s?.notificationAgents, 16, 24)) f.push(['notif_agent', v]);
  for (const v of toks(s?.mediaTypes, 4, 8)) f.push(['media_type', v]);
  for (const v of toks(s?.arrActions, 6, 32)) f.push(['arr_action', v]);

  return f;
}

async function ingest(req: Request, env: Env): Promise<Response> {
  const raw = await req.text();
  if (raw.length > 4096) return new Response(null, { status: 413 });

  let body: Record<string, any>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const c = pickCensus(body);
  if (!c) return new Response(null, { status: 400 });

  const w = week();
  const stmts = [
    env.DB.prepare(
      `INSERT INTO weekly_counts (week, version, version_tag, is_docker, node_major, arch, platform, media_server, count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT (week, version, version_tag, is_docker, node_major, arch, platform, media_server)
       DO UPDATE SET count = count + 1`,
    ).bind(w, c.version, c.version_tag, c.is_docker, c.node_major, c.arch, c.platform, c.media_server),
  ];

  if (body.sample && typeof body.sample === 'object' && !Array.isArray(body.sample)) {
    const f = sampleFacts(body.sample);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO weekly_facts (week, metric, value, count)
         VALUES ${f.map(() => '(?, ?, ?, 1)').join(', ')}
         ON CONFLICT (week, metric, value)
         DO UPDATE SET count = count + excluded.count`,
      ).bind(...f.flatMap(([metric, value]) => [w, metric, value])),
    );
  }

  await env.DB.batch(stmts);
  return new Response(null, { status: 204 });
}

/**
 * Public stats. Census is published as MARGINALS (totals per dimension) so
 * exact adoption numbers are public without exposing the stored field
 * combinations; sample facts are published as-is. Both k-suppressed.
 */
async function stats(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const cached = await cache.match(req);
  if (cached) return cached;

  const since = week(new Date(Date.now() - 56 * 86400000)); // 8 weeks back
  const [census, facts] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM weekly_counts WHERE week >= ?`).bind(since),
    env.DB.prepare(
      `SELECT week, metric, value, count FROM weekly_facts
       WHERE week >= ? AND count >= ? ORDER BY week DESC, metric, count DESC`,
    ).bind(since, K),
  ]);

  // Marginalize census rows per week per dimension in JS.
  const DIMS = ['version', 'version_tag', 'is_docker', 'node_major', 'arch', 'platform', 'media_server'];
  const marginals: Record<string, Record<string, Record<string, number>>> = {};
  const totals: Record<string, number> = {};
  for (const row of census.results as any[]) {
    totals[row.week] = (totals[row.week] ?? 0) + row.count;
    for (const dim of DIMS) {
      const m = ((marginals[row.week] ??= {})[dim] ??= {});
      m[String(row[dim])] = (m[String(row[dim])] ?? 0) + row.count;
    }
  }
  for (const wk of Object.keys(marginals))
    for (const dim of Object.keys(marginals[wk]))
      for (const val of Object.keys(marginals[wk][dim]))
        if (marginals[wk][dim][val] < K) delete marginals[wk][dim][val];

  const res = new Response(
    JSON.stringify({
      meta: {
        kThreshold: K,
        sampleDivisor: SAMPLE_DIVISOR,
        note:
          'census.* are exact instance counts (every instance reports weekly). ' +
          'facts counts are of sampled pings: estimated instances ~= count * sampleDivisor, ' +
          'or share = count / sample_all scaled by the census total.',
      },
      census: { totalInstances: totals, byDimension: marginals },
      facts: facts.results,
    }),
    {
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=3600',
      },
    },
  );
  ctx.waitUntil(cache.put(req, res.clone()));
  return res;
}

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method === 'POST' && pathname === '/v1/ingest')
      return ingest(req, env);
    if (req.method === 'GET' && pathname === '/v1/stats')
      return stats(req, env, ctx);
    if (req.method === 'GET' && pathname === '/')
      return new Response(PAGE, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=3600',
        },
      });
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
