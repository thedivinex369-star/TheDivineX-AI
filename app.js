import { createIcons, icons } from 'https://cdn.jsdelivr.net/npm/lucide@latest/+esm';
import { MODELS, SUGGESTIONS } from './config.js';
import { state, setBusy } from './state.js';
import { $, escapeHtml } from './utils.js';
import { storage } from './services/storage.js';
import { authService } from './services/auth.js';
import { modelService } from './services/models.js';
import { aiService } from './services/ai.js';
import { chatService } from './services/chat.js';

const icon = () => createIcons({ icons });

marked.setOptions({ breaks: true, gfm: true });
const md = value => DOMPurify.sanitize(marked.parse(value || ''));

function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.add('hidden'), 1800);
}

function showGate() {
  $('app').classList.add('hidden');
  $('gate').classList.remove('hidden');
  icon();
}

function showApp() {
  $('gate').classList.add('hidden');
  $('app').classList.remove('hidden');
}

function groupLabel(timestamp) {
  const days = (Date.now() - timestamp) / 864e5;
  return days < 1 ? 'Today' : days < 2 ? 'Yesterday' : days < 7 ? 'Previous 7 days' : 'Older';
}

/* ---------- UI: Sidebar ---------- */
const openSidebar = () => {
  $('sidebar').classList.add('sidebar-open');
  $('scrim').classList.remove('hidden');
};

const closeSidebar = () => {
  $('sidebar').classList.remove('sidebar-open');
  $('scrim').classList.add('hidden');
};

function renderList() {
  const query = $('searchInput').value.trim().toLowerCase();
  const items = state.chats
    .filter(chat => String(chat.title || '').toLowerCase().includes(query))
    .sort((a, b) => b.updated - a.updated);

  if (!items.length) {
    $('chatList').innerHTML = `<p class="text-xs text-slate-400 px-2 py-4">${query ? 'No matching chats' : 'No conversations yet'}</p>`;
    return;
  }

  let html = '';
  let lastGroup = '';
  for (const chat of items) {
    const group = groupLabel(chat.updated);
    if (group !== lastGroup) {
      html += `<p class="text-xs font-medium text-slate-400 px-2 pt-4 pb-1.5">${group}</p>`;
      lastGroup = group;
    }
    const active = state.current?.id === chat.id;
    html += `<div class="group flex items-center rounded-lg ${active ? 'bg-slate-200/80' : 'hover:bg-slate-200/50'}">
      <button data-open="${escapeHtml(chat.id)}" class="flex-1 min-w-0 text-left px-2.5 py-2 truncate">${escapeHtml(chat.title)}</button>
      <button data-rename="${escapeHtml(chat.id)}" title="Rename" class="p-1.5 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
      <button data-del="${escapeHtml(chat.id)}" title="Delete" class="p-1.5 mr-1 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
    </div>`;
  }

  $('chatList').innerHTML = html;
  icon();
}

async function handleChatListClick(event) {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.open) {
    await openChat(button.dataset.open);
    return;
  }

  if (button.dataset.rename) {
    const chat = state.chats.find(item => item.id === button.dataset.rename);
    if (!chat) return;
    const name = prompt('Rename chat', chat.title);
    if (!name?.trim()) return;
    chat.title = name.trim().slice(0, 80);
    renderList();
    try {
      await chatService.persistIndex(state.chats);
    } catch (error) {
      toast('Could not save chat name');
      console.warn('[Chat] rename failed:', error);
    }
    return;
  }

  if (button.dataset.del) {
    if (!confirm('Delete this chat?')) return;
    const id = button.dataset.del;
    state.chats = state.chats.filter(item => item.id !== id);
    if (state.current?.id === id) newChat();
    renderList();
    try {
      await chatService.remove(id, state.chats);
    } catch (error) {
      toast('Could not delete chat');
      console.warn('[Chat] delete failed:', error);
    }
  }
}

/* ---------- UI: Models ---------- */

let modelPickerState = {
  search: '',
  category: 'all',
  provider: 'all',
};

function setModel(model) {
  if (!model) return;

  state.model = model;

  $('modelLabel').textContent = model.name || model.id;
  $('modelHint').textContent =
    model.hint ||
    `${model.providerLabel || model.provider || 'Puter'} Â· ${model.id}`;

  renderModelMenu();
}

