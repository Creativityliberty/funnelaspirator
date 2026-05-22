const btn = document.getElementById("copy");
const status = document.getElementById("status");
const urlBox = document.getElementById("url");

btn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  if (!url) {
    status.textContent = "Impossible de lire l'URL.";
    return;
  }
  await navigator.clipboard.writeText(url);
  urlBox.textContent = url;
  status.className = "ok";
  status.textContent = "URL copiée. Colle-la dans sites.txt";
});
