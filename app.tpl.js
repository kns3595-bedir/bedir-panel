/* Operasyon paneli – istemci */
(function () {
'use strict';
const OFFLINE = !!window.EMBEDDED_DATA;
const SRC = window.APP_SOURCE || null; /* yayın modu: şifreli veri kaynağı */
const POLL_MS = 60000;
const CC = {TR:'Türkiye',DE:'Almanya',FR:'Fransa',IT:'İtalya',NL:'Hollanda',BE:'Belçika',AT:'Avusturya',CZ:'Çekya',PL:'Polonya',ES:'İspanya',PT:'Portekiz',SK:'Slovakya',HU:'Macaristan',RO:'Romanya',CH:'İsviçre',DK:'Danimarka',LU:'Lüksemburg',GB:'İngiltere',SE:'İsveç',FI:'Finlandiya',LT:'Litvanya',SI:'Slovenya',HR:'Hırvatistan',BG:'Bulgaristan',GR:'Yunanistan',GE:'Gürcistan',AM:'Ermenistan',AZ:'Azerbaycan',IR:'İran',IQ:'Irak',AE:'BAE',QA:'Katar',SA:'S. Arabistan',KW:'Kuveyt',OM:'Umman',IE:'İrlanda',MA:'Fas',RU:'Rusya',AF:'Afganistan',TM:'Türkmenistan',RS:'Sırbistan',BH:'Bahreyn'};
const ST_BADGE = {'Yeni':'b-blue','Eşleşti':'b-green','Teklif hazır':'b-amber','Gönderildi':'b-purple','Takipte':'b-gray'};
const FL_ST = {driving:'Yolda',standing:'Duruyor',nodata:'Veri yok'};
let D = null, tab = 'teklif', sel = null, sortState = {}, lastFetch = null, firstFit = true;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ncc = (c) => (c === 'UK' ? 'GB' : (c || ''));
const money = (p, c) => p ? Number(p).toLocaleString('tr-TR', {maximumFractionDigits: 0}) + ' ' + (c || '') : '—';
const gmail = (t) => t ? 'https://mail.google.com/mail/u/0/#all/' + t : '';
const iso2tr = (s) => s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : '';
function hav(a, b) { const R = 6371, r = Math.PI / 180; const dLa = (b[0]-a[0])*r, dLo = (b[1]-a[1])*r; const h = Math.sin(dLa/2)**2 + Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
function parseTR(s) { const m = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(s || ''); return m ? new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0)) : null; }
function ago(d) { if (!d) return ''; const m = Math.round((Date.now() - d.getTime()) / 60000); if (m < 1) return 'az önce'; if (m < 60) return m + ' dk önce'; const h = Math.round(m/60); if (h < 48) return h + ' sa önce'; return Math.round(h/24) + ' gün önce'; }
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 1800); }
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast('Teklif metni kopyalandı');
}

/* ---------- harita ---------- */
const map = L.map('map', {zoomControl: true, worldCopyJump: true, preferCanvas: false}).setView([42, 25], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 18, attribution: '&copy; OpenStreetMap katkıcıları'}).addTo(map);
const clusterIcon = (cls) => (c) => { const n = c.getChildCount(); const s = n < 10 ? 30 : n < 50 ? 36 : 44; return L.divIcon({html: '<div class="cl ' + cls + '" style="width:' + s + 'px;height:' + s + 'px">' + n + '</div>', className: '', iconSize: [s, s]}); };
const LY = {
  loads: L.markerClusterGroup({iconCreateFunction: clusterIcon('cl-load'), maxClusterRadius: 45, showCoverageOnHover: false}),
  trucks: L.markerClusterGroup({iconCreateFunction: clusterIcon('cl-truck'), maxClusterRadius: 40, showCoverageOnHover: false}),
  fleet: L.layerGroup(), hq: L.layerGroup(), mt: L.layerGroup(), quotes: L.layerGroup(),
};
const hlLayer = L.layerGroup().addTo(map);
Object.values(LY).forEach(l => l.addTo(map));
L.control.layers(null, {
  '<span style="color:#2563eb">●</span> Yükler': LY.loads, '<span style="color:#16a34a">●</span> Boş araçlar': LY.trucks,
  '<span style="color:#0369a1">■</span> Öz filo ({{FL}})': LY.fleet, '<span style="color:#dc2626">■</span> Merkez ({{HQC}})': LY.hq,
  '<span style="color:#7c3aed">●</span> {{MT}} açık': LY.mt, '<span style="color:#ea580c">●</span> Teklif talepleri': LY.quotes,
}, {collapsed: window.innerWidth < 900, position: 'topright'}).addTo(map);
$('legend').innerHTML = '<div><i style="background:#2563eb"></i>Yük</div><div><i style="background:#16a34a"></i>Boş araç</div><div><i style="background:#0369a1;border-radius:3px"></i>Öz filo</div><div><i style="background:#ea580c"></i>Teklif talebi</div><div><i style="background:#7c3aed"></i>{{MT}}</div><div><i style="background:#dc2626;border-radius:3px"></i>Merkez</div>';
const icon = (cls, txt, s) => L.divIcon({html: '<div class="mk ' + cls + '" style="width:' + s + 'px;height:' + s + 'px">' + (txt || '') + '</div>', className: '', iconSize: [s, s], iconAnchor: [s/2, s/2]});

