// Basic Leaflet story map:
// - Esri basemap
// - Leaflet default pins (with shadows)
// - Loads `data/stops4apr26.json` and shows one stop at a time

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
let sliderCurrentEl = null;

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
let geojsonRenderer = null;
const STOP_ZOOM = 6;

function buildDefaultPinIcon() {
    // Smaller red pin (SVG), with the standard Leaflet shadow for depth.
    const color = '#c7372f';
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
            <path d="M12 0C7.6 0 4 3.6 4 8c0 6.2 8 28 8 28s8-21.8 8-28c0-4.4-3.6-8-8-8z"
                fill="${color}" stroke="#2b1f14" stroke-width="1" />
            <circle cx="12" cy="8" r="3.6" fill="#f5f0e6" opacity="0.95" />
        </svg>
    `.trim();

    const iconUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

    return L.icon({
        iconUrl,
        shadowUrl: 'static/vendor/leaflet/images/marker-shadow.png',
        iconSize: [18, 30],
        iconAnchor: [9, 30],
        popupAnchor: [1, -24],
        shadowSize: [30, 30],
        shadowAnchor: [9, 30]
    });
}

function initMap(initialCoords) {
    defaultPinIcon = buildDefaultPinIcon();

    map = L.map('map').setView(initialCoords || [30, 31], initialCoords ? 8 : 6);
    geojsonLayerGroup = L.layerGroup().addTo(map);
    geojsonRenderer = L.canvas({ padding: 0.2 });

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

    sliderCurrentEl = document.createElement('div');
    sliderCurrentEl.id = 'time-slider-current';
    sliderCurrentEl.textContent = '';
    overlay.appendChild(sliderCurrentEl);

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

    const yearByIndex = stops.map((s) => parseStopYear(s.subtitle));
    const years = Array.from(new Set(yearByIndex.filter((y) => y !== null))).sort((a, b) => a - b);
    if (!years.length) return;

    const firstIndexByYear = new Map();
    yearByIndex.forEach((y, idx) => {
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

    // Year ticks + labels
    years.forEach((year) => {
        const idx = firstIndexByYear.get(year);
        if (typeof idx !== 'number') return;

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
        renderer: geojsonRenderer,
        interactive: false,
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
        renderer: geojsonRenderer,
        interactive: false,
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
        renderer: geojsonRenderer,
        interactive: false,
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
    if (geojsonLayerGroup && geojsonLayerGroup.getLayers().length) return;
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

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isBattleStop(stop) {
    return !!(stop && typeof stop.activity === 'string' && stop.activity.trim().toUpperCase() === 'BATTLE');
}

function buildStopTitle(stop) {
    const title = stop && stop.title ? String(stop.title) : '';
    return isBattleStop(stop) ? `💥 ${title}` : title;
}

function showStop(index, opts) {
    const animate = !(opts && opts.animate === false);
    const skipMapMove = !!(opts && opts.skipMapMove);
    const stop = stops[index];

    document.getElementById('stop-title').innerText = buildStopTitle(stop);
    document.getElementById('stop-caption').innerText = stop.caption || '';
    document.getElementById('stop-description').innerText = stop.text || '';
    document.getElementById('stop-date').innerText = stop.subtitle || '';

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
        const isLongLeg = lastShownIndex === 1 && index === 2;

        // Open immediately so the popup is visible as we pan toward the marker,
        // except for the long-leg animation where we open after the waypoint.
        if (!isLongLeg && stop.marker) stop.marker.openPopup();

        if (skipMapMove) {
            // Popup is already opened.
        } else {
            // First render: jump straight to the first stop (image 1 should show on refresh).
            if (lastShownIndex === null || !animate) {
                map.setView(stop.coords, STOP_ZOOM, { animate: false });
            } else if (isLongLeg) {
                animateViaWaypoint(stop.coords, SOMALIA_WAYPOINT, STOP_ZOOM, () => {
                    if (!stop.marker) return;
                    // Avoid auto-panning after the animation finishes.
                    const popup = stop.marker.getPopup && stop.marker.getPopup();
                    if (popup) popup.options.autoPan = false;
                    stop.marker.openPopup();
                });
            } else {
                animatePanTo(stop.coords, STOP_ZOOM);
            }
        }
    }

    updateNav();
    lastShownIndex = index;

    if (sliderEl) sliderEl.value = index;
    updateSliderCurrentLabel(index);
}

function updateSliderCurrentLabel(index) {
    if (!sliderEl || !sliderCurrentEl) return;

    const stop = stops[index];
    const label = stop && stop.subtitle ? String(stop.subtitle) : '';

    const denom = Math.max(1, stops.length - 1);
    const pct = stops.length <= 1 ? 0 : (index / denom) * 100;
    sliderCurrentEl.style.left = `${pct}%`;
    sliderCurrentEl.textContent = label;
}

function fitOverviewToStops() {
    if (!map || !stops.length) return;
    const bounds = L.latLngBounds(stops.map((s) => s.coords));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 6 });
}

function animatePanTo(latlng, zoom, opts) {
    // Smooth pan/fly to the next point, keeping a more zoomed-out view.
    // Uses a token so rapid clicking doesn't stack animations.
    const myToken = ++transitionToken;
    map.stop();
    const duration = opts && typeof opts.duration === 'number' ? opts.duration : null;
    const easeLinearity =
        opts && typeof opts.easeLinearity === 'number' ? opts.easeLinearity : null;

    const currentZoom = map.getZoom();
    if (currentZoom === zoom) {
        map.panTo(latlng, {
            animate: true,
            duration: duration || 1.8,
            easeLinearity: easeLinearity || 0.35,
            noMoveStart: true
        });
    } else {
        map.flyTo(latlng, zoom, {
            animate: true,
            duration: duration || 2.2,
            easeLinearity: easeLinearity || 0.35,
            noMoveStart: true
        });
    }
    map.once('moveend', () => {
        if (transitionToken !== myToken) return;
    });
}

const SOMALIA_WAYPOINT = [5.0, 46.0];

function animateViaWaypoint(latlng, waypoint, zoom, onDone) {
    // Special long-leg animation: keep zoom, but pass via a waypoint.
    const myToken = ++transitionToken;
    map.stop();

    map.flyTo(waypoint, zoom, {
        animate: true,
        duration: 2.6,
        easeLinearity: 0.3,
        noMoveStart: true
    });

    map.once('moveend', () => {
        if (transitionToken !== myToken) return;
        map.flyTo(latlng, zoom, {
            animate: true,
            duration: 2.6,
            easeLinearity: 0.3,
            noMoveStart: true
        });

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
        const popupTitle = escapeHtml(buildStopTitle(stop));
        const popupSubtitle = escapeHtml(stop.subtitle || '');
        marker.bindPopup(`<strong>${popupTitle}</strong><br>${popupSubtitle}`);
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
    fetch('data/stops4apr26.json')
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
            document.getElementById('stop-title').innerText =
                'Failed to load data/stops4apr26.json';
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

function shouldIgnoreKeyNav(target) {
    if (!target) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return !!target.isContentEditable;
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeImageModal();
    if (modalOpen) return;
    if (shouldIgnoreKeyNav(e.target)) return;

    if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
            currentIndex--;
            showStop(currentIndex);
        }
        e.preventDefault();
        e.stopPropagation();
    } else if (e.key === 'ArrowRight') {
        if (currentIndex < stops.length - 1) {
            currentIndex++;
            showStop(currentIndex);
        }
        e.preventDefault();
        e.stopPropagation();
    }
}, { capture: true });

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
