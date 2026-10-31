import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { db } from "./firebase-init.js";

// Cada número tem dois documentos:
// - raffles/{raffleId}/numbers/{n}            -> público: { status, expiresAt }
// - raffles/{raffleId}/numbers/{n}/private/contact -> privado: { buyerName, buyerPhone, reservedAt }
// Essa separação existe para que a página pública nunca exponha nome/telefone do comprador
// (as regras do Firestore só permitem leitura do documento "private/contact" para o admin autenticado).

function numberRef(raffleId, number) {
  return doc(db, "raffles", raffleId, "numbers", String(number));
}

function contactRef(raffleId, number) {
  return doc(db, "raffles", raffleId, "numbers", String(number), "private", "contact");
}

// Observa em tempo real o status público de todos os números de uma rifa.
// Números sem documento são considerados "available" pelo chamador.
export function subscribeToNumbers(raffleId, onChange, onError) {
  const numbersRef = collection(db, "raffles", raffleId, "numbers");
  return onSnapshot(
    numbersRef,
    (snapshot) => {
      const overrides = {};
      snapshot.forEach((docSnap) => {
        overrides[docSnap.id] = docSnap.data();
      });
      onChange(overrides);
    },
    onError
  );
}

// Reserva um número (fluxo público, sem login) usando uma transação,
// para evitar que duas pessoas reservem o mesmo número ao mesmo tempo.
export async function reserveNumber(raffleId, number, buyerName, buyerPhone, reservationMinutes) {
  const pubRef = numberRef(raffleId, number);
  const privRef = contactRef(raffleId, number);
  const expiresAt = Timestamp.fromMillis(Date.now() + reservationMinutes * 60 * 1000);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(pubRef);

    if (snap.exists()) {
      const data = snap.data();
      const reservationExpired =
        data.status === "reserved" && data.expiresAt && data.expiresAt.toMillis() < Date.now();

      if (data.status === "sold") {
        throw new Error("Este número já foi vendido.");
      }
      if (data.status === "reserved" && !reservationExpired) {
        throw new Error("Este número acabou de ser reservado por outra pessoa.");
      }
    }

    transaction.set(pubRef, { status: "reserved", expiresAt });
    transaction.set(privRef, { buyerName, buyerPhone, reservedAt: serverTimestamp() });
  });

  return expiresAt.toMillis();
}

/* ------------------------- Operações do painel admin ------------------------- */
/* Exigem usuário autenticado — reforçado pelas regras do Firestore (firestore.rules). */

export async function getContact(raffleId, number) {
  const snap = await getDoc(contactRef(raffleId, number));
  return snap.exists() ? snap.data() : null;
}

export async function confirmPayment(raffleId, number) {
  await updateDoc(numberRef(raffleId, number), { status: "sold" });
}

export async function releaseNumber(raffleId, number) {
  await deleteDoc(numberRef(raffleId, number));
  await deleteDoc(contactRef(raffleId, number));
}

export async function markSoldDirectly(raffleId, number, buyerName, buyerPhone) {
  await setDoc(numberRef(raffleId, number), { status: "sold" });
  await setDoc(contactRef(raffleId, number), { buyerName, buyerPhone, reservedAt: serverTimestamp() });
}

// Apaga reservas/vendas de todos os números de uma campanha (não mexe nas
// configurações da rifa). Usado para "resetar" uma campanha antes de reusá-la.
export async function resetAllNumbers(raffleId, totalNumbers) {
  const tasks = [];
  for (let i = 1; i <= totalNumbers; i++) {
    tasks.push(releaseNumber(raffleId, i));
  }
  await Promise.all(tasks);
}