/* ---------- filtreler ---------- */
const F = () => ({q: $('fSearch').value.trim().toLocaleLowerCase('tr'), c: $('fCountry').value, v: $('fVeh').value, a: $('fAdr').value, s: $('fSrc').value, from: $('fFrom').value, to: $('fTo').value});
function hay(o, keys) { return keys.map(k => o[k] == null ? '' : String(o[k])).join(' ').toLocaleLowerCase('tr'); }
function winOk(w, f) { if (!w) return true; if (f.from && w[1] < f.from) return false; if (f.to && w[0] > f.to) return false; return true; }
function loadOk(L_, f) {
  if (f.q && !hay(L_, ['id','firma','email','cikis_adres','varis_adres','cikis','varis','urun','arac','not_','yukleme_tarihi']).includes(f.q)) return false;
  if (f.c && ncc(L_.cikis) !== f.c && ncc(L_.varis) !== f.c) return false;
  if (f.v && L_.vgrup !== f.v) return false;
  if (f.a && (L_.adr ? '1' : '0') !== f.a) return false;
  if (f.s && L_.kaynak !== f.s) return false;
  return winOk(L_.win, f);
}
function truckOk(T, f) {
  if (f.q && !hay(T, ['id','firma','email','bolge','ulke','arac','tarih','not_','gidebilecegi']).includes(f.q)) return false;
  if (f.c && ncc(T.cc) !== f.c) return false;
  if (f.v && T.vgrup !== f.v) return false;
  if (f.a && (T.adr ? '1' : '0') !== f.a) return false;
  if (f.s && T.kaynak !== f.s) return false;
  return winOk(T.win, f);
}
function quoteOk(q, f) {
  if (f.q && !hay(q, ['id','firma','email','cikis_adres','varis_adres','yuk','arac','istek']).includes(f.q)) return false;
  if (f.c && ncc(q.cikis) !== f.c && ncc(q.varis) !== f.c) return false;
  if (f.a && (q.adr ? '1' : '0') !== f.a) return false;
  return true;
}
function fillSelect(id, vals, label) {
  const el = $(id), cur = el.value;
  el.innerHTML = '<option value="">' + label + '</option>' + vals.map(v => '<option value="' + esc(v[0]) + '">' + esc(v[1]) + '</option>').join('');
  el.value = cur;
}
function setupFilters() {
  const cs = new Set(); D.loads.forEach(l => { cs.add(ncc(l.cikis)); cs.add(ncc(l.varis)); }); D.trucks.forEach(t => cs.add(ncc(t.cc)));
  fillSelect('fCountry', [...cs].filter(Boolean).sort((a, b) => (CC[a] || a).localeCompare(CC[b] || b, 'tr')).map(c => [c, (CC[c] || c) + ' (' + c + ')']), 'Tüm ülkeler');
  const vs = new Set(); D.loads.forEach(l => vs.add(l.vgrup)); D.trucks.forEach(t => vs.add(t.vgrup));
  fillSelect('fVeh', [...vs].filter(Boolean).sort().map(v => [v, v]), 'Tüm araç tipleri');
  fillSelect('fSrc', [['Gmail', 'Gmail (yeni ilan)'], ['İlan CSV', 'İlan sistemi (CSV)'], ['{{GP}}', '{{GP}}']], 'Tüm kaynaklar');
}

/* ---------- indeksler ---------- */
let IDX = {};
function index() {
  IDX = {load: {}, truck: {}, fleet: {}, quote: {}, mByItem: {}, mByTruck: {}, gByItem: {}};
  D.loads.forEach(x => IDX.load[x.id] = x); D.trucks.forEach(x => IDX.truck[x.id] = x);
  D.fleet.forEach(x => IDX.fleet[x.plaka] = x); D.quotes.forEach(x => IDX.quote[x.id] = x);
  D.matches.forEach(m => { (IDX.mByItem[m.item] = IDX.mByItem[m.item] || []).push(m); (IDX.mByTruck[m.arac] = IDX.mByTruck[m.arac] || []).push(m); });
  D.mgroups.forEach(g => IDX.gByItem[g.item] = g);
}
const itemOf = (id) => IDX.load[id] || IDX.quote[id];
const truckOf = (id) => IDX.truck[id] || IDX.fleet[id];
const truckLabel = (id) => { const f = IDX.fleet[id]; if (f) return '🚚 ' + id + ' (öz filo)'; const t = IDX.truck[id]; return t ? id + ' · ' + t.firma_k : id; };

