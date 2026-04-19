const socket = io();

const statusMessage = document.getElementById("status-message");
const welcomeCard = document.getElementById("welcome-card");
const welcomeContinueButton = document.getElementById("welcome-continue-button");
const nameCard = document.getElementById("name-card");
const nameForm = document.getElementById("name-form");
const nameInput = document.getElementById("name-input");
const mapPanel = document.getElementById("map-panel");
const mapPanelToggleButton = document.getElementById("map-panel-toggle");
const mapPanelReopenButton = document.getElementById("map-panel-reopen");
const mapHint = document.getElementById("map-hint");
const activeUsersValue = document.getElementById("active-users-value");
const travelModeSelector = document.getElementById("travel-mode-selector");
const routeSummary = document.getElementById("route-summary");
const routeSummaryTitle = document.getElementById("route-summary-title");
const routeSummaryMeta = document.getElementById("route-summary-meta");
const clearRouteButton = document.getElementById("clear-route-button");

const INITIAL_LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 5000,
};

const LIVE_LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0,
};

const TRAVEL_MODES = {
  car: {
    label: "Car",
    routeBaseUrl: "https://routing.openstreetmap.de/routed-car/route/v1/driving",
    routeColor: "#0f172a",
    icon: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 16l1.6-5.2A2 2 0 0 1 8.5 9h7a2 2 0 0 1 1.9 1.8L19 16" />
        <path d="M4 16h16v3a1 1 0 0 1-1 1h-1.5a1.5 1.5 0 0 1-1.5-1.5V18h-8v.5A1.5 1.5 0 0 1 6.5 20H5a1 1 0 0 1-1-1z" />
        <circle cx="7.5" cy="16.5" r="1.5" />
        <circle cx="16.5" cy="16.5" r="1.5" />
      </svg>
    `,
  },
  bike: {
    label: "Bike",
    routeBaseUrl: "https://routing.openstreetmap.de/routed-bike/route/v1/driving",
    routeColor: "#0f766e",
    icon: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="6" cy="17" r="3.5" />
        <circle cx="18" cy="17" r="3.5" />
        <path d="M10 17l2.5-6h3.5" />
        <path d="M9 8h3l2 3" />
        <path d="M8.5 10.5L6 17" />
        <path d="M12.5 11L18 17" />
      </svg>
    `,
  },
  walk: {
    label: "Walk",
    routeBaseUrl: "https://routing.openstreetmap.de/routed-foot/route/v1/driving",
    routeColor: "#2563eb",
    icon: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="13" cy="5" r="2" />
        <path d="M12 8l-2 4 2.5 2" />
        <path d="M10 12l-3 2" />
        <path d="M12.5 14l-1 5" />
        <path d="M12.5 14l4 4" />
        <path d="M12 8l4 2" />
      </svg>
    `,
  },
};

const DEFAULT_CENTER = [20.5937, 78.9629];
const NAME_STORAGE_KEY = "leafleat-display-name";
const MAP_PANEL_HIDDEN_KEY = "leafleat-map-panel-hidden";
const WELCOME_SEEN_KEY = "leafleat-welcome-seen";
const LOCATION_BROADCAST_INTERVAL_MS = 10000;
const MARKER_ANIMATION_DURATION_MS = 8200;
const MAP_PADDING = [80, 80];
const INNER_VIEWPORT_PADDING_RATIO = -0.18;
const markers = {};
const userLocations = {};

let currentUserName = "";
let currentUserId = null;
let watchId = null;
let currentTravelMode = "car";
let selectedRouteUserId = null;
let activeRouteLayer = null;
let activeRouteRequest = null;
let routeRefreshTimeout = null;
let queuedLocationBroadcastTimeout = null;
let pendingBroadcastPosition = null;
let lastLocationBroadcastAt = 0;

const map = L.map("map", {
  attributionControl: false,
  zoomControl: false,
}).setView(DEFAULT_CENTER, 5);

L.control.zoom({ position: "topright" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; ShivangStreetMap",
  maxZoom: 19,
}).addTo(map);

nameInput.value = localStorage.getItem(NAME_STORAGE_KEY) || "";
const shouldAutoResumeSharing = initializeEntryFlow();
setMapPanelCollapsed(localStorage.getItem(MAP_PANEL_HIDDEN_KEY) === "true");
updateHint();
updateActiveUsers();
renderTravelModes();
updateRouteSummary();

if (shouldAutoResumeSharing) {
  startLocationSharing();
}

function initializeEntryFlow() {
  const hasSeenWelcome = localStorage.getItem(WELCOME_SEEN_KEY) === "true";
  const storedName = sanitizeName(localStorage.getItem(NAME_STORAGE_KEY) || "");

  if (!hasSeenWelcome) {
    welcomeCard.hidden = false;
    nameCard.hidden = true;
    return false;
  }

  if (storedName) {
    currentUserName = storedName;
    nameInput.value = storedName;
    welcomeCard.hidden = true;
    nameCard.hidden = true;
    return true;
  }

  welcomeCard.hidden = true;
  nameCard.hidden = false;
  nameInput.focus();
  return false;
}

function showNameCard() {
  welcomeCard.hidden = true;
  nameCard.hidden = false;
  nameInput.focus();
}

function setMapPanelCollapsed(isCollapsed) {
  mapPanel.classList.toggle("map-panel--collapsed", isCollapsed);
  mapPanelToggleButton.textContent = isCollapsed ? "Show" : "Hide";
  mapPanelToggleButton.setAttribute("aria-expanded", String(!isCollapsed));
  mapPanelReopenButton.hidden = !isCollapsed;
  localStorage.setItem(MAP_PANEL_HIDDEN_KEY, String(isCollapsed));
}

function toggleMapPanel() {
  setMapPanelCollapsed(!mapPanel.classList.contains("map-panel--collapsed"));
}

function broadcastLocation(position) {
  const { latitude, longitude, accuracy } = position.coords;

  lastLocationBroadcastAt = Date.now();
  pendingBroadcastPosition = null;
  hideStatus();
  socket.emit("send-location", {
    name: currentUserName,
    latitude,
    longitude,
    accuracy,
  });
}

function flushQueuedLocationBroadcast() {
  queuedLocationBroadcastTimeout = null;

  if (!pendingBroadcastPosition) {
    return;
  }

  broadcastLocation(pendingBroadcastPosition);
}

function scheduleLocationBroadcast(position) {
  pendingBroadcastPosition = position;

  const millisecondsSinceLastBroadcast = Date.now() - lastLocationBroadcastAt;

  if (!lastLocationBroadcastAt || millisecondsSinceLastBroadcast >= LOCATION_BROADCAST_INTERVAL_MS) {
    if (queuedLocationBroadcastTimeout) {
      clearTimeout(queuedLocationBroadcastTimeout);
      queuedLocationBroadcastTimeout = null;
    }

    broadcastLocation(position);
    return;
  }

  if (queuedLocationBroadcastTimeout) {
    return;
  }

  queuedLocationBroadcastTimeout = window.setTimeout(
    flushQueuedLocationBroadcast,
    LOCATION_BROADCAST_INTERVAL_MS - millisecondsSinceLastBroadcast
  );
}

function showStatus(message) {
  statusMessage.textContent = message;
  statusMessage.hidden = false;
}

function hideStatus() {
  statusMessage.hidden = true;
  statusMessage.textContent = "";
}

function sanitizeName(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 24);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getGeolocationErrorMessage(error) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location access was denied. Allow location permission on this device to show your live marker.";
    case error.POSITION_UNAVAILABLE:
      return "Your location is unavailable right now. Try turning on GPS or moving to an area with better signal.";
    case error.TIMEOUT:
      return "Fetching location timed out. Try again after checking GPS and network access.";
    default:
      return "Unable to fetch this device's location right now.";
  }
}

function getMarkerColor(id) {
  const palette = [
    "#0f766e",
    "#2563eb",
    "#7c3aed",
    "#db2777",
    "#ea580c",
    "#0891b2",
    "#65a30d",
    "#c2410c",
  ];

  const hash = Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return "Distance unavailable";
  }

  if (meters < 100) {
    return `${Math.round(meters)} m`;
  }

  if (meters < 1000) {
    return `${meters.toFixed(0)} m`;
  }

  if (meters < 10000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "ETA unavailable";
  }

  if (seconds < 3600) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return `${minutes} min`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours} hr ${minutes} min`;
}

function getDistanceBetweenUsers(fromUser, toUser) {
  if (!fromUser || !toUser) {
    return null;
  }

  const earthRadiusMeters = 6371008.8;
  const toRadians = (value) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(toUser.latitude - fromUser.latitude);
  const longitudeDelta = toRadians(toUser.longitude - fromUser.longitude);
  const fromLatitude = toRadians(fromUser.latitude);
  const toLatitude = toRadians(toUser.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getRelativeDistanceLabel(fromUser, toUser) {
  const distance = getDistanceBetweenUsers(fromUser, toUser);

  if (!Number.isFinite(distance)) {
    return "Waiting for your location";
  }

  return `${formatDistance(distance)} away`;
}

function getSelectedModeConfig() {
  return TRAVEL_MODES[currentTravelMode];
}

function hasMarkerTargetChanged(marker, nextLatLng) {
  const currentTarget = marker.__targetLatLng;

  if (!Array.isArray(currentTarget)) {
    return true;
  }

  return currentTarget[0] !== nextLatLng[0] || currentTarget[1] !== nextLatLng[1];
}

function getOtherUsers() {
  return Object.values(userLocations)
    .filter((user) => user.id !== currentUserId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function createMarkerIcon(user) {
  const isSelf = user.id === currentUserId;
  const color = getMarkerColor(user.id);
  const distanceText = isSelf
    ? "Your live location"
    : getRelativeDistanceLabel(userLocations[currentUserId], user);
  const safeName = escapeHtml(isSelf ? `${user.name} (You)` : user.name);

  return L.divIcon({
    className: "",
    html: `
      <div class="user-marker ${isSelf ? "user-marker--self" : ""}">
        <span class="user-marker__label">
          <strong class="user-marker__name">${safeName}</strong>
          <span class="user-marker__distance">${escapeHtml(distanceText)}</span>
        </span>
        <span class="user-marker__pin" style="--marker-color: ${color};"></span>
      </div>
    `,
    iconSize: [150, 64],
    iconAnchor: [75, 56],
  });
}

function getMarkerLatLng(marker) {
  const latLng = marker.getLatLng();
  return [latLng.lat, latLng.lng];
}

function updateMarkerVisuals(marker, user) {
  const markerElement = marker.getElement();

  if (!markerElement) {
    marker.setIcon(createMarkerIcon(user));
    return;
  }

  const isSelf = user.id === currentUserId;
  const color = getMarkerColor(user.id);
  const safeName = isSelf ? `${user.name} (You)` : user.name;
  const distanceText = isSelf
    ? "Your live location"
    : getRelativeDistanceLabel(userLocations[currentUserId], user);
  const markerCard = markerElement.querySelector(".user-marker");
  const nameNode = markerElement.querySelector(".user-marker__name");
  const distanceNode = markerElement.querySelector(".user-marker__distance");
  const pinNode = markerElement.querySelector(".user-marker__pin");

  if (!markerCard || !nameNode || !distanceNode || !pinNode) {
    marker.setIcon(createMarkerIcon(user));
    return;
  }

  markerCard.classList.toggle("user-marker--self", isSelf);
  nameNode.textContent = safeName;
  distanceNode.textContent = distanceText;
  pinNode.style.setProperty("--marker-color", color);
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - ((-2 * progress + 2) ** 3) / 2;
}

function animateMarkerTo(marker, targetLatLng, durationMs = MARKER_ANIMATION_DURATION_MS) {
  if (marker.__animationFrameId) {
    cancelAnimationFrame(marker.__animationFrameId);
    marker.__animationFrameId = null;
  }

  const startLatLng = getMarkerLatLng(marker);
  const travelDistance = getDistanceBetweenUsers(
    { latitude: startLatLng[0], longitude: startLatLng[1] },
    { latitude: targetLatLng[0], longitude: targetLatLng[1] }
  );

  if (!Number.isFinite(travelDistance) || travelDistance < 1) {
    marker.setLatLng(targetLatLng);
    marker.__targetLatLng = targetLatLng;
    return;
  }

  const animationDuration = Math.min(
    LOCATION_BROADCAST_INTERVAL_MS - 700,
    Math.max(1800, durationMs + Math.min(travelDistance * 0.12, 450))
  );
  const animationStart = performance.now();

  marker.__targetLatLng = targetLatLng;

  function step(animationNow) {
    const progress = Math.min((animationNow - animationStart) / animationDuration, 1);
    const easedProgress = easeInOutCubic(progress);
    const nextLatLng = [
      startLatLng[0] + (targetLatLng[0] - startLatLng[0]) * easedProgress,
      startLatLng[1] + (targetLatLng[1] - startLatLng[1]) * easedProgress,
    ];

    marker.setLatLng(nextLatLng);

    if (progress < 1) {
      marker.__animationFrameId = requestAnimationFrame(step);
      return;
    }

    marker.__animationFrameId = null;
    marker.setLatLng(targetLatLng);
  }

  marker.__animationFrameId = requestAnimationFrame(step);
}

function shouldIgnoreLocationJitter(previousUser, nextUser) {
  if (!previousUser) {
    return false;
  }

  const movementDistance = getDistanceBetweenUsers(previousUser, nextUser);
  const accuracyAllowance = Math.max(
    10,
    Math.min(
      55,
      ((previousUser.accuracy || 0) + (nextUser.accuracy || 0)) / 2 + 8
    )
  );

  return Number.isFinite(movementDistance) && movementDistance <= accuracyAllowance;
}

function updateMarker(user, options = {}) {
  const latLng = [user.latitude, user.longitude];
  const shouldAnimate = options.animate !== false;

  if (!markers[user.id]) {
    markers[user.id] = L.marker(latLng, {
      icon: createMarkerIcon(user),
      keyboard: false,
      riseOnHover: true,
    })
      .on("click", () => {
        if (user.id !== currentUserId) {
          selectRouteUser(user.id);
        }
      })
      .addTo(map);
    markers[user.id].__targetLatLng = latLng;
    return;
  }

  updateMarkerVisuals(markers[user.id], user);

  if (!hasMarkerTargetChanged(markers[user.id], latLng)) {
    return;
  }

  if (!shouldAnimate) {
    markers[user.id].setLatLng(latLng);
    markers[user.id].__targetLatLng = latLng;
    return;
  }

  animateMarkerTo(markers[user.id], latLng);
}

function updateMarkerDistances(options = {}) {
  const movedUserId = options.movedUserId || null;

  Object.values(userLocations).forEach((user) => {
    updateMarker(user, {
      animate: options.animate !== false && (!movedUserId || user.id === movedUserId),
    });
  });
}

function clearRouteLine() {
  if (activeRouteLayer) {
    map.removeLayer(activeRouteLayer);
    activeRouteLayer = null;
  }
}

function isBoundsComfortablyVisible(bounds) {
  if (!bounds || !map.getBounds().isValid()) {
    return false;
  }

  const paddedView = map.getBounds().pad(-0.12);
  return paddedView.contains(bounds.getSouthWest()) && paddedView.contains(bounds.getNorthEast());
}

function focusRouteIntoView(force = false) {
  if (!activeRouteLayer) {
    return;
  }

  const routeBounds = activeRouteLayer.getBounds();

  if (!routeBounds.isValid()) {
    return;
  }

  if (!force && isBoundsComfortablyVisible(routeBounds)) {
    return;
  }

  map.flyToBounds(routeBounds, {
    padding: [92, 92],
    duration: 0.95,
  });
}

function updateMapView(reason = "location") {
  if (activeRouteLayer) {
    if (reason === "route") {
      focusRouteIntoView(true);
    } else if (reason === "membership" || reason === "clear-route") {
      focusRouteIntoView();
    }
    return;
  }

  const markerList = Object.values(markers);

  if (markerList.length === 0) {
    map.setView(DEFAULT_CENTER, 5);
    return;
  }

  if (markerList.length === 1) {
    const onlyMarkerLocation = markerList[0].getLatLng();

    if (reason === "membership") {
      map.flyTo(onlyMarkerLocation, 15, { duration: 1.1 });
      return;
    }

    const visibleArea = map.getBounds().pad(-0.45);

    if (!visibleArea.contains(onlyMarkerLocation)) {
      map.panTo(onlyMarkerLocation, { animate: true, duration: 1.1 });
    }

    return;
  }

  const bounds = L.latLngBounds(markerList.map((marker) => marker.getLatLng()));
  const currentView = map.getBounds();
  const innerView = currentView.pad(INNER_VIEWPORT_PADDING_RATIO);
  const everyoneComfortablyVisible = markerList.every((marker) => innerView.contains(marker.getLatLng()));

  if (reason === "location" && everyoneComfortablyVisible) {
    return;
  }

  map.flyToBounds(bounds, {
    padding: MAP_PADDING,
    duration: 1.1,
  });
}

function updateActiveUsers() {
  const totalUsers = Object.keys(userLocations).length;
  activeUsersValue.textContent = totalUsers.toString().padStart(2, "0");
}

function renderTravelModes() {
  travelModeSelector.innerHTML = Object.entries(TRAVEL_MODES)
    .map(([mode, config]) => `
      <button
        type="button"
        class="travel-mode ${mode === currentTravelMode ? "travel-mode--active" : ""}"
        data-travel-mode="${escapeHtml(mode)}"
        aria-label="${escapeHtml(config.label)}"
        title="${escapeHtml(config.label)}"
      >
        <span class="travel-mode__icon" aria-hidden="true">${config.icon}</span>
        <span class="sr-only">${escapeHtml(config.label)}</span>
      </button>
    `)
    .join("");
}

function updateHint() {
  const selectedMode = getSelectedModeConfig();

  if (!currentUserName) {
    mapHint.textContent = "Join with your real name to see color-coded live markers, distances, and route options.";
    return;
  }

  const othersCount = getOtherUsers().length;

  if (othersCount === 0) {
    mapHint.textContent = "Waiting for other people to join. When someone appears, you can tap their marker to show a route.";
    return;
  }

  if (selectedRouteUserId && userLocations[selectedRouteUserId]) {
    mapHint.textContent = `Showing the live ${selectedMode.label.toLowerCase()} route from your marker to ${userLocations[selectedRouteUserId].name}.`;
    return;
  }

  mapHint.textContent = `Tap a teammate marker to draw the best live ${selectedMode.label.toLowerCase()} route.`;
}

function buildRoadSummary(route) {
  return `${formatDistance(route.distance)} | ${formatDuration(route.duration)}`;
}

function updateRouteSummary(route = null) {
  const selectedMode = getSelectedModeConfig();

  if (!selectedRouteUserId || !userLocations[selectedRouteUserId]) {
    routeSummary.hidden = false;
    routeSummaryTitle.textContent = "No route selected";
    routeSummaryMeta.textContent = "Tap a teammate marker on the map to start routing.";
    clearRouteButton.hidden = true;
    return;
  }

  routeSummary.hidden = false;
  clearRouteButton.hidden = false;

  if (!route) {
    routeSummaryTitle.textContent = `Routing to ${userLocations[selectedRouteUserId].name.toUpperCase()} by ${selectedMode.label.toLowerCase()}`;
    routeSummaryMeta.textContent = "Calculating the best route...";
    return;
  }

  routeSummaryTitle.textContent = `Best ${selectedMode.label.toLowerCase()} route to ${userLocations[selectedRouteUserId].name.toUpperCase()}`;
  routeSummaryMeta.textContent = buildRoadSummary(route);
}

function buildRoadRouteUrl(fromUser, toUser, modeConfig) {
  const coordinates = [
    `${fromUser.longitude},${fromUser.latitude}`,
    `${toUser.longitude},${toUser.latitude}`,
  ].join(";");

  return `${modeConfig.routeBaseUrl}/${coordinates}?overview=full&geometries=geojson`;
}

async function fetchRoadRoute(fromUser, toUser, modeConfig, signal) {
  const response = await fetch(buildRoadRouteUrl(fromUser, toUser, modeConfig), { signal });

  if (!response.ok) {
    throw new Error(`Routing service returned ${response.status}.`);
  }

  const payload = await response.json();

  if (payload.code !== "Ok" || !payload.routes || payload.routes.length === 0) {
    throw new Error(payload.code || "No road route was returned.");
  }

  const [route] = payload.routes;

  return {
    distance: route.distance,
    duration: route.duration,
    path: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]),
  };
}

function drawRoute(route, modeConfig) {
  if (!activeRouteLayer) {
    activeRouteLayer = L.polyline(route.path, {
      color: modeConfig.routeColor,
      weight: 6,
      opacity: 0.85,
      lineJoin: "round",
    }).addTo(map);
    return;
  }

  activeRouteLayer.setStyle({
    color: modeConfig.routeColor,
    weight: 6,
    opacity: 0.85,
    lineJoin: "round",
  });
  activeRouteLayer.setLatLngs(route.path);
}

async function fetchSelectedRoute(targetId, options = {}) {
  const shouldFocusMap = options.focusMap === true;
  const fromUser = userLocations[currentUserId];
  const toUser = userLocations[targetId];
  const modeConfig = getSelectedModeConfig();

  if (!toUser) {
    clearRouteLine();
    updateMapView("location");
    return;
  }

  if (!fromUser) {
    clearRouteLine();
    updateRouteSummary();
    routeSummaryTitle.textContent = "Waiting for your location";
    routeSummaryMeta.textContent = "Your marker needs one live position before a route can be calculated.";
    updateMapView("location");
    return;
  }

  if (activeRouteRequest) {
    activeRouteRequest.abort();
  }

  const controller = new AbortController();
  activeRouteRequest = controller;
  updateRouteSummary();

  try {
    const route = await fetchRoadRoute(fromUser, toUser, modeConfig, controller.signal);

    if (controller.signal.aborted) {
      return;
    }

    if (!Array.isArray(route.path) || route.path.length === 0) {
      throw new Error("The selected route did not include map geometry.");
    }

    drawRoute(route, modeConfig);
    updateRouteSummary(route);

    if (shouldFocusMap) {
      updateMapView("route");
    } else {
      focusRouteIntoView(false);
    }
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.error(error);
    clearRouteLine();
    updateRouteSummary();
    routeSummaryTitle.textContent = `${modeConfig.label} route unavailable`;
    routeSummaryMeta.textContent = error.message || "Unable to build a route right now. Try again in a moment.";
  } finally {
    if (activeRouteRequest === controller) {
      activeRouteRequest = null;
    }
  }
}

function scheduleRouteRefresh() {
  if (!selectedRouteUserId) {
    return;
  }

  if (routeRefreshTimeout) {
    clearTimeout(routeRefreshTimeout);
  }

  routeRefreshTimeout = window.setTimeout(() => {
    fetchSelectedRoute(selectedRouteUserId, { focusMap: false });
  }, 300);
}

function selectRouteUser(userId) {
  if (!userLocations[userId] || userId === currentUserId) {
    return;
  }

  selectedRouteUserId = userId;
  updateRouteSummary();
  updateHint();
  fetchSelectedRoute(userId, { focusMap: true });
}

function clearSelectedRoute() {
  selectedRouteUserId = null;

  if (activeRouteRequest) {
    activeRouteRequest.abort();
    activeRouteRequest = null;
  }

  if (routeRefreshTimeout) {
    clearTimeout(routeRefreshTimeout);
    routeRefreshTimeout = null;
  }

  clearRouteLine();
  updateRouteSummary();
  updateHint();
  updateMapView("clear-route");
}

function setTravelMode(mode) {
  if (!TRAVEL_MODES[mode] || currentTravelMode === mode) {
    return;
  }

  if (activeRouteRequest) {
    activeRouteRequest.abort();
    activeRouteRequest = null;
  }

  currentTravelMode = mode;
  renderTravelModes();
  clearRouteLine();
  updateRouteSummary();
  updateHint();

  if (selectedRouteUserId) {
    fetchSelectedRoute(selectedRouteUserId, { focusMap: true });
  } else {
    updateMapView("location");
  }
}

function startLocationSharing() {
  if (!navigator.geolocation) {
    showStatus("Geolocation is not supported in this browser, so this device cannot share its location.");
    return;
  }

  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    showStatus("This device is using HTTP, so location may be blocked. Open the app over HTTPS to test live tracking on multiple devices.");
  } else {
    showStatus("Getting your live location...");
  }

  if (queuedLocationBroadcastTimeout) {
    clearTimeout(queuedLocationBroadcastTimeout);
    queuedLocationBroadcastTimeout = null;
  }

  pendingBroadcastPosition = null;
  lastLocationBroadcastAt = 0;

  navigator.geolocation.getCurrentPosition(
    scheduleLocationBroadcast,
    (error) => {
      console.log(error);
      showStatus(getGeolocationErrorMessage(error));
    },
    INITIAL_LOCATION_OPTIONS
  );

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }

  watchId = navigator.geolocation.watchPosition(
    scheduleLocationBroadcast,
    (error) => {
      console.log(error);
      showStatus(getGeolocationErrorMessage(error));
    },
    LIVE_LOCATION_OPTIONS
  );
}

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const sanitizedName = sanitizeName(nameInput.value);

  if (!sanitizedName) {
    showStatus("Enter your real name before sharing your live location.");
    nameInput.focus();
    return;
  }

  currentUserName = sanitizedName;
  nameInput.value = sanitizedName;
  localStorage.setItem(NAME_STORAGE_KEY, sanitizedName);
  nameCard.hidden = true;
  updateHint();
  startLocationSharing();
});

