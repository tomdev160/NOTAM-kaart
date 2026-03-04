/**
 * NOTAM Kaart – app.js
 *
 * Loads Dutch airspace polygons from the LVNL ArcGIS FeatureServer and
 * renders them on an OpenStreetMap base layer using Leaflet.js.
 *
 * Data source:
 *   https://services-eu1.arcgis.com/OtUwzhpKSdeXgRIB/ArcGIS/rest/services/Airspaces_data/FeatureServer
 */

'use strict';

/* ── Constants ──────────────────────────────────────────────────────────── */

const ARCGIS_BASE =
  'https://services-eu1.arcgis.com/OtUwzhpKSdeXgRIB/ArcGIS/rest/services/Airspaces_data/FeatureServer';

/**
 * Layer definitions.
 * Each entry maps a UI key to:
 *   - layerId  : ArcGIS FeatureServer layer index
 *   - where    : SQL WHERE clause to filter features by airspace type
 *   - style    : Leaflet path-style options
 *   - typeClass: CSS class used for popup badge colouring
 *   - label    : human-readable name
 */
const LAYER_CONFIG = {
  prohibited: {
    layerId: 0,
    where: "TYPE='P' OR Airspace_type='P' OR UPPER(name) LIKE '%PROHIBITED%' OR UPPER(type_icao) LIKE '%P%'",
    style: {
      color: '#dc2626',
      fillColor: '#ef4444',
      fillOpacity: 0.30,
      weight: 2,
    },
    typeClass: 'prohibited',
    label: 'Prohibited (P)',
  },
  ctr: {
    layerId: 0,
    where: "TYPE='CTR' OR Airspace_type='CTR' OR UPPER(name) LIKE '%CTR%' OR UPPER(type_icao) LIKE '%CTR%'",
    style: {
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.20,
      weight: 2,
    },
    typeClass: 'ctr',
    label: 'CTR',
  },
  restricted: {
    layerId: 0,
    where: "TYPE='R' OR Airspace_type='R' OR UPPER(name) LIKE '%RESTRICTED%' OR UPPER(type_icao) LIKE '%R%'",
    style: {
      color: '#ca8a04',
      fillColor: '#eab308',
      fillOpacity: 0.25,
      weight: 2,
    },
    typeClass: 'restricted',
    label: 'Restricted (R)',
  },
  tsa: {
    layerId: 0,
    where: "TYPE='TSA' OR Airspace_type='TSA' OR UPPER(name) LIKE '%TSA%' OR UPPER(type_icao) LIKE '%TSA%'",
    style: {
      color: '#9333ea',
      fillColor: '#a855f7',
      fillOpacity: 0.22,
      weight: 2,
    },
    typeClass: 'tsa',
    label: 'TSA',
  },
};

/* Fallback: if the layerId-0 query returns nothing for a specific type we also
   try a broader "fetch everything" query and classify client-side. */
const FALLBACK_WHERE = '1=1';

/* ── Map initialisation ─────────────────────────────────────────────────── */

const map = L.map('map', {
  center: [52.3, 5.3],   // Netherlands
  zoom: 8,
  zoomControl: true,
});

// OSM base layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

/* ── State ──────────────────────────────────────────────────────────────── */

/** Holds the live Leaflet LayerGroup for each key in LAYER_CONFIG. */
const leafletLayers = {};

/** Tracks whether each layer type is currently visible. */
const layerVisible = {
  prohibited: true,
  ctr: true,
  restricted: true,
  tsa: true,
};

/* ── Status helper ──────────────────────────────────────────────────────── */

const statusEl = document.getElementById('status-text');

function setStatus(msg, state = '') {
  statusEl.textContent = msg;
  statusEl.className = state;
}

/* ── ArcGIS query helper ────────────────────────────────────────────────── */

/**
 * Query a single FeatureServer layer and return a GeoJSON FeatureCollection.
 * We request up to 2000 features per call; for very large datasets a
 * pagination loop would be needed, but Dutch airspace data is small.
 */
async function queryLayer(layerId, where) {
  const params = new URLSearchParams({
    where,
    outFields: '*',
    returnGeometry: 'true',
    f: 'geojson',
    resultRecordCount: 2000,
  });

  const url = `${ARCGIS_BASE}/${layerId}/query?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from FeatureServer`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'ArcGIS error');
  return data;
}

/* ── Popup builder ──────────────────────────────────────────────────────── */

