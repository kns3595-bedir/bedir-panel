/* Operasyon paneli – istemci v2 (sade, mobil öncelikli). Arayüzü kendisi çizer: index.html sadece yükleyici. */
(function () {
'use strict';
const OFFLINE = !!window.EMBEDDED_DATA;
const SRC = window.APP_SOURCE || null;
const POLL_MS = 60000;
const CC = {TR:'Türkiye',DE:'Almanya',FR:'Fransa',IT:'İtalya',NL:'Hollanda',BE:'Belçika',AT:'Avusturya',CZ:'Çekya',PL:'Polonya',ES:'İspanya',PT:'Portekiz',SK:'Slovakya',HU:'Macaristan',RO:'Romanya',CH:'İsviçre',DK:'Danimarka',LU:'Lüksemburg',GB:'İngiltere',UK:'İngiltere',SE:'İsveç',FI:'Finlandiya',LT:'Litvanya',SI:'Slovenya',HR:'Hırvatistan',BG:'Bulgaristan',GR:'Yunanistan',GE:'Gürcistan',AM:'Ermenistan',AZ:'Azerbaycan',IR:'İran',IQ:'Irak',AE:'BAE',QA:'Katar',SA:'S. Arabistan',KW:'Kuveyt',OM:'Umman',IE:'İrlanda',MA:'Fas',RU:'Rusya',AF:'Afganistan',TM:'Türkmenistan',RS:'Sırbistan',BH:'Bahreyn'};
const COUNTRY_WORDS = /^(uk|u\.k\.|uae|türkiye|turkey|qatar|romania|italy|germany|scotland|england|bae|katar|almanya|italya|ingiltere|i̇ngiltere|fransa|hollanda|belçika|romanya|polonya|avusturya|isviçre|i̇sviçre|macaristan|ispanya|i̇spanya|çekya)$/i;
let D = null, view = 'bugun', sub = 'yuk', sel = null, showAll = false, sortState = {}, lastFetch = null, firstFit = true;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ncc = (c) => (c === 'UK' ? 'GB' : (c || ''));
const money = (p, c) => { if (!p) return '—'; const s = Number(p).toLocaleString('tr-TR', {maximumFractionDigits: 0}); return c === 'EUR' ? s + ' €' : c === 'USD' ? s + ' $' : s + ' ' + (c || ''); };
const gmail = (t) => t ? 'https://mail.google.com/mail/u/0/#all/' + t : '';
const iso2tr = (s) => s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : '';
function hav(a, b) { const R = 6371, r = Math.PI / 180; const dLa = (b[0]-a[0])*r, dLo = (b[1]-a[1])*r; const h = Math.sin(dLa/2)**2 + Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
function parseTR(s) { const m = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(s || ''); return m ? new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0)) : null; }
function ago(d) { if (!d) return ''; const m = Math.round((Date.now() - d.getTime()) / 60000); if (m < 1) return 'az önce'; if (m < 60) return m + ' dk önce'; const h = Math.round(m/60); if (h < 48) return h + ' saat önce'; return Math.round(h/24) + ' gün önce'; }
function daysTxt(n) { return n == null ? '' : n === 0 ? 'bugün geldi' : n === 1 ? 'dün geldi' : n + ' gün önce geldi'; }
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2000); }
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast('✓ Teklif kopyalandı – Gmail\'de yanıta yapıştır');
}
/* "Iron Mountain, Milton Keynes MK6 4AD, UK" → "Milton Keynes" */
function place(addr, cc) {
  let a = String(addr || '').replace(/\([^)]*\)/g, ' ').split('/')[0];
  const segs = a.split(',').map(s => s.trim()).filter(s => s && !COUNTRY_WORDS.test(s));
  let s = (segs.length ? segs[segs.length - 1] : '').split(/\s+/).filter(w => !/\d/.test(w) && !/^(OSB|EXW)$/i.test(w)).join(' ').replace(/[-–]+$/, '').trim();
  if (segs.length > 1 && /^(OSB)$/i.test(s)) s = segs[segs.length - 2];
  const c = ncc(cc);
  if (!s || s.length < 3) return CC[c] || c || '?';
  return (c && c !== 'TR' && CC[c] && !s.includes(CC[c])) ? s + ' (' + CC[c] + ')' : s;
}
function routeTxt(it) { return place(it.cikis_adres, it.cikis) + ' → ' + place(it.varis_adres, it.varis); }
function cleanCo(s) { return String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim(); }
function winTxt(w, raw) {
  if (!w) return raw || '';
  const f = (s) => s.slice(8, 10) + '.' + s.slice(5, 7);
  if (/hazır|müsait/i.test(raw || '')) return 'hazır';
  return w[0] === w[1] ? f(w[0]) : f(w[0]).slice(0, 2) + '–' + f(w[1]);
}
const PLAIN_FLAG = {'teyit gerekir': 'ilan eski, hâlâ geçerli mi sor', 'tarih belirtilmemiş': 'yükleme tarihi yazmıyor', 'araç yolda – boşalma teyit': 'aracımız şu an yolda, boşalınca'};
const plainFlags = (fs) => (fs || []).map(f => PLAIN_FLAG[f] || f).join(' · ');
const FL_ST = {driving: 'yolda', standing: 'duruyor', nodata: 'sinyal yok'};
const cityOf = (yakin) => String(yakin || '').replace(/\s*\(.*$/, '');

/* ---------- iskelet ---------- */
const root = $('appRoot') || document.body.appendChild(Object.assign(document.createElement('div'), {id: 'appRoot'}));
root.style.display = 'block';
root.innerHTML =
  '<header class="hdr"><div class="hl"><div class="logo">B</div><div><div class="ttl">{{TITLE}}</div><div id="upd" class="upd">Yükleniyor…</div></div></div>' +
  '<div class="hr"><button id="btnReload" class="hbtn" title="Yenile">↻</button>' + (OFFLINE ? '' : '<a id="btnLogout" class="hbtn" href="' + (SRC ? '#' : '/logout') + '">Çıkış</a>') + '</div></header>' +
  '<nav class="nav"><button data-v="bugun" class="on">Bugün</button><button data-v="detay">Detay</button></nav>' +
  '<div class="wrap"><section class="colMap"><div class="mapBox"><div id="map"></div><button id="btnAll" class="allBtn">Tüm yükleri göster</button></div><div id="sel"></div></section>' +
  '<section id="main" class="colMain"></section></div><div id="toast" class="toast"></div>';
document.querySelectorAll('.nav button').forEach(b => b.onclick = () => { view = b.dataset.v; document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('on', x === b)); render(); window.scrollTo({top: 0}); });