/* ---------- harita çizimi ---------- */
const MK = {load: {}, truck: {}, fleet: {}, quote: {}};
function popLoad(l) { return '<div class="pop"><b>' + esc(l.id) + ' · ' + esc(l.firma_k) + '</b><div>' + esc(l.cikis_adres) + ' → ' + esc(l.varis_adres) + '</div><div class="small muted">Yükleme: ' + esc(l.yukleme_tarihi || '—') + ' · ' + esc(l.vgrup) + (l.adr ? ' · ADR' : '') + '</div><div class="small">Öneri: <b>' + money(l.fiyat, l.para) + '</b></div><div class="small"><a href="#" data-sel="load:' + esc(l.id) + '">Eşleşmeleri göster</a>' + (l.link ? ' · <a target="_blank" rel="noopener" href="' + esc(l.link) + '">Gmail</a>' : '') + '</div></div>'; }
function popTruck(t) { return '<div class="pop"><b>' + esc(t.id) + ' · ' + esc(t.firma_k) + '</b><div>' + esc(t.bolge) + ' (' + esc(t.ulke) + ')</div><div class="small muted">' + esc(t.arac) + ' · ' + esc(t.tarih) + ' · ' + esc(t.kaynak) + '</div><div class="small"><a href="#" data-sel="truck:' + esc(t.id) + '">Uygun yükler</a>' + (t.link1 ? ' · <a target="_blank" rel="noopener" href="' + esc(t.link1) + '">Gmail</a>' : '') + '</div></div>'; }
function popFleet(f) { return '<div class="pop"><b>🚚 ' + esc(f.plaka) + '</b><div>' + esc(FL_ST[f.durum] || f.durum) + (f.hiz ? ' · ' + f.hiz + ' km/s' : '') + '</div><div class="small muted">' + esc(f.yakin) + ' · son sinyal ' + esc(f.son || '—') + '</div><div class="small"><a href="#" data-sel="fleet:' + esc(f.plaka) + '">Uygun yükler</a></div></div>'; }
function popQuote(q) { return '<div class="pop"><b>' + esc(q.id) + ' · ' + esc(q.firma_k) + '</b>' + (q.acil ? ' <span class="badge b-red">ACİL</span>' : '') + '<div>' + esc(q.cikis_adres) + ' → ' + esc(q.varis_adres) + '</div><div class="small">' + esc(q.durum) + ' · ' + money(q.fiyat, q.para) + '</div><div class="small"><a href="#" data-sel="quote:' + esc(q.id) + '">Detay</a></div></div>'; }
function drawMap() {
  const f = F();
  LY.loads.clearLayers(); LY.trucks.clearLayers(); LY.fleet.clearLayers(); LY.hq.clearLayers(); LY.mt.clearLayers(); LY.quotes.clearLayers();
  MK.load = {}; MK.truck = {}; MK.fleet = {}; MK.quote = {};
  const lm = [];
  D.loads.filter(l => l.o && loadOk(l, f)).forEach(l => { const m = L.marker([l.o[0], l.o[1]], {icon: icon('mk-load', '', 14), title: l.id}).bindPopup(popLoad(l)); m.on('click', () => select('load', l.id, false)); MK.load[l.id] = m; lm.push(m); });
  LY.loads.addLayers(lm);
  const tm = [];
  D.trucks.filter(t => t.p && truckOk(t, f)).forEach(t => { const m = L.marker([t.p[0], t.p[1]], {icon: icon('mk-truck', '', 16), title: t.id}).bindPopup(popTruck(t)); m.on('click', () => select('truck', t.id, false)); MK.truck[t.id] = m; tm.push(m); });
  LY.trucks.addLayers(tm);
  D.fleet.filter(x => x.p).forEach(x => {
    const cls = 'mk-fleet' + (x.durum === 'driving' ? ' drv' : '') + (x.eski || x.durum === 'nodata' ? ' old' : '');
    const m = L.marker([x.p[0], x.p[1]], {icon: icon(cls, '🚚', 24), zIndexOffset: 500}).bindTooltip(x.plaka + ' · ' + (FL_ST[x.durum] || x.durum) + (x.hiz ? ' ' + x.hiz + ' km/s' : ''), {direction: 'top', className: 'plate', offset: [0, -10]}).bindPopup(popFleet(x));
    m.on('click', () => select('fleet', x.plaka, false)); MK.fleet[x.plaka] = m; LY.fleet.addLayer(m);
  });
  const hq = D.hq || {p: [38.73, 35.48], ad: 'Merkez', adres: '{{HQC}}'};
  L.marker(hq.p, {icon: icon('mk-hq', '★', 30), zIndexOffset: 1000}).bindTooltip(hq.ad, {direction: 'top', offset: [0, -14]}).bindPopup('<b>' + esc(hq.ad) + '</b><br>' + esc(hq.adres)).addTo(LY.hq);
  D.mt.filter(m => m.acik).forEach(m => {
    const pts = [m.o, m.d].filter(Boolean).map(p => [p[0], p[1]]);
    const pop = '<div class="pop"><b>{{MT}} ' + esc(m.ref) + '</b><div>' + esc(m.cikis) + ' → ' + esc(m.varis) + '</div><div class="small muted">' + esc(m.durum) + ' · ' + esc(m.cekici || '—') + ' / ' + esc(m.dorse || '—') + '</div><div class="small">Kalkış ' + iso2tr(m.kalkis) + ' · Tahmini varış ' + iso2tr(m.tahmini_varis) + '</div><div class="small muted">Veri ' + iso2tr(D.mt_tarih) + ' tarihli (önbellek)</div></div>';
    if (pts.length === 2) L.polyline(pts, {color: '#7c3aed', weight: 2, opacity: .55, dashArray: '6 6'}).bindPopup(pop).addTo(LY.mt);
    if (m.d) L.marker([m.d[0], m.d[1]], {icon: icon('mk-mt', 'M', 18)}).bindPopup(pop).bindTooltip(m.ref + (m.cekici ? ' · ' + m.cekici : ''), {direction: 'top'}).addTo(LY.mt);
  });
  D.quotes.filter(q => q.o && quoteOk(q, f)).forEach(q => { const m = L.marker([q.o[0], q.o[1]], {icon: icon('mk-quote', 'T', 20), zIndexOffset: 400}).bindPopup(popQuote(q)); m.on('click', () => select('quote', q.id, false)); MK.quote[q.id] = m; LY.quotes.addLayer(m); });
  if (firstFit) { firstFit = false; map.setView([41, 30], window.innerWidth < 900 ? 3 : 4); }
}
map.on('popupopen', (e) => { e.popup.getElement().querySelectorAll('[data-sel]').forEach(a => a.addEventListener('click', (ev) => { ev.preventDefault(); const [k, id] = a.dataset.sel.split(':'); select(k, id, false); })); });

/* ---------- eşleşmeler ---------- */
function matchesForItem(id) {
  const it = itemOf(id); if (!it) return [];
  const raw = (IDX.mByItem[id] || []).map(m => Object.assign({alt: false}, m));
  const have = new Set(raw.map(m => m.arac));
  const g = IDX.gByItem[id];
  (g ? g.alternatif : []).forEach(a => { if (have.has(a)) return; const t = truckOf(a); if (!t || !t.p || !it.o) return; raw.push({arac: a, arac_kaynak: IDX.fleet[a] ? 'filo' : 'ilan', km: Math.round(hav(it.o, t.p)), gun: null, puan: null, flags: [], alt: true}); have.add(a); });
  return raw.sort((a, b) => (b.puan || 0) - (a.puan || 0) || a.km - b.km);
}
function itemsForTruck(id) { return (IDX.mByTruck[id] || []).slice().sort((a, b) => b.puan - a.puan); }
function dateFit(g) { if (g == null) return '<span class="muted">—</span>'; return g === 0 ? '<span class="badge b-green">Tarih uyumlu</span>' : '<span class="badge b-amber">±' + g + ' gün</span>'; }

function highlight(kind, id) {
  hlLayer.clearLayers();
  const bounds = [];
  const addHl = (p, color, r) => { L.circleMarker(p, {radius: r || 16, color: color || '#facc15', weight: 3, fillOpacity: .15}).addTo(hlLayer); bounds.push(p); };
  if (kind === 'load' || kind === 'quote') {
    const it = itemOf(id); if (!it || !it.o) return;
    const o = [it.o[0], it.o[1]]; addHl(o, '#1d4ed8', 14);
    if (it.d) { L.polyline([o, [it.d[0], it.d[1]]], {color: '#1d4ed8', weight: 2.5, opacity: .7, dashArray: '8 8'}).addTo(hlLayer); L.circleMarker([it.d[0], it.d[1]], {radius: 7, color: '#1d4ed8', fillColor: '#fff', fillOpacity: 1, weight: 3}).bindTooltip('Varış: ' + it.varis_adres).addTo(hlLayer); bounds.push([it.d[0], it.d[1]]); }
    matchesForItem(id).forEach((m, i) => { const t = truckOf(m.arac); if (!t || !t.p) return; const p = [t.p[0], t.p[1]];
      L.polyline([o, p], {color: m.alt ? '#94a3b8' : '#f59e0b', weight: m.alt ? 2 : 3.5, opacity: .9}).bindTooltip(truckLabel(m.arac) + ' · ' + m.km + ' km').addTo(hlLayer);
      addHl(p, m.alt ? '#94a3b8' : '#facc15', 15); });
  } else {
    const t = truckOf(id); if (!t || !t.p) return; const p = [t.p[0], t.p[1]]; addHl(p, '#facc15', 18);
    itemsForTruck(id).forEach(m => { const it = itemOf(m.item); if (!it || !it.o) return; const o = [it.o[0], it.o[1]]; L.polyline([p, o], {color: '#f59e0b', weight: 3, opacity: .9}).bindTooltip(m.item + ' · ' + m.km + ' km').addTo(hlLayer); addHl(o, '#1d4ed8', 12); });
  }
  if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds).pad(0.25), {maxZoom: 9}); else if (bounds.length) map.setView(bounds[0], Math.max(map.getZoom(), 8));
}

