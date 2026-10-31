// Valores "semente" usados para criar a primeira campanha (e como último
// recurso se o Firestore estiver vazio/indisponível). Depois de criada, cada
// campanha vive inteiramente no Firestore (raffles/{raffleId}) e é editável
// pelo painel admin — ver js/campaign-service.js.

export const defaultRaffleId = "rifa-exemplo";

export const raffleInfo = {
  title: "Rifa Beneficente",
  prize: "iPhone 15 128GB",
  priceLabel: "R$ 10,00",
  drawDateISO: "2026-11-30T20:00:00",
  pixKey: "rifa.exemplo@pix.com",
  adminWhatsapp: "5511999999999", // trocar pelo número real do organizador
  reservationMinutes: 30,
  totalNumbers: 100,
};
