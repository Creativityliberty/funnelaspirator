document.addEventListener('DOMContentLoaded', () => {
    // Mode Switcher Elements
    const modeCrawlerBtn = document.getElementById('mode-crawler-btn');
    const modeStudioBtn = document.getElementById('mode-studio-btn');
    const viewCrawler = document.getElementById('view-crawler');
    const viewStudio = document.getElementById('view-studio');

    // Crawler Elements
    const form = document.getElementById('crawl-form');
    const urlInput = document.getElementById('url-input');
    const crawlBtn = document.getElementById('crawl-btn');
    const btnText = document.querySelector('.btn-text');
    const crawlLoader = document.getElementById('crawl-loader');
    const statusMsg = document.getElementById('status-message');
    const resultsGrid = document.getElementById('results-grid');
    const resultsLoader = document.getElementById('results-loader');
    const refreshBtn = document.getElementById('refresh-btn');

    // Theme Toggle Elements
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeLabel = document.getElementById('theme-label');
    const sunIcon = themeToggleBtn?.querySelector('.sun-icon');
    const moonIcon = themeToggleBtn?.querySelector('.moon-icon');

    // Check saved theme
    const savedTheme = localStorage.getItem('fa_theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        if (themeLabel) themeLabel.textContent = 'Sombre';
        sunIcon?.classList.add('hidden');
        moonIcon?.classList.remove('hidden');
    }

    themeToggleBtn?.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-theme');
        if (isLight) {
            localStorage.setItem('fa_theme', 'light');
            if (themeLabel) themeLabel.textContent = 'Sombre';
            sunIcon?.classList.add('hidden');
            moonIcon?.classList.remove('hidden');
        } else {
            localStorage.setItem('fa_theme', 'dark');
            if (themeLabel) themeLabel.textContent = 'Clair';
            sunIcon?.classList.remove('hidden');
            moonIcon?.classList.add('hidden');
        }
    });

    // Studio View Elements
    const viewportBtns = document.querySelectorAll('.viewport-btn');
    const previewWrapper = document.getElementById('editorial-preview-wrapper');
    const liveEditorialFunnel = document.getElementById('live-editorial-funnel');
    const copyFunnelHtmlBtn = document.getElementById('copy-funnel-html-btn');

    // Mode Switch Logic
    modeCrawlerBtn.addEventListener('click', () => {
        modeCrawlerBtn.classList.add('active');
        modeStudioBtn.classList.remove('active');
        viewCrawler.classList.remove('hidden');
        viewStudio.classList.add('hidden');
    });

    modeStudioBtn.addEventListener('click', () => {
        modeStudioBtn.classList.add('active');
        modeCrawlerBtn.classList.remove('active');
        viewStudio.classList.remove('hidden');
        viewCrawler.classList.add('hidden');
        renderEditorialFunnelDemo();
    });

    // Viewport Switcher
    viewportBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            viewportBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.viewport;
            if (mode === 'mobile') {
                previewWrapper.classList.remove('desktop-mode');
                previewWrapper.classList.add('mobile-mode');
            } else {
                previewWrapper.classList.remove('mobile-mode');
                previewWrapper.classList.add('desktop-mode');
            }
        });
    });

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

        urlInput.disabled = true;
        crawlBtn.disabled = true;
        btnText.classList.add('hidden');
        crawlLoader.classList.remove('hidden');
        showStatus('Aspiration et analyse de la mécanique en cours. Cela peut prendre 30-60s...', 'info');

        try {
            const response = await fetch('/api/crawl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (data.success) {
                showStatus(`✅ Evidence aspirée avec succès : ${data.result.pages} pages pour ${data.result.host}`, 'success');
                urlInput.value = '';
                fetchResults();
            } else {
                throw new Error(data.error || 'Erreur inconnue lors du crawl');
            }
        } catch (error) {
            showStatus(`❌ Erreur : ${error.message}`, 'error');
        } finally {
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

    // Helper: Classify route family
    function classifyRouteFamily(url, title = '') {
        const lowerUrl = (url || '').toLowerCase();
        const lowerTitle = (title || '').toLowerCase();

        if (lowerUrl.includes('case') || lowerUrl.includes('etude') || lowerUrl.includes('result') || lowerUrl.includes('client')) {
            return { family: 'case-study', label: 'Case Study', class: 'badge-route-casestudy' };
        }
        if (lowerUrl.includes('expert') || lowerUrl.includes('service') || lowerUrl.includes('solution') || lowerUrl.includes('methode')) {
            return { family: 'expertise', label: 'Expertise', class: 'badge-route-expertise' };
        }
        if (lowerUrl.includes('offer') || lowerUrl.includes('tarifs') || lowerUrl.includes('price') || lowerUrl.includes('pricing') || lowerUrl.includes('programme')) {
            return { family: 'offer', label: 'Offer', class: 'badge-route-offer' };
        }
        if (lowerUrl.includes('contact') || lowerUrl.includes('audit') || lowerUrl.includes('diag') || lowerUrl.includes('booking') || lowerUrl.includes('call')) {
            return { family: 'qualification', label: 'Qualification', class: 'badge-route-qualification' };
        }
        return { family: 'home', label: 'Home / Core', class: 'badge-route-home' };
    }

    async function fetchResults() {
        resultsGrid.innerHTML = '';
        resultsLoader.classList.remove('hidden');

        try {
            const res = await fetch('/api/results');
            const data = await res.json();
            
            resultsLoader.classList.add('hidden');

            if (data.success && data.results.length > 0) {
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
                            <p style="color:var(--text-secondary); font-size:0.85rem;">
                                ${item.error ? `<span style="color:var(--rose-danger)">${item.error}</span>` : `Audit architectural complet & tokens extraits.`}
                            </p>
                            <div class="meta-badges-row">
                                <span class="badge-pill badge-gold">${item.pagesCount} Pages Extracted</span>
                                <span class="badge-pill">Design Tokens OK</span>
                                <span class="badge-pill">Motion Signatures</span>
                            </div>
                        </div>
                    `;
                    card.addEventListener('click', () => openModal(item.domain));
                    resultsGrid.appendChild(card);
                });
            } else {
                resultsGrid.innerHTML = '<p style="color:var(--text-secondary); grid-column: 1/-1; text-align: center;">Aucun funnel aspiré pour le moment.</p>';
            }
        } catch (err) {
            resultsLoader.classList.add('hidden');
            resultsGrid.innerHTML = `<p style="color:var(--rose-danger); grid-column: 1/-1;">Erreur lors du chargement : ${err.message}</p>`;
        }
    }

    // Modal & Tabs Logic
    const modal = document.getElementById('details-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const modalDomainTitle = document.getElementById('modal-domain-title');
    const downloadZipBtn = document.getElementById('download-zip-btn');
    const modalLoader = document.getElementById('modal-loader');
    
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = {
        pages: document.getElementById('modal-pages-list'),
        'design-system': document.getElementById('modal-design-tokens'),
        motion: document.getElementById('modal-motion'),
        components: document.getElementById('modal-components')
    };

    closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const targetTab = btn.dataset.tab;
            Object.keys(tabPanels).forEach(tabKey => {
                if (tabPanels[tabKey]) {
                    if (tabKey === targetTab) tabPanels[tabKey].classList.remove('hidden');
                    else tabPanels[tabKey].classList.add('hidden');
                }
            });
        });
    });

    async function openModal(domain) {
        modal.classList.remove('hidden');
        modalDomainTitle.textContent = domain;
        downloadZipBtn.href = `/api/download/${domain}`;
        
        tabBtns.forEach((b, i) => b.classList.toggle('active', i === 0));
        Object.keys(tabPanels).forEach((tabKey, i) => {
            if (tabPanels[tabKey]) tabPanels[tabKey].classList.toggle('hidden', i !== 0);
        });

        modalLoader.classList.remove('hidden');
        tabPanels.pages.innerHTML = '';

        try {
            const resPages = await fetch(`/api/results/${domain}`);
            const dataPages = await resPages.json();
            
            if (dataPages.success && dataPages.pages.length > 0) {
                tabPanels.pages.innerHTML = '';
                dataPages.pages.forEach(page => {
                    const routeInfo = classifyRouteFamily(page.url, page.title);
                    const el = document.createElement('div');
                    el.className = 'page-item';
                    el.innerHTML = `
                        <div class="page-info">
                            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem;">
                                <span class="badge-pill badge-route ${routeInfo.class}">${routeInfo.label}</span>
                                <h4>${page.url || page.title || 'Page'}</h4>
                            </div>
                            <p>${page.title || ''} • <strong>${page.componentCount || 0} Composants</strong> • <span style="color:var(--gold-primary)">${(page.detectedLibraries || []).join(', ') || 'Vanilla CSS Engine'}</span></p>
                        </div>
                        <div class="page-actions">
                            <a href="/exports/${domain}/${page.html}" target="_blank" class="glass-btn">HTML</a>
                            <a href="/exports/${domain}/${page.screenshot}" target="_blank" class="glass-btn">Screenshot</a>
                            <a href="/exports/${domain}/${page.data}" target="_blank" class="glass-btn">JSON</a>
                        </div>
                    `;
                    tabPanels.pages.appendChild(el);
                });
            } else {
                tabPanels.pages.innerHTML = '<p style="color:var(--text-secondary)">Aucune page trouvée.</p>';
            }

            fetchDesignSystem(domain);
            fetchMotion(domain);
            fetchComponentsAndInteractions(domain);

            modalLoader.classList.add('hidden');
        } catch (err) {
            modalLoader.classList.add('hidden');
            tabPanels.pages.innerHTML = `<p style="color:var(--rose-danger)">Erreur de chargement : ${err.message}</p>`;
        }
    }

    async function fetchDesignSystem(domain) {
        const paletteGrid = document.getElementById('palette-grid');
        const typoList = document.getElementById('typo-list');
        const cssVarsTable = document.getElementById('css-vars-table');

        paletteGrid.innerHTML = '';
        typoList.innerHTML = '';
        cssVarsTable.innerHTML = '';

        try {
            const res = await fetch(`/api/results/${domain}/design-system`);
            const data = await res.json();
            if (data.success && data.designSystem) {
                const ds = data.designSystem;

                const allColors = [...new Set([
                    ...(ds.colors?.background || []),
                    ...(ds.colors?.text || []),
                    ...(ds.colors?.border || [])
                ])];

                if (allColors.length > 0) {
                    allColors.forEach(color => {
                        const swatch = document.createElement('div');
                        swatch.className = 'color-swatch-card';
                        swatch.innerHTML = `
                            <div class="color-preview" style="background-color: ${color}"></div>
                            <span class="color-meta">${color}</span>
                        `;
                        paletteGrid.appendChild(swatch);
                    });
                } else {
                    paletteGrid.innerHTML = '<p style="color:var(--text-secondary)">Aucune couleur spécifique extraite.</p>';
                }

                if (ds.typography?.hierarchy) {
                    const h = ds.typography.hierarchy;
                    const items = [...(h.h1 || []), ...(h.h2 || []), ...(h.buttons || []), ...(h.body || [])].slice(0, 8);
                    items.forEach(t => {
                        const card = document.createElement('div');
                        card.className = 'typo-item';
                        card.innerHTML = `
                            <div class="typo-specimen" style="font-family: '${t.fontFamily}', sans-serif; font-size: ${t.fontSize}; font-weight: ${t.fontWeight}; color: ${t.color || 'white'}">
                                ${t.sampleText || 'Spécimen Typographique'}
                            </div>
                            <div class="typo-meta">
                                <span>Tag: &lt;${t.tag}&gt;</span>
                                <span>Font: ${t.fontFamily}</span>
                                <span>Size: ${t.fontSize}</span>
                                <span>Weight: ${t.fontWeight}</span>
                                <span>Line-height: ${t.lineHeight}</span>
                            </div>
                        `;
                        typoList.appendChild(card);
                    });
                }

                if (ds.cssVariables && Object.keys(ds.cssVariables).length > 0) {
                    let codeHtml = '<pre><code>:root {\n';
                    for (const [k, v] of Object.entries(ds.cssVariables)) {
                        codeHtml += `  ${k}: ${v};\n`;
                    }
                    codeHtml += '}</code></pre>';
                    cssVarsTable.innerHTML = codeHtml;
                } else {
                    cssVarsTable.innerHTML = '<p style="color:var(--text-secondary)">Aucune variable :root trouvée.</p>';
                }
            }
        } catch (e) {
            paletteGrid.innerHTML = `<p style="color:var(--text-secondary)">Design tokens non disponibles.</p>`;
        }
    }

    async function fetchMotion(domain) {
        const libsList = document.getElementById('motion-libs-list');
        const transList = document.getElementById('motion-transitions-list');
        const keyframesList = document.getElementById('motion-keyframes-list');

        libsList.innerHTML = '';
        transList.innerHTML = '';
        keyframesList.innerHTML = '';

        try {
            const res = await fetch(`/api/results/${domain}/motion`);
            const data = await res.json();
            if (data.success && data.motion.length > 0) {
                const firstPageMotion = data.motion[0].motion;

                if (firstPageMotion.detectedLibraries && firstPageMotion.detectedLibraries.length > 0) {
                    firstPageMotion.detectedLibraries.forEach(lib => {
                        const badge = document.createElement('span');
                        badge.className = 'badge-pill badge-gold';
                        badge.textContent = `${lib.name} ${lib.type ? `(${lib.type})` : ''}`;
                        libsList.appendChild(badge);
                    });
                } else {
                    libsList.innerHTML = '<span class="badge-pill">Moteur CSS Vanilla</span>';
                }

                if (firstPageMotion.activeTransitions && firstPageMotion.activeTransitions.length > 0) {
                    firstPageMotion.activeTransitions.slice(0, 8).forEach(t => {
                        const card = document.createElement('div');
                        card.className = 'motion-card';
                        card.innerHTML = `
                            <h5 style="color:var(--gold-primary); font-family:var(--font-mono);">${t.selector}</h5>
                            <p style="font-size:0.8rem; color:var(--text-secondary); font-family:monospace;">
                                <strong>Prop:</strong> ${t.property}<br>
                                <strong>Durée:</strong> ${t.duration} • <strong>Timing:</strong> ${t.timing}
                            </p>
                        `;
                        transList.appendChild(card);
                    });
                } else {
                    transList.innerHTML = '<p style="color:var(--text-secondary)">Aucune transition CSS détectée.</p>';
                }

                if (firstPageMotion.keyframes && firstPageMotion.keyframes.length > 0) {
                    firstPageMotion.keyframes.slice(0, 6).forEach(kf => {
                        const card = document.createElement('div');
                        card.className = 'motion-card';
                        card.innerHTML = `
                            <h5 style="color:var(--cyan-accent); font-family:var(--font-mono);">@keyframes ${kf.name}</h5>
                            <p style="font-size:0.75rem; color:var(--text-secondary); font-family:monospace;">
                                ${kf.steps.map(s => `${s.keyText} { ${s.cssText.slice(0, 45)}... }`).join('<br>')}
                            </p>
                        `;
                        keyframesList.appendChild(card);
                    });
                } else {
                    keyframesList.innerHTML = '<p style="color:var(--text-secondary)">Aucune règle @keyframes trouvée.</p>';
                }
            }
        } catch (e) {
            libsList.innerHTML = `<p style="color:var(--text-secondary)">Motion data non disponible.</p>`;
        }
    }

    async function fetchComponentsAndInteractions(domain) {
        const ctaList = document.getElementById('cta-micro-list');
        const accList = document.getElementById('accordions-list');
        const compList = document.getElementById('components-list');

        ctaList.innerHTML = '';
        accList.innerHTML = '';
        compList.innerHTML = '';

        try {
            const resInter = await fetch(`/api/results/${domain}/interactions`);
            const dataInter = await resInter.json();

            if (dataInter.success && dataInter.interactions.length > 0) {
                const first = dataInter.interactions[0].microInteractions;

                if (first.ctas && first.ctas.length > 0) {
                    first.ctas.slice(0, 6).forEach(cta => {
                        const card = document.createElement('div');
                        card.className = 'cta-micro-card';
                        const def = cta.defaultState || {};
                        const hov = cta.hoverState || {};
                        
                        card.innerHTML = `
                            <h4 style="font-family:var(--font-display);">${cta.text}</h4>
                            <div class="cta-preview-box">
                                <button class="live-cta-btn" style="
                                    background: ${def.backgroundColor || 'linear-gradient(135deg, #e5c07b, #b38b38)'};
                                    color: ${def.color || '#000'};
                                    padding: ${def.padding || '12px 24px'};
                                    border-radius: ${def.borderRadius || '8px'};
                                    box-shadow: ${def.boxShadow || '0 4px 15px rgba(229, 192, 123, 0.3)'};
                                    border: ${def.border || 'none'};
                                    font-weight: 700;
                                    transition: ${def.transition || 'all 0.3s'};
                                ">${cta.text}</button>
                            </div>
                            <div style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono);">
                                <div><strong>Normal :</strong> ${def.backgroundColor} | ${def.color}</div>
                                <div><strong>Hover Delta :</strong> ${hov.backgroundColor || 'same'} | scale ${hov.transform || 'none'}</div>
                            </div>
                        `;

                        const btn = card.querySelector('.live-cta-btn');
                        if (hov.backgroundColor) {
                            btn.addEventListener('mouseenter', () => {
                                btn.style.background = hov.backgroundColor;
                                if (hov.color) btn.style.color = hov.color;
                                if (hov.transform && hov.transform !== 'none') btn.style.transform = hov.transform;
                                if (hov.boxShadow && hov.boxShadow !== 'none') btn.style.boxShadow = hov.boxShadow;
                            });
                            btn.addEventListener('mouseleave', () => {
                                btn.style.background = def.backgroundColor || 'linear-gradient(135deg, #e5c07b, #b38b38)';
                                btn.style.color = def.color || '#000';
                                btn.style.transform = 'none';
                                btn.style.boxShadow = def.boxShadow || '0 4px 15px rgba(229, 192, 123, 0.3)';
                            });
                        }

                        ctaList.appendChild(card);
                    });
                }

                if (first.accordions && first.accordions.length > 0) {
                    first.accordions.forEach(acc => {
                        const card = document.createElement('div');
                        card.className = 'accordion-card';
                        card.innerHTML = `
                            <span class="badge-pill ${acc.isExpanded ? 'badge-route-casestudy' : 'badge-route-qualification'}">
                                ${acc.isExpanded ? 'État: Ouvert (Expanded)' : 'État: Fermé (Collapsed)'}
                            </span>
                            <h4>${acc.title || 'Déclencheur Accordéon'}</h4>
                            <p style="font-size:0.85rem; color:var(--text-secondary);">${acc.contentPreview || 'Aperçu non disponible.'}</p>
                        `;
                        accList.appendChild(card);
                    });
                } else {
                    accList.innerHTML = '<p style="color:var(--text-secondary)">Aucun accordéon détecté.</p>';
                }
            }

            const resComp = await fetch(`/api/results/${domain}/components`);
            const dataComp = await resComp.json();

            if (dataComp.success && dataComp.components.length > 0) {
                const comps = dataComp.components[0].components;
                comps.forEach(c => {
                    const card = document.createElement('div');
                    card.className = 'component-card';
                    card.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="badge-pill badge-gold">${c.type}</span>
                            <span style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono);">${c.bounding.width}x${c.bounding.height}px</span>
                        </div>
                        <h4>${c.heading || c.id}</h4>
                        <p style="font-size:0.8rem; color:var(--text-secondary); font-family:var(--font-mono);">
                            BG: ${c.styles.backgroundColor || 'transparent'} • Display: ${c.styles.display}
                        </p>
                        ${c.ctaList && c.ctaList.length > 0 ? `<div style="font-size:0.75rem; color:var(--gold-primary);">CTAs : ${c.ctaList.join(', ')}</div>` : ''}
                    `;
                    compList.appendChild(card);
                });
            } else {
                compList.innerHTML = '<p style="color:var(--text-secondary)">Aucune section modulaire trouvée.</p>';
            }

        } catch (e) {
            ctaList.innerHTML = `<p style="color:var(--text-secondary)">Données des composants non disponibles.</p>`;
        }
    }

    // =======================================================
    // BRAND-LED EDITORIAL FUNNEL DEMO GENERATOR (Achats Performance 360)
    // =======================================================
    function renderEditorialFunnelDemo() {
        liveEditorialFunnel.innerHTML = `
            <!-- Topbar -->
            <nav class="ef-nav">
                <div class="ef-logo">ACHATS<span>360</span>.PRO</div>
                <a href="#diagnostic" class="ef-cta-top">Diagnostic Offert (30 min)</a>
            </nav>

            <!-- Hero Section (Editorial Conversion Grammar) -->
            <header class="ef-hero">
                <div class="ef-kicker">CONSEIL STRATÉGIQUE & PILOTAGE DE MARGE</div>
                <h1 class="ef-title">Transformez vos Achats en un <span style="color:var(--gold-primary); font-style:italic;">Levier Direct d'EBITDA</span>.</h1>
                <p class="ef-subtitle">
                    Nous réingénierons les dépenses directes et indirectes des ETI et scale-ups pour sécuriser en moyenne 18% d'économies nettes et libérer 30% de temps opérationnel.
                </p>
                <div class="ef-hero-actions">
                    <a href="#diagnostic" class="ef-btn-primary">Réserver un Diagnostic Stratégique</a>
                    <a href="#cases" class="ef-btn-secondary">Explorer les Résultats Clients</a>
                </div>
            </header>

            <!-- Proof Metrics Strip -->
            <section class="ef-metrics-strip">
                <div class="ef-metric-item">
                    <div class="ef-metric-num">18%</div>
                    <div class="ef-metric-desc">Économies moyennes constatées</div>
                </div>
                <div class="ef-metric-item">
                    <div class="ef-metric-num">30%</div>
                    <div class="ef-metric-desc">Gain de temps administratif</div>
                </div>
                <div class="ef-metric-item">
                    <div class="ef-metric-num">90 Jours</div>
                    <div class="ef-metric-desc">Garantie de ROI opérationnel</div>
                </div>
                <div class="ef-metric-item">
                    <div class="ef-metric-num">100%</div>
                    <div class="ef-metric-desc">Visibilité et contrôle des dépenses</div>
                </div>
            </section>

            <!-- Proof Sequence : Case Studies (Défi / Intervention / Résultat) -->
            <section id="cases" class="ef-section">
                <div class="ef-section-header">
                    <div class="ef-kicker">PREUVES & RÉSULTATS MESURABLES</div>
                    <h2 class="ef-section-title">Études de Cas Récents</h2>
                </div>
                <div class="ef-cases-grid">
                    <div class="ef-case-card">
                        <span class="ef-case-tag">INDUSTRIE & LOGISTIQUE</span>
                        <h3 class="ef-case-heading">Restructuration des achats packaging & fret</h3>
                        <div class="ef-rhythm-row">
                            <strong>1. Le Défi :</strong>
                            Inflation non maîtrisée de +24% sur les emballages et dispersion sur 12 fournisseurs.
                        </div>
                        <div class="ef-rhythm-row">
                            <strong>2. L'Intervention :</strong>
                            Appel d'offres consolidé, standardisation des formats et négociation de contrats cadre pluriannuels.
                        </div>
                        <div class="ef-rhythm-row">
                            <strong>3. Le Résultat :</strong>
                            <span style="color:var(--emerald-success); font-weight:700;">-21% de dépenses annuelles</span> et réduction du lead time de 14 jours.
                        </div>
                    </div>

                    <div class="ef-case-card">
                        <span class="ef-case-tag">SERVICES & TECH (ETI 250 Salariés)</span>
                        <h3 class="ef-case-heading">Digitalisation & rationalisation SaaS / Licences</h3>
                        <div class="ef-rhythm-row">
                            <strong>1. Le Défi :</strong>
                            Shadow IT massif avec plus de 80 abonnements redondants non tracés.
                        </div>
                        <div class="ef-rhythm-row">
                            <strong>2. L'Intervention :</strong>
                            Cartographie 360°, élimination des doublons et mise en place d'un workflow d'approbation d'achat centralisé.
                        </div>
                        <div class="ef-rhythm-row">
                            <strong>3. Le Résultat :</strong>
                            <span style="color:var(--emerald-success); font-weight:700;">145 000 € économisés dès l'an 1</span> et conformité RGPD totale.
                        </div>
                    </div>
                </div>
            </section>

            <!-- Services & Piliers d'Expertise (Numérotés) -->
            <section class="ef-section">
                <div class="ef-section-header">
                    <div class="ef-kicker">MÉTHODOLOGIE DÉCISIONNELLE</div>
                    <h2 class="ef-section-title">Les 4 Piliers de l'Accompagnement</h2>
                </div>
                <div class="ef-services-grid">
                    <div class="ef-service-card">
                        <div class="ef-service-num">01</div>
                        <h4>Stratégie Achats</h4>
                        <p>Audit approfondi des catégories de dépenses, alignement avec vos objectifs de marge et identification des gains rapides.</p>
                    </div>
                    <div class="ef-service-card">
                        <div class="ef-service-num">02</div>
                        <h4>Digitalisation & Outils</h4>
                        <p>Déploiement de tableaux de bord KPI et de flux de validation pour éradiquer les fuites financières invisibles.</p>
                    </div>
                    <div class="ef-service-card">
                        <div class="ef-service-num">03</div>
                        <h4>Optimisation des Coûts</h4>
                        <p>Négociation experte, massification des volumes et renégociation tactique sans dégrader la qualité des prestations.</p>
                    </div>
                    <div class="ef-service-card">
                        <div class="ef-service-num">04</div>
                        <h4>Supply Chain & Risques</h4>
                        <p>Sécurisation des relations fournisseurs clés, réduction des dépendances critiques et plans de continuité.</p>
                    </div>
                </div>
            </section>

            <!-- Offer & Qualification Box -->
            <section id="diagnostic" class="ef-section" style="background: rgba(229, 192, 123, 0.02);">
                <div class="ef-offer-box">
                    <span class="ef-offer-tag">DIAGNOSTIC STRATÉGIQUE SANS ENGAGEMENT</span>
                    <h2 class="ef-section-title">Découvrez votre Potentiel d'Économie en 30 Minutes</h2>
                    <p style="color:#9aa1b2; font-size:1.05rem; margin-bottom:1.5rem;">
                        Un entretien direct avec un directeur des achats senior. Nous identifions vos 3 gisements de marge immédiats et vous remettons une feuille de route chiffrée.
                    </p>
                    
                    <form class="ef-diag-form" onsubmit="event.preventDefault(); alert('✅ Demande de diagnostic enregistrée ! Notre équipe vous contacte sous 24h.');">
                        <input type="text" placeholder="Votre Nom et Fonction" required>
                        <input type="email" placeholder="Email professionnel" required>
                        <input type="text" placeholder="Nom de votre Entreprise & Volume d'achats annuel" required>
                        <button type="submit">Valider mon Diagnostic Gratuit</button>
                    </form>
                    
                    <div style="font-size:0.8rem; color:#6b7280; margin-top:1rem;">
                        🔒 Confidentialité garantie • Réponse sous 24h ouvrées • Zéro démarchage agressif.
                    </div>
                </div>
            </section>
        `;
    }

    // Copy HTML button action
    copyFunnelHtmlBtn.addEventListener('click', () => {
        const htmlToCopy = liveEditorialFunnel.innerHTML;
        navigator.clipboard.writeText(htmlToCopy).then(() => {
            const prevText = copyFunnelHtmlBtn.innerHTML;
            copyFunnelHtmlBtn.innerHTML = `✅ Code HTML Copié !`;
            setTimeout(() => { copyFunnelHtmlBtn.innerHTML = prevText; }, 2500);
        });
    });
});


