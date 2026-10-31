import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { auth, isFirebaseConfigured } from "./firebase-init.js";
import { defaultRaffleId, raffleInfo } from "./raffle-config.js";
import {
  subscribeToNumbers,
  confirmPayment,
  releaseNumber,
  markSoldDirectly,
  getContact,
  resetAllNumbers,
} from "./numbers-service.js";
import { getRaffleSettings, saveRaffleSettings, resetWinner } from "./raffle-service.js";
import {
  listCampaigns,
  createCampaign,
  campaignExists,
  getDefaultCampaignId,
  setDefaultCampaignId,
  deleteCampaignDoc,
  slugify,
} from "./campaign-service.js";
import { showToast } from "./toast.js";
import { initTheme } from "./theme.js";
import { attachPhoneMask, isValidPhone, formatPhone } from "./phone-mask.js";
import { attachMoneyMask, formatMoney } from "./money-mask.js";

const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

const manualSaleModal = document.getElementById("manual-sale-modal");
const manualSaleForm = document.getElementById("manual-sale-form");
const manualSaleBadge = document.getElementById("manual-sale-badge");
const manualSalePhoneInput = document.getElementById("manual-sale-phone");
const manualSaleSubmit = manualSaleForm.querySelector("button[type=submit]");

const settingsForm = document.getElementById("settings-form");
const drawButton = document.getElementById("draw-button");
const drawResult = document.getElementById("draw-result");

const campaignSelect = document.getElementById("campaign-select");
const campaignDefaultNote = document.getElementById("campaign-default-note");
const newCampaignModal = document.getElementById("new-campaign-modal");
const newCampaignForm = document.getElementById("new-campaign-form");

let currentRaffleId = null;
let campaigns = [];
let defaultCampaignId = null;
let raffleSettingsCache = null;

let numbersOverrides = {};
const contactsCache = {};
let unsubscribeNumbers = null;
let currentFilter = "all";
let searchTerm = "";
let manualSaleNumber = null;
let renderToken = 0;

initTheme();
attachPhoneMask(manualSalePhoneInput);
attachPhoneMask(document.getElementById("settings-admin-whatsapp"));
attachMoneyMask(document.getElementById("settings-price"));

if (!isFirebaseConfigured) {
  showToast("⚠️ Configure as credenciais do Firebase em js/firebase-config.js");
}

/* ---------------------------- Autenticação ---------------------------- */
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.classList.add("hidden");

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    loginError.textContent = "E-mail ou senha inválidos.";
    loginError.classList.remove("hidden");
  }
});

document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    initCampaigns();
  } else {
    dashboardView.classList.add("hidden");
    loginView.classList.remove("hidden");
    if (unsubscribeNumbers) unsubscribeNumbers();
  }
});

/* ---------------------------- Campanhas ---------------------------- */
async function initCampaigns() {
  try {
    campaigns = await listCampaigns();

    if (campaigns.length === 0) {
      // Primeira vez usando o painel: cria a campanha semente para começar.
      const seed = { ...raffleInfo, showDrawDate: true };
      await createCampaign(defaultRaffleId, seed);
      campaigns = [{ id: defaultRaffleId, ...seed }];
    }

    defaultCampaignId = await getDefaultCampaignId().catch(() => null);

    renderCampaignOptions();

    const urlRaffleId = new URLSearchParams(window.location.search).get("rifa");
    const initialId =
      (urlRaffleId && campaigns.some((c) => c.id === urlRaffleId) && urlRaffleId) ||
      (defaultCampaignId && campaigns.some((c) => c.id === defaultCampaignId) && defaultCampaignId) ||
      campaigns[0].id;

    await switchCampaign(initialId);
  } catch (error) {
    console.error(error);
    showToast("Erro ao carregar campanhas.");
  }
}

function renderCampaignOptions() {
  campaignSelect.innerHTML = "";
  campaigns.forEach((campaign) => {
    const option = document.createElement("option");
    option.value = campaign.id;
    option.textContent = campaign.title || campaign.id;
    campaignSelect.appendChild(option);
  });
}

