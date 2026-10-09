import { storage } from './storage.js';
import { makeChatId } from '../utils.js';

export const chatService = Object.freeze({
  createMeta(title, modelId) {
    const text = String(title || 'New chat').trim();
    return {
      id: makeChatId(),
      title: text.slice(0, 48) + (text.length > 48 ? '…' : ''),
      updated: Date.now(),
      model: modelId,
    };
  },

  async loadIndex() {
    return storage.loadChatIndex();
  },

  async load(id) {
    return storage.loadChat(id);
  },

  async persist(chat, chats) {
    await Promise.all([
      storage.saveChat(chat.id, chat.messages),
      storage.saveChatIndex(chats),
    ]);
  },

  async persistIndex(chats) {
    await storage.saveChatIndex(chats);
  },

  async remove(id, chats) {
    await storage.deleteChat(id);
    await storage.saveChatIndex(chats);
  },
});
