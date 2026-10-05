/**
 * ZYN AI - Frontend Application
 * Cyber Security AI Command Center
 *
 * SECURITY:
 * - No API keys are stored or used in the frontend
 * - All AI requests go through the backend
 * - Markdown is sanitized with DOMPurify before rendering
 */

(function () {
  'use strict';

  const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:3001' : '';
  const STORAGE_KEY = 'zyn_ai_chats';
  const SETTINGS_KEY = 'zyn_ai_settings';
  const MODEL_PREFERENCE_KEY = 'zyn_ai_model_preference';
  const AUTH_KEY = 'zyn_ai_auth';
  const MAX_TITLE_LENGTH = 40;
  const MAX_MESSAGE_LENGTH = 12000;
  const MAX_CONTEXT_LENGTH = 40000;
  const MAX_CONTEXT_MESSAGES = 50;

  let state = {
    chats: [],
    currentChatId: null,
    mode: 'GENERAL',
    model: 'openrouter/auto',
    pendingModel: 'openrouter/auto',
    availableModels: [],
    modelsLoaded: false,
    providerStatuses: {},
    temperature: 0.7,
    isGenerating: false,
    abortController: null,
    animations: true,
    compact: false,
    theme: 'cyber',
    authMode: 'login',
    token: null,
    user: null,
    authenticated: false
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const bootScreen = $('#boot-screen');
  const authScreen = $('#auth-screen');
  const app = $('#app');
  const sidebar = $('#sidebar');
  const sidebarOverlay = $('#sidebar-overlay');
  const chatHistory = $('#chat-history');
  const messagesEl = $('#messages');
  const emptyState = $('#empty-state');
  const messageInput = $('#message-input');
  const btnSend = $('#btn-send');
  const btnStop = $('#btn-stop');
  const modeSelector = $('#mode-selector');
  const modelBadge = $('#model-badge');
  const providerOptions = $('#ai-provider-options');
  const currentProviderLabel = $('#ai-current-provider');
  const currentModelLabel = $('#ai-current-model');
  const modelStatus = $('#ai-model-status');
  const modelMessage = $('#ai-model-message');
  const applyModelButton = $('#ai-model-apply');
  const searchInput = $('#search-input');
  const settingsPanel = $('#settings-panel');
  const toast = $('#toast');

  function runBootSequence() {
    const lines = [
      $('#boot-line-1'),
      $('#boot-line-2'),
      $('#boot-line-3'),
      $('#boot-line-4')
    ];
    const progressBar = $('#boot-progress-bar');
    let step = 0;

    const fallbackTimer = setTimeout(() => {
      finishBoot();
    }, 4000);

    function nextStep() {
      if (step < lines.length) {
        lines[step].classList.add('visible');
        if (step === lines.length - 1) {
          lines[step].classList.add('done');
        }
        progressBar.style.width = ((step + 1) / lines.length) * 100 + '%';
        step++;
        setTimeout(nextStep, 450);
      } else {
        clearTimeout(fallbackTimer);
        setTimeout(finishBoot, 400);
      }
    }

    setTimeout(nextStep, 600);
  }

  function finishBoot() {
    bootScreen.classList.add('fade-out');
    if (state.authenticated) {
      app.classList.remove('hidden');
      authScreen.classList.add('hidden');
    } else {
      authScreen.classList.remove('hidden');
      app.classList.add('hidden');
    }
    setTimeout(() => {
      bootScreen.style.display = 'none';
    }, 500);
  }

  function loadAuthSession() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) {
        state.token = null;
        state.user = null;
        state.authenticated = false;
        return;
      }
      const auth = JSON.parse(raw);
      state.token = auth.token || null;
      state.user = auth.user || null;
      state.authenticated = !!(state.token && state.user && state.user.email);
    } catch (e) {
      state.token = null;
      state.user = null;
      state.authenticated = false;
      localStorage.removeItem(AUTH_KEY);
    }
  }

  function saveAuthSession(token, user) {
    state.token = token;
    state.user = user;
    state.authenticated = !!token && !!user;
    localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
  }

  function clearAuthSession() {
    state.token = null;
    state.user = null;
    state.authenticated = false;
    localStorage.removeItem(AUTH_KEY);
  }

  function showAuthScreen() {
    app.classList.add('hidden');
    authScreen.classList.remove('hidden');
  }

  function showAppScreen() {
    authScreen.classList.add('hidden');
    app.classList.remove('hidden');
  }

  function loadChats() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state.chats = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[ZYN] Failed to load chats:', e.message);
      state.chats = [];
    }
  }

  function saveChats() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.chats));
    } catch (e) {
      console.warn('[ZYN] Failed to save chats:', e.message);
      showToast('Storage full. Unable to save chat.');
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        state.temperature = typeof s.temperature === 'number' ? s.temperature : state.temperature;
        state.animations = s.animations !== false;
        state.compact = !!s.compact;
        state.theme = s.theme || 'cyber';
      }
    } catch (e) { /* ignore */ }
    applySettings();
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        temperature: state.temperature,
        animations: state.animations,
        compact: state.compact,
        theme: state.theme
      }));
    } catch (e) { /* ignore */ }
  }

  function modelPreferenceKey() {
    const userId = state.user?.id || 'guest';
    return `${MODEL_PREFERENCE_KEY}:${encodeURIComponent(userId)}`;
  }

  function loadModelPreference() {
    try {
      return localStorage.getItem(modelPreferenceKey());
    } catch (error) {
      console.warn('[ZYN] Failed to load AI model preference:', error.message);
      return null;
    }
  }

  function providerName(modelId) {
    if (modelId === 'openrouter/auto') return 'OpenRouter';
    if (typeof modelId === 'string' && modelId.startsWith('groq/qwen/')) return 'Groq';
    return '';
  }

  function modelName(model) {
    const label = typeof model?.label === 'string' ? model.label : model?.id || '';
    const separator = label.indexOf(' · ');
    return separator === -1 ? label : label.slice(separator + 3);
  }

  function updateModelSelector() {
    if (!providerOptions) return;

    providerOptions.replaceChildren();
    const currentModel = state.availableModels.find(model => model.id === state.model);
    const pendingModel = state.availableModels.find(model => model.id === state.pendingModel);

    currentProviderLabel.textContent = currentModel ? providerName(currentModel.id) : 'Not configured';
    currentModelLabel.textContent = currentModel ? modelName(currentModel) : 'No supported model configured';
    modelBadge.textContent = currentModel?.label || 'No model configured';

    for (const model of state.availableModels) {
      const name = providerName(model.id);
      const isActive = model.id === state.model;
      const isRateLimited = state.providerStatuses?.[model.id] === 'rate_limited';
      const option = document.createElement('label');
      option.className = `ai-provider-option${isActive ? ' active' : ''}`;

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'ai-model-provider';
      radio.value = model.id;
      radio.checked = model.id === state.pendingModel;
      radio.setAttribute('aria-label', `${name}, ${modelName(model)}`);

      const radioMark = document.createElement('span');
      radioMark.className = 'ai-provider-radio';
      radioMark.setAttribute('aria-hidden', 'true');

      const details = document.createElement('span');
      details.className = 'ai-provider-details';
      const provider = document.createElement('strong');
      provider.textContent = name;
      const description = document.createElement('small');
      description.textContent = name === 'Groq' ? 'Qwen model via Groq' : 'AI via OpenRouter';
      const selectedModel = document.createElement('span');
      selectedModel.className = 'ai-provider-model';
      selectedModel.textContent = modelName(model);
      details.append(provider, description, selectedModel);

      const status = document.createElement('span');
      status.className = `ai-provider-status${isRateLimited ? ' rate-limited' : ''}`;
      status.textContent = isRateLimited ? 'Rate limited' : isActive ? 'Active' : 'Available';

      option.append(radio, radioMark, details, status);
      providerOptions.append(option);
    }

    const selectedStatus = state.providerStatuses?.[state.model];
    if (!state.modelsLoaded) {
      modelStatus.textContent = 'Loading provider configuration from backend...';
    } else if (!state.availableModels.length) {
      modelStatus.textContent = 'No supported OpenRouter or Groq/Qwen model is configured on the backend.';
    } else if (selectedStatus === 'rate_limited') {
      modelStatus.textContent = `${providerName(state.model)} rate limit reached. Wait a moment or switch providers.`;
    } else {
      modelStatus.textContent = 'Availability reflects backend configuration, not a live connectivity check.';
    }

    updatePendingModelUI(pendingModel);
  }

  function updatePendingModelUI(pendingModel = state.availableModels.find(model => model.id === state.pendingModel)) {
    modelMessage.textContent = pendingModel && pendingModel.id !== state.model
      ? `${providerName(pendingModel.id)} will be used after you apply this change.`
      : '';
    applyModelButton.disabled = !pendingModel || pendingModel.id === state.model;
  }

  function saveModelPreference() {
    try {
      localStorage.setItem(modelPreferenceKey(), state.model);
      return true;
    } catch (error) {
      console.warn('[ZYN] Failed to save AI model preference:', error.message);
      return false;
    }
  }

  async function loadAvailableModels() {
    try {
      const response = await fetch(`${API_BASE}/api/config`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error('Unable to load model configuration.');

      const config = await response.json();
      state.availableModels = (Array.isArray(config.models) ? config.models : [])
        .filter(model => model && (
          model.id === 'openrouter/auto' ||
          (typeof model.id === 'string' && /^groq\/qwen\/.+$/i.test(model.id))
        ));
      state.modelsLoaded = true;

      const preference = loadModelPreference();
      const savedModel = state.availableModels.find(model => model.id === preference);
      const defaultModel = state.availableModels.find(model => model.id === config.defaultModel);
      state.model = (savedModel || defaultModel || state.availableModels[0])?.id || '';
      state.pendingModel = state.model;
      updateModelSelector();
    } catch (error) {
      console.warn('[ZYN] Failed to load available models:', error.message);
      state.modelsLoaded = true;
      state.availableModels = [];
      state.model = '';
      state.pendingModel = '';
      updateModelSelector();
      modelStatus.textContent = 'Unable to load AI provider configuration. Check your connection and try again.';
      modelMessage.textContent = '';
      applyModelButton.disabled = true;
    }
  }

  function applySettings() {
    document.body.classList.toggle('no-animation', !state.animations);
    document.body.classList.toggle('compact', state.compact);
    document.body.classList.remove('theme-obsidian', 'theme-emerald');
    if (state.theme === 'obsidian') document.body.classList.add('theme-obsidian');
    if (state.theme === 'emerald') document.body.classList.add('theme-emerald');

    const themeSelect = $('#setting-theme');
    const tempRange = $('#setting-temperature');
    const tempValue = $('#temp-value');
    const animCheck = $('#setting-animation');
    const compactCheck = $('#setting-compact');

    if (themeSelect) themeSelect.value = state.theme;
    updateModelSelector();
    if (tempRange) {
      tempRange.value = state.temperature;
      if (tempValue) tempValue.textContent = state.temperature;
    }
    if (animCheck) animCheck.checked = state.animations;
    if (compactCheck) compactCheck.checked = state.compact;
  }

  function generateId() {
    return 'chat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function createNewChat() {
    const chat = {
      id: generateId(),
      title: 'New Conversation',
      messages: [],
      mode: state.mode,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    state.chats.unshift(chat);
    state.currentChatId = chat.id;
    saveChats();
    renderHistory();
    renderMessages();
    closeSidebar();
    messageInput.focus();
  }

  function getCurrentChat() {
    return state.chats.find(c => c.id === state.currentChatId) || null;
  }

  function switchChat(id) {
    if (state.isGenerating) return;
    state.currentChatId = id;
    const chat = getCurrentChat();
    if (chat) {
      state.mode = chat.mode || 'GENERAL';
      updateModeUI();
    }
    renderHistory();
    renderMessages();
    closeSidebar();
  }

  function deleteChat(id, e) {
    if (e) e.stopPropagation();
    state.chats = state.chats.filter(c => c.id !== id);
    if (state.currentChatId === id) {
      state.currentChatId = state.chats.length > 0 ? state.chats[0].id : null;
    }
    saveChats();
    renderHistory();
    renderMessages();
  }

  function renameChat(id, e) {
    if (e) e.stopPropagation();
    const chat = state.chats.find(c => c.id === id);
    if (!chat) return;
    const newTitle = prompt('Rename conversation:', chat.title);
    if (newTitle && newTitle.trim()) {
      chat.title = newTitle.trim().slice(0, MAX_TITLE_LENGTH);
      chat.updatedAt = Date.now();
      saveChats();
      renderHistory();
    }
  }

  function autoTitle(chat, firstMessage) {
    if (chat.title !== 'New Conversation') return;
    let title = firstMessage.trim().replace(/\s+/g, ' ');
    if (title.length > MAX_TITLE_LENGTH) {
      title = title.slice(0, MAX_TITLE_LENGTH - 1) + '…';
    }
    chat.title = title || 'New Conversation';
  }

  function clearAllChats() {
    if (!confirm('Clear all local conversations? This cannot be undone.')) return;
    state.chats = [];
    state.currentChatId = null;
    saveChats();
    renderHistory();
    renderMessages();
    showToast('All chats cleared');
  }

  function renderHistory(filter = '') {
    const q = filter.toLowerCase().trim();
    const filtered = q
      ? state.chats.filter(c => c.title.toLowerCase().includes(q))
      : state.chats;

    if (filtered.length === 0) {
      chatHistory.innerHTML = '<div style="padding:1rem;color:var(--text-muted);font-size:0.8rem;text-align:center;">No conversations</div>';
      return;
    }

    chatHistory.innerHTML = filtered.map(chat => `
      <div class="history-item ${chat.id === state.currentChatId ? 'active' : ''}" data-id="${chat.id}">
        <span class="history-item-title">${escapeHtml(chat.title)}</span>
        <div class="history-item-actions">
          <button class="history-action-btn" data-action="rename" title="Rename">✎</button>
          <button class="history-action-btn" data-action="delete" title="Delete">✕</button>
        </div>
      </div>
    `).join('');

    chatHistory.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const id = item.dataset.id;
        if (action === 'delete') deleteChat(id, e);
        else if (action === 'rename') renameChat(id, e);
        else switchChat(id);
      });
    });
  }

  function renderMessages() {
    const chat = getCurrentChat();

    if (!chat || chat.messages.length === 0) {
      emptyState.classList.remove('hidden');
      messagesEl.innerHTML = '';
      return;
    }

    emptyState.classList.add('hidden');

    messagesEl.innerHTML = chat.messages.map((msg, idx) => {
      const time = formatTime(msg.timestamp);
      const roleLabel = msg.role === 'user' ? 'YOU' : 'ZYN';
      const body = msg.role === 'assistant'
        ? renderMarkdown(msg.content)
        : escapeHtml(msg.content).replace(/\n/g, '<br>');

      let actions = '';
      if (msg.role === 'assistant') {
        actions = `
          <div class="message-actions">
            <button class="msg-action-btn" data-action="copy" data-idx="${idx}">COPY</button>
            <button class="msg-action-btn" data-action="regenerate" data-idx="${idx}">REGENERATE</button>
          </div>
        `;
      }

      return `
        <div class="message ${msg.role}" data-idx="${idx}">
          <div class="message-header">
            ${msg.role === 'assistant' ? '<span class="message-avatar" aria-hidden="true">Z</span>' : ''}
            <span class="message-role">${msg.role === 'assistant' ? 'ZYN AI' : roleLabel}</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-body">${body}</div>
          ${actions}
        </div>
      `;
    }).join('');

    messagesEl.querySelectorAll('pre code').forEach(block => {
      if (window.hljs) {
        try { hljs.highlightElement(block); } catch (e) { /* ignore */ }
      }
    });

    messagesEl.querySelectorAll('.msg-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const idx = parseInt(btn.dataset.idx, 10);
        if (action === 'copy') copyMessage(idx);
        if (action === 'regenerate') regenerateMessage(idx);
      });
    });

    messagesEl.querySelectorAll('.btn-copy-code').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.closest('pre').querySelector('code').textContent;
        copyToClipboard(code).then(() => {
          btn.textContent = 'COPIED';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'COPY';
            btn.classList.remove('copied');
          }, 1500);
        });
      });
    });

    scrollToBottom();
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
      return escapeHtml(text).replace(/\n/g, '<br>');
    }

    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false
    });

    const renderer = new marked.Renderer();

    renderer.code = function (code, language) {
      const lang = (language || '').trim();
      const langLabel = lang || 'code';
      let highlighted = code;
      if (window.hljs && lang && hljs.getLanguage(lang)) {
        try {
          highlighted = hljs.highlight(code, { language: lang }).value;
        } catch (e) {
          highlighted = escapeHtml(code);
        }
      } else {
        highlighted = escapeHtml(code);
      }
      return `<pre><div class="code-header"><span>${escapeHtml(langLabel)}</span><button class="btn-copy-code">COPY</button></div><code class="hljs language-${escapeHtml(lang)}">${highlighted}</code></pre>`;
    };

    let html;
    try {
      html = marked.parse(text, { renderer });
    } catch (e) {
      return escapeHtml(text).replace(/\n/g, '<br>');
    }

    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['class'],
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'code', 'pre',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'div', 'span', 'button', 'hr'
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-action', 'data-idx']
    });
  }

  async function sendMessage(text) {
    if (!state.authenticated || !state.token) {
      showAuthScreen();
      return;
    }

    if (!text || !text.trim() || state.isGenerating) return;

    text = text.trim();

    if (!state.currentChatId) {
      createNewChat();
    }

    const chat = getCurrentChat();
    if (!chat) return;

    chat.messages.push({
      role: 'user',
      content: text,
      timestamp: Date.now()
    });
    autoTitle(chat, text);
    chat.mode = state.mode;
    chat.updatedAt = Date.now();
    saveChats();
    renderHistory();
    renderMessages();

    messageInput.value = '';
    autoResizeInput();
    syncSendButton();

    await generateResponse(chat);
  }

  async function generateResponse(chat, regenerateIdx = null) {
    state.isGenerating = true;
    state.abortController = new AbortController();
    setGeneratingUI(true);

    if (regenerateIdx !== null && regenerateIdx >= 0) {
      chat.messages = chat.messages.slice(0, regenerateIdx);
    }

    const typingId = 'typing-' + Date.now();
    const typingHtml = `
      <div class="message assistant" id="${typingId}">
        <div class="message-header">
          <span class="message-avatar" aria-hidden="true">Z</span>
          <span class="message-role">ZYN AI</span>
        </div>
        <div class="message-body">
          <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
        </div>
      </div>
    `;
    emptyState.classList.add('hidden');
    messagesEl.insertAdjacentHTML('beforeend', typingHtml);
    scrollToBottom();

    try {
      const contextMessages = chat.messages.slice(-MAX_CONTEXT_MESSAGES);
      const latestMessage = contextMessages.pop();
      const apiMessages = latestMessage ? [{
        role: latestMessage.role,
        content: latestMessage.content
      }] : [];
      let remainingContext = Math.max(0, MAX_CONTEXT_LENGTH - (latestMessage?.content.length || 0));

      for (let index = contextMessages.length - 1; index >= 0 && remainingContext > 0; index--) {
        const message = contextMessages[index];
        const contentLength = Math.min(message.content.length, MAX_MESSAGE_LENGTH, remainingContext);
        apiMessages.unshift({
          role: message.role,
          content: message.content.slice(-contentLength)
        });
        remainingContext -= contentLength;
      }

      const requestedModel = state.model;
      const response = await fetch(`${API_BASE}/api/secure-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({
          messages: apiMessages,
          mode: state.mode,
          model: requestedModel,
          temperature: state.temperature,
          stream: false
        }),
        signal: state.abortController.signal
      });

      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();

      if (!response.ok) {
        let errData = {};
        try { errData = await response.json(); } catch (e) { /* ignore */ }

        let errorMsg = errData.error || 'Unable to reach ZYN CORE. Please try again.';

        if (response.status === 0 || !navigator.onLine) {
          errorMsg = 'Connection unavailable.';
        }
        if (errData.code === 'RATE_LIMIT') {
          state.providerStatuses = { ...state.providerStatuses, [requestedModel]: 'rate_limited' };
          updateModelSelector();
        }

        chat.messages.push({
          role: 'assistant',
          content: `⚠ ${errorMsg}`,
          timestamp: Date.now(),
          isError: true
        });
        saveChats();
        renderMessages();
        return;
      }

      const data = await response.json();
      if (state.providerStatuses?.[requestedModel] === 'rate_limited') {
        const { [requestedModel]: _clearedStatus, ...providerStatuses } = state.providerStatuses;
        state.providerStatuses = providerStatuses;
        updateModelSelector();
      }
      const content = data.content || '';

      chat.messages.push({
        role: 'assistant',
        content: content,
        timestamp: Date.now()
      });
      chat.updatedAt = Date.now();
      saveChats();
      renderHistory();
      renderMessages();

    } catch (err) {
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();

      if (err.name === 'AbortError') {
        chat.messages.push({
          role: 'assistant',
          content: '_Generation stopped._',
          timestamp: Date.now()
        });
      } else {
        let errorMsg = 'Unable to reach ZYN CORE. Please try again.';
        if (!navigator.onLine) {
          errorMsg = 'Connection unavailable.';
        }
        chat.messages.push({
          role: 'assistant',
          content: `⚠ ${errorMsg}`,
          timestamp: Date.now(),
          isError: true
        });
      }
      saveChats();
      renderMessages();
    } finally {
      state.isGenerating = false;
      state.abortController = null;
      setGeneratingUI(false);
    }
  }

  function stopGeneration() {
    if (state.abortController) {
      state.abortController.abort();
    }
  }

  function regenerateMessage(idx) {
    if (state.isGenerating) return;
    const chat = getCurrentChat();
    if (!chat) return;
    generateResponse(chat, idx);
  }

  function copyMessage(idx) {
    const chat = getCurrentChat();
    if (!chat || !chat.messages[idx]) return;
    copyToClipboard(chat.messages[idx].content).then(() => {
      showToast('Copied to clipboard');
    });
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  function setGeneratingUI(generating) {
    btnSend.classList.toggle('hidden', generating);
    btnStop.classList.toggle('hidden', !generating);
    btnSend.disabled = generating || !messageInput.value.trim();
    messageInput.disabled = generating;
  }

  function syncSendButton() {
    btnSend.disabled = state.isGenerating || !messageInput.value.trim();
  }

  function autoResizeInput() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + 'px';
  }

  function scrollToBottom() {
    const container = $('#chat-container');
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }

  function updateModeUI() {
    modeSelector.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === state.mode);
    });
  }

  function showToast(msg, duration = 2200) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('visible');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('visible');
  }

  function openSettings() {
    settingsPanel.classList.remove('hidden');
  }

  function closeSettings() {
    settingsPanel.classList.add('hidden');
  }

  function bindEvents() {
    const authTabs = document.querySelectorAll('.auth-tab');
    const authForm = $('#auth-form');
    const authNameWrap = $('#auth-name-wrap');
    const authSubmit = $('#auth-submit');
    const authMessage = $('#auth-message');

    authTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.authMode;
        state.authMode = mode;
        authTabs.forEach(item => item.classList.toggle('active', item.dataset.authMode === mode));
        authNameWrap.classList.toggle('hidden', mode !== 'register');
        authSubmit.textContent = mode === 'register' ? 'Register' : 'Login';
        authMessage.textContent = '';
      });
    });

    authForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = $('#auth-email').value.trim();
      const password = $('#auth-password').value.trim();
      const name = $('#auth-name').value.trim();

      if (!email || !password || (state.authMode === 'register' && !name)) {
        authMessage.textContent = 'Please complete all required fields.';
        return;
      }

      if (password.length < 6) {
        authMessage.textContent = 'Password must be at least 6 characters.';
        return;
      }

      authMessage.textContent = state.authMode === 'register' ? 'Creating your account...' : 'Signing in...';

      try {
        const endpoint = state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
        const payload = state.authMode === 'register'
          ? { name, email, password }
          : { email, password };

        const response = await fetch(`${API_BASE}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Authentication failed.');
        }

        if (state.authMode === 'register') {
          state.authMode = 'login';
          authTabs.forEach(item => item.classList.toggle('active', item.dataset.authMode === 'login'));
          authNameWrap.classList.add('hidden');
          authSubmit.textContent = 'Login';
          authMessage.textContent = 'Registration successful. Please sign in.';
          $('#auth-form').reset();
          return;
        }

        saveAuthSession(data.token, data.user);
        authMessage.textContent = 'Access granted.';
        showAppScreen();
        initAppAfterAuth();
      } catch (error) {
        authMessage.textContent = error.message || 'Authentication failed.';
      }
    });

    $('#btn-logout').addEventListener('click', () => {
      clearAuthSession();
      $('#auth-form').reset();
      state.authMode = 'login';
      showAuthScreen();
      authTabs.forEach(item => item.classList.toggle('active', item.dataset.authMode === 'login'));
      authNameWrap.classList.add('hidden');
      authSubmit.textContent = 'Login';
      authMessage.textContent = 'You have been signed out.';
    });

    $('#btn-new-chat').addEventListener('click', () => {
      if (state.isGenerating) return;
      createNewChat();
    });

    btnSend.addEventListener('click', () => {
      sendMessage(messageInput.value);
    });

    btnStop.addEventListener('click', stopGeneration);

    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(messageInput.value);
      }
    });

    messageInput.addEventListener('input', () => {
      autoResizeInput();
      syncSendButton();
    });

    modeSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.mode-btn');
      if (!btn || state.isGenerating) return;
      state.mode = btn.dataset.mode;
      updateModeUI();
      const chat = getCurrentChat();
      if (chat) {
        chat.mode = state.mode;
        saveChats();
      }
    });

    searchInput.addEventListener('input', () => {
      renderHistory(searchInput.value);
    });

    $$('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.dataset.prompt;
        if (prompt) {
          messageInput.value = prompt;
          autoResizeInput();
          sendMessage(prompt);
        }
      });
    });

    $('#btn-menu').addEventListener('click', openSidebar);
    $('#btn-close-sidebar').addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);
    $('#btn-collapse-sidebar').addEventListener('click', (e) => {
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      e.currentTarget.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
      e.currentTarget.setAttribute('aria-label', e.currentTarget.title);
    });

    $('#btn-settings').addEventListener('click', openSettings);
    $('#btn-close-settings').addEventListener('click', closeSettings);
    $('#settings-backdrop').addEventListener('click', closeSettings);

    $('#setting-theme').addEventListener('change', (e) => {
      state.theme = e.target.value;
      applySettings();
      saveSettings();
    });

    providerOptions.addEventListener('change', (event) => {
      if (event.target.matches('input[name="ai-model-provider"]')) {
        state.pendingModel = event.target.value;
        updatePendingModelUI();
      }
    });

    applyModelButton.addEventListener('click', () => {
      if (!state.availableModels.some(model => model.id === state.pendingModel)) return;
      state.model = state.pendingModel;
      const saved = saveModelPreference();
      updateModelSelector();
      showToast(saved
        ? `${providerName(state.model)} selected for chat.`
        : `${providerName(state.model)} selected for this session, but the preference could not be saved.`);
    });

    $('#setting-temperature').addEventListener('input', (e) => {
      state.temperature = parseFloat(e.target.value);
      $('#temp-value').textContent = state.temperature;
      saveSettings();
    });

    $('#setting-animation').addEventListener('change', (e) => {
      state.animations = e.target.checked;
      applySettings();
      saveSettings();
    });

    $('#setting-compact').addEventListener('change', (e) => {
      state.compact = e.target.checked;
      applySettings();
      saveSettings();
    });

    $('#btn-clear-all').addEventListener('click', clearAllChats);

    syncSendButton();
    checkBackend();
  }

  async function checkBackend() {
    try {
      const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error('offline');
    } catch (e) {
      console.info('[ZYN] Backend not reachable yet. Start it with: node server.js');
    }
  }

  function initAppAfterAuth() {
    loadSettings();
    loadChats();

    if (state.chats.length > 0) {
      state.currentChatId = state.chats[0].id;
      const chat = getCurrentChat();
      if (chat) {
        state.mode = chat.mode || 'GENERAL';
      }
    }

    updateModeUI();
    renderHistory();
    renderMessages();
    loadAvailableModels();
  }

  function init() {
    loadAuthSession();
    bindEvents();

    if (state.authenticated) {
      showAppScreen();
      initAppAfterAuth();
    }

    runBootSequence();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();