// Cloudflare Worker: Notion proxy for the Partner Lead Time dashboard.
// Required secret: NOTION_API_KEY (Settings > Variables and Secrets). Never put the key in this file.
// Optional variable: ALLOWED_ORIGIN (e.g. https://your-user.github.io) to lock CORS to your Pages site.

const PBL_DB = '29b54942-9c8b-807b-bb34-c7aeb3d312b2'; // Partner Brief Library
const MCT_DB = '28054942-9c8b-81bc-910a-d1ea9365e76f'; // Master Creative Tracker
const PARTNERS_DS = '2a054942-9c8b-80a0-b1b0-000be5f448b6'; // Partners Database (data source)
const NOTION_VERSION = '2022-06-28';
const DATA_SOURCE_VERSION = '2025-09-03'; // the Partners Database has several data sources, so it needs the newer API

// Property names exactly as they appear in Notion (case- and space-sensitive).
const PBL_PROPS = {
  name: 'Brief Name', status: 'Brief Status', month: 'Brief Month', product: 'Product',
  tier: 'Tier', partner: 'Sent To', mct: '\u{1F680} Master Creative Tracker' /* the rocket emoji, written as a code so copy-paste can't mangle it */,
  created: 'Created Date', briefingStart: 'Briefing Start Date', briefReview: 'Brief Review Date',
  briefReady: 'Brief Ready Date', briefSent: 'Brief Sent Date', footageReceived: 'Footage Received Date',
  editsRequested: 'Edits Requested Date', revisionsStart: 'Revisions Start Date',
  revisionsReceived: 'Revisions Received Date', contentApproved: 'Content Approved Date',
  briefDue: 'Brief Due Date', footageDue: 'Footage Due Date', cs: 'CS', portalPartner: 'Portal Partner',
};
const MCT_PROPS = {
  status: 'Status', briefingQueue: 'Briefing Queue Date', originalCreated: 'Original Created',
  designQueue: 'Design Queue Date', designStart: 'Design Start Date', v1Ready: 'V1 Ready Date',
  revisionStart: 'Revision Start Date', finalReview: 'Final Review Date', execReview: 'Exec Review Date',
  finalized: 'Finalized Creative Date', creativeReady: 'Creative Ready Date', launch: 'Launch Date',
  onHold: 'On Hold Date', offHold: 'Off Hold Date',
  cs: 'CS', editors: 'Designer', assets: 'Total Assets',
  name: 'Concept', perfSpend7: 'Perf 7d Spend', matchConf: 'Perf Match Confidence', firstSpend: 'Perf First Spend Date',
};
const PBL_EXCLUDED = ['Archive', 'Test Status'];

// Spend check. Only these partner fields are read, and spend is reduced to "zero or not" before it leaves
// the Worker: no costs, dollar amounts, billing, addresses or contact details are ever requested.
const PARTNER_PROPS = {
  name: 'Name', status: 'Status', tier: 'Tier', cs: 'Designated CS', lastUpdated: 'Last Updated',
  lastSpend: 'Last Spend Date', spend7: 'Spend L7', newAds14: 'New Ads L14',
};
const SPRINT_PROPS = {
  name: 'Concept', status: 'Status', partner: 'Partner IG Handle', finalized: 'Finalized Creative Date',
  launch: 'Launch Date', firstSpend: 'Perf First Spend Date',
  perfSpend7: 'Perf 7d Spend', matchConf: 'Perf Match Confidence', cs: 'CS', editors: 'Designer',
};
const OPEN_SPRINT_STATUSES = ['Resize + Upload', 'Growth QA', 'Ready To Build', 'Built - Needs Review',
  'V1 Review', 'Final Review', 'Ready For Exec. Review', 'In Exec. Review',
  'Needs CS Briefing', 'Briefing', 'Review Brief', 'Needs Brief Edit', 'Ready for Production', 'In V1 Production',
  'Needs Revision', 'Revising'];

