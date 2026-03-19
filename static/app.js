// Basic Leaflet story map:
// - Esri basemap
// - Leaflet default pins (with shadows)
// - Loads `data/stops.json` and shows one stop at a time

let stops = [];
let currentIndex = 0;
let map = null;
let markers = [];
let defaultPinIcon = null;
let lastShownIndex = null;
let transitionToken = 0;
let sliderEl = null;
let sliderYearsEl = null;
let sliderDragIndex = null;
let sliderTicksEl = null;
let sliderTickbarEl = null;

// Image modal state
let modalOpen = false;
let modalScale = 1;
let modalTx = 0;
let modalTy = 0;
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartTx = 0;
let dragStartTy = 0;

const modalEl = document.getElementById('image-modal');
const modalViewportEl = document.getElementById('image-modal-viewport');
const modalImgEl = document.getElementById('image-modal-img');
const modalCloseBtn = document.getElementById('image-modal-close');
let geojsonLayerGroup = null;

function buildDefaultPinIcon() {
    // Match Leaflet's standard "blue pin" icon, but serve assets locally.
    return L.icon({
        iconRetinaUrl: 'static/vendor/leaflet/images/marker-icon-2x.png',
        iconUrl: 'static/vendor/leaflet/images/marker-icon.png',
        shadowUrl: 'static/vendor/leaflet/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
}

function initMap(initialCoords) {
    defaultPinIcon = buildDefaultPinIcon();

    map = L.map('map').setView(initialCoords || [30, 31], initialCoords ? 8 : 6);
    geojsonLayerGroup = L.layerGroup().addTo(map);

    L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        {
            attribution:
                'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Source: Esri, DeLorme, NAVTEQ',
            maxZoom: 18
        }
    ).addTo(map);

    ensureTimeSliderDom();
}

function ensureTimeSliderDom() {
    if (sliderEl) return;

    const mapEl = document.getElementById('map');
    const overlay = document.createElement('div');
    overlay.id = 'time-slider-overlay';
    overlay.innerHTML = `
        <input id="time-slider" type="range" min="0" max="0" step="1" value="0" list="time-slider-ticks" />
        <datalist id="time-slider-ticks"></datalist>
        <div id="time-slider-tickbar"></div>
        <div id="time-slider-years"></div>
    `;
    mapEl.appendChild(overlay);

    sliderEl = overlay.querySelector('#time-slider');
    sliderTicksEl = overlay.querySelector('#time-slider-ticks');
    sliderTickbarEl = overlay.querySelector('#time-slider-tickbar');
    sliderYearsEl = overlay.querySelector('#time-slider-years');

    sliderEl.addEventListener('input', () => {
        const idx = parseInt(sliderEl.value, 10) || 0;
        sliderDragIndex = idx;
        currentIndex = idx;
        showStop(idx, { animate: false });
    });

    sliderEl.addEventListener('change', () => {
        const idx = parseInt(sliderEl.value, 10) || 0;
        currentIndex = idx;
        // Slider scrubbing should be snappy: jump without the hop animation.
        showStop(idx, { animate: false });
        sliderDragIndex = null;
    });
}

function parseStopYear(subtitle) {
    if (!subtitle) return null;

    // Prefer 4-digit years if present.
    let m = String(subtitle).match(/(19|20)\\d{2}/);
    if (m) return parseInt(m[0], 10);

    // Fall back to 2-digit years (e.g., "Sep-41", "6-May-41").
    m = String(subtitle).match(/(?:^|[^0-9])(\\d{2})(?:$|[^0-9])/);
    if (!m) return null;

    const yy = parseInt(m[1], 10);
    // Heuristic: 30-99 => 1930-1999, 00-29 => 2000-2029.
    return yy >= 30 ? 1900 + yy : 2000 + yy;
}

function setupTimeSlider() {
    if (!sliderEl || !sliderYearsEl) return;

    sliderEl.min = 0;
    sliderEl.max = Math.max(0, stops.length - 1);
    sliderEl.step = 1;
    sliderEl.value = currentIndex;

    sliderYearsEl.innerHTML = '';
    if (sliderTicksEl) sliderTicksEl.innerHTML = '';
    if (sliderTickbarEl) sliderTickbarEl.innerHTML = '';
    const firstIndexByYear = new Map();
    stops.forEach((s, idx) => {
        const y = parseStopYear(s.subtitle);
        if (y === null) return;
        if (!firstIndexByYear.has(y)) firstIndexByYear.set(y, idx);
    });

    const denom = Math.max(1, stops.length - 1);

    // Step ticks: show every stop when small, otherwise sample to avoid clutter.
    if (sliderTickbarEl) {
        const maxTicks = 120;
        const stepEvery = stops.length <= maxTicks ? 1 : Math.ceil(stops.length / maxTicks);
        for (let idx = 0; idx < stops.length; idx += stepEvery) {
            const tick = document.createElement('div');
            tick.className = 'time-tick step';
            const pct = stops.length <= 1 ? 0 : (idx / denom) * 100;
            tick.style.left = `${pct}%`;
            sliderTickbarEl.appendChild(tick);
        }
        // Always ensure the last stop has a tick.
        if (stops.length > 1 && (stops.length - 1) % stepEvery !== 0) {
            const tick = document.createElement('div');
            tick.className = 'time-tick step';
            tick.style.left = '100%';
            sliderTickbarEl.appendChild(tick);
        }
    }

    Array.from(firstIndexByYear.entries())
        .sort((a, b) => a[0] - b[0])
        .forEach(([year, idx]) => {
            const label = document.createElement('div');
            label.className = 'time-year';
            label.textContent = String(year);
            const pct = stops.length <= 1 ? 0 : (idx / denom) * 100;
            label.style.left = `${pct}%`;
            sliderYearsEl.appendChild(label);

            if (sliderTickbarEl) {
                const tick = document.createElement('div');
                tick.className = 'time-tick year';
                tick.style.left = `${pct}%`;
                sliderTickbarEl.appendChild(tick);
            }

            // Native tick marks (where supported) at the same positions.
            if (sliderTicksEl) {
                const opt = document.createElement('option');
                opt.value = String(idx);
                opt.label = String(year);
                sliderTicksEl.appendChild(opt);
            }
        });
}

function addGeoJsonToMap(geojson, name) {
    if (!map) return;

    const getTitle = (feature) =>
        (feature && feature.properties && (feature.properties.name || feature.properties.title)) || name;

    const isPoint = (f) => {
        const t = f && f.geometry && f.geometry.type;
        return t === 'Point' || t === 'MultiPoint';
    };

    const isLineOrPoly = (f) => !isPoint(f) && f && f.geometry;

    // White "casing" underlay
    const casing = L.geoJSON(geojson, {
        filter: isLineOrPoly,
        style: () => ({
            color: '#ffffff',
            weight: 6,
            opacity: 0.75,
            fillOpacity: 0
        }),
        onEachFeature: (feature, featureLayer) => {
            const title = getTitle(feature);
            if (title) featureLayer.bindPopup(String(title));
        }
    });

    // Black dotted line on top
    const dotted = L.geoJSON(geojson, {
        filter: isLineOrPoly,
        style: () => ({
            color: '#111111',
            weight: 3,
            opacity: 0.9,
            dashArray: '2 8',
            lineCap: 'round',
            fillOpacity: 0
        }),
        onEachFeature: (feature, featureLayer) => {
            const title = getTitle(feature);
            if (title) featureLayer.bindPopup(String(title));
        }
    });

    // Points, if present
    const points = L.geoJSON(geojson, {
        filter: isPoint,
        pointToLayer: (_feature, latlng) =>
            L.circleMarker(latlng, {
                radius: 5,
                color: '#111111',
                weight: 2,
                fillColor: '#ffffff',
                fillOpacity: 0.9
            }),
        onEachFeature: (feature, featureLayer) => {
            const title = getTitle(feature);
            if (title) featureLayer.bindPopup(String(title));
        }
    });

    casing.addTo(geojsonLayerGroup);
    dotted.addTo(geojsonLayerGroup);
    points.addTo(geojsonLayerGroup);
}

function loadGeoJsonOverlays() {
    // GitHub Pages doesn't provide directory listings, so we use a manifest file.
    // Put your GeoJSON files in `data/geojson/` and add filenames to `data/geojson/index.json`.
    return fetch('data/geojson/index.json')
        .then((r) => (r.ok ? r.json() : []))
        .then((files) => {
            if (!Array.isArray(files) || files.length === 0) return;

            files.forEach((file) => {
                if (typeof file !== 'string' || !file) return;
                fetch(`data/geojson/${file}`)
                    .then((r) => r.json())
                    .then((geojson) => addGeoJsonToMap(geojson, file))
                    .catch(() => {});
            });
        })
        .catch(() => {});
}

function updateNav() {
    document.getElementById('prev').disabled = currentIndex <= 0;
    document.getElementById('next').disabled = currentIndex >= stops.length - 1;
}

function showStop(index, opts) {
    const animate = !(opts && opts.animate === false);
    const skipMapMove = !!(opts && opts.skipMapMove);
    const stop = stops[index];

    document.getElementById('stop-title').innerText = stop.title || '';
    document.getElementById('stop-caption').innerText = stop.caption || '';
    document.getElementById('stop-description').innerText = stop.text || '';

    const imgEl = document.getElementById('stop-image');
    if (stop.image) {
        imgEl.style.display = '';
        imgEl.src = stop.image;
        imgEl.title = 'Click to zoom';
    } else {
        imgEl.src = '';
        imgEl.style.display = 'none';
        imgEl.title = '';
    }

    if (map) {
        const onArrive = () => {
            if (stop.marker) stop.marker.openPopup();
        };

        if (skipMapMove) {
            onArrive();
        } else {
            // First render: jump straight to the first stop (image 1 should show on refresh).
            if (lastShownIndex === null || !animate) {
                map.setView(stop.coords, 8, { animate: false });
                onArrive();
            } else {
                animateHopTo(stop.coords, 8, onArrive);
            }
        }
    }

    updateNav();
    lastShownIndex = index;

    if (sliderEl) sliderEl.value = index;
}

function fitOverviewToStops() {
    if (!map || !stops.length) return;
    const bounds = L.latLngBounds(stops.map((s) => s.coords));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 6 });
}

