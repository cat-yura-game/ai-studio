const apiBase = String(window.CHAT_API_URL || "").replace(/\/$/, "");
const $ = (id) => document.getElementById(id);
const match = location.hash.match(/(?:^#|&)invite=([^&]+)/);
if (match) { localStorage.setItem("admin_access_token", decodeURIComponent(match[1])); history.replaceState(null, "", location.pathname + location.search); }
const token = localStorage.getItem("admin_access_token") || "";

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ошибка сервера.");
  return data;
}
function status(message) { $("status").textContent = message; }
function renderUsers(users, cap) {
  const holder = $("usersList");
  holder.replaceChildren();
  for (const user of users) {
    const row = document.createElement("div"); row.className = "admin-user";
    const identity = document.createElement("div"); identity.className = "identity";
    const name = document.createElement("strong"); name.textContent = user.display_name || (user.role === "admin" ? "Администратор" : "Пользователь");
    const uid = document.createElement("small"); uid.textContent = user.id;
    identity.append(name, uid);
    const right = document.createElement("div"); right.className = "right";
    const balance = document.createElement("span"); balance.textContent = `Сбросы: ${user.reset_balance}/${cap}`;
    const grant = document.createElement("button"); grant.type = "button"; grant.className = "outline-button"; grant.textContent = "+1 сброс"; grant.disabled = user.reset_balance >= cap;
    grant.addEventListener("click", async () => { try { const result = await api(`/api/admin/users/${user.id}/grant`, { method: "POST", body: "{}" }); user.reset_balance = result.resetBalance; balance.textContent = `Сбросы: ${user.reset_balance}/${cap}`; grant.disabled = user.reset_balance >= cap; status("Сброс начислен."); } catch (error) { status(error.message); } });
    right.append(balance, grant); row.append(identity, right); holder.append(row);
  }
}
async function load() {
  if (!apiBase) { status("Адрес Worker ещё не настроен в config.js."); return; }
  if (!token) { status("Откройте админку по личной ссылке администратора."); return; }
  try {
    const [policy, people] = await Promise.all([api("/api/admin/settings"), api("/api/admin/users")]);
    const settings = policy.settings;
    $("dailyLimit").value = settings.daily_limit;
    $("resetIntervalDays").value = settings.reset_interval_days;
    $("resetCap").value = settings.reset_cap;
    $("resetGrantAmount").value = settings.reset_grant_amount;
    renderUsers(people.users, settings.reset_cap);
    $("settingsCard").classList.remove("hidden");
    $("usersCard").classList.remove("hidden");
    status("Изменения сохраняются сразу для всех пользователей.");
  } catch (error) { status(error.message); }
}
$("policyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ dailyLimit: Number($("dailyLimit").value), resetIntervalDays: Number($("resetIntervalDays").value), resetCap: Number($("resetCap").value), resetGrantAmount: Number($("resetGrantAmount").value) }) });
    status("Правила сохранены.");
    await load();
  } catch (error) { status(error.message); }
});
$("createInvite").addEventListener("click", async () => {
  try {
    const result = await api("/api/admin/invite", { method: "POST", body: "{}" });
    const url = new URL("./", location.href);
    url.hash = `invite=${result.token}`;
    $("inviteOutput").value = url.toString();
    $("inviteBox").classList.remove("hidden");
    status("Новая личная ссылка создана.");
    const people = await api("/api/admin/users");
    renderUsers(people.users, Number($("resetCap").value));
  } catch (error) { status(error.message); }
});
$("copyInvite").addEventListener("click", async () => { await navigator.clipboard.writeText($("inviteOutput").value); status("Ссылка скопирована."); });
load();