// Cloudflare's free plan allows 50 outbound requests per invocation; stay under it.
const SUBREQUEST_BUDGET = 48;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, cors);
    if (!env.NOTION_API_KEY) return json({ error: 'NOTION_API_KEY secret is not set on this Worker' }, 500, cors);

    try {
      // ?part=spend runs the spend check on its own, so each call stays under the subrequest limit.
      const part = new URL(request.url).searchParams.get('part');
      const data = part === 'spend' ? await buildSpendOnly(env.NOTION_API_KEY) : await buildDataset(env.NOTION_API_KEY);
      return json(data, 200, { ...cors, 'Cache-Control': 'public, max-age=120' });
    } catch (err) {
      return json({ error: err.message || String(err) }, 502, cors);
    }
  },
};

function notionClient(key) {
  const budget = { left: SUBREQUEST_BUDGET };
  const notion = (path, body, version) => {
    if (budget.left-- <= 0) throw new Error('Subrequest budget exhausted');
    return fetch('https://api.notion.com/v1' + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + key, 'Notion-Version': version || NOTION_VERSION, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error('Notion ' + r.status + ': ' + (d.message || 'request failed'));
      return d;
    });
  };
  notion.budget = budget;
  return notion;
}

async function buildSpendOnly(key) {
  const notion = notionClient(key);
  const mctSchema = await notion('/databases/' + MCT_DB);
  return { updated: new Date().toISOString(), ...(await buildSpendCheck(notion, mctSchema)) };
}

async function buildDataset(key) {
  const notion = notionClient(key), budget = notion.budget;

  // Resolve property names to ids so queries only return the columns we need (much smaller payloads).
  const [pblSchema, mctSchema] = await Promise.all([notion('/databases/' + PBL_DB), notion('/databases/' + MCT_DB)]);
  const pblQs = propFilter(pblSchema, PBL_PROPS);
  const mctQs = propFilter(mctSchema, MCT_PROPS);

  // Both libraries page through Notion 100 rows at a time, so run them side by side.
  // Partner sprints in the MCT are Internal items titled "... Partner" or linked to a partner handle.
  const [pblPages, mctPages] = await Promise.all([
    queryAll(notion, PBL_DB, pblQs, {
      filter: { and: PBL_EXCLUDED.map((s) => ({ property: PBL_PROPS.status, status: { does_not_equal: s } })) },
    }),
    queryAll(notion, MCT_DB, mctQs, {
      filter: {
        and: [
          { property: 'Source', select: { equals: 'Internal' } },
          { or: [
            { property: 'Concept', title: { contains: 'Partner' } },
            { property: 'Partner IG Handle', relation: { is_not_empty: true } },
          ] },
        ],
      },
    }),
  ]);

  const briefs = pblPages.map((p) => readPage(p, PBL_PROPS));
  const wanted = new Set(briefs.map((b) => b.mct).filter(Boolean));
  const mctById = {};
  for (const p of mctPages) if (wanted.has(p.id)) mctById[p.id] = readMct(p);

  // Linked items the bulk query missed are fetched one by one with whatever budget is left.
  const missing = [...wanted].filter((id) => !mctById[id]);
  const fetchable = missing.slice(0, Math.max(0, budget.left));
  const pages = await pool(fetchable, 6, (id) => notion('/pages/' + id + '?' + mctQs).catch(() => null));
  for (const p of pages) if (p) mctById[p.id] = readMct(p);

  for (const b of briefs) b.mct = b.mct ? mctById[b.mct] || { id: b.mct, missing: true } : null;
  return {
    updated: new Date().toISOString(),
    briefs,
    unresolvedMct: briefs.filter((b) => b.mct && b.mct.missing).length,
  };
}

// MCT item for the lead-time data. Spend and match confidence are reduced to yes/no here so no
// dollar figures leave the Worker.
function readMct(p) {
  const r = readPage(p, MCT_PROPS);
  r.zeroSpend7 = r.perfSpend7 === 0;
  r.lowMatch = r.matchConf != null && r.matchConf < 0.7;
  r.neverSpent = !r.d.firstSpend;
  delete r.perfSpend7; delete r.matchConf;
  return r;
}

