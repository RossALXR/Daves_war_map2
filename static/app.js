// Basic Leaflet story map:
// - Esri basemap
// - Leaflet default pins (with shadows)
// - Loads `data/stops.json` and shows one stop at a time

let stops = [];
let currentIndex = 0;
let map = null;
let markers = [];
let defaultPinIcon = null;
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
}

function addGeoJsonToMap(geojson, name) {
    if (!map) return;

    const layer = L.geoJSON(geojson, {
        style: () => ({
            color: '#cc2f2f',
            weight: 3,
            opacity: 0.9,
            fillColor: '#cc2f2f',
            fillOpacity: 0.15
        }),
        pointToLayer: (_feature, latlng) =>
            L.circleMarker(latlng, {
                radius: 5,
                color: '#cc2f2f',
                weight: 2,
                fillColor: '#ffffff',
                fillOpacity: 0.9
            }),
        onEachFeature: (feature, featureLayer) => {
            const title =
                (feature && feature.properties && (feature.properties.name || feature.properties.title)) || name;
            if (title) featureLayer.bindPopup(String(title));
        }
    });

    layer.addTo(geojsonLayerGroup);
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

function showStop(index) {
    const stop = stops[index];

    document.getElementById('stop-title').innerText = stop.title || '';
    document.getElementById('stop-caption').innerText = stop.caption || '';
    document.getElementById('stop-description').innerText = stop.text || '';

    const imgEl = document.getElementById('stop-image');
    if (stop.image) {
        imgEl.style.display = '';
        imgEl.src = stop.image;
    } else {
        imgEl.src = '';
        imgEl.style.display = 'none';
    }

    if (map) {
        map.setView(stop.coords, 8, { animate: false });
        if (stop.marker) stop.marker.openPopup();
    }

    updateNav();
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

function init() {
    fetch('data/stops.json')
        .then((r) => r.json())
        .then((data) => {
            stops = Array.isArray(data) ? data : [];
            if (!stops.length) return;

            initMap(stops[0].coords);
            loadGeoJsonOverlays();
            addMarkers();
            showStop(0); // image 1 shows on refresh
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
