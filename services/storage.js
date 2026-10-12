import { STORAGE_KEYS } from '../config.js';
import { parseStored } from '../utils.js';

function getPuter() {
  if (!globalThis.puter?.kv) throw new Error('Puter storage is not available.');
  return globalThis.puter;
}

export const storage = Object.freeze({
  async loadChatIndex() {
    const value = await getPuter().kv.get(STORAGE_KEYS.chatIndex);
    const parsed = parseStored(value, []);
    return Array.isArray(parsed) ? parsed : [];
  },

  async saveChatIndex(chats) {
    await getPuter().kv.set(STORAGE_KEYS.chatIndex, chats);
  },

  async loadChat(id) {
    if (!id) return [];
    const value = await getPuter().kv.get(STORAGE_KEYS.chat(id));
    const parsed = parseStored(value, []);
    return Array.isArray(parsed) ? parsed : [];
  },

  async saveChat(id, messages) {
    if (!id) throw new Error('Cannot save a chat without an id.');
    await getPuter().kv.set(STORAGE_KEYS.chat(id), messages);
  },

  async deleteChat(id) {
    if (!id) return;
    try {
      await getPuter().kv.del(STORAGE_KEYS.chat(id));
    } catch (error) {
      console.warn('[Storage] deleteChat failed:', error);
    }
  },

  async loadModel() {
    return getPuter().kv.get(STORAGE_KEYS.model);
  },

  async saveModel(modelId) {
    await getPuter().kv.set(STORAGE_KEYS.model, modelId);
  },

  async loadSettings() {
    const value = await getPuter().kv.get(STORAGE_KEYS.settings);
    const parsed = parseStored(value, {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  },

  async saveSettings(settings) {
    await getPuter().kv.set(STORAGE_KEYS.settings, settings);
  },
});
