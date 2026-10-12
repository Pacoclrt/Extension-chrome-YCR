(() => {
  // ==========================================
  // CONFIGURATION & ÉTAT
  // ==========================================
  let isRunning = false;
  let delayBetweenQuestions = 2; // Temps d'attente en secondes
  let questionsDataList = [];    // Liste complète des objets questions
  let currentIndex = 0;
  let isProcessing = false;
  let lastProcessedIdentifier = null;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ==========================================
  // 1. EXTRACTION INTELLIGENTE DU JSON (quiz.cfc)
  // ==========================================
  function parseQuizPayload(json) {
    const rawData = json?.payload?.questions?.data;
    if (Array.isArray(rawData) && rawData.length > 0) {
      questionsDataList = rawData.map((q, idx) => {
        let answers = [];
        const rawAns = q?.answerOptions?.answer;

        // Gestion tableau (cartes à ordonner ou choix multiples)
        if (Array.isArray(rawAns)) {
          answers = rawAns
            .map((item) => {
              if (typeof item === 'object' && item !== null) {
                return String(item.value ?? item.text ?? item.label ?? '').trim();
              }
              return String(item).trim();
            })
            .filter(Boolean);
        } else if (rawAns && typeof rawAns === 'object') {
          if (rawAns.value) answers = [String(rawAns.value).trim()];
        } else if (rawAns !== undefined && rawAns !== null) {
          answers = [String(rawAns).trim()];
        }

        // Fallback sur d'autres clés éventuelles
        if (!answers.length && q?.answer) {
          if (Array.isArray(q.answer)) answers = q.answer.map((a) => String(a.value ?? a).trim());
          else answers = [String(q.answer.value ?? q.answer).trim()];
        }

        return {
          index: idx,
          id: q?.id ?? idx,
          title: String(q?.title ?? q?.text ?? q?.statement ?? q?.question ?? '').trim(),
          answers: answers,
          isCards: answers.length > 1
        };
      });

      currentIndex = 0;
      updateUIStatus(`Quiz : ${questionsDataList.length} questions`, '#10b981');
      updateUIProgress();
      console.log('[AutoSolver] Questions analysées :', questionsDataList);
    }
  }

  // Interception Fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (url.includes('quiz.cfc')) {
      try {
        const clone = response.clone();
        clone.json().then(parseQuizPayload).catch(() => {});
      } catch (_) {}
    }
    return response;
  };

  // Interception XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      if (typeof this._url === 'string' && this._url.includes('quiz.cfc')) {
        try {
          parseQuizPayload(JSON.parse(this.responseText));
        } catch (_) {}
      }
    });
    return originalSend.apply(this, arguments);
  };

  // ==========================================
  // 2. SYNCHRONISATION DYNAMIQUE DE LA QUESTION
  // ==========================================
  // Détecte le numéro de question affiché à l'écran (ex: "3 / 10" ou "Question 3")
  function detectLiveQuestionIndex() {
    if (!questionsDataList.length) return null;

    const candidateElements = [
      ...document.querySelectorAll(
        '.durationCounter, .quiz__stepper, .question-stepper, .stepper, .question-count, [class*="stepper"], [class*="counter"], [class*="progress"], header'
      )
    ];

    for (const el of candidateElements) {
      const match = el.innerText.match(/(\d+)\s*[/|sur|of]\s*(\d+)/i);
      if (match) {
        const liveNum = parseInt(match[1], 10) - 1;
        if (liveNum >= 0 && liveNum < questionsDataList.length) {
          return liveNum;
        }
      }
    }

    const container = document.querySelector('.quiz__container, .question-container, .question_content');
    if (container) {
      const match = container.innerText.match(/\b(\d+)\s*\/\s*(\d+)\b/);
      if (match) {
        const liveNum = parseInt(match[1], 10) - 1;
        if (liveNum >= 0 && liveNum < questionsDataList.length) {
          return liveNum;
        }
      }
    }

    return null;
  }

  function syncCurrentIndex() {
    const liveIdx = detectLiveQuestionIndex();
    if (liveIdx !== null && liveIdx !== currentIndex) {
      console.log(`[AutoSolver] Recalage auto : Q${currentIndex + 1} -> Q${liveIdx + 1}`);
      currentIndex = liveIdx;
      lastProcessedIdentifier = null;
      updateUIProgress();
    }
  }

  // ==========================================
  // 3. RÉSOLUTION DES QUESTIONS & CARTES
  // ==========================================
  function setReactInputValue(input, val) {
    input.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(input, val);
    } else {
      input.value = val;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    document.execCommand('insertText', false, val);
  }

  function findSubmitOrNextButton() {
    const selectors = [
      '.question__form button[type=submit]',
      '.buttons_container button:last-child',
      'button.question__validate',
      '.question-container button[type=submit]',
      '.bottom-navigation button:last-child'
    ];

    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) return btn;
    }

    const allBtns = [...document.querySelectorAll('button')];
    return allBtns.find((b) => {
      const txt = b.innerText.trim().toLowerCase();
      return ['valider', 'validate', 'suivant', 'next', 'continuer'].includes(txt);
    });
  }

  // Résolution pour les exercices de cartes / mots à ordonner
  async function solveCardsQuestion(orderedAnswers) {
    const cardSelectors = [
      '[draggable="true"]',
      '.draggable',
      '.chip',
      '.card',
      '.token',
      '.word',
      '.sortable-item',
      '.MuiChip-root',
      '.words__item',
      '.question-container button:not([type=submit])',
      '.cards-container > *',
      '.words-container > *'
    ];

    let successCount = 0;
    const clickedElements = new Set();

    for (const word of orderedAnswers) {
      const cards = [...document.querySelectorAll(cardSelectors.join(', '))];
      const match = cards.find((el) => {
        if (clickedElements.has(el)) return false;
        const text = el.innerText.trim();
        return text.toLowerCase() === word.toLowerCase();
      });

      if (match) {
        clickedElements.add(match);
        // Simulation du clic pour envoyer la carte dans la zone de réponse
        match.click();
        match.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        match.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        successCount++;
        await wait(120);
      }
    }

    return successCount > 0;
  }

  async function step() {
    if (!isRunning || isProcessing || !questionsDataList.length) return;

    // Recalage instantané si l'humain ou la page a avancé
    syncCurrentIndex();

    // 1. Si un bouton "Suivant" est en attente
    const nextOrValidateBtn = findSubmitOrNextButton();
    const btnText = nextOrValidateBtn?.innerText?.trim()?.toLowerCase() || '';

    if (nextOrValidateBtn && ['suivant', 'next', 'continuer'].includes(btnText)) {
      isProcessing = true;
      nextOrValidateBtn.click();
      await wait(400);
      syncCurrentIndex();
      isProcessing = false;
      return;
    }

    // 2. Vérification du conteneur de question
    const questionContainer = document.querySelector('.question-container, .question_content, .question__form');
    if (!questionContainer) return;

    const questionIdentifier = questionContainer.innerText.slice(0, 50);
    if (questionIdentifier === lastProcessedIdentifier) return;

    if (currentIndex >= questionsDataList.length) {
      updateUIStatus('Quiz terminé !', '#3b82f6');
      return;
    }

    const currentQ = questionsDataList[currentIndex];
    if (!currentQ || !currentQ.answers.length) return;

    isProcessing = true;
    updateUIStatus(`Résolution Q${currentIndex + 1}...`, '#f59e0b');
    showCurrentAnswerHUD(currentQ);

    let resolved = false;

    // A. Cas des cartes à bouger / ordonner (plusieurs réponses)
    if (currentQ.isCards) {
      resolved = await solveCardsQuestion(currentQ.answers);
      if (!resolved) {
        // Si l'automatisation n'a pas pu cliquer sur les cartes, on laisse la main sans bloquer
        updateUIStatus(`Q${currentIndex + 1} : Déplacez les cartes`, '#eab308');
        isProcessing = false;
        return;
      }
    }

    // B. Cas Choix Multiple (QCM simple)
    if (!resolved) {
      const singleAnswer = currentQ.answers[0];
      const options = [
        ...document.querySelectorAll(
          '.answer-container button, .question_variant label, .question__customLabel, [role="radio"]'
        )
      ];

      for (const opt of options) {
        const text = opt.innerText.trim();
        if (text.toLowerCase() === singleAnswer.toLowerCase() || text.toLowerCase().includes(singleAnswer.toLowerCase())) {
          const targetClick = opt.closest('button') || opt;
          targetClick.click();
          resolved = true;
          break;
        }
      }
    }

    // C. Cas Champ de saisie (Texte)
    if (!resolved) {
      const singleAnswer = currentQ.answers[0];
      const input = document.querySelector('.question__form input, .question__form textarea, input.question__input');
      if (input) {
        setReactInputValue(input, singleAnswer);
        resolved = true;
      }
    }

    if (resolved) {
      lastProcessedIdentifier = questionIdentifier;
      await wait(250);

      // Clic sur "Valider"
      const submitBtn = findSubmitOrNextButton();
      if (submitBtn) {
        submitBtn.click();
        await wait(350);

        // Clic sur "Suivant" s'il s'affiche
        const afterBtn = findSubmitOrNextButton();
        if (afterBtn) {
          afterBtn.click();
        }
      }

      currentIndex++;
      updateUIProgress();

      // Pause paramétrable
      if (delayBetweenQuestions > 0 && currentIndex < questionsDataList.length) {
        for (let remaining = delayBetweenQuestions; remaining > 0; remaining--) {
          if (!isRunning) break;
          updateUIStatus(`Pause : ${remaining}s...`, '#60a5fa');
          await wait(1000);
        }
      }
    }

    await wait(200);
    isProcessing = false;
  }

  // ==========================================
  // 4. INTERFACE UTILISATEUR FLOTTANTE (HUD)
  // ==========================================
  function createUI() {
    if (document.getElementById('autosolver-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'autosolver-hud';
    hud.innerHTML = `
      <div class="hud-header">
        <span class="hud-title">⚡ 7Speaking Bot</span>
        <button id="hud-toggle-btn" class="hud-btn-mini">−</button>
      </div>
      <div id="hud-body">
        <div class="hud-row">
          <span class="hud-label">Statut :</span>
          <span id="hud-status" class="hud-badge">En attente...</span>
        </div>
        <div class="hud-row">
          <span class="hud-label">Progression :</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <button id="hud-prev-q" class="hud-btn-nav" title="Question précédente">⏮️</button>
            <span id="hud-progress">0 / 0</span>
            <button id="hud-next-q" class="hud-btn-nav" title="Question suivante / Sauter">⏭️</button>
          </div>
        </div>
        <div id="hud-answer-box" class="hud-answer-preview">
          <span style="color:#9ca3af;font-size:11px;">Réponse : </span>
          <span id="hud-current-answer" style="color:#6ee7b7;font-weight:600;">-</span>
        </div>
        <div class="hud-row">
          <span class="hud-label">Pause :</span>
          <div style="display:flex;align-items:center;gap:4px;">
            <input type="number" id="hud-delay-input" min="0" max="60" value="${delayBetweenQuestions}" style="width:40px;background:#374151;color:#fff;border:1px solid #4b5563;border-radius:4px;padding:2px;text-align:center;">
            <span>s</span>
          </div>
        </div>
        <div class="hud-actions">
          <button id="hud-start-stop" class="hud-btn hud-btn-start">DÉMARRER</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #autosolver-hud {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999999;
        width: 270px;
        background: rgba(23, 23, 28, 0.95);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        padding: 12px;
        user-select: none;
      }
      .hud-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .hud-title {
        font-weight: 700;
        font-size: 14px;
        color: #60a5fa;
      }
      .hud-btn-mini {
        background: transparent;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        font-size: 16px;
      }
      .hud-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .hud-badge {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        background: #374151;
        color: #e5e7eb;
        max-width: 145px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hud-btn-nav {
        background: #374151;
        border: 1px solid #4b5563;
        color: #fff;
        border-radius: 4px;
        cursor: pointer;
        padding: 1px 4px;
        font-size: 11px;
      }
      .hud-btn-nav:hover {
        background: #4b5563;
      }
      .hud-answer-preview {
        background: #1f2937;
        border: 1px solid #374151;
        border-radius: 6px;
        padding: 6px;
        margin-bottom: 8px;
        font-size: 11px;
        word-break: break-word;
        max-height: 55px;
        overflow-y: auto;
      }
      .hud-actions {
        margin-top: 10px;
      }
      .hud-btn {
        width: 100%;
        padding: 8px;
        border: none;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        transition: 0.2s;
      }
      .hud-btn-start {
        background: #10b981;
        color: white;
      }
      .hud-btn-start:hover {
        background: #059669;
      }
      .hud-btn-stop {
        background: #ef4444;
        color: white;
      }
      .hud-btn-stop:hover {
        background: #dc2626;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(hud);

    // Événements
    const startBtn = document.getElementById('hud-start-stop');
    const delayInput = document.getElementById('hud-delay-input');
    const toggleBtn = document.getElementById('hud-toggle-btn');
    const prevBtn = document.getElementById('hud-prev-q');
    const nextBtn = document.getElementById('hud-next-q');
    const body = document.getElementById('hud-body');

    startBtn.onclick = () => {
      isRunning = !isRunning;
      if (isRunning) {
        startBtn.textContent = 'ARRÊTER';
        startBtn.className = 'hud-btn hud-btn-stop';
        updateUIStatus('Actif', '#10b981');
      } else {
        startBtn.textContent = 'DÉMARRER';
        startBtn.className = 'hud-btn hud-btn-start';
        updateUIStatus('En pause', '#9ca3af');
      }
    };

    prevBtn.onclick = () => {
      if (currentIndex > 0) {
        currentIndex--;
        lastProcessedIdentifier = null;
        updateUIProgress();
        showCurrentAnswerHUD(questionsDataList[currentIndex]);
      }
    };

    nextBtn.onclick = () => {
      if (currentIndex < questionsDataList.length - 1) {
        currentIndex++;
        lastProcessedIdentifier = null;
        updateUIProgress();
        showCurrentAnswerHUD(questionsDataList[currentIndex]);
      }
    };

    delayInput.oninput = (e) => {
      const val = parseInt(e.target.value, 10);
      delayBetweenQuestions = isNaN(val) || val < 0 ? 0 : val;
    };

    toggleBtn.onclick = () => {
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? '−' : '+';
    };
  }

  function updateUIStatus(text, color) {
    const el = document.getElementById('hud-status');
    if (el) {
      el.textContent = text;
      if (color) el.style.color = color;
    }
  }

  function updateUIProgress() {
    const el = document.getElementById('hud-progress');
    if (el) {
      el.textContent = `${currentIndex + 1} / ${questionsDataList.length || 0}`;
    }
  }

  function showCurrentAnswerHUD(q) {
    const el = document.getElementById('hud-current-answer');
    if (!el || !q) return;
    if (q.isCards) {
      el.textContent = q.answers.join(' ➔ ');
    } else {
      el.textContent = q.answers[0] || '-';
    }
  }

  // Écouteur global : si l'utilisateur clique sur Suivant/Valider à la main, recalage immédiat
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const txt = btn.innerText.trim().toLowerCase();
    if (['suivant', 'next', 'continuer', 'valider', 'validate'].includes(txt)) {
      setTimeout(syncCurrentIndex, 300);
    }
  });

  // Boucle d'exécution permanente
  setInterval(() => {
    if (!document.getElementById('autosolver-hud')) {
      createUI();
    }
    step();
  }, 100);
})();