function animateHopTo(latlng, zoomIn, onDone) {
    // Two-phase move: quick zoom-out, then zoom-in to the next point.
    // Uses a token so rapid clicking doesn't stack animations.
    const myToken = ++transitionToken;
    map.stop();

    const currentZoom = map.getZoom();
    const zoomOut = Math.max(3, Math.min(currentZoom, zoomIn) - 2);

    map.flyTo(map.getCenter(), zoomOut, { animate: true, duration: 0.35 });
    map.once('moveend', () => {
        if (transitionToken !== myToken) return;

        map.flyTo(latlng, zoomIn, { animate: true, duration: 0.55 });
        map.once('moveend', () => {
            if (transitionToken !== myToken) return;
            if (typeof onDone === 'function') onDone();
        });
    });
}

function addMarkers() {
    markers = [];

    stops.forEach((stop) => {
        const marker = L.marker(stop.coords, { icon: defaultPinIcon }).addTo(map);
        marker.bindPopup(`<strong>${stop.title || ''}</strong><br>${stop.subtitle || ''}`);
        stop.marker = marker;
        markers.push(marker);
    });
}

function applyModalTransform() {
    modalImgEl.style.transform = `translate(${modalTx}px, ${modalTy}px) scale(${modalScale})`;
}

function fitModalImageToViewport() {
    const vw = modalViewportEl.clientWidth;
    const vh = modalViewportEl.clientHeight;
    const iw = modalImgEl.naturalWidth || 1;
    const ih = modalImgEl.naturalHeight || 1;

    // Fit-to-view (contain)
    modalScale = Math.min(vw / iw, vh / ih);
    modalTx = Math.round((vw - iw * modalScale) / 2);
    modalTy = Math.round((vh - ih * modalScale) / 2);
    applyModalTransform();
}