function modelMatchesSearch(model, query) {
  if (!query) return true;

  const text = [
    model.id,
    model.name,
    model.desc,
    model.description,
    model.provider,
    model.providerLabel,
    ...(Array.isArray(model.aliases) ? model.aliases : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return text.includes(query.toLowerCase());
}

function getModelProviders() {
  return [
    ...new Set(
      modelService
        .list()
        .map(model => model.providerLabel || model.provider)
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function getFilteredModels() {
  const search = modelPickerState.search.trim().toLowerCase();
  const category = modelPickerState.category;
  const provider = modelPickerState.provider;

  return modelService
    .list()
    .filter(model => {
      if (!modelMatchesSearch(model, search)) return false;

      if (
        category !== 'all' &&
        !model.categories?.includes(category)
      ) {
        return false;
      }

      if (
        provider !== 'all' &&
        (model.providerLabel || model.provider) !== provider
      ) {
        return false;
      }

      return true;
    });
}

function getRecommendedModels() {
  const recommended = [];
  const category = modelPickerState.category;

  const addModel = model => {
    if (
      model &&
      !recommended.some(item => item.id === model.id)
    ) {
      recommended.push(model);
    }
  };

  if (state.model) {
    if (
      category === 'all' ||
      state.model.categories?.includes(category)
    ) {
      addModel(state.model);
    }
  }

  if (category !== 'all') {
    modelService
      .getByCategory(category)
      .slice(0, 4)
      .forEach(addModel);
  } else {
    const defaultModel = modelService.default();

    addModel(defaultModel);

    modelService
      .list()
      .filter(model =>
        model?.capabilities?.chat === true &&
        model?.id !== defaultModel?.id
      )
      .slice(0, 3)
      .forEach(addModel);
  }

  return recommended.slice(0, 4);
}
function modelCategoryLabel(category) {
  const labels = {
    all: 'All',
    fast: 'Fast',
    reasoning: 'Reasoning',
    coding: 'Coding',
    vision: 'Vision',
    'long-context': 'Long Context',
  };

  return labels[category] || category;
}

function renderModelMenu() {
  const menu = $('modelMenu');
  if (!menu) return;

  const providers = getModelProviders();
  const recommended = getRecommendedModels();
  const filtered = getFilteredModels();

  const recommendedIds = new Set(
    recommended.map(model => model.id)
  );

  const visibleModels = filtered
    .filter(model => !recommendedIds.has(model.id))
    .slice(0, 100);

  const providerOptions = [
    '<option value="all">All providers</option>',
    ...providers.map(provider => `
      <option value="${escapeHtml(provider)}" ${
        modelPickerState.provider === provider ? 'selected' : ''
      }>
        ${escapeHtml(provider)}
      </option>
    `),
  ].join('');

  const categoryButtons = [
    'all',
    'fast',
    'reasoning',
    'coding',
    'vision',
    'long-context',
  ].map(category => `
    <button
      type="button"
      data-model-category="${escapeHtml(category)}"
      class="px-2.5 py-1.5 rounded-lg text-xs font-medium ${
        modelPickerState.category === category
          ? 'bg-slate-900 text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }"
    >
      ${escapeHtml(modelCategoryLabel(category))}
    </button>
  `).join('');

  const recommendedHTML = recommended.length
    ? `
      <div class="px-2 pt-2 pb-1">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Recommended
        </div>
      </div>

      <div class="space-y-1">
        ${recommended.map(model => `
          <button
            type="button"
            data-model="${escapeHtml(model.id)}"
            class="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 ${
              model.id === state.model.id ? 'bg-slate-50' : ''
            }"
          >
            <span class="mt-0.5 text-amber-500">â˜…</span>

            <span class="flex-1 min-w-0">
              <span class="block text-sm font-medium truncate">
                ${escapeHtml(model.name || model.id)}
              </span>

              <span class="block text-xs text-slate-500 truncate">
                ${escapeHtml(
                  model.hint ||
                  model.providerLabel ||
                  model.provider ||
                  model.id
                )}
              </span>
            </span>

            ${
              model.id === state.model.id
                ? '<i data-lucide="check" class="w-4 h-4 text-indigo-600 mt-0.5 shrink-0"></i>'
                : ''
            }
          </button>
        `).join('')}
      </div>
    `
    : '';

  const modelsHTML = visibleModels.length
    ? visibleModels.map(model => `
        <button
          type="button"
          data-model="${escapeHtml(model.id)}"
          class="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 ${
            model.id === state.model.id ? 'bg-slate-50' : ''
          }"
        >
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium truncate">
              ${escapeHtml(model.name || model.id)}
            </span>

            <span class="block text-xs text-slate-500 truncate">
              ${escapeHtml(
                model.desc ||
                model.description ||
                `${model.providerLabel || model.provider || 'Puter'} Â· ${model.id}`
              )}
            </span>
          </span>

          ${
            model.id === state.model.id
              ? '<i data-lucide="check" class="w-4 h-4 text-indigo-600 mt-0.5 shrink-0"></i>'
              : ''
          }
        </button>
      `).join('')
    : `
      <div class="px-4 py-8 text-center">
        <div class="text-sm font-medium text-slate-700">
          No models found
        </div>
        <div class="mt-1 text-xs text-slate-400">
          Try another search, provider, or category.
        </div>
      </div>
    `;

  menu.innerHTML = `
    <div class="p-1.5">

      <div class="relative">
        <i
          data-lucide="search"
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
        ></i>

        <input
          id="modelSearch"
          type="search"
          value="${escapeHtml(modelPickerState.search)}"
          placeholder="Search models..."
          autocomplete="off"
          class="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:bg-white"
        />
      </div>

      <div class="mt-2 flex flex-wrap gap-1.5">
        ${categoryButtons}
      </div>

      <div class="mt-2">
        <select
          id="modelProvider"
          class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 outline-none"
        >
          ${providerOptions}
        </select>
      </div>

      ${recommendedHTML}

      <div class="mt-2 border-t border-slate-100 pt-2">
        <div class="flex items-center justify-between px-2 pb-1">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Models
          </span>

          <span class="text-[11px] text-slate-400">
            ${filtered.length}
          </span>
        </div>

        <div class="max-h-80 overflow-y-auto space-y-0.5">
          ${modelsHTML}
        </div>
      </div>

      ${
        filtered.length > 100
          ? `
            <div class="px-2 pt-2 text-[11px] text-slate-400">
              Showing first 100 results. Use search or filters to narrow the list.
            </div>
          `
          : ''
      }

    </div>
  `;

  const searchInput = $('modelSearch');

  if (searchInput) {
    searchInput.oninput = event => {
      modelPickerState.search = event.target.value;
      renderModelMenu();

      const nextInput = $('modelSearch');

      if (nextInput) {
        nextInput.focus();

        try {
          nextInput.setSelectionRange(
            nextInput.value.length,
            nextInput.value.length
          );
        } catch {}
      }
    };
  }

  const providerSelect = $('modelProvider');

  if (providerSelect) {
    providerSelect.onchange = event => {
      modelPickerState.provider = event.target.value;
      renderModelMenu();
    };
  }

  icon();
}

async function selectModel(id) {
  const model = modelService.get(id);

  if (!model) return;

  setModel(model);
  $('modelMenu').classList.add('hidden');

  try {
    await storage.saveModel(model.id);
  } catch (error) {
    toast('Model selected, but could not save it');
    console.warn('[Model] save failed:', error);
  }
}
/* ---------- UI: Messages ---------- */
function msgHTML(message, index) {
  if (message.role === 'user') {
    return `<div class="flex justify-end"><div class="bg-slate-100 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%] whitespace-pre-wrap text-[15px]">${escapeHtml(message.content)}</div></div>`;
  }

  const likeClass = message.feedback === 'like' ? 'text-blue-600 bg-blue-50' : 'hover:bg-slate-100 hover:text-slate-700';
  const dislikeClass = message.feedback === 'dislike' ? 'text-red-600 bg-red-50' : 'hover:bg-slate-100 hover:text-slate-700';

  return `<div class="flex gap-3">
    <img src="icon.svg" class="w-7 h-7 rounded-md shrink-0 mt-0.5" alt="">
    <div class="flex-1 min-w-0">
      <div class="prose-nova">${md(message.content)}</div>
      <div class="flex items-center gap-1 mt-2 text-slate-400">
        <button type="button" data-copy="${index}" title="Copy" aria-label="Copy response" class="p-1.5 rounded-md hover:bg-slate-100 hover:text-slate-700"><i data-lucide="copy" class="w-4 h-4"></i></button>
        <button type="button" data-regen="${index}" title="Regenerate" aria-label="Regenerate response" class="p-1.5 rounded-md hover:bg-slate-100 hover:text-slate-700"><i data-lucide="refresh-cw" class="w-4 h-4"></i></button>
        <button type="button" data-feedback="${index}" data-value="like" title="Good response" aria-label="Like response" aria-pressed="${message.feedback === 'like'}" class="p-1.5 rounded-md ${likeClass}"><i data-lucide="thumbs-up" class="w-4 h-4"></i></button>
        <button type="button" data-feedback="${index}" data-value="dislike" title="Bad response" aria-label="Dislike response" aria-pressed="${message.feedback === 'dislike'}" class="p-1.5 rounded-md ${dislikeClass}"><i data-lucide="thumbs-down" class="w-4 h-4"></i></button>
      </div>
    </div>
  </div>`;
}
function addCodeCopy(root) {
  root.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-code')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-code';
    button.textContent = 'Copy';
    button.onclick = () => {
      navigator.clipboard?.writeText(pre.querySelector('code')?.innerText || pre.innerText).catch(() => {});
      button.textContent = 'Copied';
      setTimeout(() => (button.textContent = 'Copy'), 1200);
    };
    pre.appendChild(button);
  });
}

function scrollDown() {
  const scroller = $('scroller');
  scroller.scrollTop = scroller.scrollHeight;
}

function renderMessages() {
  const messages = state.current?.messages || [];
  $('empty').classList.toggle('hidden', messages.length > 0);
  $('messages').classList.toggle('hidden', messages.length === 0);
  $('messages').innerHTML = messages.map(msgHTML).join('');
  addCodeCopy($('messages'));
  icon();
  scrollDown();
}

/* ---------- UI: Composer ---------- */
const input = $('input');

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 192) + 'px';
  $('sendBtn').disabled = !input.value.trim() || state.busy;
}

