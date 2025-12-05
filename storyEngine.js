// storyEngine.js
import fs from "fs-extra";
import path from "path";

const PUBLIC_DIR = path.join("stories", "public");
const PRIVATE_DIR = path.join("stories", "private");
const SAVES_DIR = "saves";
const CODES_FILE = "codes.json";

function readJSON(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readJsonSync(file);
}

export function getPublicStories() {
  if (!fs.existsSync(PUBLIC_DIR)) return [];
  return fs
    .readdirSync(PUBLIC_DIR)
    .filter((d) => fs.existsSync(path.join(PUBLIC_DIR, d, "config.json")));
}

export function loadStoryConfig(storyId, visibility = "public") {
  const base = visibility === "public" ? PUBLIC_DIR : PRIVATE_DIR;
  const configPath = path.join(base, storyId, "config.json");
  return readJSON(configPath);
}

export function loadStoryByCode(code) {
  const codes = readJSON(CODES_FILE) || {};
  const entry = codes[code];
  if (!entry) return null;
  const { storyId } = entry;
  const cfg = loadStoryConfig(storyId, "private");
  return { config: cfg, storyId };
}

export function saveCodes(codes) {
  fs.writeJsonSync(CODES_FILE, codes, { spaces: 2 });
}

export function getCodes() {
  return readJSON(CODES_FILE) || {};
}

// ---------- sauvegardes joueur ----------
export function loadSave(userId, storyId) {
  const filePath = path.join(SAVES_DIR, userId, `${storyId}.json`);
  return readJSON(filePath);
}

export function saveProgress(userId, storyId, state) {
  const dir = path.join(SAVES_DIR, userId);
  fs.ensureDirSync(dir);
  const filePath = path.join(dir, `${storyId}.json`);
  fs.writeJsonSync(filePath, state, { spaces: 2 });
}

// ---------- tags & conditions ----------

function applyTags(text, state) {
  if (!text) return "";

  // {STAT:name|default}
  text = text.replace(/\{STAT:([a-zA-Z0-9_]+)\|?([0-9]*)\}/g, (_, statName, def) => {
    const v = state.stats?.[statName];
    return v != null ? v : def || "0";
  });

  // {ITEM:add:Name}
  text = text.replace(/\{ITEM:add:([^}]+)\}/g, (_, itemName) => {
    state.inventory = state.inventory || [];
    if (!state.inventory.includes(itemName)) state.inventory.push(itemName);
    return "";
  });

  // {END:type}
  text = text.replace(/\{END:([^}]+)\}/g, (_, endType) => {
    state.ending = endType;
    return "";
  });

  return text;
}

function isChoiceAvailable(choice, state) {
  if (!choice.require) return true;
  const req = choice.require;

  // items nécessaires
  if (req.items && req.items.length) {
    for (const item of req.items) {
      if (!state.inventory || !state.inventory.includes(item)) return false;
    }
  }

  // stats minimum
  if (req.stats) {
    for (const [name, min] of Object.entries(req.stats)) {
      const cur = state.stats?.[name] ?? 0;
      if (cur < min) return false;
    }
  }

  return true;
}

// ---------- logique principale ----------

export function startStory(config, userId) {
  const initialState = {
    userId,
    storyId: config.id,
    currentScene: config.start,
    stats: { ...(config.stats?.values || {}) },
    inventory: [...(config.inventory?.items || [])],
    history: [],
    ending: null,
  };

  const scene = config.scenes[initialState.currentScene];
  const text = applyTags(scene.text, initialState);
  const choices = (scene.choices || []).filter((c) =>
    isChoiceAvailable(c, initialState)
  );

  return { state: initialState, scene, text, choices };
}

export function applyChoice(config, state, choiceIndex) {
  const currentScene = config.scenes[state.currentScene];
  const visibleChoices = (currentScene.choices || []).filter((c) =>
    isChoiceAvailable(c, state)
  );
  const choice = visibleChoices[choiceIndex];
  if (!choice) throw new Error("Choix invalide.");

  state.history.push({
    scene: state.currentScene,
    choice: choice.text,
  });

  state.currentScene = choice.next;

  const nextScene = config.scenes[state.currentScene];
  if (!nextScene) throw new Error(`Scène "${state.currentScene}" introuvable.`);

  const text = applyTags(nextScene.text, state);
  const choices = (nextScene.choices || []).filter((c) =>
    isChoiceAvailable(c, state)
  );

  return { state, scene: nextScene, text, choices };
}