function matchTable(id) {
  const it = itemOf(id), ms = matchesForItem(id);
  if (!ms.length) return '<div class="banner">Bu ilan için ±250 km / ±2 gün içinde uygun araç bulunamadı. Tedarikçiye sor ya da geç.</div>';
  return '<div class="tbl-wrap"><table><thead><tr><th>Araç</th><th>Mesafe</th><th>Tarih</th><th>Puan</th><th>Önerilen fiyat</th><th>Not</th></tr></thead><tbody>' + ms.map(m => {
    const t = truckOf(m.arac) || {};
    const desc = IDX.fleet[m.arac] ? '<b>🚚 ' + esc(m.arac) + '</b><div class="small muted">Öz filo · ' + esc(t.yakin || '') + '</div>' : '<b>' + esc(m.arac) + '</b> ' + esc(t.firma_k || '') + '<div class="small muted">' + esc(t.bolge || '') + ' · ' + esc(t.arac || '') + (t.link1 ? ' · <a target="_blank" rel="noopener" href="' + esc(t.link1) + '">Gmail</a>' : '') + '</div>';
    return '<tr class="row" data-truck="' + esc(m.arac) + '"><td>' + desc + '</td><td class="num">' + m.km + ' km</td><td>' + dateFit(m.gun) + '</td><td class="num">' + (m.puan == null ? '<span class="muted small">alternatif</span>' : m.puan) + '</td><td class="num"><b>' + money(it.fiyat, it.para) + '</b><div class="small muted">' + esc(it.fiyat_dayanak || '') + '</div></td><td class="small">' + esc((m.flags || []).join('; ')) + '</td></tr>';
  }).join('') + '</tbody></table></div>';
}