/* ---------- Chat orchestration ---------- */
async function openChat(id) {
  if (state.busy) return;
  const meta = state.chats.find(chat => chat.id === id);
  if (!meta) return;

  try {
    const messages = await chatService.load(id);
    state.current = { id, messages: Array.isArray(messages) ? messages : [] };
    input.value = '';
    input.style.height = 'auto';
    input.scrollTop = 0;
    autosize();
    const model = modelService.resolve(meta.model);
    if (model) setModel(model);
    renderMessages();
    renderList();
    closeSidebar();
  } catch (error) {
    toast('Could not open this chat');
    console.warn('[Chat] open failed:', error);
  }
}

function newChat() {
  if (state.busy) return;
  state.current = null;
  input.value = '';
  input.style.height = 'auto';
  input.scrollTop = 0;
  autosize();
  renderMessages();
  renderList();
  closeSidebar();
  input.focus();
}

async function send(text) {
  if (state.busy) return;
  if (!authService.isSignedIn()) {
    await boot();
    return;
  }

  input.value = '';
  autosize();

  if (!state.current) {
    const meta = chatService.createMeta(text, state.model.id);
    state.current = { id: meta.id, messages: [] };
    state.chats.push(meta);
  }

  state.current.messages.push({ role: 'user', content: text });
  renderMessages();
  renderList();
  await respond();
}