function updateCampaignNote() {
  if (currentRaffleId === defaultCampaignId) {
    campaignDefaultNote.textContent = "Esta é a campanha padrão (aberta quando o link não tem ?rifa=).";
    document.getElementById("set-default-btn").disabled = true;
  } else {
    campaignDefaultNote.textContent = "";
    document.getElementById("set-default-btn").disabled = false;
  }
}

async function switchCampaign(raffleId) {
  if (unsubscribeNumbers) unsubscribeNumbers();

  currentRaffleId = raffleId;
  numbersOverrides = {};
  Object.keys(contactsCache).forEach((key) => delete contactsCache[key]);

  campaignSelect.value = raffleId;

  const url = new URL(window.location.href);
  url.searchParams.set("rifa", raffleId);
  window.history.replaceState(null, "", url);

  updateCampaignNote();

  unsubscribeNumbers = subscribeToNumbers(
    raffleId,
    (overrides) => {
      numbersOverrides = overrides;
      renderTable();
    },
    (error) => {
      console.error(error);
      showToast("Erro ao carregar dados da rifa.");
    }
  );

  await loadSettingsForm();
}

campaignSelect.addEventListener("change", (event) => {
  switchCampaign(event.target.value);
});

document.getElementById("copy-link-btn").addEventListener("click", async () => {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/admin\.html$/, "index.html");
  url.search = `?rifa=${currentRaffleId}`;

  try {
    await navigator.clipboard.writeText(url.toString());
    showToast("Link público copiado!");
  } catch (error) {
    console.error(error);
    showToast("Não foi possível copiar o link.");
  }
});

document.getElementById("set-default-btn").addEventListener("click", async () => {
  try {
    await setDefaultCampaignId(currentRaffleId);
    defaultCampaignId = currentRaffleId;
    updateCampaignNote();
    showToast("Campanha definida como padrão!");
  } catch (error) {
    console.error(error);
    showToast("Erro ao definir campanha padrão.");
  }
});

document.getElementById("new-campaign-btn").addEventListener("click", () => {
  newCampaignForm.reset();
  newCampaignModal.classList.remove("hidden");
  document.getElementById("new-campaign-name").focus();
});

document.getElementById("new-campaign-close").addEventListener("click", closeNewCampaignModal);
newCampaignModal.addEventListener("click", (event) => {
  if (event.target === newCampaignModal) closeNewCampaignModal();
});

function closeNewCampaignModal() {
  newCampaignModal.classList.add("hidden");
}

newCampaignForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("new-campaign-name").value.trim();
  if (!name) {
    showToast("Dê um nome para a nova campanha.");
    return;
  }

  const submitBtn = newCampaignForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Criando...";

  try {
    const baseSlug = slugify(name);
    let candidateId = baseSlug;
    let suffix = 2;
    while (await campaignExists(candidateId)) {
      candidateId = `${baseSlug}-${suffix}`;
      suffix++;
      if (suffix > 50) throw new Error("Não foi possível gerar um identificador único.");
    }

    const seed = { ...raffleInfo, title: name, showDrawDate: true };
    await createCampaign(candidateId, seed);

    campaigns.push({ id: candidateId, ...seed });
    renderCampaignOptions();
    closeNewCampaignModal();
    await switchCampaign(candidateId);
    showToast("Campanha criada! Agora configure prêmio, preço e demais detalhes.");
  } catch (error) {
    console.error(error);
    showToast("Erro ao criar campanha.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Criar campanha";
  }
});

