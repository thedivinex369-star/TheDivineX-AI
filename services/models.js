import { MODELS } from "../config.js";
import { normalizeCapabilities, DEFAULT_CAPABILITIES } from "./capabilities.js";

const FALLBACK_MODELS = Array.isArray(MODELS) ? MODELS : [];

const CATEGORY_ORDER = Object.freeze([
  "fast",
  "reasoning",
  "coding",
  "vision",
  "long-context",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function providerLabel(provider) {
  const value = clean(provider);
  if (!value) return "Puter";

  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function modelText(model) {
  return [
    model?.id,
    model?.name,
    model?.description,
    model?.provider,
    ...(Array.isArray(model?.aliases) ? model.aliases : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function detectCategories(model) {
  const text = modelText(model);
  const categories = new Set();

  const context =
    Number(model?.context) ||
    Number(model?.context_window) ||
    Number(model?.contextLength) ||
    0;

  if (/reason|thinking|o1|o3|o4|r1|r2|reasoning/.test(text)) {
    categories.add("reasoning");
  }

  if (/code|coder|coding|dev|developer|program/.test(text)) {
    categories.add("coding");
  }

  if (
    /vision|vl|visual|multimodal|image|omni/.test(text) ||
    model?.vision === true ||
    model?.supports_vision === true
  ) {
    categories.add("vision");
  }

  if (context >= 100000) {
    categories.add("long-context");
  }

  if (/mini|nano|flash|haiku|small|lite|fast|speed/.test(text)) {
    categories.add("fast");
  }

  if (!categories.size) {
    categories.add("fast");
  }

  return CATEGORY_ORDER.filter(category => categories.has(category));
}

function normalizeModel(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = clean(raw.id);
  if (!id) return null;

  const provider = clean(raw.provider) || "puter";

  const name =
    clean(raw.name) ||
    clean(raw.display_name) ||
    id;

  const context =
    Number(raw.context) ||
    Number(raw.context_window) ||
    Number(raw.contextLength) ||
    0;

  const maxTokens =
    Number(raw.max_tokens) ||
    Number(raw.maxTokens) ||
    0;

  const categories = detectCategories(raw);

  const inputModalities = Array.isArray(raw?.modalities?.input)
    ? raw.modalities.input.map(value =>
        String(value).toLowerCase()
      )
    : [];

  const modelText = [
    raw?.id,
    raw?.name,
    raw?.description,
    raw?.provider,
    raw?.puterId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasImageInput = inputModalities.includes("image");

  const isCodingModel =
    categories.includes("coding") ||
    /\b(coder|code|coding|developer)\b/i.test(modelText);

  return {
    ...raw,
    id,
    name,
    provider,
    providerLabel: providerLabel(provider),

    aliases: Array.isArray(raw.aliases)
      ? raw.aliases.map(clean).filter(Boolean)
      : [],

    context,
    maxTokens,

    categories,

    capabilities: normalizeCapabilities({
      ...DEFAULT_CAPABILITIES,

      chat: true,
      streaming: true,

      vision:
        raw?.vision === true ||
        raw?.supports_vision === true ||
        hasImageInput ||
        categories.includes("vision"),

      reasoning:
        raw?.reasoning === true ||
        raw?.supports_reasoning === true ||
        categories.includes("reasoning"),

      coding:
        isCodingModel,

      longContext:
        context >= 100000 ||
        categories.includes("long-context"),
    }),
  };
}

function mergeDisplayMetadata(model) {
  const fallback = FALLBACK_MODELS.find(
    item => item?.id === model?.id
  );

  if (!fallback) return model;

  return {
    ...model,
    name: fallback.name || model.name,
    hint: fallback.hint || model.hint,
    desc: fallback.desc || model.desc,
  };
}

function dedupeModels(models) {
  const map = new Map();

  for (const model of models) {
    if (!model?.id) continue;

    const key = `${model.provider}:${model.id}`.toLowerCase();

    if (!map.has(key)) {
      map.set(key, model);
    }
  }

  return [...map.values()];
}

function sortModels(models) {
  return [...models].sort((a, b) => {
    const aFallback = FALLBACK_MODELS.some(
      model => model.id === a.id
    );

    const bFallback = FALLBACK_MODELS.some(
      model => model.id === b.id
    );

    if (aFallback !== bFallback) {
      return aFallback ? -1 : 1;
    }

    return clean(a.name)
      .toLowerCase()
      .localeCompare(clean(b.name).toLowerCase());
  });
}

function isPuterAvailable() {
  return Boolean(
    window.puter &&
    window.puter.ai &&
    typeof window.puter.ai.listModels === "function"
  );
}

let models = FALLBACK_MODELS
  .map(normalizeModel)
  .filter(Boolean)
  .map(mergeDisplayMetadata);

let initialized = false;
let initializingPromise = null;

const listeners = new Set();

function notify() {
  for (const listener of listeners) {
    try {
      listener(models);
    } catch (error) {
      console.warn(
        "[TheDivineX Model Manager] Listener error:",
        error
      );
    }
  }
}

async function discover() {
  if (!isPuterAvailable()) {
    console.warn(
      "[TheDivineX Model Manager] Puter model discovery unavailable. Using fallback models."
    );

    return models;
  }

  try {
    const discovered = await window.puter.ai.listModels();

    const normalized = Array.isArray(discovered)
      ? discovered
          .map(normalizeModel)
          .filter(Boolean)
          .map(mergeDisplayMetadata)
      : [];

    if (normalized.length) {
      models = sortModels(
        dedupeModels(normalized)
      );

      console.info(
        `[TheDivineX Model Manager] Loaded ${models.length} live models.`
      );

      notify();
    } else {
      console.warn(
        "[TheDivineX Model Manager] Puter returned no models. Keeping fallback models."
      );
    }
  } catch (error) {
    console.warn(
      "[TheDivineX Model Manager] Live discovery failed. Using fallback models.",
      error
    );
  }

  return models;
}

function initialize() {
  if (!initializingPromise) {
    initializingPromise = discover().finally(() => {
      initialized = true;
    });
  }

  return initializingPromise;
}

function get(id) {
  if (!id) return null;

  const wanted = clean(id).toLowerCase();

  return (
    models.find(
      model => model.id.toLowerCase() === wanted
    ) ||
    models.find(
      model =>
        model.aliases?.some(
          alias => alias.toLowerCase() === wanted
        )
    ) ||
    null
  );
}

function getDefault() {
  const preferredIds = [
    "gpt-5.6-luna",
    "gpt-5.6-luna:free",
    "gpt-4o-mini",
  ];

  for (const id of preferredIds) {
    const model = get(id);
    if (model) return model;
  }

  return models[0] || null;
}

function getByCategory(category) {
  return models.filter(model =>
    model.categories.includes(category)
  );
}

function getByCapability(capability) {
  const key = String(capability || '').trim();

  if (!key) {
    return [];
  }

  return models.filter(model =>
    model?.capabilities?.[key] === true
  );
}

function categories() {
  return CATEGORY_ORDER
    .map(id => ({
      id,
      models: getByCategory(id),
    }))
    .filter(group => group.models.length);
}

function isAvailable(id) {
  return Boolean(get(id));
}

function resolve(savedId) {
  if (savedId && isAvailable(savedId)) {
    return get(savedId);
  }

  return getDefault();
}

function subscribe(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  listeners.add(listener);

  return () => listeners.delete(listener);
}

export const modelService = Object.freeze({
  list() {
    return models;
  },

  get,

  default() {
    return getDefault();
  },

  initialize,

  ready() {
    return initialize();
  },

  refresh() {
    return discover();
  },

  resolve,

  isAvailable,

  getByCategory,

  getByCapability,

  categories,

  subscribe,

  get initialized() {
    return initialized;
  },
});