/* ---------- harita ---------- */
const map = L.map('map', {zoomControl: true, worldCopyJump: true, attributionControl: true}).setView([40, 33], 5);
const TILE_OSM = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: '&copy; OpenStreetMap'});
const TILE_ESRI = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {maxZoom: 19, attribution: 'Harita &copy; Esri, OpenStreetMap'});
let tileErr = 0; TILE_OSM.on('tileerror', () => { if (++tileErr === 3 && map.hasLayer(TILE_OSM)) { map.removeLayer(TILE_OSM); TILE_ESRI.addTo(map); } });
TILE_OSM.addTo(map);
const clusterIcon = (cls) => (c) => { const n = c.getChildCount(); const s = n < 10 ? 30 : n < 50 ? 36 : 44; return L.divIcon({html: '<div class="cl ' + cls + '" style="width:' + s + 'px;height:' + s + 'px">' + n + '</div>', className: '', iconSize: [s, s]}); };
const LY = {
  loads: L.markerClusterGroup({iconCreateFunction: clusterIcon('cl-load'), maxClusterRadius: 45, showCoverageOnHover: false}),
  trucks: L.markerClusterGroup({iconCreateFunction: clusterIcon('cl-truck'), maxClusterRadius: 40, showCoverageOnHover: false}),
  quotes: L.layerGroup(), mt: L.layerGroup(), fleet: L.layerGroup().addTo(map), hq: L.layerGroup().addTo(map),
};
const hlLayer = L.layerGroup().addTo(map);
const icon = (cls, txt, s) => L.divIcon({html: '<div class="mk ' + cls + '" style="width:' + s + 'px;height:' + s + 'px">' + (txt || '') + '</div>', className: '', iconSize: [s, s], iconAnchor: [s/2, s/2]});
function setAll(on) { showAll = on; ['loads', 'trucks', 'quotes', 'mt'].forEach(k => on ? LY[k].addTo(map) : map.removeLayer(LY[k])); $('btnAll').textContent = on ? 'Sadece araçlarım' : 'Tüm yükleri göster'; $('btnAll').classList.toggle('on', on); }
$('btnAll').onclick = () => setAll(!showAll);

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
const isOpenQ = (q) => ['Teklif hazır', 'Yeni', 'Eşleşti'].includes(q.durum);

