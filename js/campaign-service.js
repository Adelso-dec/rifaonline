import {
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { db } from "./firebase-init.js";

// Cada campanha é um documento em raffles/{raffleId} (já usado desde a Fase 2
// para nome/prêmio/preço/etc). Esse arquivo cuida da parte "multi-campanha":
// listar todas, criar novas, e saber qual é a campanha padrão (a que a página
// pública mostra quando o link não traz ?rifa=ID).

const appMetaRef = () => doc(db, "meta", "app");

export function slugify(text) {
  const base = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return base.slice(0, 60) || "rifa";
}

export async function listCampaigns() {
  const snapshot = await getDocs(collection(db, "raffles"));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function campaignExists(raffleId) {
  const snap = await getDoc(doc(db, "raffles", raffleId));
  return snap.exists();
}

export async function createCampaign(raffleId, settings) {
  await setDoc(doc(db, "raffles", raffleId), settings);
}

export async function getDefaultCampaignId() {
  const snap = await getDoc(appMetaRef());
  return snap.exists() ? snap.data().defaultRaffleId || null : null;
}

export async function setDefaultCampaignId(raffleId) {
  await setDoc(appMetaRef(), { defaultRaffleId: raffleId }, { merge: true });
}

// Apaga só o documento da campanha (título/prêmio/etc). Os números e contatos
// devem ser apagados à parte, com resetAllNumbers (js/numbers-service.js),
// antes de chamar isso — ver o botão "Apagar campanha" em js/admin.js.
export async function deleteCampaignDoc(raffleId) {
  await deleteDoc(doc(db, "raffles", raffleId));
}
