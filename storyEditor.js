// storyEditor.js
import fs from "fs-extra";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getCodes, saveCodes } from "./storyEngine.js";

const PUBLIC_DIR = path.join("stories", "public");
const PRIVATE_DIR = path.join("stories", "private");
const ITEMS_FILE = path.join("items", "items.json");

function readJSON(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readJsonSync(file);
}

export function createStoryFolder(id, title) {
  const dir = path.join(PRIVATE_DIR, id);
  fs.ensureDirSync(dir);
  const configPath = path.join(dir, "config.json");

  const base = {
    id,
    title,
    visibility: "private",
    code: null,
    inventory: { enabled: false, items: [] },
    stats: { enabled: false, values: {} },
    scenes: {
      start: {
        type: "normal",
        text: "Scène de départ vide.",
        choices: [],
      },
    },
  };

  fs.writeJsonSync(configPath, base, { spaces: 2 });
  return configPath;
}

export function addScene(storyId, sceneId) {
  const configPath = path.join(PRIVATE_DIR, storyId, "config.json");
  const cfg = readJSON(configPath);
  if (!cfg) throw new Error("Histoire introuvable.");
  if (!cfg.scenes[sceneId]) {
    cfg.scenes[sceneId] = {
      type: "normal",
      text: "Scène vide.",
      choices: [],
    };
    fs.writeJsonSync(configPath, cfg, { spaces: 2 });
  }
}

export function editSceneText(storyId, sceneId, text) {
  const configPath = path.join(PRIVATE_DIR, storyId, "config.json");
  const cfg = readJSON(configPath);
  if (!cfg) throw new Error("Histoire introuvable.");
  if (!cfg.scenes[sceneId]) {
    cfg.scenes[sceneId] = {
      type: "normal",
      text: "",
      choices: [],
    };
  }
  cfg.scenes[sceneId].text = text;
  fs.writeJsonSync(configPath, cfg, { spaces: 2 });
}

export function addChoice(storyId, sceneId, text, nextId) {
  const configPath = path.join(PRIVATE_DIR, storyId, "config.json");
  const cfg = readJSON(configPath);
  if (!cfg) throw new Error("Histoire introuvable.");
  if (!cfg.scenes[sceneId]) {
    cfg.scenes[sceneId] = {
      type: "normal",
      text: "Scène vide.",
      choices: [],
    };
  }
  cfg.scenes[sceneId].choices.push({ text, next: nextId });
  fs.writeJsonSync(configPath, cfg, { spaces: 2 });
}

export function publishStory(storyId, isPublic) {
  const srcDir = path.join(PRIVATE_DIR, storyId);
  const configPath = path.join(srcDir, "config.json");
  const cfg = readJSON(configPath);
  if (!cfg) throw new Error("Histoire introuvable.");

  let code = null;

  if (isPublic) {
    cfg.visibility = "public";
    cfg.code = null;
    const destDir = path.join(PUBLIC_DIR, storyId);
    fs.ensureDirSync(destDir);
    fs.writeJsonSync(path.join(destDir, "config.json"), cfg, { spaces: 2 });
  } else {
    cfg.visibility = "private";
    code =
      uuidv4().split("-")[0].toUpperCase() +
      "-" +
      uuidv4().split("-")[1].toUpperCase();
    cfg.code = code;
    fs.writeJsonSync(configPath, cfg, { spaces: 2 });

    const codes = getCodes();
    codes[code] = { storyId };
    saveCodes(codes);
  }

  return { cfg, code };
}

// -------- banque d’objets globale --------
export function addGlobalItem(name) {
  const data = readJSON(ITEMS_FILE) || { items: [] };
  if (!data.items.includes(name)) data.items.push(name);
  fs.writeJsonSync(ITEMS_FILE, data, { spaces: 2 });
  return data.items;
}

export function listGlobalItems() {
  const data = readJSON(ITEMS_FILE) || { items: [] };
  return data.items;
}
