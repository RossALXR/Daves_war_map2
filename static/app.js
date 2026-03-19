// Bare-bones Story Map:
// - No external network dependencies (no tile servers)
// - Loads `data/stops.json`
// - Shows 1 marker + story + optional image for the current stop

let stops = [];
let currentIndex = 0;
let map = null;
let markerLayer = null;

function initMap(initialCoords) {
    map = L.map('map', { zoomControl: true }).setView(initialCoords || [30, 31], 6);

    // Local-only "basemap": a plain grid so the page never hangs on remote tiles.
    L.gridLayer({
        attribution: '',
        tileSize: 256,
        createTile: function () {
            const div = document.createElement('div');
            div.style.background = '#efe9dd';
            div.style.border = '1px solid rgba(0,0,0,0.06)';
            return div;
        }
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
}

function updateNav() {
    document.getElementById('prev').disabled = currentIndex <= 0;
    document.getElementById('next').disabled = currentIndex >= stops.length - 1;
}

function showStop(index) {
    const stop = stops[index];
    document.getElementById('stop-title').innerText = stop.title || '';
    document.getElementById('stop-caption').innerText = stop.caption || '';
    document.getElementById('stop-description').innerText = stop.text || '';

    // Optional image: show only if present.
    const imgEl = document.getElementById('stop-image');
    if (stop.image) {
        imgEl.style.display = '';
        imgEl.src = stop.image;
    } else {
        imgEl.src = '';
        imgEl.style.display = 'none';
    }

    // Update marker + view.
    markerLayer.clearLayers();
    const marker = L.circleMarker(stop.coords, {
        radius: 7,
        color: '#222',
        weight: 2,
        fillColor: '#ffcc33',
        fillOpacity: 0.9
    }).addTo(markerLayer);
    marker.bindPopup(`<strong>${stop.title || ''}</strong><br>${stop.subtitle || ''}`);

    map.setView(stop.coords, 8, { animate: false });
    updateNav();
}

// Hide the image if it fails to load (missing file, bad path, etc).
document.getElementById('stop-image').addEventListener('error', (e) => {
    e.target.src = '';
    e.target.style.display = 'none';
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

fetch('data/stops.json')
    .then((response) => response.json())
    .then((data) => {
        stops = Array.isArray(data) ? data : [];
        if (!stops.length) return;
        initMap(stops[0].coords);
        showStop(0); // Stop 1 renders on refresh
    })
    .catch(() => {
        document.getElementById('stop-title').innerText = 'Failed to load stops.json';
    });
