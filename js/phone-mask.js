export function formatPhone(digits) {
  let out = "";
  if (digits.length > 0) out += "(" + digits.slice(0, 2);
  if (digits.length >= 2) out += ")";
  if (digits.length > 2) out += digits.slice(2, 7);
  if (digits.length > 7) out += "-" + digits.slice(7, 11);
  return out;
}

export function attachPhoneMask(input) {
  input.addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
    event.target.value = formatPhone(digits);
  });
  input.addEventListener("paste", (event) => {
    event.preventDefault();
    const pasted = (event.clipboardData || window.clipboardData).getData("text");
    const digits = pasted.replace(/\D/g, "").slice(0, 11);
    event.target.value = formatPhone(digits);
  });
}

export function isValidPhone(value) {
  return value.replace(/\D/g, "").length === 11;
}
