import { defaultRaffleId, raffleInfo } from "./raffle-config.js";
import { isFirebaseConfigured } from "./firebase-init.js";
import { subscribeToNumbers, reserveNumber } from "./numbers-service.js";
import { subscribeToRaffle } from "./raffle-service.js";
import { getDefaultCampaignId } from "./campaign-service.js";
import { showToast } from "./toast.js";
import { initTheme } from "./theme.js";
import { attachPhoneMask, isValidPhone } from "./phone-mask.js";

// Qual campanha mostrar: ?rifa=ID na URL tem prioridade; senão usa a campanha
// marcada como padrão no painel admin; em último caso, cai no valor semente.
const urlRaffleId = new URLSearchParams(window.location.search).get("rifa");
let raffleId = urlRaffleId || defaultRaffleId;

let numbersOverrides = {}; // o que veio do Firestore, por número (string)
// título/prêmio/preço/data do sorteio/quantidade de números editáveis pelo admin
let currentSettings = { ...raffleInfo, showDrawDate: true };
let selectedNumber = null;
let countdownInterval = null;
let expireInterval = null;
let refreshInterval = null;

const grid = document.getElementById("numbers-grid");
const modalOverlay = document.getElementById("modal-overlay");
const modalClose = document.getElementById("modal-close");
const modalNumberBadge = document.getElementById("modal-number-badge");
const buyerForm = document.getElementById("buyer-form");
const stepForm = document.getElementById("step-form");
const stepPayment = document.getElementById("step-payment");
const submitButton = buyerForm.querySelector("button[type=submit]");

const ICONS = {
  check:
    '<svg class="cell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  clock:
    '<svg class="cell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>',
};

/* ---------------------------- Header ---------------------------- */
function applyRaffleSettings(settings) {
  currentSettings = { ...raffleInfo, showDrawDate: true, ...settings };
  renderHeader();
  restartCountdown();
  renderWinnerBanner();
  renderGrid();
}

function renderHeader() {
  document.getElementById("raffle-title").textContent = currentSettings.title;
  document.getElementById("raffle-prize").textContent = `Prêmio: ${currentSettings.prize}`;
  document.getElementById("raffle-price").textContent = currentSettings.priceLabel;
  document.getElementById("reservation-minutes-label").textContent = `${raffleInfo.reservationMinutes} minutos`;

  const showDrawDate = currentSettings.showDrawDate !== false;
  document.getElementById("draw-date-stat").classList.toggle("hidden", !showDrawDate);
  document.getElementById("stats-divider").classList.toggle("hidden", !showDrawDate);
}

function renderWinnerBanner() {
  const banner = document.getElementById("winner-banner");
  if (currentSettings.winnerNumber) {
    document.getElementById("winner-number").textContent = `Número ${String(currentSettings.winnerNumber).padStart(2, "0")}`;
    document.getElementById("winner-name").textContent = currentSettings.winnerName
      ? `Parabéns, ${currentSettings.winnerName}!`
      : "";
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

function restartCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  if (currentSettings.showDrawDate === false) return;

  const target = new Date(currentSettings.drawDateISO).getTime();
  const el = document.getElementById("countdown");

  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      el.textContent = "Encerrado";
      clearInterval(countdownInterval);
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    el.textContent = `${days}d ${hours}h ${minutes}m`;
  }

  tick();
  countdownInterval = setInterval(tick, 60 * 1000);
}

/* ---------------------------- Estado efetivo dos números ---------------------------- */
// Reservas expiradas voltam a contar como "available" no visual,
// mesmo que o documento no Firestore ainda diga "reserved"
// (a expiração "de fato" acontece na próxima tentativa de reserva, via transação).
function getEffectiveStatus(number) {
  const data = numbersOverrides[String(number)];
  if (!data) return "available";
  if (data.status === "reserved" && data.expiresAt && data.expiresAt.toMillis() < Date.now()) {
    return "available";
  }
  return data.status;
}

/* ---------------------------- Progresso ---------------------------- */
function updateProgress() {
  const total = currentSettings.totalNumbers;
  let taken = 0;
  for (let i = 1; i <= total; i++) {
    if (getEffectiveStatus(i) !== "available") taken++;
  }
  const percent = Math.round((taken / total) * 100);
  document.getElementById("progress-fill").style.width = `${percent}%`;
  document.getElementById("progress-label").textContent = `${taken} de ${total} números já garantidos`;
}

