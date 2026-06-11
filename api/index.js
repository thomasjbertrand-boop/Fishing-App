const express = require('express');
const fetch   = require('node-fetch');
const app     = express();

app.use(express.json());

// ─── USGS PROXY ───────────────────────────────────────────────────────────────
// Fetches from USGS server-side, no CORS issues
app.get('/api/gauges', async (req, res) => {
  const SITES = [
    '09085000','09058000','09071750','09095500',
    '09080400','09041400','09019500','09112500'
  ].join(',');
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${SITES}&parameterCd=00060,00065&siteStatus=active`;
  try {
    const r    = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const json = await r.json();
    const ts   = json?.value?.timeSeries || [];

    const bySite = {};
    ts.forEach(t => {
      const siteNo = t.sourceInfo?.siteCode?.[0]?.value;
      const pcode  = t.variable?.variableCode?.[0]?.value;
      const vals   = t.values?.[0]?.value || [];
      if (!siteNo) return;
      if (!bySite[siteNo]) bySite[siteNo] = {};
      const last = vals[vals.length - 1];
      const num  = parseFloat(last?.value);
      const hist = vals.slice(-24).map(v => parseFloat(v.value)).filter(v => !isNaN(v));
      bySite[siteNo][pcode] = {
        value:    isNaN(num) ? null : num,
        dateTime: last?.dateTime || null,
        history:  hist
      };
    });

    const gauges = Object.entries(bySite).map(([id, params]) => {
      const cfsD = params['00060'];
      const htD  = params['00065'];
      const hist = cfsD?.history || [];
      const trend = hist.length >= 3
        ? Math.sign(hist[hist.length - 1] - hist[hist.length - 3])
        : 0;
      return {
        id,
        cfs:       cfsD?.value   ?? null,
        gageHt:    htD?.value    ?? null,
        trend,
        history:   hist.slice(-12),
        updatedAt: cfsD?.dateTime ?? null
      };
    });

    res.json({ ok: true, gauges });
  } catch (err) {
    console.error('USGS fetch error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── CLAUDE API PROXY ─────────────────────────────────────────────────────────
// Keeps API key server-side; client never sees it
app.post('/api/claude', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'web-search-2025-03-05'
      },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error('Claude proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DASHBOARD HTML ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(DASHBOARD_HTML);
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Fishing dashboard running on http://localhost:${PORT}`));

module.exports = app;

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD HTML
// ═════════════════════════════════════════════════════════════════════════════
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
<meta name="theme-color" content="#0D1B27"/>
<title>🎣 CO Fly Fishing</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --ink:#0D1B27;--deep:#111E2C;--panel:#162535;--border:#1E3247;
  --muted:#4B6478;--soft:#8AA0B4;--body:#C4D6E8;--bright:#E8F4FF;
  --teal:#3DB8C8;--green:#5FA870;--sand:#C8A060;--blue:#5580C8;--r:10px;
}
html{scroll-behavior:smooth}
body{background:var(--ink);color:var(--body);font-family:-apple-system,'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.5;min-height:100vh}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:var(--ink)}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}

/* ── Header ── */
#hdr{background:linear-gradient(180deg,#09141E 0%,var(--deep) 100%);border-bottom:1px solid var(--border);padding:16px 18px 12px;position:relative;overflow:hidden}
#wave-svg{position:absolute;bottom:0;left:0;width:200%;height:18px;opacity:.1;animation:flowR 12s linear infinite}
@keyframes flowR{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.hdr-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
.site-title{font-size:19px;font-weight:700;color:var(--bright);letter-spacing:-.02em}
.site-sub{font-size:10px;color:var(--teal);font-family:monospace;margin-top:2px;letter-spacing:.05em}
.hdr-meta{font-size:10px;color:var(--muted);font-family:monospace;margin-top:7px}
.hdr-actions{display:flex;gap:7px;flex-wrap:wrap}
.btn{background:var(--panel);border:1px solid var(--border);color:var(--body);border-radius:8px;padding:8px 14px;font-size:12px;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}
.btn:active{opacity:.7}
.btn-p{background:var(--teal)!important;border-color:var(--teal)!important;color:var(--ink)!important;font-weight:700}
.btn-p:disabled,.btn:disabled{background:var(--panel)!important;border-color:var(--border)!important;color:var(--muted)!important;cursor:default}
#prog-wrap{height:3px;background:var(--border);border-radius:2px;margin-top:10px;display:none}
#prog-wrap.vis{display:block}
#prog-bar{height:100%;background:var(--teal);border-radius:2px;width:0%;transition:width .4s}

/* ── Layout ── */
#main{max-width:680px;margin:0 auto;padding:20px 14px 60px}
.sec{margin-bottom:28px}
.sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px}
.sec-title{font-size:15px;font-weight:700;color:var(--bright)}
.sec-label{font-size:10px;color:var(--muted);font-family:monospace;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px}
.legend{display:flex;gap:10px;flex-wrap:wrap}
.leg-item{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--soft)}
.leg-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}