function drawMap() {
  Object.values(LY).forEach(l => l.clearLayers());
  const pl = (l) => '<b>' + esc(cleanCo(l.firma_k)) + '</b><br>' + esc(routeTxt(l)) + '<br>' + esc(winTxt(l.win, l.yukleme_tarihi)) + ' · ' + money(l.fiyat, l.para) + '<br><a href="#" data-sel="load:' + esc(l.id) + '">Uygun araçlar</a>';
  LY.loads.addLayers(D.loads.filter(l => l.o).map(l => L.marker([l.o[0], l.o[1]], {icon: icon('mk-load', '', 14)}).bindPopup(pl(l))));
  LY.trucks.addLayers(D.trucks.filter(t => t.p).map(t => L.marker([t.p[0], t.p[1]], {icon: icon('mk-truck', '', 14)}).bindPopup('<b>' + esc(cleanCo(t.firma_k)) + '</b><br>Boş araç: ' + esc(t.bolge) + '<br>' + esc(t.arac) + ' · ' + esc(t.tarih))));
  D.quotes.filter(q => q.o && isOpenQ(q)).forEach(q => L.marker([q.o[0], q.o[1]], {icon: icon('mk-quote', '€', 22)}).bindPopup('<b>' + esc(cleanCo(q.firma_k)) + '</b><br>' + esc(routeTxt(q)) + '<br>' + money(q.fiyat, q.para) + '<br><a href="#" data-sel="quote:' + esc(q.id) + '">Göster</a>').addTo(LY.quotes));
  D.mt.filter(m => m.acik && m.o && m.d).forEach(m => L.polyline([[m.o[0], m.o[1]], [m.d[0], m.d[1]]], {color: '#64748b', weight: 2, opacity: .5, dashArray: '6 6'}).bindTooltip('{{MT}}: ' + m.cikis + ' → ' + m.varis + (m.cekici ? ' · ' + m.cekici : '')).addTo(LY.mt));
  D.fleet.filter(x => x.p).forEach(x => {
    const cls = 'mk-fleet' + (x.eski || x.durum === 'nodata' ? ' old' : '');
    L.marker([x.p[0], x.p[1]], {icon: L.divIcon({html: '<div class="plt ' + cls + '">' + esc(x.plaka) + '</div>', className: '', iconSize: null, iconAnchor: [34, 12]}), zIndexOffset: 500})
      .bindPopup('<b>' + esc(x.plaka) + '</b><br>' + esc(cityOf(x.yakin)) + ' – ' + esc(FL_ST[x.durum] || x.durum) + (x.hiz ? ' (' + x.hiz + ' km/s)' : '') + '<br>Son sinyal: ' + esc(x.son || '—') + '<br><a href="#" data-sel="fleet:' + esc(x.plaka) + '">Bu araca uygun yükler</a>').addTo(LY.fleet);
  });
  const hq = D.hq || {p: [38.73, 35.48], ad: 'Merkez'};
  L.marker(hq.p, {icon: icon('mk-hq', '★', 30), zIndexOffset: 1000}).bindTooltip('Merkez', {direction: 'top', offset: [0, -14]}).bindPopup('<b>' + esc(hq.ad) + '</b><br>' + esc(hq.adres || '')).addTo(LY.hq);
  if (firstFit) { firstFit = false; fitFleet(); }
}
function fitFleet() { const pts = D.fleet.filter(x => x.p).map(x => [x.p[0], x.p[1]]); pts.push((D.hq || {p: [38.73, 35.48]}).p); map.fitBounds(L.latLngBounds(pts).pad(0.15), {maxZoom: 7}); }
map.on('popupopen', (e) => { e.popup.getElement().querySelectorAll('[data-sel]').forEach(a => a.addEventListener('click', (ev) => { ev.preventDefault(); const [k, id] = a.dataset.sel.split(':'); select(k, id); })); });

/* ---------- eşleşmeler ---------- */
function matchesForItem(id) {
  const it = itemOf(id); if (!it) return [];
  const raw = (IDX.mByItem[id] || []).map(m => Object.assign({alt: false}, m));
  const have = new Set(raw.map(m => m.arac)); const g = IDX.gByItem[id];
  (g ? g.alternatif : []).forEach(a => { if (have.has(a)) return; const t = truckOf(a); if (!t || !t.p || !it.o) return; raw.push({arac: a, arac_kaynak: IDX.fleet[a] ? 'filo' : 'ilan', km: Math.round(hav(it.o, t.p)), gun: null, puan: 0, flags: [], alt: true}); have.add(a); });
  return raw.sort((a, b) => (IDX.fleet[b.arac] ? 1 : 0) - (IDX.fleet[a.arac] ? 1 : 0) || (b.puan || 0) - (a.puan || 0) || a.km - b.km);
}
/* Öz araçlarımız için en iyi yük: araç başına 1 satır */
function fleetDeals() {
  const best = {};
  D.matches.filter(m => m.arac_kaynak === 'filo' && m.tur === 'yük' && !(m.flags || []).includes('teyit gerekir')).forEach(m => { if (!best[m.arac] || m.puan > best[m.arac].puan) best[m.arac] = m; });
  D.mgroups.filter(g => g.tur === 'yük' && !(g.flags || []).includes('teyit gerekir')).forEach(g => [g.arac].concat(g.alternatif || []).forEach(a => {
    if (!IDX.fleet[a] || best[a]) return; const it = IDX.load[g.item], t = IDX.fleet[a]; if (!it || !it.o || !t.p) return;
    const km = Math.round(hav(it.o, t.p)); if (km <= 250) best[a] = {item: g.item, arac: a, km, gun: g.gun, puan: g.puan - 5 - km / 50, flags: g.flags, tur: 'yük'};
  }));
  return Object.values(best).sort((a, b) => b.puan - a.puan);
}

