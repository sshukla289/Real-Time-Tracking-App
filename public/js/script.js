const socket = io();
const statusMessage = document.getElementById("status-message");

const INITIAL_LOCATION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 60000,
};

const LIVE_LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 10000,
};

function showStatus(message) {
  statusMessage.textContent = message;
  statusMessage.hidden = false;
}

function hideStatus() {
  statusMessage.hidden = true;
  statusMessage.textContent = "";
}

function getGeolocationErrorMessage(error) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location access was denied. Allow location permission on this device to show its marker.";
    case error.POSITION_UNAVAILABLE:
      return "Your location is unavailable right now. Try turning on GPS or moving to an area with better signal.";
    case error.TIMEOUT:
      return "Fetching location timed out. Try again after checking GPS and network access.";
    default:
      return "Unable to fetch this device's location right now.";
  }
}

function emitLocation(position) {
  const { latitude, longitude } = position.coords;
  hideStatus();
  socket.emit("send-location", { latitude, longitude });
}

if (navigator.geolocation) {
  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    showStatus("This device is using HTTP, so location may be blocked. Open the app over HTTPS to test tracking on multiple devices.");
  } else {
    showStatus("Getting your location...");
  }

  navigator.geolocation.getCurrentPosition(
    emitLocation,
    (error) => {
      console.log(error);
      showStatus(getGeolocationErrorMessage(error));
    },
    INITIAL_LOCATION_OPTIONS
  );

  navigator.geolocation.watchPosition(
    emitLocation,
    (error) => {
      console.log(error);
      showStatus(getGeolocationErrorMessage(error));
    },
    LIVE_LOCATION_OPTIONS
  );
} else {
  showStatus("Geolocation is not supported in this browser, so this device cannot share its location.");
}

const map = L.map("map").setView([0, 0], 16);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "ShivangStreetMap",
}).addTo(map);

const markers = {};

function updateMapView() {
  const markerList = Object.values(markers);

  if (markerList.length === 0) {
    return;
  }

  if (markerList.length === 1) {
    map.setView(markerList[0].getLatLng(), 16);
    return;
  }

  const bounds = L.latLngBounds(markerList.map((marker) => marker.getLatLng()));
  map.fitBounds(bounds, { padding: [50, 50] });
}

socket.on("receive-location", (data) => {
  const { id, latitude, longitude } = data;

  if (markers[id]) {
    markers[id].setLatLng([latitude, longitude]);
  } else {
    markers[id] = L.marker([latitude, longitude]).addTo(map);
  }

  updateMapView();
});
 
socket.on("user-disconnected", (id) => {
  if (markers[id]) {
    map.removeLayer(markers[id]);
    delete markers[id];
    updateMapView();
  }
});
