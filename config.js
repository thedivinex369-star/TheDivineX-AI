export const MODELS = [
  { id: 'gpt-4o-mini', name: 'DivineX Fast', hint: 'Fast · great for everyday tasks', desc: 'Quick answers for everyday tasks' },
  { id: 'gpt-4.1', name: 'DivineX Pro', hint: 'Pro · advanced reasoning', desc: 'Smarter reasoning and writing' },
  { id: 'claude-sonnet-4', name: 'DivineX Creative', hint: 'Creative · long-form writing', desc: 'Nuanced, long-form writing' },
  { id: 'gemini-2.0-flash', name: 'DivineX Lite', hint: 'Lite · lightweight and very fast', desc: 'Lightweight and very fast' },
];

export const SYSTEM = {
  role: 'system',
  content: 'You are TheDivineX, a helpful, friendly and concise AI assistant made by TheDivineX AI. Use Markdown formatting when helpful.',
};

export const SUGGESTIONS = [
  ['Write an email', 'asking my manager for a day off next Friday'],
  ['Explain a concept', 'like quantum computing in simple terms'],
  ['Help me code', 'a JavaScript function to debounce input'],
  ['Plan a trip', '3 days in Tokyo on a budget'],
];

// These keys are intentionally unchanged so existing chats/settings continue to work.
export const STORAGE_KEYS = Object.freeze({
  chatIndex: 'nova:index',
  model: 'nova:model',
  chat: id => `nova:chat:${id}`,
});