/* ── Gauge grid ── */
#gauge-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.gc{background:linear-gradient(155deg,#1a2e42 0%,var(--panel) 100%);border:1px solid var(--border);border-radius:var(--r);padding:14px 15px 12px;position:relative;overflow:hidden}
.g-accent{position:absolute;top:0;left:0;right:0;height:3px;border-radius:10px 10px 0 0}
.g-river{font-size:9px;font-family:monospace;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-bottom:1px}
.g-name{font-size:11px;color:var(--body);font-weight:600;margin-bottom:8px;line-height:1.3}
.g-loc{font-size:9px;color:var(--muted);font-weight:400}
.g-cfs{font-size:28px;font-weight:700;font-family:monospace;line-height:1}
.g-unit{font-size:9px;color:var(--muted);margin-top:1px}
.g-badge{display:inline-block;font-size:8px;font-family:monospace;font-weight:700;border-radius:3px;padding:1px 5px;letter-spacing:.07em;margin-top:3px}
.g-trend{font-size:14px;margin-left:3px;vertical-align:middle}
.g-ht{font-size:10px;color:var(--muted);margin-top:5px}
.g-time{font-size:9px;color:var(--muted);margin-top:1px;font-family:monospace}
.g-spark{display:block;margin:7px 0 3px}

/* ── Best Bet ── */
#bb-card{background:var(--panel);border:1.5px solid var(--sand);border-radius:var(--r);padding:18px 18px;display:none}
#bb-card.vis{display:block}
.bb-eye{font-size:9px;font-family:monospace;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--sand);display:flex;align-items:center;gap:8px;margin-bottom:7px}
.bb-eye::after{content:'';flex:1;height:1px;background:var(--sand);opacity:.3}
.bb-river{font-size:22px;font-weight:700;color:var(--bright);letter-spacing:-.02em;line-height:1.15;margin-bottom:6px}
.bb-why{font-size:13px;color:var(--body);line-height:1.65;margin-bottom:12px}
.bb-pills{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}
.pill{font-size:10px;font-family:monospace;border-radius:4px;padding:3px 8px;border:1px solid}
.p-fly{background:#5FA87018;border-color:#5FA87040;color:#90d4a0}
.p-hatch{background:#C8A06018;border-color:#C8A06040;color:#e0c080}
.bb-src{font-size:10px;color:var(--muted);font-family:monospace}
#bb-ph{color:var(--muted);font-size:13px;padding:2px 0;line-height:1.55}
#bb-spin{display:none;color:var(--teal);font-family:monospace;font-size:12px;padding:3px 0}
#bb-spin.vis{display:block}

/* ── Shops ── */
#shop-list{display:flex;flex-direction:column;gap:7px}
.sc{background:var(--panel);border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.sh{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;border-bottom:1px solid transparent}
.sh.open{border-bottom-color:var(--border)}
.s-name{font-size:13px;font-weight:600;color:var(--bright)}
.s-loc{font-size:11px;color:var(--muted);margin-top:1px}
.s-rr{display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:10px}
.s-age{font-size:10px;color:var(--teal);font-family:monospace;white-space:nowrap}
.s-btn{background:none;border:1px solid var(--border);color:var(--teal);border-radius:5px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:monospace;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.s-btn:active{opacity:.6}
.s-chev{color:var(--teal);font-size:11px;transition:transform .2s;flex-shrink:0}
.s-chev.open{transform:rotate(180deg)}
.sb{display:none;padding:13px 14px}
.sb.open{display:block}
.r-label{font-size:9px;font-family:monospace;letter-spacing:.1em;text-transform:uppercase;margin-bottom:5px}
.r-summary{font-size:13px;color:var(--body);line-height:1.65;margin-bottom:10px}
.r-pills{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}
.r-date{font-size:10px;color:var(--muted)}
.s-link{font-size:11px;color:var(--teal);display:inline-block;margin-top:7px;text-decoration:none}
.s-err{color:#c87070;font-size:12px;line-height:1.5}

/* ── Misc ── */
.spinning{animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
#footer{margin-top:36px;padding-top:16px;border-top:1px solid var(--border);font-size:10px;color:var(--muted);font-family:monospace;line-height:1.7}
</style>
</head>
<body>

<div id="hdr">
  <svg id="wave-svg" viewBox="0 0 1200 18" preserveAspectRatio="none">
    <path d="M0,9 Q100,2 200,9 Q300,16 400,9 Q500,2 600,9 Q700,16 800,9 Q900,2 1000,9 Q1100,16 1200,9 Q1300,2 1400,9 Q1500,16 1600,9 Q1700,2 1800,9 Q1900,16 2000,9 Q2100,2 2200,9 Q2300,16 2400,9" fill="none" stroke="#3DB8C8" stroke-width="2"/>
    <path d="M0,13 Q80,7 160,13 Q240,19 320,13 Q400,7 480,13 Q560,19 640,13 Q720,7 800,13 Q880,19 960,13 Q1040,7 1120,13 Q1200,19 1280,13 Q1360,7 1440,13 Q1520,19 1600,13 Q1680,7 1760,13 Q1840,19 1920,13 Q2000,7 2080,13 Q2160,19 2240,13" fill="none" stroke="#3DB8C8" stroke-width="1"/>
  </svg>
  <div class="hdr-row">
    <div>
      <div class="site-title">🎣 CO River Flows</div>
      <div class="site-sub">USGS GAUGES &nbsp;·&nbsp; AI SHOP REPORTS &nbsp;·&nbsp; 24H CACHE</div>
    </div>
    <div class="hdr-actions">
      <button class="btn" onclick="refreshGauges(true)">↻ Flows</button>
      <button class="btn btn-p" id="fetch-all-btn" onclick="fetchAllShops()">⚡ All Reports</button>
    </div>
  </div>
  <div class="hdr-meta" id="hdr-meta">Loading…</div>
  <div id="prog-wrap"><div id="prog-bar"></div></div>
</div>

<div id="main">

  <div class="sec">
    <div class="sec-label">📍 Today's Best Bet</div>
    <div id="bb-spin">🤖 Finding today's best water…</div>
    <div id="bb-ph">Hit ⚡ All Reports to fetch shop conditions — the Best Bet will appear once AI has read the shops.</div>
    <div id="bb-card">
      <div class="bb-eye">Best Water Today</div>
      <div class="bb-river" id="bb-river">—</div>
      <div class="bb-why" id="bb-why"></div>
      <div class="bb-pills" id="bb-pills"></div>
      <div class="bb-src" id="bb-src"></div>
    </div>
  </div>

  <div class="sec">
    <div class="sec-hdr">
      <div class="sec-title">📊 Stream Gauges</div>
      <div class="legend">
        <div class="leg-item"><span class="leg-dot" style="background:#C8A060"></span>Low</div>
        <div class="leg-item"><span class="leg-dot" style="background:#5FA870"></span>Prime</div>
        <div class="leg-item"><span class="leg-dot" style="background:#3DB8C8"></span>Good</div>
        <div class="leg-item"><span class="leg-dot" style="background:#5580C8"></span>High</div>
      </div>
    </div>
    <div id="gauge-grid"></div>
  </div>

  <div class="sec">
    <div class="sec-hdr">
      <div class="sec-title">🏪 Fly Shop Reports</div>
      <div style="font-size:11px;color:var(--muted)">AI reads each shop's report page</div>
    </div>
    <div id="shop-list"></div>
  </div>

  <div id="footer">
    Flows: USGS NWIS (15-min intervals) &nbsp;·&nbsp; Shop reports: Claude AI web search<br>
    Data cached 24h in browser &nbsp;·&nbsp; Not a safety resource — verify before wading
  </div>
</div>

<script>
const GAUGES=[
  {id:"09085000",name:"Roaring Fork", loc:"Glenwood Spgs",  river:"Roaring Fork"},
  {id:"09058000",name:"Eagle River",  loc:"below Gypsum",   river:"Eagle River"},
  {id:"09071750",name:"Colorado R.",  loc:"Glenwood Canyon",river:"Colorado River"},
  {id:"09095500",name:"Colorado R.",  loc:"near Cameo",     river:"Colorado River"},
  {id:"09080400",name:"Fryingpan R.", loc:"Ruedi Outflow",  river:"Fryingpan River"},
  {id:"09041400",name:"Blue River",   loc:"below Dillon",   river:"Blue River"},
  {id:"09019500",name:"Colorado R.",  loc:"near Granby",    river:"Colorado River"},
  {id:"09112500",name:"Gunnison R.",  loc:"nr Grand Jct",   river:"Gunnison River"},
];
const SHOPS=[
  {id:"anglers_covey",  name:"Anglers Covey",      loc:"Colorado Springs",url:"https://www.anglerscovey.com/fly-fishing-report/"},
  {id:"anglers_all",    name:"Anglers All",         loc:"Littleton",       url:"https://anglersall.com/fly-fishing-reports/"},
  {id:"golden_fly",     name:"Golden Fly Shop",     loc:"Golden",          url:"https://goldenflyshop.com/fishing-report/"},
  {id:"minturn_anglers",name:"Minturn Anglers",     loc:"Minturn",         url:"https://www.minturnanglers.com/fly-fishing-report/"},
  {id:"vail_valley",    name:"Vail Valley Anglers", loc:"Vail / Edwards",  url:"https://www.vailvalleyanglers.com/fly-fishing-reports/"},
  {id:"avid_max",       name:"Avid Angler / Max",   loc:"Denver",          url:"https://www.avidmax.com/pages/fishing-reports"},
];
const TTL=24*60*60*1000;
const GAUGE_KEY="co_ff_g_v5",SHOP_PFX="co_ff_s_v5_",BB_KEY="co_ff_bb_v5";
let gaugeData={},shopData={};

function save(k,d){try{localStorage.setItem(k,JSON.stringify({ts:Date.now(),data:d}));}catch(e){}}
function load(k){try{const r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch(e){return null;}}
function fresh(ts){return ts&&(Date.now()-ts)<TTL;}
function cfsColor(v){if(v==null)return"#4B6478";if(v<150)return"#C8A060";if(v<400)return"#5FA870";if(v<900)return"#3DB8C8";return"#5580C8";}
function cfsLabel(v){if(v==null)return"N/A";if(v<150)return"LOW";if(v<400)return"PRIME";if(v<900)return"GOOD";return"HIGH";}
function ago(ts){if(!ts)return"";const m=(Date.now()-new Date(ts))/60000;if(m<60)return Math.round(m)+"m ago";if(m<1440)return Math.round(m/60)+"h ago";return Math.round(m/1440)+"d ago";}
function spark(vals,w=68,h=24){if(!vals||vals.length<2)return"";const mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1;return"M "+vals.map((v,i)=>((i/(vals.length-1))*w)+","+(h-((v-mn)/rng)*h)).join(" L ");}
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function delay(ms){return new Promise(r=>setTimeout(r,ms));}

async function apiFetch(path,body){
  const opts={method:body?"POST":"GET",headers:{"Content-Type":"application/json"}};
  if(body) opts.body=JSON.stringify(body);
  const r=await fetch(path,opts);
  if(!r.ok){const e=await r.text();throw new Error("HTTP "+r.status+": "+e.slice(0,150));}
  return r.json();
}

async function callClaude(prompt,useSearch){
  const body={model:"claude-sonnet-4-20250514",max_tokens:1200,messages:[{role:"user",content:prompt}]};
  if(useSearch) body.tools=[{type:"web_search_20250305",name:"web_search"}];
  const data=await apiFetch("/api/claude",body);
  if(data.error) throw new Error(data.error.message||JSON.stringify(data.error));
  const txt=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").replace(/\`\`\`json|\`\`\`/gi,"").trim();
  try{return JSON.parse(txt);}catch{const m=txt.match(/\{[\s\S]*\}/);if(m)return JSON.parse(m[0]);throw new Error("Bad JSON: "+txt.slice(0,120));}
}

// ── Gauges ──────────────────────────────────────────────────────────────────
async function refreshGauges(force=false){
  const c=load(GAUGE_KEY);
  if(!force&&c&&fresh(c.ts)){
    gaugeData=c.data; renderGauges();
    setMeta("Flows cached "+ago(c.ts)+" · Next refresh in ~"+Math.round((TTL-(Date.now()-c.ts))/3600000)+"h");
    return;
  }
  renderGaugesLoading(); setMeta("Fetching live flow data…");
  try{
    const r=await apiFetch("/api/gauges");
    if(!r.ok||!r.gauges) throw new Error(r.error||"No gauges returned");
    r.gauges.forEach(g=>{gaugeData[g.id]=g;});
    // fill any missing
    GAUGES.forEach(g=>{if(!gaugeData[g.id])gaugeData[g.id]={id:g.id,cfs:null,gageHt:null,trend:0,history:[],updatedAt:null};});
    save(GAUGE_KEY,gaugeData); renderGauges();
    setMeta("Flows updated just now · Next refresh in ~24h · USGS NWIS");
  }catch(err){
    console.error("Gauge error:",err);
    GAUGES.forEach(g=>{if(!gaugeData[g.id])gaugeData[g.id]={id:g.id,cfs:null,gageHt:null,trend:0,history:[],updatedAt:null};});
    renderGauges(); setMeta("Flow data unavailable — tap ↻ Flows to retry");
  }
}

function setMeta(t){document.getElementById("hdr-meta").textContent=t;}

function renderGaugesLoading(){
  document.getElementById("gauge-grid").innerHTML=GAUGES.map(g=>
    '<div class="gc"><div class="g-river">'+g.river+'</div><div class="g-name">'+g.name+' <span class="g-loc">@ '+g.loc+'</span></div><div class="spinning" style="color:var(--teal);font-size:11px;font-family:monospace">fetching…</div></div>'
  ).join("");
}

function renderGauges(){
  document.getElementById("gauge-grid").innerHTML=GAUGES.map(g=>{
    const d=gaugeData[g.id]||{};
    const col=cfsColor(d.cfs),lbl=cfsLabel(d.cfs),sp=spark(d.history);
    const ti=d.trend>0?"↑":d.trend<0?"↓":"",tc=d.trend>0?"#5580C8":"#C8A060";
    const val=d.cfs!=null?Number(d.cfs).toLocaleString():"—";
    return '<div class="gc">'+
      '<div class="g-accent" style="background:'+col+'"></div>'+
      '<div class="g-river">'+g.river+'</div>'+
      '<div class="g-name">'+g.name+' <span class="g-loc">@ '+g.loc+'</span></div>'+
      '<div style="display:flex;align-items:flex-end;gap:5px">'+
        '<span class="g-cfs" style="color:'+col+'">'+val+'</span>'+
        (ti?'<span class="g-trend" style="color:'+tc+'">'+ti+'</span>':'')+
      '</div>'+
      '<div class="g-unit">cfs</div>'+
      '<span class="g-badge" style="background:'+col+'20;color:'+col+';border:1px solid '+col+'50">'+lbl+'</span>'+
      (sp?'<svg class="g-spark" width="68" height="24" viewBox="0 0 68 24"><path d="'+sp+'" fill="none" stroke="'+col+'" stroke-width="1.5" stroke-linecap="round" opacity=".75"/></svg>':'')+
      (d.gageHt!=null?'<div class="g-ht">📏 '+d.gageHt+' ft</div>':'')+
      (d.updatedAt?'<div class="g-time">'+ago(d.updatedAt)+'</div>':'')+
    '</div>';
  }).join("");
}

// ── Shops ───────────────────────────────────────────────────────────────────
function renderShops(){
  document.getElementById("shop-list").innerHTML=SHOPS.map(s=>
    '<div class="sc" id="sc-'+s.id+'">'+
      '<div class="sh" id="sh-'+s.id+'" onclick="toggleShop(\''+s.id+'\')">'+
        '<div><div class="s-name">'+s.name+'</div><div class="s-loc">📍 '+s.loc+'</div></div>'+
        '<div class="s-rr">'+
          '<span class="s-age" id="sa-'+s.id+'"></span>'+
          '<button class="s-btn" id="sbtn-'+s.id+'" onclick="event.stopPropagation();fetchShop(\''+s.id+'\',true)">Fetch</button>'+
          '<span class="s-chev" id="sv-'+s.id+'">▼</span>'+
        '</div>'+
      '</div>'+
      '<div class="sb" id="sb-'+s.id+'"><div style="color:var(--muted);font-size:12px;padding:6px 0;text-align:center">Tap Fetch to pull the latest report via AI.</div></div>'+
    '</div>'
  ).join("");
  SHOPS.forEach(s=>{const c=load(SHOP_PFX+s.id);if(c&&c.data){shopData[s.id]={report:c.data,fetchedAt:c.ts};applyReport(s.id,c.data,c.ts);}});
}

function toggleShop(id){
  const body=document.getElementById("sb-"+id),hdr=document.getElementById("sh-"+id),chev=document.getElementById("sv-"+id);
  const o=body.classList.toggle("open");hdr.classList.toggle("open",o);chev.classList.toggle("open",o);
}

function applyReport(id,rpt,fetchedAt){
  const shop=SHOPS.find(s=>s.id===id);
  const ae=document.getElementById("sa-"+id),sb=document.getElementById("sbtn-"+id);
  if(ae)ae.textContent=ago(fetchedAt);if(sb)sb.textContent="↻";
  const flies=(rpt.hatches||[]).slice(0,8),rivers=(rpt.rivers||[]).slice(0,6);
  document.getElementById("sb-"+id).innerHTML=
    (rpt.summary?'<div class="r-label" style="color:var(--sand)">Conditions</div><div class="r-summary">'+esc(rpt.summary)+'</div>':'')+
    (flies.length?'<div class="r-label" style="color:var(--green)">🪰 Flies & Hatches</div><div class="r-pills">'+flies.map(f=>'<span class="pill p-fly">'+esc(f)+'</span>').join("")+'</div>':'')+
    (rivers.length?'<div class="r-label" style="color:var(--teal)">🌊 Rivers</div><div class="r-pills">'+rivers.map(r=>'<span class="pill" style="background:#3DB8C818;border-color:#3DB8C840;color:#70d8e8">'+esc(r)+'</span>').join("")+'</div>':'')+
    (rpt.reportDate?'<div class="r-date">Report date: '+esc(rpt.reportDate)+'</div>':'')+
    '<a class="s-link" href="'+shop.url+'" target="_blank" rel="noreferrer">Full report at '+esc(shop.name)+' ↗</a>';
}

async function fetchShop(id,force=false){
  const shop=SHOPS.find(s=>s.id===id);if(!shop)return;
  if(!force){const c=load(SHOP_PFX+id);if(c&&c.data&&fresh(c.ts)){shopData[id]={report:c.data,fetchedAt:c.ts};applyReport(id,c.data,c.ts);return;}}
  const body=document.getElementById("sb-"+id),hdr=document.getElementById("sh-"+id),chev=document.getElementById("sv-"+id);
  body.classList.add("open");hdr.classList.add("open");chev.classList.add("open");
  body.innerHTML='<div class="spinning" style="color:var(--teal);font-family:monospace;font-size:12px;padding:4px 0">🤖 Reading report…</div>';
  const sbtn=document.getElementById("sbtn-"+id);if(sbtn)sbtn.disabled=true;
  try{
    const p='Use web search to fetch and read the current fly fishing report from: '+shop.url+
      '\\n\\nReturn ONLY valid JSON, no markdown:\\n{"summary":"2-4 sentence summary of conditions, clarity, flows, fishing quality","hatches":["fly patterns and hatches, up to 8"],"rivers":["rivers mentioned, up to 6"],"reportDate":"date if mentioned, else null"}\\n\\nIf inaccessible: {"summary":"Unable to retrieve report.","hatches":[],"rivers":[],"reportDate":null}';
    const parsed=await callClaude(p,true);
    if(!parsed)throw new Error("No data");
    shopData[id]={report:parsed,fetchedAt:Date.now()};save(SHOP_PFX+id,parsed);applyReport(id,parsed,Date.now());
  }catch(err){
    console.error("Shop error:",id,err);
    body.innerHTML='<div class="s-err">Could not fetch report. <a class="s-link" href="'+shop.url+'" target="_blank">Visit site ↗</a></div>';
  }
  if(sbtn){sbtn.disabled=false;sbtn.textContent="↻";}
}

async function fetchAllShops(){
  const btn=document.getElementById("fetch-all-btn"),bar=document.getElementById("prog-wrap"),fill=document.getElementById("prog-bar");
  btn.disabled=true;btn.textContent="⏳ Fetching…";bar.classList.add("vis");
  for(let i=0;i<SHOPS.length;i++){
    await fetchShop(SHOPS[i].id,true);
    fill.style.width=Math.round(((i+1)/SHOPS.length)*100)+"%";
    if(i<SHOPS.length-1)await delay(500);
  }
  bar.classList.remove("vis");fill.style.width="0%";btn.disabled=false;btn.textContent="⚡ All Reports";
  await computeBestBet(true);
}

// ── Best Bet ────────────────────────────────────────────────────────────────
async function computeBestBet(force=false){
  const c=load(BB_KEY);if(!force&&c&&c.data&&fresh(c.ts)){renderBestBet(c.data);return;}
  const loaded=SHOPS.filter(s=>shopData[s.id]?.report?.summary&&!shopData[s.id].report.summary.startsWith("Unable"));
  if(loaded.length<2)return;
  document.getElementById("bb-spin").classList.add("vis");document.getElementById("bb-ph").style.display="none";
  try{
    const sums=loaded.map(s=>{const r=shopData[s.id].report;return"SHOP: "+s.name+" ("+s.loc+")\\nSUMMARY: "+r.summary+"\\nFLIES: "+(r.hatches||[]).join(", ")+"\\nRIVERS: "+(r.rivers||[]).join(", ");}).join("\\n\\n---\\n\\n");
    const p="You are an expert Colorado fly fishing guide. Based on these current shop reports, identify today's single best river or water to fish:\\n\\n"+sums+"\\n\\nReturn ONLY valid JSON, no markdown:\\n{\"river\":\"best river or stretch\",\"why\":\"2-3 sentences citing specific conditions\",\"flies\":[\"top 4-5 patterns\"],\"hatches\":[\"active hatches\"],\"sources\":[\"supporting shop names\"]}";
    const parsed=await callClaude(p,false);if(parsed){save(BB_KEY,parsed);renderBestBet(parsed);}
  }catch(err){console.error("Best bet error:",err);}
  document.getElementById("bb-spin").classList.remove("vis");
}

function renderBestBet(d){
  document.getElementById("bb-spin").classList.remove("vis");document.getElementById("bb-ph").style.display="none";
  document.getElementById("bb-river").textContent=d.river||"—";document.getElementById("bb-why").textContent=d.why||"";
  document.getElementById("bb-pills").innerHTML=(d.flies||[]).map(f=>'<span class="pill p-fly">'+esc(f)+'</span>').join("")+(d.hatches||[]).map(h=>'<span class="pill p-hatch">'+esc(h)+'</span>').join("");
  if(d.sources?.length)document.getElementById("bb-src").textContent="Based on: "+d.sources.join(", ");
  document.getElementById("bb-card").classList.add("vis");
}

(async function init(){
  renderShops();
  await refreshGauges();
  const bbc=load(BB_KEY);if(bbc&&bbc.data&&fresh(bbc.ts))renderBestBet(bbc.data);
  setInterval(()=>refreshGauges(true),TTL);
})();
</script>
</body>
</html>`;
