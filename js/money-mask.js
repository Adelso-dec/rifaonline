// Máscara "estilo banco": o usuário digita só números e eles são
// interpretados da direita pra esquerda como centavos (ex: "1000" -> R$ 10,00).

export function formatMoney(digitsStr) {
  let digits = digitsStr.replace(/\D/g, "");
  digits = digits.replace(/^0+(?=\d)/, "");
  while (digits.length < 3) digits = "0" + digits;

  const cents = digits.slice(-2);
  const integerPart = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `R$ ${integerPart},${cents}`;
}

export function attachMoneyMask(input) {
  input.addEventListener("input", (event) => {
    event.target.value = formatMoney(event.target.value);
  });
  input.addEventListener("paste", (event) => {
    event.preventDefault();
    const pasted = (event.clipboardData || window.clipboardData).getData("text");
    event.target.value = formatMoney(pasted);
  });
  input.addEventListener("focus", () => {
    // mantém o cursor sempre no fim, já que os dígitos entram pela direita
    requestAnimationFrame(() => {
      input.selectionStart = input.selectionEnd = input.value.length;
    });
  });
}
