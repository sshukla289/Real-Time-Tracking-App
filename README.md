# Real-Time Tracking App

Real-Time Tracking App is a real-time location tracking web app built with Node.js, Express, Socket.IO, and Leaflet. It shows connected users on a shared map and updates their positions live as their device location changes.

## Tech Stack

- Node.js
- Express.js
- EJS
- Socket.IO
- Leaflet.js
- OpenStreetMap tiles
- HTML, CSS, and vanilla JavaScript

## How It Works

1. The Express server renders the main page and serves static assets from the `public` folder.
2. On the client side, the browser asks the user for geolocation permission.
3. Once permission is granted, the app gets the current location and starts watching for future location updates.
4. The client sends latitude and longitude to the server through Socket.IO using the `send-location` event.
5. The server broadcasts that location to all connected clients using the `receive-location` event.
6. Each client creates or updates a Leaflet marker for that socket ID.
7. When a user disconnects, the server emits `user-disconnected`, and all clients remove that user's marker from the map.

## Features

- Real-time location updates with Socket.IO
- Shared live map using Leaflet
- Automatic marker creation and updates for connected users
- Marker removal when a user disconnects
- Map auto-fit behavior to keep active users visible
- User-facing status messages for geolocation errors
- Faster initial location fetch followed by live tracking updates

## Project Structure

```text
Real-Time-Tracking-App/
|-- app.js
|-- package.json
|-- public/
|   |-- css/
|   |   `-- style.css
|   `-- js/
|       `-- script.js
`-- views/
    `-- index.ejs
```

## Installation

1. Clone the repository:

```bash
git clone <your-repository-url>
cd Real-Time-Tracking-App
```

2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
node app.js
```

4. Open the app in your browser:

```text
http://localhost:3000
```

## Live Demo

This project can be tested through an ngrok HTTPS tunnel while the local server is running.

- Start the app locally with `node app.js`
- Start ngrok with `ngrok http 3000`
- Run `npm run ngrok:url` to print the current HTTPS demo URL
- The public URL usually changes whenever ngrok is restarted

## Testing on Another Device

If you want to test the app on a phone or another laptop on the same network, you can try your local network IP:

```text
http://<your-local-ip>:3000
```

However, many mobile browsers block geolocation on plain HTTP. For reliable multi-device testing, use an HTTPS tunnel such as ngrok.

### ngrok

Start your app first:

```bash
node app.js
```

Then run ngrok against port `3000`:

```bash
ngrok http 3000
```

If ngrok is already running locally, this project also includes helper scripts:

```bash
npm run ngrok:url
npm run ngrok:tunnels
```

## Location Permission and Privacy

- The app cannot access a user's location unless the browser permission is allowed.
- If the user denies permission, the app shows a status message and does not send coordinates.
- After permission is granted, the user's live location is shared with all connected clients in the current session.
- This project does not store location history in a database.
- This project does not include authentication, authorization, or user accounts.

If you plan to publish or deploy this project, make sure users understand that connected clients can see each other's live locations.

## Dependencies

The main runtime dependencies used in this project are:

- `express`
- `ejs`
- `socket.io`

Leaflet is loaded from a CDN in the browser.

## Future Improvements

- Add authentication so only approved users can join a session
- Add rooms or private groups for location sharing
- Persist location history if needed
- Improve the UI for mobile devices
- Add user labels or avatars on markers
- Deploy the app with HTTPS by default