/* ---------------------------- Configurações da rifa ---------------------------- */
function toDatetimeLocalValue(iso) {
  const date = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// O WhatsApp é guardado com DDI (ex: "5511999998888", usado no link wa.me),
// mas o campo do formulário mostra/edita só o formato local (xx)xxxxx-xxxx.
function toLocalWhatsappDigits(fullDigits) {
  if (!fullDigits) return "";
  return fullDigits.startsWith("55") && fullDigits.length === 13 ? fullDigits.slice(2) : fullDigits;
}

async function loadSettingsForm() {
  let settings = null;
  try {
    settings = await getRaffleSettings(currentRaffleId);
  } catch (error) {
    console.error(error);
  }

  const merged = { ...raffleInfo, showDrawDate: true, ...settings };
  raffleSettingsCache = merged;

  document.getElementById("settings-title").value = merged.title;
  document.getElementById("settings-prize").value = merged.prize;
  document.getElementById("settings-price").value = formatMoney(merged.priceLabel);
  document.getElementById("settings-draw-date").value = toDatetimeLocalValue(merged.drawDateISO);
  document.getElementById("settings-pix-key").value = merged.pixKey;
  document.getElementById("settings-admin-whatsapp").value = formatPhone(toLocalWhatsappDigits(merged.adminWhatsapp));
  document.getElementById("settings-total-numbers").value = merged.totalNumbers;
  document.getElementById("settings-show-draw-date").checked = merged.showDrawDate !== false;

  document.getElementById("admin-raffle-title").textContent = merged.title;
  renderDrawSection();
}

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = document.getElementById("settings-title").value.trim();
  const prize = document.getElementById("settings-prize").value.trim();
  const priceLabel = document.getElementById("settings-price").value.trim();
  const drawDateValue = document.getElementById("settings-draw-date").value;
  const pixKey = document.getElementById("settings-pix-key").value.trim();
  const adminWhatsappInput = document.getElementById("settings-admin-whatsapp").value.trim();
  const totalNumbersInput = document.getElementById("settings-total-numbers").value;
  const showDrawDate = document.getElementById("settings-show-draw-date").checked;

  if (!title || !prize || !priceLabel || !drawDateValue || !pixKey || !totalNumbersInput) {
    showToast("Preencha todos os campos da rifa.");
    return;
  }

  if (!isValidPhone(adminWhatsappInput)) {
    showToast("Informe um WhatsApp do organizador válido: (xx)xxxxx-xxxx");
    return;
  }

  const totalNumbers = parseInt(totalNumbersInput, 10);
  if (!Number.isInteger(totalNumbers) || totalNumbers < 10 || totalNumbers > 1000) {
    showToast("A quantidade de números deve ser um valor entre 10 e 1000.");
    return;
  }

  const submitBtn = settingsForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Salvando...";

  const updatedFields = {
    title,
    prize,
    priceLabel,
    drawDateISO: new Date(drawDateValue).toISOString(),
    pixKey,
    adminWhatsapp: "55" + adminWhatsappInput.replace(/\D/g, ""),
    totalNumbers,
    showDrawDate,
  };

  try {
    await saveRaffleSettings(currentRaffleId, updatedFields);
    raffleSettingsCache = { ...raffleSettingsCache, ...updatedFields };
    document.getElementById("admin-raffle-title").textContent = title;

    const campaignInList = campaigns.find((c) => c.id === currentRaffleId);
    if (campaignInList) campaignInList.title = title;
    renderCampaignOptions();
    campaignSelect.value = currentRaffleId;

    renderTable();
    showToast("Configurações da rifa salvas!");
  } catch (error) {
    console.error(error);
    showToast("Erro ao salvar configurações.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Salvar configurações";
  }
});

/* ---------------------------- Estado efetivo ---------------------------- */
function getTotalNumbers() {
  return (raffleSettingsCache && raffleSettingsCache.totalNumbers) || raffleInfo.totalNumbers;
}

function getEffectiveStatus(number) {
  const data = numbersOverrides[String(number)];
  if (!data) return "available";
  if (data.status === "reserved" && data.expiresAt && data.expiresAt.toMillis() < Date.now()) {
    return "available";
  }
  return data.status;
}