async function respond() {
  if (!state.current || state.busy) return;

  setBusy(true);
  autosize();
  const chat = state.current;
  const modelId = state.model.id;

  const wrap = document.createElement('div');
  wrap.className = 'flex gap-3';
  wrap.innerHTML = `<img src="icon.svg" class="w-7 h-7 rounded-md shrink-0 mt-0.5" alt=""><div class="flex-1 min-w-0"><div class="prose-nova"><div class="flex gap-1 py-2"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div></div></div>`;
  $('messages').appendChild(wrap);
  scrollDown();
  const body = wrap.querySelector('.prose-nova');

  let output = '';
  let failed = false;

  try {
    output = await aiService.streamChat({
      messages: chat.messages,
      modelId,
      onText: (_chunk, fullText) => {
        output = fullText;
        body.innerHTML = md(output);
        body.classList.add('cursor-blink');
        const scroller = $('scroller');
        if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160) scrollDown();
      },
    });

    if (!output) output = '_No response received. Please try again._';
  } catch (error) {
    failed = true;
    console.warn('[AI] response failed:', error);
    output = (output ? output + '\n\n' : '') + aiService.formatError(error);
    body.innerHTML = md(output);
  } finally {
    setBusy(false);
    autosize();
  }

  chat.messages.push({ role: 'assistant', content: output });

  const meta = state.chats.find(item => item.id === chat.id);
  if (meta) {
    meta.updated = Date.now();
    meta.model = modelId;
  }

  if (state.current === chat) renderMessages();
  renderList();

  try {
    await chatService.persist(chat, state.chats);
  } catch (error) {
    toast('Response received, but could not save the chat');
    console.warn('[Storage] persist failed:', error);
  }

  if (failed) toast('AI request failed');
}

