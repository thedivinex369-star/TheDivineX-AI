import { MODELS } from './config.js';

export const state = {
  chats: [],
  current: null,
  model: MODELS[0],
  busy: false,
};

export function isBusy() {
  return state.busy === true;
}

export function setBusy(value) {
  state.busy = Boolean(value);
}