function openImageModal(src) {
    if (!src) return;

    modalOpen = true;
    modalEl.classList.add('open');
    modalEl.setAttribute('aria-hidden', 'false');

    // Reset state; fit once the image is loaded.
    modalScale = 1;
    modalTx = 0;
    modalTy = 0;
    applyModalTransform();

    modalImgEl.onload = () => fitModalImageToViewport();
    modalImgEl.src = src;
}

function closeImageModal() {
    if (!modalOpen) return;
    modalOpen = false;
    dragging = false;
    modalImgEl.classList.remove('dragging');
    modalEl.classList.remove('open');
    modalEl.setAttribute('aria-hidden', 'true');
    modalImgEl.src = '';
}

function init() {
    fetch('data/stops.json')
        .then((r) => r.json())
        .then((data) => {
            stops = Array.isArray(data) ? data : [];
            if (!stops.length) return;

            initMap(stops[0].coords);
            loadGeoJsonOverlays();
            addMarkers();
            setupTimeSlider();

            // On refresh, start with an overview over the Mediterranean / all points.
            fitOverviewToStops();

            // Still render stop 1 content + popup, without forcing the map to zoom into it.
            showStop(0, { animate: false, skipMapMove: true });
        })
        .catch(() => {
            document.getElementById('stop-title').innerText = 'Failed to load data/stops.json';
        });
}

