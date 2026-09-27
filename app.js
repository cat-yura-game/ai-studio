const MODELS = [
  { id: "gpt-6-luna", name: "GPT-6 Luna", provider: "OpenAI", description: "Быстрые повседневные задачи" },
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "Google", description: "Быстрые ответы" },
];

const $ = (id) => document.getElementById(id);
const initialApi = String(window.CHAT_API_URL || "").replace(/\/$/, "");
const state = {
  apiUrl: initialApi,
  token: localStorage.getItem("chat_access_token") || "",
  model: localStorage.getItem("chat_default_model") || MODELS[0].id,
  defaultModel: localStorage.getItem("chat_default_model") || MODELS[0].id,
  thinking: JSON.parse(localStorage.getItem("chat_thinking") || "{}"),
  chats: [],
  currentId: null,
  tempChat: null,
  busy: false,
  files: [],
  remaining: 30,
  limit: 30,
  resetBalance: 0,
  resetCap: 3,
  resetIntervalDays: 7,
  resetGrantAmount: 1,
  nextResetAt: null,
  role: "user",
  profile: { displayName: "", aboutText: "", memoryEnabled: true },
  connected: false,
};

function id() { return crypto.randomUUID(); }
function currentChat() { return state.currentId === "temporary" ? state.tempChat : state.chats.find((chat) => chat.id === state.currentId) || null; }
function selectedModel() { return MODELS.find((model) => model.id === state.model) || MODELS[0]; }
function selectedThinking() { return state.thinking[state.model] || "medium"; }
function apiUrl(path) { return `${state.apiUrl}${path}`; }
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3300);
}
function tokenFromUrl() {
  const match = location.hash.match(/(?:^#|&)invite=([^&]+)/);
  if (!match) return;
  state.token = decodeURIComponent(match[1]);
  localStorage.setItem("chat_access_token", state.token);
  history.replaceState(null, "", location.pathname + location.search);
}
function extractToken(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const match = url.hash.match(/(?:^#|&)invite=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : trimmed;
  } catch { return trimmed; }
}
async function api(path, options = {}) {
  if (!state.apiUrl || !state.token) throw new Error("Для доступа нужна личная ссылка и адрес API.");
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { "Authorization": `Bearer ${state.token}`, ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("Сервер вернул неожиданный ответ."); }
  if (!response.ok) throw new Error(data.error || `Ошибка сервера (${response.status}).`);
  return data;
}
async function connect() {
  if (!state.apiUrl || !state.token) { state.connected = false; state.chats = []; renderAll(); return; }
  try {
    const [profile, chats, personalization] = await Promise.all([api("/api/me"), api("/api/chats"), api("/api/profile")]);
    state.connected = true;
    state.remaining = profile.remaining;
    state.limit = profile.limit;
    state.resetBalance = profile.resetBalance;
    state.resetCap = profile.resetCap;
    state.resetIntervalDays = profile.resetIntervalDays;
    state.resetGrantAmount = profile.resetGrantAmount;
    state.nextResetAt = profile.nextResetAt;
    state.role = profile.role || "user";
    state.profile = personalization;
    state.defaultModel = personalization.defaultModel || MODELS[0].id;
    localStorage.setItem("chat_default_model", state.defaultModel);
    state.chats = chats.chats;
    state.currentId = state.chats[0]?.id || null;
    state.model = state.chats[0]?.model || state.defaultModel;
    renderAll();
  } catch (error) {
    state.connected = false;
    state.chats = [];
    renderAll();
    showToast(error.message);
  }
}
function renderQuota() {
  const percent = Math.max(0, Math.min(100, Math.round((state.remaining / Math.max(1, state.limit)) * 100)));
  $("quotaPercent").textContent = state.connected ? `${percent}%` : "—";
  $("quotaFill").style.width = state.connected ? `${percent}%` : "0%";
  $("quotaText").textContent = state.connected ? `${percent}% лимита осталось` : "Откройте личную ссылку";
  $("modePill").textContent = state.connected ? "Бета" : "Доступ по ссылке";
  if (state.currentId === "temporary") $("modePill").textContent = "Временный чат";
  $("planLabel").textContent = state.connected ? "Бета · личный доступ" : "Требуется вход";
  $("connectionDescription").textContent = state.connected ? "Сервер подключён. История и лимит привязаны к личной ссылке." : state.apiUrl ? "Откройте личную ссылку доступа. Если она уже сохранена, проверьте подключение." : "Сервис временно не настроен.";
  $("connectionDot").classList.toggle("connected", state.connected);
  $("welcomeText").textContent = state.connected ? "Выберите модель и напишите сообщение. История синхронизируется по вашей личной ссылке." : "Выберите модель и напишите сообщение. Для реальных ответов потребуется личная ссылка доступа.";
  $("limitsNumber").textContent = state.connected ? `${percent}%` : "—";
  $("limitsFill").style.width = state.connected ? `${percent}%` : "0%";
  $("resetBalance").textContent = state.connected ? `${state.resetBalance} из ${state.resetCap}` : "—";
  $("nextResetText").textContent = state.connected ? (state.nextResetAt ? `Начисление: +${state.resetGrantAmount} каждые ${state.resetIntervalDays} дн. Следующее — ${new Date(state.nextResetAt).toLocaleString("ru-RU")}.` : "Запас сбросов заполнен.") : "Подключите личную ссылку, чтобы увидеть сбросы.";
  $("useResetButton").disabled = !state.connected || state.resetBalance < 1 || state.remaining >= state.limit;
  $("adminLink").classList.toggle("hidden", state.role !== "admin");
  if (state.role === "admin" && state.token) $("adminLink").href = `./admin.html#invite=${encodeURIComponent(state.token)}`;
}
function renderModels() {
  $("selectedModelName").textContent = selectedModel().name;
  const menu = $("modelMenu");
  menu.replaceChildren();
  for (const provider of ["OpenAI", "Google"]) {
    const title = document.createElement("div");
    title.className = "model-group-label";
    title.textContent = provider;
    menu.append(title);
    for (const model of MODELS.filter((entry) => entry.provider === provider)) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = `model-option ${model.id === state.model ? "selected" : ""}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(model.id === state.model));
      option.innerHTML = `<span class="model-option-icon ${provider === "Google" ? "gemini" : ""}">${provider === "Google" ? "✦" : "◎"}</span><span class="model-option-copy"><strong></strong><small></small></span>${model.id === state.model ? '<svg class="check"><use href="#i-check"/></svg>' : ""}`;
      option.querySelector("strong").textContent = model.name;
      option.querySelector("small").textContent = model.description;
      option.addEventListener("click", () => {
        if (currentChat()?.messages.length && currentChat().model !== model.id) {
          state.currentId = null;
          showToast("Для другой модели открыт новый чат");
        }
        state.model = model.id;
        menu.classList.add("hidden");
        $("modelTrigger").setAttribute("aria-expanded", "false");
        renderModels();
        renderThinking();
        renderList();
        renderMessages();
      });
      menu.append(option);
    }
  }
}
function renderThinking() {
  const select = $("thinkingSelect");
  const choices = state.model === "gpt-6-luna" ? [["none", "Без размышления"], ["low", "Быстро"], ["medium", "Стандартно"], ["high", "Глубоко"], ["xhigh", "Очень глубоко"], ["max", "Максимально"]] : [["low", "Быстро"], ["medium", "Стандартно"], ["high", "Глубоко"]];
  select.replaceChildren();
  for (const [value, label] of choices) { const option = document.createElement("option"); option.value = value; option.textContent = label; select.append(option); }
  select.value = selectedThinking();
}
function renderList() {
  const list = $("chatList");
  list.replaceChildren();
  for (const chat of [...state.chats].sort((a,b) => b.updatedAt - a.updatedAt)) {
    const item = document.createElement("div");
    item.className = `chat-item ${chat.id === state.currentId ? "active" : ""}`;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    const title = document.createElement("span");
    title.className = "chat-title";
    title.textContent = chat.title || "Новый чат";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chat-delete";
    remove.title = "Удалить чат";
    remove.setAttribute("aria-label", `Удалить чат ${chat.title || "Новый чат"}`);
    remove.innerHTML = '<svg><use href="#i-trash"/></svg>';
    remove.addEventListener("click", (event) => { event.stopPropagation(); deleteChat(chat.id); });
    item.append(title, remove);
    const open = () => { state.currentId = chat.id; state.model = chat.model; renderAll(); closeMobile(); };
    item.addEventListener("click", open);
    item.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    list.append(item);
  }
}
function messageElement(message, modelName) {
  const row = document.createElement("article");
  row.className = `message ${message.role}`;
  if (message.role === "assistant") {
    const header = document.createElement("div");
    header.className = "message-header";
    header.innerHTML = '<span class="assistant-mark"><svg><use href="#i-spark"/></svg></span><span></span>';
    header.lastElementChild.textContent = modelName || selectedModel().name;
    row.append(header);
  }
  if (message.files?.length) {
    for (const file of message.files) {
      const chip = document.createElement("div");
      chip.className = "file-chip";
      const extension = file.name.split(".").pop()?.toUpperCase().slice(0, 4) || "FILE";
      chip.innerHTML = '<span class="file-chip-icon"></span><span></span>';
      chip.children[0].textContent = extension;
      chip.children[1].textContent = file.name;
      if (file.id && state.connected) {
        chip.classList.add("downloadable");
        chip.title = "Скачать файл";
        chip.tabIndex = 0;
        chip.setAttribute("role", "button");
        const download = () => downloadFile(file);
        chip.addEventListener("click", download);
        chip.addEventListener("keydown", (event) => { if (event.key === "Enter") download(); });
      }
      row.append(chip);
    }
  }
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = message.content;
  row.append(bubble);
  if (message.role === "assistant" && message.content) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.title = "Копировать ответ";
    copy.setAttribute("aria-label", "Копировать ответ");
    copy.innerHTML = '<svg><use href="#i-copy"/></svg>';
    copy.addEventListener("click", async () => { await navigator.clipboard.writeText(message.content); showToast("Ответ скопирован"); });
    actions.append(copy);
    row.append(actions);
  }
  return row;
}
function renderMessages() {
  const chat = currentChat();
  const hasMessages = !!chat?.messages?.length;
  $("welcome").classList.toggle("hidden", hasMessages);
  $("messages").classList.toggle("hidden", !hasMessages);
  const container = $("messages");
  container.replaceChildren();
  if (!hasMessages) return;
  for (const message of chat.messages) container.append(messageElement(message, chat.modelName));
  if (state.busy) {
    const pending = document.createElement("article");
    pending.className = "message assistant";
    pending.innerHTML = '<div class="message-header"><span class="assistant-mark"><svg><use href="#i-spark"/></svg></span><span>Готовлю ответ</span></div><div class="thinking"><span></span><span></span><span></span></div>';
    container.append(pending);
  }
  requestAnimationFrame(() => { $("conversation").scrollTop = $("conversation").scrollHeight; });
}
function renderAttachments() {
  const holder = $("attachments");
  holder.replaceChildren();
  state.files.forEach((file, index) => {
    const chip = document.createElement("div");
    chip.className = "attached-file";
    chip.innerHTML = '<span></span><button type="button" aria-label="Удалить вложение"><svg><use href="#i-close"/></svg></button>';
    chip.firstElementChild.textContent = file.name;
    chip.lastElementChild.addEventListener("click", () => { state.files.splice(index, 1); renderAttachments(); updateSend(); });
    holder.append(chip);
  });
}
function renderAll() { renderModels(); renderThinking(); renderList(); renderMessages(); renderQuota(); renderAttachments(); updateSend(); }
function updateSend() {
  const ready = !!$("promptInput").value.trim() || state.files.length > 0;
  $("sendButton").classList.toggle("ready", ready || state.busy);
  $("sendButton").setAttribute("aria-label", state.busy ? "Ожидание ответа" : "Отправить сообщение");
  $("sendButton").innerHTML = state.busy ? '<svg><use href="#i-stop"/></svg>' : '<svg><use href="#i-arrow"/></svg>';
}
function newChat() {
  state.currentId = null;
  state.model = state.defaultModel;
  $("promptInput").value = "";
  state.files = [];
  renderAll();
  closeMobile();
  $("promptInput").focus();
}
function temporaryChat() {
  if (!state.tempChat) state.tempChat = { id: "temporary", title: "Временный чат", model: state.defaultModel, modelName: MODELS.find((model) => model.id === state.defaultModel).name, messages: [], updatedAt: Date.now() };
  state.currentId = "temporary";
  state.model = state.tempChat.model;
  renderAll();
  closeMobile();
  $("promptInput").focus();
}
async function deleteChat(chatId) {
  if (state.connected) {
    try { await api(`/api/chats/${encodeURIComponent(chatId)}`, { method: "DELETE" }); }
    catch (error) { showToast(error.message); return; }
  }
  state.chats = state.chats.filter((chat) => chat.id !== chatId);
  if (state.currentId === chatId) state.currentId = state.chats[0]?.id || null;
  renderAll();
}
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function sendMessage() {
  if (state.busy) return;
  if (!state.connected) { showToast("Для чата нужна личная ссылка доступа."); openSettings(); return; }
  const content = $("promptInput").value.trim();
  const attached = [...state.files];
  if (!content && attached.length === 0) return;
  if (state.connected && state.remaining <= 0) { showToast("Дневной лимит исчерпан. Попробуйте завтра."); return; }
  const chat = currentChat() || { id: id(), title: content.slice(0, 46) || attached[0].name, model: state.model, modelName: selectedModel().name, messages: [], updatedAt: Date.now() };
  if (!currentChat()) { state.chats.unshift(chat); state.currentId = chat.id; }
  const temporary = chat.id === "temporary";
  const userMessage = { role: "user", content, files: attached.map(({ name, size, type }) => ({ name, size, type })) };
  if (temporary && attached.length) userMessage._uploads = attached;
  chat.messages.push(userMessage);
  chat.updatedAt = Date.now();
  $("promptInput").value = "";
  state.files = [];
  state.busy = true;
  renderAll();
  try {
    let answer;
    {
      const previousUploads = temporary && !attached.length ? [...chat.messages].reverse().find((message) => message._uploads)?._uploads || [] : [];
      const modelAttachments = attached.length ? attached : previousUploads;
      const files = await Promise.all(modelAttachments.map(async (file) => ({ name: file.name, type: file.type || "application/octet-stream", size: file.size, data: await readFile(file) })));
      const result = await api("/api/chat", { method: "POST", body: JSON.stringify({ chatId: temporary ? null : chat.id, temporary, history: temporary ? chat.messages.slice(0, -1).map(({ role, content }) => ({ role, content })) : undefined, model: chat.model, thinking: selectedThinking(), content, files }) });
      answer = result.answer;
      state.remaining = result.remaining;
      chat.id = result.chatId;
      state.currentId = result.chatId;
      userMessage.files = result.files || userMessage.files;
    }
    chat.messages.push({ role: "assistant", content: answer });
    chat.updatedAt = Date.now();
  } catch (error) {
    chat.messages.pop();
    $("promptInput").value = content;
    state.files = attached;
    if (chat.messages.length === 0) { state.chats = state.chats.filter((entry) => entry !== chat); state.currentId = null; }
    showToast(error.message);
  } finally {
    state.busy = false;
    renderAll();
    $("promptInput").focus();
  }
}
function closeMobile() { $("appShell").classList.remove("mobile-open"); }
async function downloadFile(file) {
  try {
    const response = await fetch(apiUrl(`/api/files/${encodeURIComponent(file.id)}`), { headers: { Authorization: `Bearer ${state.token}` } });
    if (!response.ok) { const error = await response.json(); throw new Error(error.error || "Не удалось скачать файл."); }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) { showToast(error.message); }
}
function renderSearch() {
  const query = $("searchInput").value.trim().toLocaleLowerCase();
  const results = $("searchResults");
  results.replaceChildren();
  const chats = state.chats.filter((chat) => !query || chat.title.toLocaleLowerCase().includes(query) || chat.messages.some((message) => message.content.toLocaleLowerCase().includes(query)));
  if (!chats.length) { const empty = document.createElement("div"); empty.className = "search-empty"; empty.textContent = "Ничего не найдено"; results.append(empty); return; }
  chats.forEach((chat) => { const result = document.createElement("button"); result.className = "search-result"; result.textContent = chat.title; result.addEventListener("click", () => { state.currentId = chat.id; $("searchDialog").close(); renderAll(); closeMobile(); }); results.append(result); });
}

tokenFromUrl();
renderAll();
connect();
$("newChatButton").addEventListener("click", newChat);
$("newChatIcon").addEventListener("click", newChat);
$("temporaryChatButton").addEventListener("click", temporaryChat);
$("sidebarToggle").addEventListener("click", () => $("appShell").classList.add("sidebar-hidden"));
$("desktopOpen").addEventListener("click", () => $("appShell").classList.remove("sidebar-hidden"));
$("mobileMenu").addEventListener("click", () => $("appShell").classList.add("mobile-open"));
$("mobileScrim").addEventListener("click", closeMobile);
$("modelTrigger").addEventListener("click", () => { const open = $("modelMenu").classList.toggle("hidden"); $("modelTrigger").setAttribute("aria-expanded", String(!open)); });
$("thinkingSelect").addEventListener("change", () => { state.thinking[state.model] = $("thinkingSelect").value; localStorage.setItem("chat_thinking", JSON.stringify(state.thinking)); });
document.addEventListener("click", (event) => { if (!event.target.closest(".model-control")) { $("modelMenu").classList.add("hidden"); $("modelTrigger").setAttribute("aria-expanded", "false"); } });
$("settingsButton").addEventListener("click", openSettings);
$("topSettings").addEventListener("click", openSettings);
function openSettings() { $("defaultModelSelect").value = state.defaultModel; $("displayNameInput").value = state.profile.displayName; $("aboutTextInput").value = state.profile.aboutText; $("memoryEnabledInput").checked = state.profile.memoryEnabled; $("accessCodeInput").value = ""; $("accessCodeInput").placeholder = state.token ? "Личная ссылка уже сохранена" : "Вставьте личную ссылку"; $("settingsDialog").showModal(); closeMobile(); }
$("saveSettings").addEventListener("click", async () => {
  const personalization = { displayName: $("displayNameInput").value.trim(), aboutText: $("aboutTextInput").value.trim(), defaultModel: $("defaultModelSelect").value, memoryEnabled: $("memoryEnabledInput").checked };
  state.defaultModel = $("defaultModelSelect").value;
  localStorage.setItem("chat_default_model", state.defaultModel);
  if (!currentChat()) state.model = state.defaultModel;
  const token = extractToken($("accessCodeInput").value);
  if (token) state.token = token;
  if (state.token) localStorage.setItem("chat_access_token", state.token);
  $("settingsDialog").close();
  if (!state.apiUrl) { showToast("Адрес Worker ещё не настроен владельцем сайта."); renderAll(); return; }
  await connect();
  if (state.connected) {
    try { state.profile = await api("/api/profile", { method: "PUT", body: JSON.stringify(personalization) }); state.defaultModel = state.profile.defaultModel; localStorage.setItem("chat_default_model", state.defaultModel); if (!currentChat()) state.model = state.defaultModel; renderAll(); showToast("Настройки сохранены"); }
    catch (error) { showToast(error.message); }
  }
});
$("quotaCard").addEventListener("click", () => { $("limitsDialog").showModal(); closeMobile(); });
$("useResetButton").addEventListener("click", async () => {
  try {
    const result = await api("/api/reset", { method: "POST", body: "{}" });
    state.remaining = result.remaining;
    state.resetBalance = result.resetBalance;
    state.nextResetAt = result.nextResetAt;
    renderQuota();
    showToast("Дневной лимит восстановлен");
  } catch (error) { showToast(error.message); }
});
$("clearChats").addEventListener("click", async () => {
  if (!confirm("Удалить все чаты? Это действие нельзя отменить.")) return;
  if (state.connected) {
    try { await api("/api/chats", { method: "DELETE" }); }
    catch (error) { showToast(error.message); return; }
  }
  state.chats = [];
  state.currentId = null;
  $("settingsDialog").close();
  renderAll();
});
$("searchButton").addEventListener("click", () => { $("searchInput").value = ""; renderSearch(); $("searchDialog").showModal(); $("searchInput").focus(); });
$("closeSearch").addEventListener("click", () => $("searchDialog").close());
$("searchInput").addEventListener("input", renderSearch);
$("promptInput").addEventListener("input", () => { const input = $("promptInput"); input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 190)}px`; updateSend(); });
$("promptInput").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage(); } });
$("composerForm").addEventListener("submit", (event) => { event.preventDefault(); sendMessage(); });
$("attachButton").addEventListener("click", () => $("fileInput").click());
$("fileInput").addEventListener("change", (event) => {
  for (const file of event.target.files) {
    if (state.files.length >= 3) { showToast("Можно прикрепить до 3 файлов."); break; }
    if (file.size > 5 * 1024 * 1024) { showToast(`Файл «${file.name}» больше 5 МБ.`); continue; }
    state.files.push(file);
  }
  event.target.value = "";
  renderAttachments();
  updateSend();
});
$("suggestions").addEventListener("click", (event) => { const button = event.target.closest("[data-prompt]"); if (!button) return; $("promptInput").value = button.dataset.prompt; updateSend(); $("promptInput").focus(); });