welcomeContinueButton.addEventListener("click", () => {
  localStorage.setItem(WELCOME_SEEN_KEY, "true");
  showNameCard();
});

travelModeSelector.addEventListener("click", (event) => {
  const modeButton = event.target.closest("[data-travel-mode]");

  if (!modeButton) {
    return;
  }

  setTravelMode(modeButton.dataset.travelMode);
});

clearRouteButton.addEventListener("click", () => {
  clearSelectedRoute();
});

mapPanelToggleButton.addEventListener("click", () => {
  toggleMapPanel();
});

mapPanelReopenButton.addEventListener("click", () => {
  setMapPanelCollapsed(false);
});

socket.on("connect", () => {
  currentUserId = socket.id;
  updateHint();
  updateMarkerDistances({ animate: false });
  updateRouteSummary();
});

socket.on("receive-location", (data) => {
  const name = sanitizeName(data.name || "Guest");
  const nextUser = {
    id: data.id,
    name,
    latitude: data.latitude,
    longitude: data.longitude,
    accuracy: typeof data.accuracy === "number" ? data.accuracy : null,
  };
  const previousUser = userLocations[data.id];

  if (shouldIgnoreLocationJitter(previousUser, nextUser)) {
    nextUser.latitude = previousUser.latitude;
    nextUser.longitude = previousUser.longitude;
  }

  userLocations[nextUser.id] = nextUser;
  updateMarkerDistances({ movedUserId: nextUser.id });
  updateActiveUsers();
  updateHint();
  updateMapView(previousUser ? "location" : "membership");
  scheduleRouteRefresh();
});

socket.on("user-disconnected", (id) => {
  if (markers[id]) {
    if (markers[id].__animationFrameId) {
      cancelAnimationFrame(markers[id].__animationFrameId);
    }
    map.removeLayer(markers[id]);
    delete markers[id];
  }

  delete userLocations[id];

  if (selectedRouteUserId === id) {
    clearSelectedRoute();
  }

  updateMarkerDistances();
  updateActiveUsers();
  updateRouteSummary();
  updateHint();
  updateMapView("membership");
});