// Hide the image if it fails to load (missing file, bad path, etc).
document.getElementById('stop-image').addEventListener('error', (e) => {
    e.target.src = '';
    e.target.style.display = 'none';
});

// Click-to-zoom for the stop image
document.getElementById('stop-image').addEventListener('click', (e) => {
    const img = e.currentTarget;
    if (img.style.display === 'none' || !img.src) return;
    openImageModal(img.src);
});

modalCloseBtn.addEventListener('click', closeImageModal);

// Close if you click the dark backdrop (but not when clicking inside the viewport).
modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeImageModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeImageModal();
});

// Wheel zoom within the viewport.
modalViewportEl.addEventListener(
    'wheel',
    (e) => {
        if (!modalOpen) return;
        e.preventDefault();

        const rect = modalViewportEl.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const nextScale = Math.min(8, Math.max(0.2, modalScale * zoomFactor));

        // Zoom around cursor point.
        const dx = cx - modalTx;
        const dy = cy - modalTy;
        const scaleRatio = nextScale / modalScale;

        modalTx = cx - dx * scaleRatio;
        modalTy = cy - dy * scaleRatio;
        modalScale = nextScale;
        applyModalTransform();
    },
    { passive: false }
);

// Drag-to-pan
modalImgEl.addEventListener('mousedown', (e) => {
    if (!modalOpen) return;
    dragging = true;
    modalImgEl.classList.add('dragging');
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartTx = modalTx;
    dragStartTy = modalTy;
});

window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    modalTx = dragStartTx + (e.clientX - dragStartX);
    modalTy = dragStartTy + (e.clientY - dragStartY);
    applyModalTransform();
});

window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    modalImgEl.classList.remove('dragging');
});

// Re-fit image on resize (when modal open)
window.addEventListener('resize', () => {
    if (!modalOpen) return;
    if (!modalImgEl.src) return;
    fitModalImageToViewport();
});

document.getElementById('prev').addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex--;
        showStop(currentIndex);
    }
});

document.getElementById('next').addEventListener('click', () => {
    if (currentIndex < stops.length - 1) {
        currentIndex++;
        showStop(currentIndex);
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