/* ---------- App boot ---------- */
async function boot() {
  if (!authService.isSignedIn()) {
    showGate();
    return;
  }

  showApp();

  try {
    const user = await authService.getUser();
    $('username').textContent = user?.username || 'User';
    $('avatar').textContent = (user?.username?.[0] || 'U').toUpperCase();
  } catch (error) {
    console.warn('[Auth] user lookup failed:', error);
    $('username').textContent = 'User';
    $('avatar').textContent = 'U';
  }

  try {
    await modelService.initialize();

    const savedModel = await storage.loadModel();
    const model = modelService.resolve(savedModel);

    if (model) {
      setModel(model);

      if (model.id !== savedModel) {
        await storage.saveModel(model.id);
      }
    }

    state.chats = await chatService.loadIndex?.() || await storage.loadChatIndex();
  } catch (error) {
    state.chats = [];
    toast('Could not load your chats');
    console.warn('[Storage] boot load failed:', error);
  }

  renderList();

  const latestChat = [...state.chats]
    .filter(chat => chat && chat.id)
    .sort((a, b) => Number(b.updated || 0) - Number(a.updated || 0))[0];

  if (latestChat) {
    await openChat(latestChat.id);
  } else {
    newChat();
  }

  icon();
}

/* ---------- Event wiring ---------- */
$('signInBtn').onclick = async () => {
  try {
    await authService.signIn();
    await boot();
  } catch (error) {
    console.warn('[Auth] sign in failed:', error);
    toast('Sign in was cancelled or failed');
  }
};

$('signOutBtn').onclick = async () => {
  try {
    await authService.signOut();
  } catch (error) {
    console.warn('[Auth] sign out failed:', error);
  } finally {
    location.reload();
  }
};

$('openSidebar').onclick = openSidebar;
$('closeSidebar').onclick = closeSidebar;
$('scrim').onclick = closeSidebar;
$('newChatBtn').onclick = newChat;
$('newChatTop').onclick = newChat;
let chatSearchTimer;
$('searchInput').oninput = () => {
  clearTimeout(chatSearchTimer);
  chatSearchTimer = setTimeout(renderList, 300);
};
$('chatList').onclick = handleChatListClick;

$('modelBtn').onclick = event => {
  event.stopPropagation();
  $('modelMenu').classList.toggle('hidden');
};

$('modelMenu').onclick = async event => {
  const modelButton = event.target.closest('[data-model]');

  if (modelButton) {
    await selectModel(modelButton.dataset.model);
    return;
  }

  const categoryButton = event.target.closest('[data-model-category]');

  if (categoryButton) {
    modelPickerState.category =
      categoryButton.dataset.modelCategory || 'all';

    renderModelMenu();
  }
};

document.addEventListener('click', event => {
  if (!event.target.closest('#modelMenu')) $('modelMenu').classList.add('hidden');
});