function highlight(kind, id) {
  hlLayer.clearLayers(); const bounds = [];
  const ring = (p, color, r) => { L.circleMarker(p, {radius: r, color, weight: 3, fillOpacity: .12}).addTo(hlLayer); bounds.push(p); };
  if (kind === 'load' || kind === 'quote') {
    const it = itemOf(id); if (!it || !it.o) return;
    const o = [it.o[0], it.o[1]];
    L.marker(o, {icon: icon(kind === 'quote' ? 'mk-quote' : 'mk-load', kind === 'quote' ? '€' : '', 22), zIndexOffset: 900}).bindTooltip('Yükleme: ' + place(it.cikis_adres, it.cikis), {permanent: true, direction: 'right', offset: [12, 0]}).addTo(hlLayer); bounds.push(o);
    if (it.d) { const d = [it.d[0], it.d[1]]; L.polyline([o, d], {color: '#1d4ed8', weight: 3, opacity: .75, dashArray: '8 8'}).addTo(hlLayer); L.circleMarker(d, {radius: 8, color: '#1d4ed8', fillColor: '#fff', fillOpacity: 1, weight: 3}).bindTooltip('Teslim: ' + place(it.varis_adres, it.varis), {permanent: true, direction: 'right', offset: [10, 0]}).addTo(hlLayer); bounds.push(d); }
    matchesForItem(id).slice(0, 6).forEach(m => { const t = truckOf(m.arac); if (!t || !t.p) return; const p = [t.p[0], t.p[1]];
      L.polyline([o, p], {color: '#f59e0b', weight: 3.5, opacity: .9}).addTo(hlLayer);
      if (!IDX.fleet[m.arac]) L.marker(p, {icon: icon('mk-truck', '', 16)}).bindTooltip(cleanCo(t.firma_k) + ' · ' + m.km + ' km').addTo(hlLayer);
      ring(p, '#f59e0b', 16); });
  } else {
    const t = truckOf(id); if (!t || !t.p) return; const p = [t.p[0], t.p[1]]; ring(p, '#f59e0b', 18);
    (IDX.mByTruck[id] || []).slice().sort((a, b) => b.puan - a.puan).slice(0, 6).forEach(m => { const it = itemOf(m.item); if (!it || !it.o) return; const o = [it.o[0], it.o[1]]; L.polyline([p, o], {color: '#f59e0b', weight: 3, opacity: .9}).addTo(hlLayer); L.marker(o, {icon: icon('mk-load', '', 16)}).bindTooltip(cleanCo(it.firma_k)).addTo(hlLayer); bounds.push(o); });
  }
  if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds).pad(0.3), {maxZoom: 9}); else if (bounds.length) map.setView(bounds[0], 8);
}

function select(kind, id) { sel = {kind, id}; renderSel(); highlight(kind, id); if (window.innerWidth < 900) document.querySelector('.colMap').scrollIntoView({behavior: 'smooth', block: 'start'}); }
function renderSel() {
  const box = $('sel');
  if (!sel) { box.innerHTML = ''; hlLayer.clearLayers(); return; }
  let h = '';
  if (sel.kind === 'load' || sel.kind === 'quote') {
    const it = itemOf(sel.id); if (!it) { sel = null; return renderSel(); }
    const ms = matchesForItem(sel.id);
    h = '<div class="selHd"><div><div class="selT">' + esc(cleanCo(it.firma_k)) + '</div><div class="selR">' + esc(routeTxt(it)) + '</div><div class="muted">' + esc(sel.kind === 'quote' ? it.yuk : 'Yükleme ' + winTxt(it.win, it.yukleme_tarihi) + ' · ' + (it.vgrup || '') + (it.adr ? ' · ADR' : '')) + '</div></div><button class="x" id="selX" aria-label="Kapat">✕</button></div>' +
      '<div class="selP">' + money(it.fiyat, it.para) + ' <span class="muted small">önerilen fiyat</span></div>' +
      (ms.length ? '<div class="selSub">Yakındaki araçlar</div>' + ms.slice(0, 6).map(m => { const t = truckOf(m.arac) || {}; const own = !!IDX.fleet[m.arac];
        return '<div class="line"><b>' + (own ? '🚚 ' + esc(m.arac) + ' (bizim)' : esc(cleanCo(t.firma_k))) + '</b> – ' + m.km + ' km uzakta' + (m.gun ? ', tarih ' + m.gun + ' gün kayık' : '') + (own ? '' : '<div class="muted small">' + esc(t.bolge || '') + ' · ' + esc(t.arac || '') + (t.link1 ? ' · <a target="_blank" rel="noopener" href="' + esc(t.link1) + '">mail</a>' : '') + '</div>') + (m.flags && m.flags.length ? '<div class="muted small">' + esc(plainFlags(m.flags)) + '</div>' : '') + '</div>'; }).join('')
        : '<div class="line muted">Yakında uygun araç yok.</div>') +
      '<div class="btnRow">' + (it.teklif_metni ? '<button class="big pri" data-copy="' + esc(it.id) + '">📋 Teklifi kopyala</button>' : '') + (it.link ? '<a class="big" target="_blank" rel="noopener" href="' + esc(it.link) + '">✉️ Gmail\'de aç</a>' : '') + '</div>';
  } else {
    const t = truckOf(sel.id); if (!t) { sel = null; return renderSel(); }
    const own = !!IDX.fleet[sel.id]; const ms = (IDX.mByTruck[sel.id] || []).slice().sort((a, b) => b.puan - a.puan);
    h = '<div class="selHd"><div><div class="selT">' + (own ? '🚚 ' + esc(t.plaka) : esc(cleanCo(t.firma_k))) + '</div><div class="muted">' + (own ? esc(cityOf(t.yakin)) + ' – ' + esc(FL_ST[t.durum] || t.durum) + ' · son sinyal ' + esc(t.son || '—') : esc(t.bolge) + ' · ' + esc(t.arac)) + '</div></div><button class="x" id="selX" aria-label="Kapat">✕</button></div>' +
      (ms.length ? '<div class="selSub">Bu araca uygun yükler</div>' + ms.slice(0, 8).map(m => { const it = itemOf(m.item) || {}; return '<div class="line click" data-item="' + esc(m.item) + '" data-kind="' + (m.tur === 'teklif' ? 'quote' : 'load') + '"><b>' + esc(cleanCo(it.firma_k)) + '</b> – ' + esc(routeTxt(it)) + '<div class="muted small">' + esc(winTxt(it.win, it.yukleme_tarihi)) + ' · ' + m.km + ' km · <b class="money">' + money(it.fiyat, it.para) + '</b></div></div>'; }).join('') : '<div class="line muted">Şu an bu araca uygun yük yok.</div>');
  }
  box.innerHTML = '<div class="selCard">' + h + '</div>';
  $('selX').onclick = () => { sel = null; renderSel(); fitFleet(); };
  bindCommon(box);
  box.querySelectorAll('[data-item]').forEach(r => r.onclick = () => select(r.dataset.kind, r.dataset.item));
}

