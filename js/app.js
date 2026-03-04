/**
 * NOTAM Kaart – app.js
 *
 * Data source:
 * https://services-eu1.arcgis.com/OtUwzhpKSdeXgRIB/ArcGIS/rest/services/Airspaces_data/FeatureServer
 */

'use strict';

const ARCGIS_BASE =
  'https://services-eu1.arcgis.com/OtUwzhpKSdeXgRIB/ArcGIS/rest/services/Airspaces_data/FeatureServer';

// Subset zoals in de UI
const LAYER_CONFIG = {
  prohibited: {
    layerId: 19,
    where: '1=1',
    style: { color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.30, weight: 2 },
    typeClass: 'prohibited',
    label: 'Prohibited (P)',
  },
  ctr: {
    layerId: 15,
    where: '1=1',
    style: { color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.20, weight: 2 },
    typeClass: 'ctr',
    label: 'CTR',
  },
  restricted: {
    layerId: 18,
    where: '1=1',
    style: { color: '#ca8a04', fillColor: '#eab308', fillOpacity: 0.25, weight: 2 },
    typeClass: 'restricted',
    label: 'Restricted (R)',
  },
  tsa: {
    layerId: 3,
    where: '1=1',
    style: { color: '#9333ea', fillColor: '#a855f7', fillOpacity: 0.22, weight: 2 },
    typeClass: 'tsa',
    label: 'TSA',
  },
};

/* ── Map initialisation ─────────────────────────────────────────────── */

const map = L.map('map', { center: [52.3, 5.3], zoom: 8, zoomControl: true });

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

/* ── State ─────────────────────────────────────────────────────────── */

const leafletLayers = {};
const layerVisible = { prohibited: true, ctr: true, restricted: true, tsa: true };

const statusEl = document.getElementById('status-text');

function setStatus(msg, state = '') {
  statusEl.textContent = msg;
  statusEl.className = state;
}

async function fetchJson(url) {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} from FeatureServer`);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error.message || 'ArcGIS error');
  return data;
}

async function getLayerMaxRecordCount(layerId) {
  const meta = await fetchJson(`${ARCGIS_BASE}/${layerId}?f=pjson`);
  const n = Number(meta && meta.maxRecordCount);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

/**
 * Haal ALLE features op via paging.
 */
async function queryLayerAll(layerId, where) {
  const pageSize = await getLayerMaxRecordCount(layerId);

  let offset = 0;
  let all = [];
  let first = null;

  // simpele guard
  const MAX_PAGES = 2000;
  let pages = 0;

  while (true) {
    pages++;
    if (pages > MAX_PAGES) throw new Error('Paging aborted (too many pages).');

    const params = new URLSearchParams({
      where,
      outFields: '*',
      returnGeometry: 'true',
      f: 'geojson',
      resultRecordCount: String(pageSize),
      resultOffset: String(offset),
      returnExceededLimitFeatures: 'true',
    });

    const data = await fetchJson(`${ARCGIS_BASE}/${layerId}/query?${params.toString()}`);
    if (!first) first = data;

    const features = (data && data.features) ? data.features : [];
    all = all.concat(features);

    if (features.length < pageSize) break;
    offset += pageSize;
  }

  return {
    type: 'FeatureCollection',
    features: all,
    crs: first && first.crs ? first.crs : undefined,
  };
}

/* ── Popup builder ─────────────────────────────────────────────────── */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPopup(props, typeKey) {
  const cfg = LAYER_CONFIG[typeKey];

  const name =
    props.Name || props.name || props.NAME ||
    props.Designation || props.designation ||
    props.label || props.LABEL || '(onbekend)';

  const type =
    props.TYPE || props.type || props.Airspace_type ||
    props.type_icao || cfg.label;

  const lower = props.lower_limit !== undefined
    ? props.lower_limit
    : (props.Lower_limit !== undefined ? props.Lower_limit : '–');

  const upper = props.upper_limit !== undefined
    ? props.upper_limit
    : (props.Upper_limit !== undefined ? props.Upper_limit : '–');

  const activity = props.Activity || props.activity || props.Status || props.status || '–';

  return `
    <div class="popup-title">${escHtml(name)}</div>
    <span class="popup-type ${cfg.typeClass}">${escHtml(type)}</span>
    <div class="popup-row"><strong>Ondergrens:</strong> ${escHtml(lower)}</div>
    <div class="popup-row"><strong>Bovengrens:</strong> ${escHtml(upper)}</div>
    <div class="popup-row"><strong>Activiteit:</strong> ${escHtml(activity)}</div>
  `.trim();
}

/* ── Layer loader ─────────────────────────────────────────────────── */

async function loadLayer(key) {
  const cfg = LAYER_CONFIG[key];

  try {
    const geojson = await queryLayerAll(cfg.layerId, cfg.where);
    const count = (geojson.features || []).length;

    const group = L.layerGroup();

    L.geoJSON(geojson, {
      style: () => cfg.style,
      onEachFeature: (feature, layer) => {
        layer.bindPopup(buildPopup(feature.properties || {}, key), { maxWidth: 280 });
        layer.on('mouseover', function () { this.openPopup(); });
        layer.on('mouseout', function () { this.closePopup(); });
      },
    }).addTo(group);

    leafletLayers[key] = group;
    if (layerVisible[key]) group.addTo(map);

    return count;
  } catch (err) {
    console.error(`Fout bij laden laag "${key}":`, err);
    return null;
  }
}

/* ── Toggle wiring ─────────────────────────────────────────────────── */

document.querySelectorAll('.layer-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.layer;
    const isActive = layerVisible[key];

    layerVisible[key] = !isActive;
    btn.classList.toggle('active', !isActive);

    const group = leafletLayers[key];
    if (!group) return;

    if (!isActive) group.addTo(map);
    else map.removeLayer(group);
  });
});

/* ── Bootstrap ───────────────────────────────────────────────────── */

(async function init() {
  const keys = Object.keys(LAYER_CONFIG);
  const total = keys.length;
  let doneCount = 0;
  let loaded = 0;
  let failed = 0;
  let totalFeatures = 0;

  setStatus(`Lagen laden… 0 / ${total}`, 'loading');

  const results = await Promise.allSettled(
    keys.map(async (k) => {
      const count = await loadLayer(k);
      doneCount++;
      setStatus(`Lagen laden… ${doneCount} / ${total}`, 'loading');
      return count;
    })
  );

  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value !== null) {
      loaded++;
      totalFeatures += r.value;
    } else {
      failed++;
      console.warn(`Laag "${keys[i]}" kon niet worden geladen.`);
    }
  });

  if (failed === keys.length) setStatus('Fout: FeatureServer niet bereikbaar.', 'error');
  else if (failed > 0) setStatus(`${loaded} lagen geladen (${totalFeatures} gebieden), ${failed} mislukt.`, 'error');
  else setStatus(`${totalFeatures} gebieden geladen.`, 'ok');
})();
