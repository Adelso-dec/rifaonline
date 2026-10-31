export function initTheme(toggleId = "theme-toggle") {
  const toggle = document.getElementById(toggleId);
  if (!toggle) return;

  const saved = localStorage.getItem("raffle-theme");
  if (saved) {
    document.documentElement.setAttribute("data-theme", saved);
    toggle.textContent = saved === "dark" ? "☀️" : "🌙";
  }

  toggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = current ? current === "dark" : prefersDark;
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("raffle-theme", next);
    toggle.textContent = next === "dark" ? "☀️" : "🌙";
  });
}