/* ---------- Bugün ---------- */
function quoteCard(q) {
  const g = IDX.gByItem[q.id]; const own = g && IDX.fleet[g.arac];
  return '<div class="card' + (q.acil ? ' urgent' : '') + '">' +
    '<div class="cTop"><div class="cName">' + esc(cleanCo(q.firma_k)) + '</div>' + (q.acil ? '<span class="tag red">ACİL</span>' : '') + '</div>' +
    '<div class="cRoute">' + esc(routeTxt(q)) + '</div>' +
    '<div class="cSub">' + esc(q.yuk) + '</div>' +
    '<div class="cPrice">' + money(q.fiyat, q.para) + '</div>' +
    '<div class="cSub">' + esc(daysTxt(q.bekleme)) + (own ? ' · <b>aracımız ' + esc(g.arac) + ' ' + g.km + ' km yakında</b>' : '') + '</div>' +
    '<div class="btnRow"><button class="big pri" data-copy="' + esc(q.id) + '">📋 Teklifi kopyala</button>' + (q.link ? '<a class="big" target="_blank" rel="noopener" href="' + esc(q.link) + '">✉️ Gmail\'de aç</a>' : '') + '</div>' +
    '<div class="cLinks"><a href="#" data-sel="quote:' + esc(q.id) + '">Haritada göster</a> · <a href="#" data-show="' + esc(q.id) + '">Metni gör</a></div>' +
    '<pre class="qt hidden" id="qt-' + esc(q.id) + '">' + esc(q.teklif_metni || '') + '</pre></div>';
}
function renderToday() {
  const open = D.quotes.filter(isOpenQ).sort((a, b) => (b.acil|0) - (a.acil|0) || (a.bekleme||0) - (b.bekleme||0));
  const deals = fleetDeals();
  const wait = D.quotes.filter(q => !isOpenQ(q)).map(q => ({ad: cleanCo(q.firma_k), r: routeTxt(q), s: q.sent, g: q.bekleme, link: q.link}))
    .concat(D.other.filter(o => o.durum !== 'Yeni').map(o => ({ad: cleanCo(o.firma), r: o.konu, s: '', g: (() => { const d = parseTR(o.gelis); return d ? Math.floor((new Date(D.bugun) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5) : null; })(), link: gmail(o.thread)})))
    .sort((a, b) => (b.g || 0) - (a.g || 0));
  const newMail = D.other.filter(o => o.durum === 'Yeni');
  let h = '<div class="blk"><h2>1 · Teklif ver <span class="cnt">' + open.length + '</span></h2>' + (open.map(quoteCard).join('') || '<div class="empty">Bekleyen teklif talebi yok 👍</div>') +
    (newMail.length ? newMail.map(o => '<div class="row2"><div><b>' + esc(cleanCo(o.firma)) + '</b> – ' + esc(o.konu) + '</div><a class="sm" target="_blank" rel="noopener" href="' + gmail(o.thread) + '">Cevapla ✉️</a></div>').join('') : '') + '</div>';
  h += '<div class="blk"><h2>2 · Aracım var, yük var <span class="cnt">' + deals.length + '</span></h2>' +
    (deals.length ? deals.slice(0, 8).map(m => { const f = IDX.fleet[m.arac], it = IDX.load[m.item]; if (!f || !it) return '';
      const where = f.durum === 'driving' ? cityOf(f.yakin) + ' yakınında yolda' : cityOf(f.yakin) + '\'de duruyor';
      return '<div class="deal" data-sel="load:' + esc(it.id) + '"><div class="dTruck">🚚 ' + esc(f.plaka) + ' <span class="muted">' + esc(where) + '</span></div>' +
        '<div class="dLoad">→ <b>' + esc(cleanCo(it.firma_k)) + '</b> ' + esc(routeTxt(it)) + '</div>' +
        '<div class="dMeta">' + esc(winTxt(it.win, it.yukleme_tarihi)) + ' · ' + m.km + ' km · <b class="money">' + money(it.fiyat, it.para) + '</b>' + (it.link ? ' · <a target="_blank" rel="noopener" href="' + esc(it.link) + '">Gmail\'de aç</a>' : '') + '</div>' +
        (m.flags && m.flags.length ? '<div class="muted small">' + esc(plainFlags(m.flags)) + '</div>' : '') + '</div>'; }).join('')
      : '<div class="empty">Şu an araçlarımıza yakın yük yok.</div>') + '</div>';
  h += '<div class="blk"><h2>3 · Bekleyen <span class="cnt">' + wait.length + '</span></h2>' + (wait.map(w => '<div class="row2"><div><b>' + esc(w.ad) + '</b> – ' + esc(w.r) + (w.s ? '<div class="muted small">Verdiğimiz fiyat: ' + esc(w.s) + '</div>' : '') + '</div><div class="right"><span class="tag' + ((w.g || 0) >= 5 ? ' red' : '') + '">' + (w.g == null ? '' : w.g + ' gündür cevap yok') + '</span>' + (w.link ? '<a class="sm" target="_blank" rel="noopener" href="' + esc(w.link) + '">Gmail</a>' : '') + '</div></div>').join('') || '<div class="empty">Bekleyen yok.</div>') + '</div>';
  const stale = D.fleet.filter(f => f.eski || f.durum === 'nodata').map(f => f.plaka);
  h += '<div class="note">' + (stale.length ? 'Konumu gelmeyen araçlar: ' + esc(stale.join(', ')) + '. ' : '') + '{{MT}} bilgisi ' + esc(iso2tr(D.mt_tarih)) + ' tarihli (canlı bağlantı kapalı). Fiyatlar öneridir.</div>';
  return h;
}

/* ---------- Detay ---------- */
function table(key, cols, rows, attr) {
  const s = sortState[key] || {};
  if (s.col != null) { const c = cols[s.col]; const v = c.sv || ((r) => r[c.k]); rows = rows.slice().sort((a, b) => { const x = v(a), y = v(b); const r = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'tr', {numeric: true}); return s.dir === 'desc' ? -r : r; }); }
  if (!rows.length) return '<div class="empty">Kayıt yok.</div>';
  return '<div class="tw"><table data-key="' + key + '"><thead><tr>' + cols.map((c, i) => '<th data-i="' + i + '" class="' + (s.col === i ? 's-' + s.dir : '') + '">' + c.h + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr ' + (attr ? attr(r) : '') + '>' + cols.map(c => '<td>' + (c.r ? c.r(r) : esc(r[c.k])) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}
const SUBS = [['yuk', 'Yükler'], ['arac', 'Boş araçlar'], ['eslesme', 'Uygun eşleşmeler'], ['teklif', 'Tüm teklifler'], ['filo', 'Araçlarımız'], ['mt', '{{MT}}']];
function renderDetail() {
  const q = ($('dq') && $('dq').value || '').toLocaleLowerCase('tr');
  const hit = (o, ks) => !q || ks.map(k => o[k] == null ? '' : String(o[k])).join(' ').toLocaleLowerCase('tr').includes(q);
  let h = '<div class="subs">' + SUBS.map(s => '<button data-s="' + s[0] + '" class="' + (sub === s[0] ? 'on' : '') + '">' + s[1] + '</button>').join('') + '</div>' +
    '<input id="dq" class="search" type="search" placeholder="Ara: firma, şehir, plaka…" value="' + esc(q) + '">';
  const gm = (l) => l ? '<a target="_blank" rel="noopener" href="' + esc(l) + '">Gmail</a>' : '';
  if (sub === 'yuk') {
    const rows = D.loads.filter(l => hit(l, ['firma', 'cikis_adres', 'varis_adres', 'arac', 'yukleme_tarihi', 'urun']));
    h += '<div class="muted small pad">' + rows.length + ' yük ilanı (son 14 gün). Satıra dokun → haritada uygun araçlar.</div>' + table('yuk', [
      {h: 'Firma', k: 'firma_k', r: r => esc(cleanCo(r.firma_k))},
      {h: 'Nereden → Nereye', k: 'r', r: r => esc(routeTxt(r)), sv: r => routeTxt(r)},
      {h: 'Yükleme', k: 'w', r: r => esc(winTxt(r.win, r.yukleme_tarihi) || '—'), sv: r => r.win ? r.win[0] : ''},
      {h: 'Araç', k: 'vgrup', r: r => esc(r.vgrup) + (r.adr ? ' · ADR' : '')},
      {h: 'Fiyat', k: 'fiyat', r: r => '<b class="money">' + money(r.fiyat, r.para) + '</b>', sv: r => r.fiyat || 0},
      {h: 'Uygun araç', k: 'm', r: r => { const n = (IDX.mByItem[r.id] || []).length; return n ? n + ' araç' : '–'; }, sv: r => (IDX.mByItem[r.id] || []).length},
      {h: '', k: 'link', r: r => gm(r.link)},
    ], rows, r => 'class="click" data-sel="load:' + esc(r.id) + '"');
  } else if (sub === 'arac') {
    const rows = D.trucks.filter(t => hit(t, ['firma', 'bolge', 'ulke', 'arac', 'tarih']));
    h += '<div class="muted small pad">Başka firmaların boş araç ilanları. Bazıları birkaç günlük, aramadan önce hâlâ boş mu sor.</div>' + table('arac', [
      {h: 'Firma', k: 'firma_k', r: r => esc(cleanCo(r.firma_k))},
      {h: 'Nerede', k: 'bolge', r: r => esc(r.bolge) + (r.ulke ? ' (' + esc(r.ulke) + ')' : '')},
      {h: 'Araç', k: 'arac'}, {h: 'Ne zaman', k: 'tarih'},
      {h: 'Gün', k: 'bekleme', r: r => esc(r.bekleme) + ' gün önce'},
      {h: '', k: 'link1', r: r => gm(r.link1)},
    ], rows, r => 'class="click" data-sel="truck:' + esc(r.id) + '"');
  } else if (sub === 'eslesme') {
    const rows = D.mgroups.filter(g => { const it = itemOf(g.item); return it && hit(it, ['firma', 'cikis_adres', 'varis_adres']); });
    h += '<div class="muted small pad">Yüke 250 km ve 2 gün içinde uyan araçlar.</div>' + table('esl', [
      {h: 'Müşteri', k: 'i', r: r => esc(cleanCo((itemOf(r.item) || {}).firma_k))},
      {h: 'Nereden → Nereye', k: 'r', r: r => esc(routeTxt(itemOf(r.item)))},
      {h: 'En yakın araç', k: 'arac', r: r => IDX.fleet[r.arac] ? '🚚 ' + esc(r.arac) + ' (bizim)' : esc(cleanCo((truckOf(r.arac) || {}).firma_k))},
      {h: 'Uzaklık', k: 'km', r: r => r.km + ' km'},
      {h: 'Fiyat', k: 'f', r: r => '<b class="money">' + money((itemOf(r.item) || {}).fiyat, (itemOf(r.item) || {}).para) + '</b>', sv: r => (itemOf(r.item) || {}).fiyat || 0},
      {h: 'Not', k: 'flags', r: r => esc(plainFlags(r.flags))},
    ], rows, r => 'class="click" data-sel="' + (r.tur === 'teklif' ? 'quote' : 'load') + ':' + esc(r.item) + '"');
  } else if (sub === 'teklif') {
    const rows = D.quotes.filter(x => hit(x, ['firma', 'cikis_adres', 'varis_adres', 'yuk']));
    h += table('tek', [
      {h: 'Müşteri', k: 'firma_k', r: r => esc(cleanCo(r.firma_k))},
      {h: 'Nereden → Nereye', k: 'r', r: r => esc(routeTxt(r))},
      {h: 'Durum', k: 'durum', r: r => isOpenQ(r) ? 'Teklif verilecek' : 'Cevap bekleniyor'},
      {h: 'Fiyat', k: 'fiyat', r: r => '<b class="money">' + (r.sent ? esc(r.sent) : money(r.fiyat, r.para)) + '</b>', sv: r => r.fiyat || 0},
      {h: 'Geldi', k: 'bekleme', r: r => esc(daysTxt(r.bekleme))},
      {h: '', k: 'link', r: r => gm(r.link)},
    ], rows, r => 'class="click" data-sel="quote:' + esc(r.id) + '"');
  } else if (sub === 'filo') {
    h += table('filo', [
      {h: 'Plaka', k: 'plaka', r: r => '<b>' + esc(r.plaka) + '</b>'},
      {h: 'Nerede', k: 'yakin', r: r => esc(cityOf(r.yakin))},
      {h: 'Durum', k: 'durum', r: r => esc(FL_ST[r.durum] || r.durum) + (r.hiz ? ' · ' + r.hiz + ' km/s' : '') + (r.eski ? ' · konum eski' : '')},
      {h: 'Son sinyal', k: 'son', sv: r => +(parseTR(r.son) || 0)},
      {h: 'Uygun yük', k: 'm', r: r => { const n = (IDX.mByTruck[r.plaka] || []).length; return n ? n + ' yük' : '–'; }, sv: r => (IDX.mByTruck[r.plaka] || []).length},
    ], D.fleet.filter(f => hit(f, ['plaka', 'yakin'])), r => 'class="click" data-sel="fleet:' + esc(r.plaka) + '"') + '<div class="muted small pad">Konumlar {{FL}} sisteminden 5 dakikada bir alınır (son: ' + esc((D.fleet_zaman || '').replace('T', ' ')) + ').</div>';
  } else if (sub === 'mt') {
    h += '<div class="note">Bu liste ' + esc(iso2tr(D.mt_tarih)) + ' tarihli. Canlı bağlantı için {{MT}} hesabında API izni açılmalı.</div>' + table('mt', [
      {h: 'Pozisyon', k: 'ref'}, {h: 'Nereden → Nereye', k: 'cikis', r: r => esc(r.cikis) + ' → ' + esc(r.varis)},
      {h: 'Araç', k: 'cekici', r: r => esc(r.cekici || '—')}, {h: 'Çıkış', k: 'kalkis', r: r => iso2tr(r.kalkis)}, {h: 'Varış (tahmini)', k: 'tahmini_varis', r: r => iso2tr(r.tahmini_varis)},
    ], D.mt.filter(m => m.acik && hit(m, ['ref', 'cikis', 'varis', 'cekici'])));
  }
  return h;
}

/* ---------- çizim ---------- */
function bindCommon(el) {
  el.querySelectorAll('[data-copy]').forEach(b => b.onclick = (e) => { e.stopPropagation(); const it = itemOf(b.dataset.copy); if (it && it.teklif_metni) copyText(it.teklif_metni); else toast('Bu talep için hazır metin yok'); });
  el.querySelectorAll('[data-sel]').forEach(a => a.onclick = (e) => { if (e.target.closest('a[target], button[data-copy]')) return; e.preventDefault(); const [k, id] = a.dataset.sel.split(':'); select(k, id); });
  el.querySelectorAll('[data-show]').forEach(a => a.onclick = (e) => { e.preventDefault(); const p = $('qt-' + a.dataset.show); p.classList.toggle('hidden'); a.textContent = p.classList.contains('hidden') ? 'Metni gör' : 'Metni gizle'; });
}
function render() {
  if (!D) return;
  const m = $('main');
  if (view === 'bugun') m.innerHTML = renderToday();
  else {
    const hadFocus = document.activeElement && document.activeElement.id === 'dq'; const pos = hadFocus ? $('dq').selectionStart : 0;
    m.innerHTML = renderDetail();
    m.querySelectorAll('.subs button').forEach(b => b.onclick = () => { sub = b.dataset.s; render(); });
    m.querySelectorAll('th').forEach(th => th.onclick = () => { const k = th.closest('table').dataset.key, i = +th.dataset.i; const s = sortState[k] || {}; sortState[k] = {col: i, dir: s.col === i && s.dir === 'asc' ? 'desc' : 'asc'}; render(); });
    let t; $('dq').oninput = () => { clearTimeout(t); t = setTimeout(render, 250); };
    if (hadFocus) { $('dq').focus(); $('dq').setSelectionRange(pos, pos); }
  }
  bindCommon(m);
}
function renderUpd() {
  const g = parseTR(D.guncelleme);
  let s = 'Güncel: ' + esc((D.guncelleme || '').slice(11, 16)) + ' (' + ago(g) + ')';
  if (OFFLINE) s += ' · çevrimdışı kopya';
  $('upd').innerHTML = s;
}
let sig = '';
function apply(data) {
  D = data; lastFetch = new Date(); index();
  const s = [D.guncelleme, D.fleet_zaman, D.loads.length, D.quotes.length, D.data_mtime, D.yayin_zamani].join('|');
  if (s !== sig) { sig = s; drawMap(); if (sel) { renderSel(); } }
  render(); renderUpd();
}
async function fetchData(manual) {
  if (OFFLINE) return;
  try {
    if (SRC) apply(await SRC());
    else { const r = await fetch('api/data', {credentials: 'same-origin', cache: 'no-store'}); if (r.status === 401) { location.href = 'login'; return; } if (!r.ok) throw new Error('HTTP ' + r.status); apply(await r.json()); }
    if (manual) toast('Güncellendi');
  } catch (e) { $('upd').textContent = 'Bağlantı sorunu, tekrar denenecek'; }
}
$('btnReload').onclick = () => OFFLINE ? toast('Çevrimdışı kopya') : fetchData(true);
if (SRC && $('btnLogout')) $('btnLogout').onclick = (e) => { e.preventDefault(); if (window.APP_LOGOUT) window.APP_LOGOUT(); };
window.addEventListener('resize', () => map.invalidateSize());
if (OFFLINE) apply(window.EMBEDDED_DATA); else { fetchData(); setInterval(fetchData, POLL_MS); }
setInterval(() => D && renderUpd(), 30000);
setTimeout(() => map.invalidateSize(), 300);
})();