function buildPopup(props, typeKey) {
  const cfg = LAYER_CONFIG[typeKey];
  const name = props.Name || props.name || props.NAME ||
               props.Designation || props.designation ||
               props.label || props.LABEL || '(onbekend)';
  const type = props.TYPE || props.type || props.Airspace_type ||
               props.type_icao || cfg.label;
  const lower = props.lower_limit !== undefined
    ? props.lower_limit
    : (props.Lower_limit !== undefined ? props.Lower_limit : '–');
  const upper = props.upper_limit !== undefined
    ? props.upper_limit
    : (props.Upper_limit !== undefined ? props.Upper_limit : '–');
  const activity = props.Activity || props.activity || props.Status || props.status || '–';

  return `
    <div class="popup-title">${escHtml(String(name))}</div>
    <span class="popup-type ${cfg.typeClass}">${escHtml(String(type))}</span>
    <div class="popup-row"><strong>Ondergrens:</strong> ${escHtml(String(lower))}</div>
    <div class="popup-row"><strong>Bovengrens:</strong> ${escHtml(String(upper))}</div>
    <div class="popup-row"><strong>Activiteit:</strong> ${escHtml(String(activity))}</div>
  `.trim();
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Layer loader ───────────────────────────────────────────────────────── */

/**
 * Fetch and render one airspace type.  Stores the resulting LayerGroup in
 * `leafletLayers[key]` so it can be toggled without re-fetching.
 */
async function loadLayer(key) {
  const cfg = LAYER_CONFIG[key];

  try {
    let geojson = await queryLayer(cfg.layerId, cfg.where);

    // If the specific WHERE returned 0 features, try the fallback broad query
    // and classify client-side based on the type field.
    if (!geojson.features || geojson.features.length === 0) {
      geojson = await queryLayer(cfg.layerId, FALLBACK_WHERE);
      const typeUpper = key.toUpperCase();
      geojson.features = (geojson.features || []).filter((f) => {
        const p = f.properties || {};
        const t = (p.TYPE || p.type || p.Airspace_type || p.type_icao || '').toUpperCase();
        if (key === 'prohibited') return t === 'P' || t.includes('PROHIBIT');
        if (key === 'ctr')        return t === 'CTR';
        if (key === 'restricted') return t === 'R' || t.includes('RESTRICT');
        if (key === 'tsa')        return t === 'TSA';
        return false;
      });
    }

    const count = (geojson.features || []).length;

    const group = L.layerGroup();

    L.geoJSON(geojson, {
      style: () => cfg.style,
      onEachFeature: (feature, layer) => {
        const popup = buildPopup(feature.properties || {}, key);
        layer.bindPopup(popup, { maxWidth: 280 });
        layer.on('mouseover', function () { this.openPopup(); });
        layer.on('mouseout',  function () { this.closePopup(); });
      },
    }).addTo(group);

    leafletLayers[key] = group;

    if (layerVisible[key]) {
      group.addTo(map);
    }

    return count;
  } catch (err) {
    console.error(`Fout bij laden laag "${key}":`, err);
    return null;
  }
}

/* ── Toggle button wiring ───────────────────────────────────────────────── */

document.querySelectorAll('.layer-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.layer;
    const isActive = layerVisible[key];

    layerVisible[key] = !isActive;
    btn.classList.toggle('active', !isActive);

    const group = leafletLayers[key];
    if (group) {
      if (!isActive) {
        group.addTo(map);
      } else {
        map.removeLayer(group);
      }
    }
  });
});

/* ── Bootstrap ──────────────────────────────────────────────────────────── */

(async function init() {
  setStatus('Kaartlagen worden geladen…', 'loading');

  const keys = Object.keys(LAYER_CONFIG);
  const results = await Promise.allSettled(keys.map((k) => loadLayer(k)));

  let loaded = 0;
  let failed = 0;
  let totalFeatures = 0;

  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value !== null) {
      loaded++;
      totalFeatures += r.value;
    } else {
      failed++;
      console.warn(`Laag "${keys[i]}" kon niet worden geladen.`);
    }
  });

  if (failed === keys.length) {
    setStatus('Fout: FeatureServer niet bereikbaar.', 'error');
  } else if (failed > 0) {
    setStatus(`${loaded} lagen geladen (${totalFeatures} gebieden), ${failed} mislukt.`, 'error');
  } else {
    setStatus(`${totalFeatures} gebieden geladen.`, 'ok');
  }
})();
