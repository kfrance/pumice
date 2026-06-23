import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'pumice');
const PREFERENCES_PATH = path.join(CONFIG_DIR, 'preferences.json');
const SESSIONS_PATH = path.join(CONFIG_DIR, 'sessions.json');

const DEFAULT_PREFERENCES = {
  theme: 'system', // 'light', 'dark', or 'system'
  editorFontSize: 14,
};

const DEFAULT_SESSIONS = {
  recent: [],
  maxRecent: 20,
};

/** Ensure the config directory exists */
async function ensureConfigDir() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

/** Read a JSON file, returning defaultValue if it doesn't exist or is invalid */
async function readJsonFile(filePath, defaultValue) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { ...defaultValue };
  }
}

/** Write a JSON file atomically (write to temp, then rename) */
async function writeJsonFile(filePath, data) {
  await ensureConfigDir();
  const tmpPath = filePath + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpPath, filePath);
}

// ─── Preferences ────────────────────────────────────────────────────────────

export async function loadPreferences() {
  const prefs = await readJsonFile(PREFERENCES_PATH, DEFAULT_PREFERENCES);
  // Merge with defaults to handle missing keys from older config files
  return { ...DEFAULT_PREFERENCES, ...prefs };
}

export async function savePreferences(prefs) {
  await writeJsonFile(PREFERENCES_PATH, prefs);
}

export async function updatePreference(key, value) {
  const prefs = await loadPreferences();
  prefs[key] = value;
  await savePreferences(prefs);
  return prefs;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

let sessionsWriteChain = Promise.resolve();

function enqueueSessionsWrite(task) {
  const run = sessionsWriteChain.then(task);
  sessionsWriteChain = run.catch(() => {});
  return run;
}

export async function loadSessions() {
  const sessions = await readJsonFile(SESSIONS_PATH, DEFAULT_SESSIONS);
  return { ...DEFAULT_SESSIONS, ...sessions };
}

export async function saveSessions(sessions) {
  return enqueueSessionsWrite(async () => {
    await writeJsonFile(SESSIONS_PATH, sessions);
  });
}

/**
 * Find a session matching the given root path.
 * Returns the session object or null.
 */
export async function findSession(rootPath) {
  const sessions = await loadSessions();
  return sessions.recent.find(s => s.root === rootPath) || null;
}

/**
 * Save or update a session for a given root path.
 * Moves it to the front of the recent list.
 */
export async function saveSession(session) {
  return enqueueSessionsWrite(async () => {
    const sessions = await loadSessions();

    sessions.recent = sessions.recent.filter(s => s.root !== session.root);
    sessions.recent.unshift({
      ...session,
      lastOpened: new Date().toISOString(),
    });
    sessions.recent = sessions.recent.slice(0, sessions.maxRecent);

    await writeJsonFile(SESSIONS_PATH, sessions);
  });
}

/**
 * Remove a session for a given root path.
 */
export async function removeSession(rootPath) {
  return enqueueSessionsWrite(async () => {
    const sessions = await loadSessions();
    sessions.recent = sessions.recent.filter(s => s.root !== rootPath);
    await writeJsonFile(SESSIONS_PATH, sessions);
  });
}

export {
  CONFIG_DIR,
  PREFERENCES_PATH,
  SESSIONS_PATH,
  DEFAULT_PREFERENCES,
  DEFAULT_SESSIONS,
};