function select(kind, id, pan) {
  sel = {kind, id}; renderSel(); highlight(kind, id); render();
  if (window.innerWidth < 900) $('sel').scrollIntoView({behavior: 'smooth', block: 'start'});
}
function renderSel() {
  const box = $('sel');
  if (!sel) { box.classList.add('hidden'); hlLayer.clearLayers(); return; }
  let h = '';
  if (sel.kind === 'load' || sel.kind === 'quote') {
    const it = itemOf(sel.id); if (!it) { sel = null; return renderSel(); }
    const isQ = sel.kind === 'quote';
    h = '<div class="hd"><div><div style="font-weight:700;font-size:14px">' + esc(it.id) + ' · ' + esc(it.firma_k) + ' <span class="badge ' + (ST_BADGE[it.durum] || '') + '">' + esc(it.durum) + '</span>' + (it.adr ? ' <span class="badge b-red">ADR</span>' : '') + '</div>' +
      '<div class="route"><span class="cc">' + esc(ncc(it.cikis)) + '</span>' + esc(it.cikis_adres) + ' → <span class="cc">' + esc(ncc(it.varis)) + '</span>' + esc(it.varis_adres) + '</div>' +
      '<div class="small muted">' + (isQ ? esc(it.yuk) + ' · ' + esc(it.arac) : 'Yükleme ' + esc(it.yukleme_tarihi || '—') + ' · ' + esc(it.vgrup) + ' · ' + esc(it.agirlik || '') + ' · ' + esc(it.kaynak)) + ' · <b>Öneri ' + money(it.fiyat, it.para) + '</b>' + (it.link ? ' · <a target="_blank" rel="noopener" href="' + esc(it.link) + '">Gmail\'de aç</a>' : '') + '</div></div><button class="x" id="selX">✕</button></div>' +
      '<div class="section" style="margin-top:8px">Uygun araçlar</div>' + matchTable(sel.id);
  } else {
    const t = truckOf(sel.id); if (!t) { sel = null; return renderSel(); }
    const isF = !!IDX.fleet[sel.id];
    const ms = itemsForTruck(sel.id);
    h = '<div class="hd"><div><div style="font-weight:700;font-size:14px">' + (isF ? '🚚 ' + esc(t.plaka) + ' <span class="badge b-blue">Öz filo</span>' : esc(t.id) + ' · ' + esc(t.firma_k)) + '</div><div class="small muted">' +
      (isF ? esc(FL_ST[t.durum] || t.durum) + ' · ' + esc(t.yakin) + ' · son sinyal ' + esc(t.son || '—') : esc(t.bolge) + ' (' + esc(t.ulke) + ') · ' + esc(t.arac) + ' · ' + esc(t.tarih) + ' · ' + esc(t.kaynak) + (t.link1 ? ' · <a target="_blank" rel="noopener" href="' + esc(t.link1) + '">Gmail</a>' : '')) +
      '</div></div><button class="x" id="selX">✕</button></div><div class="section" style="margin-top:8px">Bu araca uyan yükler / talepler</div>' +
      (ms.length ? '<div class="tbl-wrap"><table><thead><tr><th>İlan</th><th>Güzergâh</th><th>Mesafe</th><th>Tarih</th><th>Puan</th><th>Öneri</th></tr></thead><tbody>' + ms.map(m => { const it = itemOf(m.item) || {}; return '<tr class="row" data-item="' + esc(m.item) + '" data-kind="' + (m.tur === 'teklif' ? 'quote' : 'load') + '"><td><b>' + esc(m.item) + '</b><div class="small muted">' + esc(it.firma_k || '') + '</div></td><td class="small">' + esc(it.cikis_adres || '') + ' → ' + esc(it.varis_adres || '') + '</td><td class="num">' + m.km + ' km</td><td>' + dateFit(m.gun) + '</td><td class="num">' + m.puan + '</td><td class="num"><b>' + money(it.fiyat, it.para) + '</b></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="banner info">Bu araç için eşleşen yük yok (±250 km, ±2 gün, araç/ADR uyumu).</div>');
  }
  box.innerHTML = h; box.classList.remove('hidden');
  $('selX').onclick = () => { sel = null; renderSel(); render(); };
  box.querySelectorAll('tr[data-truck]').forEach(r => r.onclick = () => { const id = r.dataset.truck; const m = MK.fleet[id] || MK.truck[id]; if (m) { if (LY.trucks.hasLayer(m)) LY.trucks.zoomToShowLayer(m, () => m.openPopup()); else { map.setView(m.getLatLng(), 9); m.openPopup(); } } });
  box.querySelectorAll('tr[data-item]').forEach(r => r.onclick = () => select(r.dataset.kind, r.dataset.item));
}

/* ---------- tablolar ---------- */
function table(key, cols, rows, rowAttr) {
  const s = sortState[key] || {};
  if (s.col != null) { const c = cols[s.col]; const v = c.sv || ((r) => r[c.k]); rows = rows.slice().sort((a, b) => { const x = v(a), y = v(b); const r = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'tr', {numeric: true}); return s.dir === 'desc' ? -r : r; }); }
  if (!rows.length) return '<div class="empty">Filtreye uyan kayıt yok.</div>';
  return '<div class="tbl-wrap"><table data-key="' + key + '"><thead><tr>' + cols.map((c, i) => '<th data-i="' + i + '" class="' + (s.col === i ? 's-' + s.dir : '') + (c.num ? ' num' : '') + '">' + c.h + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr class="row' + (rowAttr.on(r) ? ' on' : '') + '" ' + rowAttr.attr(r) + '>' + cols.map(c => '<td' + (c.num ? ' class="num"' : '') + '>' + (c.r ? c.r(r) : esc(r[c.k])) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}
function bindTable() {
  $('content').querySelectorAll('table[data-key] th').forEach(th => th.onclick = () => { const k = th.closest('table').dataset.key, i = +th.dataset.i; const s = sortState[k] || {}; sortState[k] = {col: i, dir: s.col === i && s.dir === 'asc' ? 'desc' : 'asc'}; render(); });
  $('content').querySelectorAll('tr[data-sel]').forEach(tr => tr.onclick = (e) => { if (e.target.closest('a,button')) return; const [k, id] = tr.dataset.sel.split(':'); select(k, id); const m = MK[k] && MK[k][id]; if (m && (k === 'load' || k === 'truck')) { const grp = k === 'load' ? LY.loads : LY.trucks; if (grp.hasLayer(m)) grp.zoomToShowLayer(m, () => {}); } });
}
const isOn = (k) => (r) => sel && sel.kind === k && sel.id === (r.id || r.plaka);
const route = (a, ca, b, cb) => '<span class="cc">' + esc(ncc(ca)) + '</span>' + esc(a) + ' <span class="muted">→</span> <span class="cc">' + esc(ncc(cb)) + '</span>' + esc(b);

const TABS = [
  ['teklif', 'Teklif Talepleri', () => D.quotes.filter(q => ['Teklif hazır', 'Yeni', 'Eşleşti'].includes(q.durum)).length],
  ['yuk', 'Yükler', () => D.loads.filter(l => loadOk(l, F())).length],
  ['arac', 'Boş Araçlar', () => D.trucks.filter(t => truckOk(t, F())).length],
  ['eslesme', 'Eşleşmeler', () => D.mgroups.length],
  ['bugun', 'Bugün Yapılacaklar', () => (D.todo || []).length],
  ['filo', 'Filo', () => D.fleet.length],
  ['mt', '{{MT}}', () => D.mt.filter(m => m.acik).length],
];
function renderTabs() {
  $('tabs').innerHTML = TABS.map(t => '<button class="tab' + (tab === t[0] ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + '<span class="n">' + t[2]() + '</span></button>').join('');
  $('tabs').querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); $('content').scrollTop = 0; });
  const showF = ['yuk', 'arac', 'teklif', 'eslesme'].includes(tab);
  $('filters').classList.toggle('hidden', !showF && !$('fSearch').value);
}

function quoteCard(q) {
  const open = ['Teklif hazır', 'Yeni', 'Eşleşti'].includes(q.durum);
  const g = IDX.gByItem[q.id];
  return '<div class="card' + (q.acil ? ' urgent' : '') + '"><h4>' + esc(q.id) + ' · ' + esc(q.firma_k) + ' <span class="badge ' + (ST_BADGE[q.durum] || '') + '">' + esc(q.durum) + '</span>' + (q.acil ? '<span class="badge b-red">ACİL</span>' : '') + (q.adr ? '<span class="badge b-red">ADR</span>' : '') + '<span class="badge b-gray">' + (q.bekleme == null ? '' : q.bekleme + ' gün') + '</span></h4>' +
    '<div class="route">' + route(q.cikis_adres, q.cikis, q.varis_adres, q.varis) + '</div>' +
    '<div class="kv"><div>Geliş</div><div>' + esc(q.gelis) + ' · ' + esc(q.email) + '</div><div>Yük</div><div>' + esc(q.yuk) + '</div><div>Araç</div><div>' + esc(q.arac) + '</div><div>İstek</div><div>' + esc(q.istek) + '</div>' +
    (q.sent ? '<div>Gönderilen</div><div><b>' + esc(q.sent) + '</b></div>' : '') +
    (g ? '<div>Yakın araç</div><div>' + esc(truckLabel(g.arac)) + ' · ' + g.km + ' km' + (g.flags.length ? ' <span class="small muted">(' + esc(g.flags.join('; ')) + ')</span>' : '') + '</div>' : '') +
    '</div><div><span class="price">' + money(q.fiyat, q.para) + '</span> <span class="small muted">' + (open ? 'öneri · ' : 'referans · ') + esc(q.fiyat_dayanak || '') + '</span></div>' +
    (q.teklif_metni ? '<details' + (q.acil ? ' open' : '') + '><summary class="small" style="cursor:pointer;margin-top:6px;color:#1d4ed8">Teklif metni (şablon)</summary><pre class="qt">' + esc(q.teklif_metni) + '</pre></details>' : '') +
    '<div class="btns">' + (q.teklif_metni ? '<button class="btn pri" data-copy="' + esc(q.id) + '">📋 Teklif metnini kopyala</button>' : '') + (q.link ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(q.link) + '">✉️ Gmail konuşması</a>' : '') + '<button class="btn" data-sel="quote:' + esc(q.id) + '">🗺️ Haritada / araçlar</button></div></div>';
}

function render() {
  if (!D) return;
  renderTabs();
  const f = F(); let h = '';
  if (tab === 'teklif') {
    const qs = D.quotes.filter(q => quoteOk(q, f));
    const open = qs.filter(q => ['Teklif hazır', 'Yeni', 'Eşleşti'].includes(q.durum)).sort((a, b) => (b.acil|0) - (a.acil|0) || (a.bekleme||0) - (b.bekleme||0));
    const fu = qs.filter(q => !open.includes(q)).sort((a, b) => (b.bekleme||0) - (a.bekleme||0));
    h += '<div class="section">Açık – teklif gönderilecek (' + open.length + ')</div>' + (open.map(quoteCard).join('') || '<div class="empty">Açık talep yok.</div>');
    h += '<div class="section">Takipte – cevap bekleniyor (' + fu.length + ')</div>' + (fu.map(quoteCard).join('') || '<div class="empty">Yok.</div>');
    if (D.other && D.other.length) h += '<div class="section">Diğer gelen mailler (' + D.other.length + ')</div>' + table('other', [{h: 'Firma', k: 'firma'}, {h: 'Konu', k: 'konu'}, {h: 'Geliş', k: 'gelis', r: r => '<span class="nowrap">' + esc(r.gelis) + '</span>', sv: r => +(parseTR(r.gelis) || 0)}, {h: 'Durum', k: 'durum', r: r => '<span class="badge ' + (ST_BADGE[r.durum] || '') + '">' + esc(r.durum) + '</span>'}, {h: '', k: 'thread', r: r => r.thread ? '<a target="_blank" rel="noopener" href="' + gmail(r.thread) + '">Gmail</a>' : ''}], D.other, {on: () => false, attr: () => ''});
    h += '<div class="banner info small">Not: Şablondaki "{{PDFLINE}}" satırı için PDF eki henüz üretilmiyor; göndermeden önce satırı sil veya PDF ekle. Fiyatlar öneridir. Mail gönderimi bu panelden yapılmaz.</div>';
  } else if (tab === 'yuk') {
    const rows = D.loads.filter(l => loadOk(l, f));
    h = table('yuk', [
      {h: 'ID', k: 'id', r: r => '<b>' + esc(r.id) + '</b><div class="small muted">' + esc(r.kaynak) + '</div>'},
      {h: 'Firma', k: 'firma_k', r: r => esc(r.firma_k) + '<div class="small muted">' + esc(r.gelis.slice(0, 16)) + '</div>'},
      {h: 'Güzergâh', k: 'cikis', r: r => '<div class="small">' + route(r.cikis_adres, r.cikis, r.varis_adres, r.varis) + '</div>', sv: r => ncc(r.cikis) + ncc(r.varis)},
      {h: 'Yükleme', k: 'win', r: r => '<span class="nowrap">' + esc(r.yukleme_tarihi || '—') + '</span>' + (r.tarih_belirsiz ? '<div class="small muted">belirsiz</div>' : ''), sv: r => r.win ? r.win[0] : ''},
      {h: 'Araç', k: 'vgrup', r: r => esc(r.vgrup) + (r.adr ? ' <span class="badge b-red">ADR</span>' : '') + '<div class="small muted">' + esc(r.agirlik || '') + '</div>'},
      {h: 'Öneri', k: 'fiyat', num: 1, r: r => '<b>' + money(r.fiyat, r.para) + '</b>', sv: r => r.fiyat || 0},
      {h: 'Eşl.', k: 'm', num: 1, r: r => { const n = (IDX.mByItem[r.id] || []).length; return n ? '<span class="badge b-green">' + n + '</span>' : '<span class="muted">–</span>'; }, sv: r => (IDX.mByItem[r.id] || []).length},
      {h: 'Durum', k: 'durum', r: r => '<span class="badge ' + (ST_BADGE[r.durum] || '') + '">' + esc(r.durum) + '</span>' + (r.teyit ? '<div class="small muted">teyit gerekir</div>' : '')},
      {h: 'Gün', k: 'bekleme', num: 1},
      {h: '', k: 'link', r: r => r.link ? '<a target="_blank" rel="noopener" href="' + esc(r.link) + '">Gmail</a>' : ''},
    ], rows, {on: isOn('load'), attr: r => 'data-sel="load:' + esc(r.id) + '"'});
  } else if (tab === 'arac') {
    const rows = D.trucks.filter(t => truckOk(t, f));
    h = '<div class="banner small">İlan araçları (CSV) 4+ gün eski olabilir – müsaitliği teyit et.</div>' + table('arac', [
      {h: 'ID', k: 'id', r: r => '<b>' + esc(r.id) + '</b><div class="small muted">' + esc(r.kaynak) + '</div>'},
      {h: 'Firma', k: 'firma_k', r: r => esc(r.firma_k) + '<div class="small muted">' + esc(r.email || '') + '</div>'},
      {h: 'Konum', k: 'bolge', r: r => '<span class="cc">' + esc(ncc(r.cc)) + '</span>' + esc(r.bolge) + (r.gidebilecegi ? '<div class="small muted">→ ' + esc(r.gidebilecegi) + '</div>' : '')},
      {h: 'Araç', k: 'vgrup', r: r => esc(r.arac) + (r.adr ? ' <span class="badge b-red">ADR</span>' : '') + (r.adet ? '<div class="small muted">' + esc(r.adet) + ' adet</div>' : '')},
      {h: 'Müsait', k: 'tarih', r: r => esc(r.tarih || '—'), sv: r => r.win ? r.win[0] : ''},
      {h: 'Eşl.', k: 'm', num: 1, r: r => { const n = (IDX.mByTruck[r.id] || []).length; return n ? '<span class="badge b-green">' + n + '</span>' : '<span class="muted">–</span>'; }, sv: r => (IDX.mByTruck[r.id] || []).length},
      {h: 'Gün', k: 'bekleme', num: 1},
      {h: '', k: 'link1', r: r => r.link1 ? '<a target="_blank" rel="noopener" href="' + esc(r.link1) + '">Gmail</a>' : ''},
    ], rows, {on: isOn('truck'), attr: r => 'data-sel="truck:' + esc(r.id) + '"'});
  } else if (tab === 'eslesme') {
    const rows = D.mgroups.filter(g => { const it = itemOf(g.item); if (!it) return false; if (g.tur === 'yük') return loadOk(it, f); return quoteOk(it, f); });
    h = '<div class="banner info small">Kural: çıkışa ±250 km, ±2 gün, araç tipi ve ADR uyumu. Fiyat önerisi {{KMRATE}} ({{GULF}}). Satıra tıkla → haritada araçlar ve çizgiler.</div>' + table('eslesme', [
      {h: 'İlan', k: 'item', r: r => '<b>' + esc(r.item) + '</b> <span class="badge ' + (r.tur === 'teklif' ? 'b-amber' : 'b-blue') + '">' + esc(r.tur) + '</span><div class="small muted">' + esc((itemOf(r.item) || {}).firma_k || '') + '</div>'},
      {h: 'Güzergâh', k: 'r', r: r => { const it = itemOf(r.item); return '<div class="small">' + route(it.cikis_adres, it.cikis, it.varis_adres, it.varis) + '</div>'; }, sv: r => (itemOf(r.item) || {}).cikis_adres},
      {h: 'En iyi araç', k: 'arac', r: r => esc(truckLabel(r.arac)) + (r.alternatif.length ? '<div class="small muted">+' + r.alternatif.length + ' alternatif</div>' : '')},
      {h: 'Mesafe', k: 'km', num: 1, r: r => r.km + ' km'},
      {h: 'Tarih', k: 'gun', r: r => dateFit(r.gun)},
      {h: 'Puan', k: 'puan', num: 1},
      {h: 'Öneri', k: 'f', num: 1, r: r => { const it = itemOf(r.item); return '<b>' + money(it.fiyat, it.para) + '</b>'; }, sv: r => (itemOf(r.item) || {}).fiyat || 0},
      {h: 'Not', k: 'flags', r: r => '<span class="small">' + esc(r.flags.join('; ')) + '</span>', sv: r => r.flags.join()},
    ], rows, {on: r => sel && sel.id === r.item, attr: r => 'data-sel="' + (r.tur === 'teklif' ? 'quote' : 'load') + ':' + esc(r.item) + '"'});
  } else if (tab === 'bugun') {
    h = '<div class="section">Bugün yapılacaklar – ' + esc(iso2tr(D.bugun)) + '</div>' + (D.todo || []).map(t => '<div class="todo t-' + esc(t.ton) + '"><div class="dot"></div><div><div class="tt">' + esc(t.baslik) + '</div><div class="td">' + esc(t.detay) + '</div><div class="small" style="margin-top:3px">' + (t.ref ? '<a href="#" data-ref="' + esc(t.ref) + '">Haritada göster</a>' : '') + (t.ref && t.thread ? ' · ' : '') + (t.thread ? '<a target="_blank" rel="noopener" href="' + gmail(t.thread) + '">Gmail</a>' : '') + '</div></div></div>').join('');
  } else if (tab === 'filo') {
    h = '<div class="banner info small">{{FL}} ({{FLV}}) canlı konum – sunucu her 5 dakikada salt okuma ile yeniler. Son çekim: ' + esc((D.fleet_zaman || '').replace('T', ' ')) + '. Konum yerine en yakın merkez gösterilir.</div>' + table('filo', [
      {h: 'Plaka', k: 'plaka', r: r => '<b>🚚 ' + esc(r.plaka) + '</b>'},
      {h: 'Durum', k: 'durum', r: r => '<span class="badge ' + (r.durum === 'driving' ? 'b-blue' : r.durum === 'nodata' ? 'b-red' : 'b-gray') + '">' + esc(FL_ST[r.durum] || r.durum) + '</span>' + (r.eski ? ' <span class="badge b-amber">eski</span>' : '')},
      {h: 'Hız', k: 'hiz', num: 1, r: r => r.hiz ? r.hiz + ' km/s' : '–', sv: r => r.hiz || 0},
      {h: 'Yakın', k: 'yakin'},
      {h: 'Son sinyal', k: 'son', r: r => '<span class="nowrap">' + esc(r.son || '—') + '</span>', sv: r => +(parseTR(r.son) || 0)},
      {h: 'Eşl.', k: 'm', num: 1, r: r => { const n = (IDX.mByTruck[r.plaka] || []).length; return n ? '<span class="badge b-green">' + n + '</span>' : '<span class="muted">–</span>'; }, sv: r => (IDX.mByTruck[r.plaka] || []).length},
    ], D.fleet, {on: isOn('fleet'), attr: r => 'data-sel="fleet:' + esc(r.plaka) + '"'}) + '<div class="banner small">Öz araçların ADR durumu bilinmiyor; ADR yüklerle eşleştirilmez. Veri yok / eski sinyal: GPS cihazını kontrol et.</div>';
  } else if (tab === 'mt') {
    const all = $('mtAll') && $('mtAll').checked;
    const rows = D.mt.filter(m => all || m.acik);
    h = '<div class="banner">{{MT}} verisi <b>' + esc(iso2tr(D.mt_tarih)) + '</b> tarihli önbellekten. Canlı erişim reddediliyor (API yetkisi gerekli); tekrar giriş denenmez.</div>' +
      '<div style="padding:4px 12px"><label class="small"><input type="checkbox" id="mtAll"' + (all ? ' checked' : '') + '> Kapalı/geçmiş pozisyonları da göster (' + D.mt.length + ')</label></div>' + table('mt', [
      {h: 'Pozisyon', k: 'ref', r: r => '<b>' + esc(r.ref) + '</b><div class="small muted">' + (r.tip === 'owned' ? 'özmal' : esc(r.tip || '')) + '</div>'},
      {h: 'Durum', k: 'durum', r: r => '<span class="badge ' + (r.acik ? 'b-purple' : 'b-gray') + '">' + esc(r.durum) + '</span>'},
      {h: 'Güzergâh', k: 'cikis', r: r => '<span class="small">' + esc(r.cikis) + ' → ' + esc(r.varis) + '</span>'},
      {h: 'Çekici / dorse', k: 'cekici', r: r => esc(r.cekici || '—') + '<div class="small muted">' + esc(r.dorse || '') + '</div>'},
      {h: 'Kalkış', k: 'kalkis', r: r => '<span class="nowrap">' + iso2tr(r.kalkis) + '</span>'},
      {h: 'Tah. varış', k: 'tahmini_varis', r: r => '<span class="nowrap">' + iso2tr(r.tahmini_varis) + '</span>'},
      {h: 'Navlun', k: 'navlun', r: r => esc(r.navlun || '—')},
    ], rows, {on: () => false, attr: r => (r.d ? 'data-mt="' + esc(r.ref) + '"' : '')});
  }
  $('content').innerHTML = h;
  bindTable();
  $('content').querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copyText(IDX.quote[b.dataset.copy].teklif_metni));
  $('content').querySelectorAll('button[data-sel]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.sel.split(':'); select(k, id); });
  $('content').querySelectorAll('[data-ref]').forEach(a => a.onclick = (e) => { e.preventDefault(); const id = a.dataset.ref; select(IDX.quote[id] ? 'quote' : 'load', id); });
  $('content').querySelectorAll('tr[data-mt]').forEach(tr => tr.onclick = () => { const m = D.mt.find(x => x.ref === tr.dataset.mt); if (m) { const b = [m.o, m.d].filter(Boolean).map(p => [p[0], p[1]]); if (b.length > 1) map.fitBounds(b, {padding: [40, 40]}); else map.setView(b[0], 7); } });
  const mtAll = $('mtAll'); if (mtAll) mtAll.onchange = render;
}

function renderCounters() {
  const openQ = D.quotes.filter(q => ['Teklif hazır', 'Yeni', 'Eşleşti'].includes(q.durum));
  const urgent = openQ.filter(q => q.acil).length;
  const act = D.fleet.filter(x => x.durum !== 'nodata' && !x.eski).length;
  const C = [
    ['teklif', openQ.length, 'Açık teklif' + (urgent ? ' · ' + urgent + ' acil' : ''), urgent ? 'red' : 'amber'],
    ['teklif', D.quotes.length - openQ.length, 'Takipte', ''],
    ['yuk', D.loads.length, 'Yük', ''],
    ['arac', D.trucks.length, 'Boş araç', 'green'],
    ['eslesme', D.mgroups.length, 'Eşleşme', 'green'],
    ['filo', act + '/' + D.fleet.length, 'Öz filo aktif', ''],
    ['mt', D.mt.filter(m => m.acik).length, '{{MT}} açık', ''],
    ['bugun', (D.todo || []).length, 'Bugün', 'amber'],
  ];
  $('counters').innerHTML = C.map(c => '<div class="cnt ' + c[3] + '" data-t="' + c[0] + '"><b>' + c[1] + '</b><span>' + c[2] + '</span></div>').join('');
  $('counters').querySelectorAll('.cnt').forEach(e => e.onclick = () => { tab = e.dataset.t; render(); });
}
function renderUpd() {
  const g = parseTR(D.guncelleme), fz = D.fleet_zaman ? new Date(D.fleet_zaman) : null;
  const oto = D.oto_yenileme || {};
  const ageMin = g ? (Date.now() - g.getTime()) / 60000 : 0;
  let h = 'Son güncelleme: <b>' + esc(D.guncelleme) + '</b> (' + ago(g) + ')' + (ageMin > 30 && !OFFLINE ? ' <span class="warn">⚠</span>' : '');
  h += '<br>Filo: ' + esc((D.fleet_zaman || '').replace('T', ' ')) + ' · Gmail penceresi ' + esc(D.pencere) + '+ · <span class="warn">{{MT}} önbellek: ' + esc(iso2tr(D.mt_tarih)) + '</span>';
  if (OFFLINE) h += '<br><span class="warn">Çevrimdışı kopya – otomatik yenilenmez</span>';
  else if (SRC) h += (lastFetch ? '<br>Ekran ' + lastFetch.toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'}) + '\'de yenilendi · her 60 sn' : '') + (D.yayin_zamani ? ' · yayın ' + esc(D.yayin_zamani) : '');
  else if (oto.hata) h += '<br><span class="bad">Oto-yenileme: ' + esc(oto.hata) + '</span>';
  else if (lastFetch) h += '<br>Ekran ' + lastFetch.toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'}) + '\'de yenilendi · her 60 sn';
  $('updInfo').innerHTML = h;
  document.documentElement.style.setProperty('--hh', $('top').offsetHeight + 'px');
}

/* ---------- veri ---------- */
let sig = '';
function apply(data) {
  const s = data.guncelleme + '|' + data.fleet_zaman + '|' + data.loads.length + '|' + data.quotes.length + '|' + data.data_mtime;
  D = data; lastFetch = new Date(); index();
  if (s !== sig) { sig = s; setupFilters(); drawMap(); if (sel) { renderSel(); highlight(sel.kind, sel.id); } }
  renderCounters(); render(); renderUpd();
}
async function fetchData(manual) {
  if (OFFLINE) return;
  try {
    if (SRC) { apply(await SRC()); if (manual) toast('Veriler yenilendi'); return; }
    const r = await fetch('api/data', {credentials: 'same-origin', cache: 'no-store'});
    if (r.status === 401) { location.href = 'login'; return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    apply(await r.json()); if (manual) toast('Veriler yenilendi');
  } catch (e) { $('updInfo').insertAdjacentHTML('beforeend', '<br><span class="bad">Bağlantı hatası: ' + esc(e.message) + ' – tekrar denenecek</span>'); }
}
let ft;
['fSearch', 'fCountry', 'fVeh', 'fAdr', 'fSrc', 'fFrom', 'fTo'].forEach(id => $(id).addEventListener(id === 'fSearch' ? 'input' : 'change', () => { clearTimeout(ft); ft = setTimeout(() => { drawMap(); render(); }, id === 'fSearch' ? 200 : 0); }));
$('fClear').onclick = () => { ['fSearch', 'fCountry', 'fVeh', 'fAdr', 'fSrc', 'fFrom', 'fTo'].forEach(id => $(id).value = ''); drawMap(); render(); };
$('btnReload').onclick = () => OFFLINE ? toast('Çevrimdışı kopya') : fetchData(true);
$('btnFleet').onclick = async () => { if (OFFLINE) return toast('Çevrimdışı kopya'); const r = await fetch('api/refresh-fleet', {method: 'POST', credentials: 'same-origin'}); toast(r.ok ? '{{FL}} konumları güncelleniyor… (~30 sn)' : 'Başlatılamadı'); setTimeout(() => fetchData(), 30000); };
if (OFFLINE) { $('btnLogout').classList.add('hidden'); }
if (SRC) { $('btnFleet').classList.add('hidden'); $('btnLogout').onclick = (e) => { e.preventDefault(); if (window.APP_LOGOUT) window.APP_LOGOUT(); }; }
$('mobToggle').onclick = () => $('side').scrollIntoView({behavior: 'smooth'});
window.addEventListener('resize', () => { document.documentElement.style.setProperty('--hh', $('top').offsetHeight + 'px'); map.invalidateSize(); });
if (OFFLINE) apply(window.EMBEDDED_DATA); else { fetchData(); setInterval(fetchData, POLL_MS); }
setInterval(() => D && renderUpd(), 30000);
})();
