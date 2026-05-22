document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('crawl-form');
    const urlInput = document.getElementById('url-input');
    const crawlBtn = document.getElementById('crawl-btn');
    const btnText = document.querySelector('.btn-text');
    const crawlLoader = document.getElementById('crawl-loader');
    const statusMsg = document.getElementById('status-message');
    const resultsGrid = document.getElementById('results-grid');
    const resultsLoader = document.getElementById('results-loader');
    const refreshBtn = document.getElementById('refresh-btn');

    // Fetch and display results on load
    fetchResults();

    refreshBtn.addEventListener('click', () => {
        const icon = refreshBtn.querySelector('svg');
        icon.style.transform = 'rotate(180deg)';
        icon.style.transition = 'transform 0.3s';
        setTimeout(() => icon.style.transform = '', 300);
        fetchResults();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = urlInput.value.trim();
        if (!url) return;

        // UI State: Loading
        urlInput.disabled = true;
        crawlBtn.disabled = true;
        btnText.classList.add('hidden');
        crawlLoader.classList.remove('hidden');
        showStatus('Crawling in progress. This may take a minute...', 'info');

        try {
            const response = await fetch('/api/crawl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (data.success) {
                showStatus(`✅ Successfully crawled ${data.result.pages} pages for ${data.result.host}`, 'success');
                urlInput.value = '';
                fetchResults(); // Refresh grid
            } else {
                throw new Error(data.error || 'Unknown error occurred');
            }
        } catch (error) {
            showStatus(`❌ Error: ${error.message}`, 'error');
        } finally {
            // UI State: Reset
            urlInput.disabled = false;
            crawlBtn.disabled = false;
            btnText.classList.remove('hidden');
            crawlLoader.classList.add('hidden');
        }
    });

    function showStatus(msg, type) {
        statusMsg.textContent = msg;
        statusMsg.className = ``;
        statusMsg.classList.add(type);
        statusMsg.classList.remove('hidden');
    }

    async function fetchResults() {
        resultsGrid.innerHTML = '';
        resultsLoader.classList.remove('hidden');

        try {
            const res = await fetch('/api/results');
            const data = await res.json();
            
            resultsLoader.classList.add('hidden');

            if (data.success && data.results.length > 0) {
                // Sort by name or date if available
                data.results.sort((a,b) => b.pagesCount - a.pagesCount);
                
                data.results.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'result-card clickable';
                    card.innerHTML = `
                        <div class="result-card-header">
                            ${item.thumbnailUrl ? `<img src="${item.thumbnailUrl}" alt="${item.domain} preview">` : ''}
                        </div>
                        <div class="result-card-body">
                            <h3>${item.domain}</h3>
                            <p>${item.error ? `<span style="color:var(--danger)">${item.error}</span>` : `Scraped successfully.`}</p>
                            <div>
                                <span class="badge">${item.pagesCount} Pages Extracted</span>
                            </div>
                        </div>
                    `;
                    card.addEventListener('click', () => openModal(item.domain));
                    resultsGrid.appendChild(card);
                });
            } else {
                resultsGrid.innerHTML = '<p style="color:var(--text-secondary); grid-column: 1/-1; text-align: center;">No crawls found yet.</p>';
            }
        } catch (err) {
            resultsLoader.classList.add('hidden');
            resultsGrid.innerHTML = `<p style="color:var(--danger); grid-column: 1/-1;">Error loading results: ${err.message}</p>`;
        }
    }

    // Modal Logic
    const modal = document.getElementById('details-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const modalDomainTitle = document.getElementById('modal-domain-title');
    const downloadZipBtn = document.getElementById('download-zip-btn');
    const modalLoader = document.getElementById('modal-loader');
    const modalPagesList = document.getElementById('modal-pages-list');

    closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    async function openModal(domain) {
        modal.classList.remove('hidden');
        modalDomainTitle.textContent = domain;
        downloadZipBtn.href = `/api/download/${domain}`;
        
        modalLoader.classList.remove('hidden');
        modalPagesList.classList.add('hidden');
        modalPagesList.innerHTML = '';

        try {
            const res = await fetch(`/api/results/${domain}`);
            const data = await res.json();
            
            modalLoader.classList.add('hidden');
            
            if (data.success && data.pages.length > 0) {
                modalPagesList.classList.remove('hidden');
                data.pages.forEach(page => {
                    const el = document.createElement('div');
                    el.className = 'page-item';
                    el.innerHTML = `
                        <div class="page-info">
                            <h4>${page.url || page.title || 'Page'}</h4>
                            <p>${page.title || ''}</p>
                        </div>
                        <div class="page-actions">
                            <a href="/exports/${domain}/${page.html}" target="_blank" class="glass-btn">HTML</a>
                            <a href="/exports/${domain}/${page.screenshot}" target="_blank" class="glass-btn">Screenshot</a>
                            <a href="/exports/${domain}/${page.data}" target="_blank" class="glass-btn">JSON</a>
                        </div>
                    `;
                    modalPagesList.appendChild(el);
                });
            } else {
                modalPagesList.classList.remove('hidden');
                modalPagesList.innerHTML = '<p style="color:var(--text-secondary)">No pages found for this domain.</p>';
            }
        } catch (err) {
            modalLoader.classList.add('hidden');
            modalPagesList.classList.remove('hidden');
            modalPagesList.innerHTML = `<p style="color:var(--danger)">Error loading details: ${err.message}</p>`;
        }
    }
});