$('messages').onclick = async event => {
  const feedbackButton = event.target.closest('[data-feedback]');
  const copyButton = event.target.closest('[data-copy]');
  const regenerateButton = event.target.closest('[data-regen]');
  const messages = state.current?.messages || [];

  if (feedbackButton) {
    const index = Number(feedbackButton.dataset.feedback);
    const value = feedbackButton.dataset.value;
    if (!Number.isInteger(index) || index < 0 || index >= messages.length) return;
    if (!['like', 'dislike'].includes(value)) return;

    const message = messages[index];
    if (!message || message.role !== 'assistant') return;

    const previous = message.feedback;
    if (previous === value) delete message.feedback;
    else message.feedback = value;

    renderMessages();

    try {
      await chatService.persist(state.current, state.chats);
      toast(message.feedback ? 'Feedback saved' : 'Feedback removed');
    } catch (error) {
      if (previous) message.feedback = previous;
      else delete message.feedback;
      renderMessages();
      toast('Could not save feedback');
      console.warn('[Chat] feedback save failed:', error);
    }
    return;
  }

  if (copyButton) {
    const message = messages[Number(copyButton.dataset.copy)];
    if (!message) return;

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(String(message.content ?? ''));
      toast('Copied to clipboard');
    } catch (error) {
      toast('Copy failed. Check clipboard permissions.');
      console.warn('[Chat] copy failed:', error);
    }
    return;
  }

  if (regenerateButton && !state.busy) {
    const index = Number(regenerateButton.dataset.regen);
    if (!Number.isInteger(index) || index < 0 || index >= messages.length) return;
    state.current.messages.splice(index);
    renderMessages();
    respond();
  }
};


$('suggestions').innerHTML = SUGGESTIONS.map(([title, description]) => `
  <button data-s="${escapeHtml(title + ' ' + description)}" class="text-left px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50">
    <span class="block text-sm font-medium">${escapeHtml(title)}</span><span class="block text-sm text-slate-500">${escapeHtml(description)}</span>
  </button>`).join('');

$('suggestions').onclick = event => {
  const button = event.target.closest('[data-s]');
  if (button) send(button.dataset.s);
};

input.oninput = autosize;
input.onkeydown = event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $('composer').requestSubmit();
  }
};

$('composer').onsubmit = event => {
  event.preventDefault();
  const value = input.value.trim();
  if (value && !state.busy) send(value);
};

setModel(MODELS[0]);
autosize();
icon();
boot();

/* =========================================================
   TheDivineX AI Ã¢â‚¬â€ SIDEBAR CONTROLLER FINAL
   Robust against Tailwind v4 translate utilities
   ========================================================= */
(function initDivineXSidebar() {
    const init = () => {
        const sidebar = document.getElementById("sidebar");
        const scrim = document.getElementById("scrim");
        const openBtn = document.getElementById("openSidebar");
        const closeBtn = document.getElementById("closeSidebar");

        if (!sidebar || !openBtn) {
            console.warn("[TheDivineX Sidebar] Required elements not found.");
            return;
        }

        const isMobile = () => window.innerWidth < 768;

        const openSidebar = (event) => {
            event?.preventDefault();
            event?.stopPropagation();

            sidebar.classList.add("sidebar-open");
            sidebar.classList.add("open");

            if (isMobile()) {
                sidebar.style.setProperty("translate", "0 0", "important");
                sidebar.style.setProperty("transform", "none", "important");

                if (scrim) {
                    scrim.classList.remove("hidden");
                    scrim.style.setProperty("display", "block", "important");
                }
            }

            openBtn.setAttribute("aria-expanded", "true");
        };

        const closeSidebar = (event) => {
            event?.preventDefault();
            event?.stopPropagation();

            sidebar.classList.remove("sidebar-open");
            sidebar.classList.remove("open");

            if (isMobile()) {
                sidebar.style.setProperty("translate", "-100% 0", "important");
                sidebar.style.setProperty("transform", "none", "important");

                if (scrim) {
                    scrim.classList.add("hidden");
                    scrim.style.setProperty("display", "none", "important");
                }
            }

            openBtn.setAttribute("aria-expanded", "false");
        };

        /* Override previous handlers cleanly */
        openBtn.onclick = openSidebar;

        if (closeBtn) {
            closeBtn.onclick = closeSidebar;
        }

        if (scrim) {
            scrim.onclick = closeSidebar;
        }

        /* Escape key closes mobile sidebar */
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && isMobile()) {
                closeSidebar(event);
            }
        });

        /* Keep state correct when viewport changes */
        window.addEventListener("resize", () => {
            if (!isMobile()) {
                sidebar.classList.remove("sidebar-open");
                sidebar.classList.remove("open");
                sidebar.style.removeProperty("translate");
                sidebar.style.removeProperty("transform");

                if (scrim) {
                    scrim.classList.add("hidden");
                    scrim.style.removeProperty("display");
                }
            }
        });

        console.log("[TheDivineX Sidebar] Final controller loaded.");
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();


