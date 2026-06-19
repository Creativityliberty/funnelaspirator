document.addEventListener("DOMContentLoaded", async () => {
  const urlBox = document.getElementById("url");
  const faviconImg = document.getElementById("favicon");
  const copyBtn = document.getElementById("copy");
  const crawlBtn = document.getElementById("crawl");
  const statusAlert = document.getElementById("status-alert");
  const statusIcon = document.getElementById("status-icon");
  const statusText = document.getElementById("status-text");
  
  const settingsToggle = document.getElementById("settings-toggle");
  const settingsPanel = document.getElementById("settings-panel");
  const toggleArrow = document.getElementById("toggle-arrow");
  const serverUrlInput = document.getElementById("server-url");

  let currentTabUrl = "";

  // 1. Load active tab information
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab?.url || "";
    if (currentTabUrl) {
      urlBox.textContent = currentTabUrl;
      if (tab.favIconUrl) {
        faviconImg.src = tab.favIconUrl;
        faviconImg.style.display = "block";
      }
    } else {
      urlBox.textContent = "Aucun onglet actif trouvé.";
    }
  } catch (err) {
    urlBox.textContent = "Erreur de lecture de l'URL.";
    console.error(err);
  }

  // 2. Load configured server URL from storage
  chrome.storage.local.get(["serverUrl"], (result) => {
    if (result.serverUrl) {
      serverUrlInput.value = result.serverUrl;
    }
  });

  // Save server URL whenever it is changed
  serverUrlInput.addEventListener("input", () => {
    chrome.storage.local.set({ serverUrl: serverUrlInput.value.trim() });
  });

  // 3. Helper to show status alert
  function showStatus(type, message, showLoader = false) {
    statusAlert.className = `status-alert ${type}`;
    statusAlert.style.display = "flex";
    
    if (showLoader) {
      statusIcon.innerHTML = '<div class="spinner"></div>';
    } else if (type === "success") {
      statusIcon.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
    } else if (type === "error") {
      statusIcon.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
    } else {
      statusIcon.innerHTML = "";
    }
    
    statusText.textContent = message;
  }

  // 4. Handle Copy Button
  copyBtn.addEventListener("click", async () => {
    if (!currentTabUrl) {
      showStatus("error", "Pas d'URL à copier.");
      return;
    }
    try {
      await navigator.clipboard.writeText(currentTabUrl);
      showStatus("success", "URL copiée dans le presse-papiers !");
    } catch (err) {
      showStatus("error", "Échec de la copie.");
    }
  });

  // 5. Handle Crawl Button (Direct Trigger)
  crawlBtn.addEventListener("click", async () => {
    if (!currentTabUrl) {
      showStatus("error", "Pas d'URL à auditer.");
      return;
    }

    const serverUrl = serverUrlInput.value.trim();
    if (!serverUrl) {
      showStatus("error", "Veuillez configurer l'URL du serveur.");
      return;
    }

    showStatus("info", "Démarrage de l'audit...", true);
    crawlBtn.disabled = true;

    try {
      const response = await fetch(`${serverUrl}/api/crawl`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url: currentTabUrl })
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        showStatus("success", "Audit lancé avec succès !");
      } else {
        showStatus("error", `Erreur: ${result.error || "Inconnue"}`);
      }
    } catch (err) {
      console.error(err);
      showStatus("error", `Échec: impossible de joindre le serveur.`);
    } finally {
      crawlBtn.disabled = false;
    }
  });

  // 6. Settings Panel Toggle
  settingsToggle.addEventListener("click", () => {
    const isOpen = settingsPanel.classList.toggle("open");
    toggleArrow.textContent = isOpen ? "▲" : "▼";
  });
});