async function buildSpendCheck(notion, mctSchema) {
  const schema = await notion('/data_sources/' + PARTNERS_DS, null, DATA_SOURCE_VERSION);
  const pQs = propFilter(schema, PARTNER_PROPS);
  const sQs = propFilter(mctSchema, SPRINT_PROPS);
  const linked = { property: SPRINT_PROPS.partner, relation: { is_not_empty: true } };
  const [partnerPages, openSprints, launchedSprints] = await Promise.all([
    queryAllAt(notion, '/data_sources/' + PARTNERS_DS + '/query?' + pQs, { filter: { property: 'Status', select: { equals: 'Active' } } }, DATA_SOURCE_VERSION),
    queryAll(notion, MCT_DB, sQs, { filter: { and: [linked, { or: OPEN_SPRINT_STATUSES.map((st) => ({ property: 'Status', status: { equals: st } })) }] } }),
    queryAll(notion, MCT_DB, sQs, { filter: { and: [linked, { property: 'Status', status: { equals: 'Launched' } },
      { or: [{ property: SPRINT_PROPS.perfSpend7, number: { equals: 0 } }, { property: SPRINT_PROPS.matchConf, number: { less_than: 0.7 } }] }] } }),
  ]);
  const partners = partnerPages.map((p) => {
    const r = readPage(p, PARTNER_PROPS);
    return {
      id: r.id, url: r.url, name: r.name, tier: r.tier, cs: r.cs || [],
      lastUpdated: r.d.lastUpdated || null, lastSpend: r.d.lastSpend || null,
      zeroSpend7: !r.spend7, noNewAds14: !r.newAds14,
    };
  });
  const sprints = openSprints.concat(launchedSprints).map((p) => {
    const r = readPage(p, SPRINT_PROPS);
    return {
      id: r.id, url: r.url, name: r.name, status: r.status, partner: r.partner, finalized: r.d.finalized || null,
      launch: r.d.launch || null, neverSpent: !r.d.firstSpend, cs: r.cs || [], editors: r.editors || [],
      zeroSpend7: r.perfSpend7 === 0, lowMatch: r.matchConf != null && r.matchConf < 0.7,
    };
  });
  return { partners, sprints };
}

async function queryAllAt(notion, path, body, version) {
  const out = [];
  let cursor;
  do {
    const d = await notion(path, { ...body, page_size: 100, start_cursor: cursor }, version);
    out.push(...d.results);
    cursor = d.has_more ? d.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function queryAll(notion, db, qs, body) {
  const out = [];
  let cursor;
  do {
    const d = await notion('/databases/' + db + '/query?' + qs, { ...body, page_size: 100, start_cursor: cursor });
    out.push(...d.results);
    cursor = d.has_more ? d.next_cursor : undefined;
  } while (cursor);
  return out;
}

function propFilter(schema, props) {
  return Object.values(props)
    .map((name) => schema.properties[name] && schema.properties[name].id)
    .filter(Boolean)
    .map((id) => 'filter_properties=' + encodeURIComponent(id))
    .join('&');
}

function readPage(page, props) {
  const out = { id: page.id, url: page.url, createdTime: page.created_time.slice(0, 10), d: {} };
  for (const [field, name] of Object.entries(props)) {
    const p = page.properties[name];
    if (!p) continue;
    const v = value(p);
    if (p.type === 'date') { if (v) out.d[field] = v; }
    else if (p.type === 'relation') out[field] = v[0] || null;
    else out[field] = v;
  }
  return out;
}

function value(p) {
  switch (p.type) {
    case 'title': case 'rich_text': return p[p.type].map((t) => t.plain_text).join('');
    case 'status': case 'select': return p[p.type] ? p[p.type].name : null;
    case 'multi_select': return p.multi_select.map((o) => o.name);
    case 'date': return p.date ? p.date.start.slice(0, 10) : null;
    case 'relation': return p.relation.map((r) => r.id);
    case 'people': return p.people.map((u) => u.name).filter(Boolean);
    case 'number': return p.number;
    case 'formula': return p.formula[p.formula.type] ?? null;
    default: return null;
  }
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let i = 0;
  const run = async () => { while (i < items.length) { const n = i++; results[n] = await fn(items[n]); } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return results;
}

function corsHeaders(request, env) {
  const origin = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