/* ---------------------------- Grade ---------------------------- */
function renderGrid() {
  grid.innerHTML = "";
  for (let i = 1; i <= currentSettings.totalNumbers; i++) {
    const status = getEffectiveStatus(i);
    const btn = document.createElement("button");
    btn.className = `number-cell ${status}`;
    btn.disabled = status !== "available";
    btn.setAttribute("aria-label", `Número ${i}, ${statusLabel(status)}`);

    let icon = "";
    if (status === "sold") icon = ICONS.check;
    if (status === "reserved") icon = ICONS.clock;

    btn.innerHTML = `${icon}${i}`;
    btn.addEventListener("click", () => openModal(i));
    grid.appendChild(btn);
  }
  updateProgress();
}

function statusLabel(status) {
  if (status === "sold") return "vendido";
  if (status === "reserved") return "reservado";
  return "disponível";
}

/* ---------------------------- Modal ---------------------------- */
function openModal(number) {
  if (getEffectiveStatus(number) !== "available") {
    showToast("Esse número não está mais disponível.");
    return;
  }
  selectedNumber = number;
  modalNumberBadge.textContent = String(number).padStart(2, "0");
  stepForm.classList.remove("hidden");
  stepPayment.classList.add("hidden");
  modalOverlay.classList.remove("hidden");
  document.getElementById("buyer-name").focus();
}

function closeModal() {
  selectedNumber = null;
  buyerForm.reset();
  modalOverlay.classList.add("hidden");
  if (expireInterval) clearInterval(expireInterval);
}

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (event) => {
  if (event.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalOverlay.classList.contains("hidden")) closeModal();
});

const buyerPhoneInput = document.getElementById("buyer-phone");
attachPhoneMask(buyerPhoneInput);

/* ---------------------------- Envio do formulário ---------------------------- */
buyerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedNumber) return;

  const name = document.getElementById("buyer-name").value.trim();
  const phone = buyerPhoneInput.value.trim();

  if (!isValidPhone(phone)) {
    showToast("Informe um WhatsApp válido: (xx)xxxxx-xxxx");
    buyerPhoneInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Reservando...";

  try {
    const expiresAtMs = await reserveNumber(raffleId, selectedNumber, name, phone, raffleInfo.reservationMinutes);
    showPaymentStep(expiresAtMs, name);
  } catch (error) {
    showToast(error.message || "Não foi possível reservar este número. Tente outro.");
    closeModal();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Reservar e gerar PIX";
  }
});

function showPaymentStep(expiresAtMs, name) {
  stepForm.classList.add("hidden");
  stepPayment.classList.remove("hidden");

  document.getElementById("pix-key").textContent = currentSettings.pixKey;

  const message = encodeURIComponent(
    `Olá! Sou ${name} e quero enviar o comprovante do número ${selectedNumber} da ${currentSettings.title}.`
  );
  document.getElementById("whatsapp-link").href = `https://wa.me/${currentSettings.adminWhatsapp}?text=${message}`;

  const expireEl = document.getElementById("expire-time");
  if (expireInterval) clearInterval(expireInterval);

  function tick() {
    const diff = expiresAtMs - Date.now();
    if (diff <= 0) {
      expireEl.textContent = "00:00";
      clearInterval(expireInterval);
      return;
    }
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    expireEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  tick();
  expireInterval = setInterval(tick, 1000);
}

document.getElementById("copy-pix").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentSettings.pixKey);
    showToast("Chave PIX copiada!");
  } catch {
    showToast("Não foi possível copiar automaticamente.");
  }
});

document.getElementById("finish-btn").addEventListener("click", () => {
  showToast(`Número ${selectedNumber} reservado com sucesso!`);
  closeModal();
});

/* ---------------------------- Init ---------------------------- */
async function init() {
  initTheme();
  applyRaffleSettings(null);

  if (!isFirebaseConfigured) {
    showToast("⚠️ Configure as credenciais do Firebase em js/firebase-config.js");
    return;
  }

  if (!urlRaffleId) {
    try {
      const defaultId = await getDefaultCampaignId();
      if (defaultId) raffleId = defaultId;
    } catch (error) {
      console.error(error);
    }
  }

  subscribeToNumbers(
    raffleId,
    (overrides) => {
      numbersOverrides = overrides;
      renderGrid();
    },
    (error) => {
      console.error(error);
      showToast("Erro ao sincronizar com o banco de dados.");
    }
  );

  subscribeToRaffle(raffleId, applyRaffleSettings, (error) => {
    console.error(error);
  });

  // Reavalia reservas expiradas periodicamente, mesmo sem novas atualizações do Firestore
  refreshInterval = setInterval(renderGrid, 15000);
}

init();