function statusLabel(status) {
  if (status === "sold") return "Vendido";
  if (status === "reserved") return "Reservado";
  return "Disponível";
}

/* ---------------------------- Tabela ---------------------------- */
async function renderTable() {
  const token = ++renderToken; // evita condição de corrida entre renderizações concorrentes
  const tbody = document.getElementById("numbers-tbody");
  const total = getTotalNumbers();
  const counts = { available: 0, reserved: 0, sold: 0 };
  const rowsToRender = [];

  for (let i = 1; i <= total; i++) {
    const status = getEffectiveStatus(i);
    counts[status]++;

    if (currentFilter !== "all" && status !== currentFilter) continue;
    if (searchTerm && !String(i).includes(searchTerm)) continue;

    rowsToRender.push({ number: i, status, data: numbersOverrides[String(i)] });
  }

  document.getElementById("summary-available").textContent = counts.available;
  document.getElementById("summary-reserved").textContent = counts.reserved;
  document.getElementById("summary-sold").textContent = counts.sold;

  const rowElements = await Promise.all(rowsToRender.map(buildRow));
  if (token !== renderToken) return; // uma renderização mais nova já começou, descarta esta

  tbody.innerHTML = "";
  rowElements.forEach((tr) => tbody.appendChild(tr));
}

async function buildRow({ number, status, data }) {
  let contact = null;
  if (status !== "available") {
    if (!(number in contactsCache)) {
      contactsCache[number] = await getContact(currentRaffleId, number).catch(() => null);
    }
    contact = contactsCache[number];
  }

  const expireLabel =
    status === "reserved" && data && data.expiresAt
      ? new Date(data.expiresAt.toMillis()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "—";

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="col-number">${String(number).padStart(2, "0")}</td>
    <td><span class="status-badge ${status}">${statusLabel(status)}</span></td>
    <td>${contact?.buyerName || "—"}</td>
    <td>${contact?.buyerPhone || "—"}</td>
    <td>${expireLabel}</td>
    <td class="col-actions"></td>
  `;

  const actionsCell = tr.querySelector(".col-actions");
  if (status === "reserved") {
    actionsCell.appendChild(makeButton("Confirmar pagamento", "btn-primary-sm", () => handleConfirm(number)));
    actionsCell.appendChild(makeButton("Cancelar", "btn-ghost-sm", () => handleRelease(number)));
  } else if (status === "sold") {
    actionsCell.appendChild(makeButton("Desfazer venda", "btn-ghost-sm", () => handleRelease(number)));
  } else {
    actionsCell.appendChild(makeButton("Vender manualmente", "btn-ghost-sm", () => openManualSale(number)));
  }

  return tr;
}

function makeButton(label, className, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.className = className;
  btn.addEventListener("click", onClick);
  return btn;
}

/* ---------------------------- Ações ---------------------------- */
async function handleConfirm(number) {
  try {
    await confirmPayment(currentRaffleId, number);
    showToast(`Número ${number} confirmado como vendido.`);
  } catch (error) {
    console.error(error);
    showToast("Erro ao confirmar pagamento.");
  }
}

async function handleRelease(number) {
  if (!window.confirm(`Tem certeza que deseja liberar o número ${number}?`)) return;
  try {
    await releaseNumber(currentRaffleId, number);
    delete contactsCache[number];
    showToast(`Número ${number} liberado.`);
  } catch (error) {
    console.error(error);
    showToast("Erro ao liberar número.");
  }
}

function openManualSale(number) {
  manualSaleNumber = number;
  manualSaleBadge.textContent = String(number).padStart(2, "0");
  manualSaleModal.classList.remove("hidden");
}

function closeManualSale() {
  manualSaleNumber = null;
  manualSaleForm.reset();
  manualSaleModal.classList.add("hidden");
}

document.getElementById("manual-sale-close").addEventListener("click", closeManualSale);
manualSaleModal.addEventListener("click", (event) => {
  if (event.target === manualSaleModal) closeManualSale();
});

manualSaleForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("manual-sale-name").value.trim();
  const phone = manualSalePhoneInput.value.trim();

  if (!isValidPhone(phone)) {
    showToast("Informe um WhatsApp válido: (xx)xxxxx-xxxx");
    return;
  }

  manualSaleSubmit.disabled = true;
  manualSaleSubmit.textContent = "Salvando...";

  try {
    await markSoldDirectly(currentRaffleId, manualSaleNumber, name, phone);
    delete contactsCache[manualSaleNumber];
    showToast(`Número ${manualSaleNumber} registrado como vendido.`);
    closeManualSale();
  } catch (error) {
    console.error(error);
    showToast("Erro ao registrar venda.");
  } finally {
    manualSaleSubmit.disabled = false;
    manualSaleSubmit.textContent = "Confirmar venda";
  }
});

/* ---------------------------- Filtros e busca ---------------------------- */
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderTable();
  });
});

document.getElementById("search-input").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim();
  renderTable();
});

/* ---------------------------- Exportar CSV ---------------------------- */
document.getElementById("export-csv").addEventListener("click", async () => {
  const lines = ["Numero,Status,Nome,WhatsApp"];
  const total = getTotalNumbers();

  for (let i = 1; i <= total; i++) {
    const status = getEffectiveStatus(i);
    if (status === "available") continue;

    if (!(i in contactsCache)) {
      contactsCache[i] = await getContact(currentRaffleId, i).catch(() => null);
    }
    const contact = contactsCache[i] || {};
    lines.push([i, statusLabel(status), escapeCsv(contact.buyerName), escapeCsv(contact.buyerPhone)].join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `compradores-${currentRaffleId}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

function escapeCsv(value) {
  if (!value) return "";
  const str = String(value);
  return str.includes(",") ? `"${str.replace(/"/g, '""')}"` : str;
}

/* ---------------------------- Sorteio ---------------------------- */
function renderDrawSection() {
  if (!raffleSettingsCache || !raffleSettingsCache.winnerNumber) {
    drawResult.classList.add("hidden");
    drawButton.textContent = "Realizar sorteio";
    return;
  }

  drawResult.classList.remove("hidden");
  drawButton.textContent = "Sortear novamente";
  document.getElementById("draw-result-number").textContent = String(raffleSettingsCache.winnerNumber).padStart(2, "0");
  document.getElementById("draw-result-name").textContent = raffleSettingsCache.winnerName || "—";
  document.getElementById("draw-result-date").textContent = raffleSettingsCache.winnerDrawnAt
    ? `Sorteado em ${new Date(raffleSettingsCache.winnerDrawnAt).toLocaleString("pt-BR")}`
    : "";
}

drawButton.addEventListener("click", async () => {
  const total = getTotalNumbers();
  const soldNumbers = [];
  for (let i = 1; i <= total; i++) {
    if (getEffectiveStatus(i) === "sold") soldNumbers.push(i);
  }

  if (soldNumbers.length === 0) {
    showToast("Nenhum número vendido ainda para sortear.");
    return;
  }

  const hasWinner = raffleSettingsCache && raffleSettingsCache.winnerNumber;
  const confirmMessage = hasWinner
    ? "Já existe um número sorteado. Deseja sortear novamente e substituir o resultado?"
    : `Sortear um vencedor entre os ${soldNumbers.length} números vendidos?`;
  if (!window.confirm(confirmMessage)) return;

  drawButton.disabled = true;
  drawResult.classList.remove("hidden");
  document.getElementById("draw-result-name").textContent = "Sorteando...";
  document.getElementById("draw-result-date").textContent = "";

  // pequena animação: troca o número exibido antes de revelar o resultado final
  const animationTimer = setInterval(() => {
    const randomPick = soldNumbers[Math.floor(Math.random() * soldNumbers.length)];
    document.getElementById("draw-result-number").textContent = String(randomPick).padStart(2, "0");
  }, 80);

  await new Promise((resolve) => setTimeout(resolve, 1600));
  clearInterval(animationTimer);

  const winnerNumber = soldNumbers[Math.floor(Math.random() * soldNumbers.length)];
  let winnerName = "—";
  try {
    const contact = await getContact(currentRaffleId, winnerNumber);
    winnerName = contact?.buyerName || "—";
  } catch (error) {
    console.error(error);
  }

  const winnerDrawnAt = new Date().toISOString();

  try {
    await saveRaffleSettings(currentRaffleId, { winnerNumber, winnerName, winnerDrawnAt });
    raffleSettingsCache = { ...raffleSettingsCache, winnerNumber, winnerName, winnerDrawnAt };
    renderDrawSection();
    showToast(`🎉 Número ${winnerNumber} sorteado!`);
  } catch (error) {
    console.error(error);
    showToast("Erro ao salvar o resultado do sorteio.");
  } finally {
    drawButton.disabled = false;
  }
});

/* ---------------------------- Resetar campanha ---------------------------- */
document.getElementById("reset-campaign-btn").addEventListener("click", async () => {
  const title = raffleSettingsCache?.title || currentRaffleId;
  const confirmed = window.confirm(
    `Isso vai apagar TODAS as reservas/vendas e o resultado do sorteio da campanha "${title}". ` +
      "As configurações (nome, prêmio, preço, etc.) são mantidas. Essa ação não pode ser desfeita. Continuar?"
  );
  if (!confirmed) return;

  const btn = document.getElementById("reset-campaign-btn");
  btn.disabled = true;
  btn.textContent = "Resetando...";

  try {
    await resetAllNumbers(currentRaffleId, getTotalNumbers());
    await resetWinner(currentRaffleId);
    Object.keys(contactsCache).forEach((key) => delete contactsCache[key]);
    raffleSettingsCache = { ...raffleSettingsCache, winnerNumber: null, winnerName: null, winnerDrawnAt: null };
    renderDrawSection();
    showToast("Campanha resetada! Todos os números voltaram a ficar disponíveis.");
  } catch (error) {
    console.error(error);
    showToast("Erro ao resetar a campanha.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Resetar números desta campanha";
  }
});

/* ---------------------------- Apagar campanha ---------------------------- */
document.getElementById("delete-campaign-btn").addEventListener("click", async () => {
  if (campaigns.length <= 1) {
    showToast("Não é possível apagar a única campanha existente.");
    return;
  }

  const title = raffleSettingsCache?.title || currentRaffleId;
  const confirmed = window.confirm(
    `Isso vai apagar PERMANENTEMENTE a campanha "${title}", incluindo configurações, números, vendas e o ` +
      "resultado do sorteio. Essa ação não pode ser desfeita. Continuar?"
  );
  if (!confirmed) return;

  const typed = window.prompt(`Para confirmar, digite o nome exato da campanha: "${title}"`);
  if (typed !== title) {
    showToast("Nome não confere. Nada foi apagado.");
    return;
  }

  const btn = document.getElementById("delete-campaign-btn");
  btn.disabled = true;
  btn.textContent = "Apagando...";

  const deletedId = currentRaffleId;

  try {
    await resetAllNumbers(deletedId, getTotalNumbers());
    await deleteCampaignDoc(deletedId);

    campaigns = campaigns.filter((c) => c.id !== deletedId);
    if (defaultCampaignId === deletedId) defaultCampaignId = null;

    renderCampaignOptions();
    await switchCampaign(campaigns[0].id);
    showToast(`Campanha "${title}" apagada.`);
  } catch (error) {
    console.error(error);
    showToast("Erro ao apagar a campanha.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Apagar esta campanha";
  }
});

// Reavalia reservas expiradas periodicamente, mesmo sem novas atualizações do Firestore
setInterval(() => {
  if (!dashboardView.classList.contains("hidden")) renderTable();
}, 15000);
