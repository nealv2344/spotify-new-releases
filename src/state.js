// src/state.js
const fs = require('fs');
const path = require('path');

function getStatePath() {
  if (process.env.STATE_PATH) return process.env.STATE_PATH;

  // Azure Functions (Linux): writable location
  if (process.env.WEBSITE_INSTANCE_ID || process.env.WEBSITE_SITE_NAME) {
    const home = process.env.HOME || '/home';
    return path.join(home, 'data', 'state.json');
  }

  // Local: project root
  return path.join(process.cwd(), 'state.json');
}

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function defaultState() {
  return {
    mode: 'bootstrap',
    last_run_at: null,
    bootstrap_days: 30,
    incremental_days: 7,
    buffer_days: 2,
    artists: {}
  };
}

function loadState() {
  const statePath = getStatePath();
  try {
    if (!fs.existsSync(statePath)) return defaultState();
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  const statePath = getStatePath();
  ensureDirExists(statePath);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

// This is what spotify.js expects
function getLookbackDays(state, artistId) {
  if (!state?.last_run_at) return state.bootstrap_days;
  if (!state.artists?.[artistId]) return state.bootstrap_days;
  return state.incremental_days + state.buffer_days;
}

module.exports = { loadState, saveState, getStatePath, getLookbackDays };
