// JavaScript for the Story Map
let map = L.map('map').setView([30, 31], 6);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Source: Esri, DeLorme, NAVTEQ',
    maxZoom: 18
}).addTo(map);

let stops = [];
let currentIndex = 0;

fetch('data/stops.json')
    .then(response => response.json())
    .then(data => {
        stops = data;
        addMarkers();
        showStop(currentIndex);
    });

function addMarkers() {
    stops.forEach((stop, index) => {
        const marker = L.marker(stop.coords).addTo(map);
        marker.bindPopup(`<strong>${stop.title}</strong><br>${stop.subtitle}`);
        stop.marker = marker;
    });
}

function showStop(index) {
    const stop = stops[index];
    document.getElementById('stop-title').innerText = stop.title;
    document.getElementById('stop-caption').innerText = stop.caption;
    document.getElementById('stop-description').innerText = stop.text;

    const imgEl = document.getElementById('stop-image');
    if (stop.image) {
        imgEl.style.display = '';
        imgEl.src = stop.image;
    } else {
        imgEl.src = '';
        imgEl.style.display = 'none';
    }
    map.setView(stop.coords, 8);
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
