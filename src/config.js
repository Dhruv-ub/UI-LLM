// Dynamically resolve the API base URL based on the current browser hostname.
// When accessed via localhost → http://localhost:5000
// When accessed via LAN IP (e.g. 192.168.0.190) → http://192.168.0.190:5000
// This ensures API calls always reach the correct server from any device on the network.
export const API_BASE = `http://${window.location.hostname}:5000`;
