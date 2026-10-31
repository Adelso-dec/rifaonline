import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { db } from "./firebase-init.js";

// Dados "editáveis" da rifa (nome, prêmio, preço, data do sorteio) ficam em
// raffles/{raffleId}. Campos que não mudam no dia a dia (chave PIX, WhatsApp
// do organizador, minutos de reserva) continuam em js/raffle-config.js.

function raffleRef(raffleId) {
  return doc(db, "raffles", raffleId);
}

export function subscribeToRaffle(raffleId, onChange, onError) {
  return onSnapshot(
    raffleRef(raffleId),
    (snap) => onChange(snap.exists() ? snap.data() : null),
    onError
  );
}

export async function getRaffleSettings(raffleId) {
  const snap = await getDoc(raffleRef(raffleId));
  return snap.exists() ? snap.data() : null;
}

export async function saveRaffleSettings(raffleId, settings) {
  await setDoc(raffleRef(raffleId), settings, { merge: true });
}

export async function resetWinner(raffleId) {
  await setDoc(raffleRef(raffleId), { winnerNumber: null, winnerName: null, winnerDrawnAt: null }, { merge: true });
}
