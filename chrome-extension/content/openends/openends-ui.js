"use strict";

    function buildPanel() {
        const existing = document.getElementById(PANEL_ID);
        if (existing) {
            existing.remove();
        }

        const panel = document.createElement("aside");
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="qga-header">Ассистент группировки вопросов (OpenEnds)</div>
            <div class="qga-section">
                <div class="qga-row">
                    <div>
                        <label for="qga-mode">Режим</label>
                        <select id="qga-mode">
                            <option value="exact">Точное совпадение</option>
                            <option value="similar">Похожий текст</option>
                        </select>
                    </div>
                    <div>
                        <label for="qga-threshold">Порог похожести (0.50 - 1.00)</label>
                        <input id="qga-threshold" type="number" min="0.5" max="1" step="0.01" />
                    </div>
                </div>
                <div class="qga-row">
                    <div>
                        <label>
                            <input id="qga-split-by-variable" type="checkbox" />
                            Разные переменные отдельно
                        </label>
                    </div>
                    <div></div>
                </div>
                <div class="qga-actions">
                    <button id="qga-group-all">Сгруппировать все</button>
                    <button id="qga-clear">Снять подсветку</button>
                </div>
            </div>
            <div class="qga-section">
                <div class="qga-stats-row" id="qga-stats-row">
                    <div class="qga-stats" id="qga-stats"></div>
                    <div class="qga-loading" id="qga-loading" style="display:none;">
                        <span class="qga-spinner"></span>
                        <span>Загрузка…</span>
                    </div>
                </div>
                <div class="qga-progress-wrap" id="qga-progress-wrap">
                    <div class="qga-progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
                        <div class="qga-progress-fill" id="qga-progress-fill" style="width:0%"></div>
                    </div>
                    <div class="qga-progress-text" id="qga-progress-text"></div>
                </div>
                <ul class="qga-list" id="qga-list"></ul>
            </div>
        `;

        document.body.appendChild(panel);

        state.panel = panel;
        state.listNode = panel.querySelector("#qga-list");
        state.statsNode = panel.querySelector("#qga-stats");
        state.statsRowNode = panel.querySelector("#qga-stats-row");
        state.loadingNode = panel.querySelector("#qga-loading");
        state.progressBarWrap = panel.querySelector("#qga-progress-wrap");
        state.progressBarFill = panel.querySelector("#qga-progress-fill");
        state.progressBarText = panel.querySelector("#qga-progress-text");
        state.progressBarNode = panel.querySelector(".qga-progress-bar");

        const modeInput = panel.querySelector("#qga-mode");
        const thresholdInput = panel.querySelector("#qga-threshold");
        const splitByVariableInput = panel.querySelector("#qga-split-by-variable");

        modeInput.value = state.mode;
        thresholdInput.value = state.threshold.toFixed(2);
        if (splitByVariableInput) {
            splitByVariableInput.checked = Boolean(state.settings.splitByVariableInBulk);
        }

        modeInput.addEventListener("change", () => {
            state.mode = modeInput.value;
            saveStoredState();
            rescan();
        });

        thresholdInput.addEventListener("change", () => {
            const value = Number(thresholdInput.value);
            state.threshold = clamp(Number.isFinite(value) ? value : state.settings.similarThreshold, 0.5, 1);
            thresholdInput.value = state.threshold.toFixed(2);
            saveStoredState();
            if (state.mode === "similar") {
                rescan();
            }
        });

        if (splitByVariableInput) {
            splitByVariableInput.addEventListener("change", () => {
                state.settings.splitByVariableInBulk = Boolean(splitByVariableInput.checked);
                saveStoredState();
                rescan();
            });
        }

        panel.querySelector("#qga-group-all").addEventListener("click", () => toggleGroupAll());
        panel.querySelector("#qga-clear").addEventListener("click", () => clearHighlights());
        updateBulkButtonState();
    }
    function setupAutoRescanObserver() {
        if (state.observer) {
            state.observer.disconnect();
            state.observer = null;
        }
        if (!state.panelVisible) {
            return;
        }
        if (!state.settings.autoRescan) {
            return;
        }

        let timer = null;
        const root = findRootElement();
        if (!root) {
            return;
        }

        state.observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => rescan(), 250);
        });
        state.observer.observe(root, { childList: true, subtree: true });
    }

    function findRootElement() {
        try {
            const root = document.querySelector(state.settings.rootSelector);
            return root || document.body;
        } catch (error) {
            console.warn("[QGA] Некорректный корневой селектор:", state.settings.rootSelector, error);
            return document.body;
        }
    }

    function setLoading(isLoading) {
        state.loading = Boolean(isLoading);
        if (state.statsRowNode) {
            state.statsRowNode.style.justifyContent = state.loading ? "center" : "space-between";
        }
        if (!state.loadingNode) {
            return;
        }
        state.loadingNode.style.display = state.loading ? "inline-flex" : "none";
    }

    function rescan() {
        // Если уже идёт ожидание после переключения размера страницы —
        // не запускаем повторный пересчёт, дождёмся запланированного.
        if (state.loading) {
            return;
        }

        clearHighlights();
        if (!state.groupBlockIndexes || !(state.groupBlockIndexes instanceof Map)) {
            state.groupBlockIndexes = new Map();
        } else {
            state.groupBlockIndexes.clear();
        }

        ensureManualGroupButtonHooked();

        if (!state.gridAllPageSizeEnsured) {
            const pageSizeResult = ensureGridPageSizeAll();
            if (pageSizeResult && pageSizeResult.ensured) {
                state.gridAllPageSizeEnsured = true;
                if (pageSizeResult.changed) {
                    // Грид переключает размер страницы — очищаем старые данные,
                    // показываем только индикатор загрузки и считаем позже.
                    state.items = [];
                    state.groups = [];
                    if (state.statsNode) {
                        state.statsNode.textContent = "";
                    }
                    if (state.listNode) {
                        state.listNode.innerHTML = "";
                    }
                    updateBulkButtonState();

                    setLoading(true);
                    setTimeout(() => {
                        performRescanCore();
                    }, 2000);
                    return;
                }
            }
        }

        performRescanCore();
    }

    /**
     * Обеспечивает привязку обработчика к кнопке группировки (group()),
     * чтобы после ручной группировки пересканировать OpenEnds и сохранить
     * актуальные группы переменных в localStorage.
     */
    function ensureManualGroupButtonHooked() {
        const delay = clampInt(
            Number(state.settings.postGroupRescanDelayMs),
            300,
            10000,
            DEFAULT_SETTINGS.postGroupRescanDelayMs
        ) + 600;

        const attachHandler = (selector, stateKeyEl, stateKeyHandler, label) => {
            if (!selector) {
                return;
            }

            let button = null;
            try {
                button = document.querySelector(selector);
            } catch (error) {
                console.warn(`[QGA] Некорректный селектор кнопки ${label}:`, selector, error);
                return;
            }

            if (!(button instanceof HTMLElement)) {
                return;
            }

            if (state[stateKeyEl] === button && state[stateKeyHandler]) {
                return;
            }

            if (state[stateKeyEl] && state[stateKeyHandler]) {
                try {
                    state[stateKeyEl].removeEventListener("click", state[stateKeyHandler]);
                } catch (e) {}
            }

            const runCollect = () => {
                try {
                    collectOpenEndsGroupsFromPage();
                } catch (e) {
                    console.warn(
                        `[QGA] Ошибка collectOpenEndsGroupsFromPage после ${label}:`,
                        e
                    );
                }
            };
            const handler = () => {
                try {
                    setTimeout(runCollect, delay);
                    setTimeout(runCollect, delay + 2000);
                } catch (e) {}
            };

            button.addEventListener("click", handler);
            state[stateKeyEl] = button;
            state[stateKeyHandler] = handler;
        };

        attachHandler(
            state.settings && state.settings.groupActionSelector,
            "manualGroupButtonEl",
            "manualGroupButtonHandler",
            "ручной группировки"
        );
        attachHandler(
            state.settings && state.settings.ungroupActionSelector,
            "manualUngroupButtonEl",
            "manualUngroupButtonHandler",
            "ручной разгруппировки"
        );
    }

    function performRescanCore() {
        setLoading(false);
        const { items, totalRows } = extractItems();
        state.items = items;
        state.totalRowCount = totalRows;
        state.groups = createGroups(state.items, state.mode, state.threshold).filter((group) => group.members.length >= state.settings.minGroupSize);
        state.groups.sort((a, b) => b.members.length - a.members.length);
        renderStats();
        updateProgressBar();
        // Во время массовой группировки не перерисовываем список кластеров,
        // чтобы он не "скакал" и показывал исходные кластеры.
        if (!state.bulkRunning) {
            renderGroups();
        }
        updateBulkButtonState();
    }


    function renderStats() {
        const groupedRows = state.groups.reduce((sum, group) => sum + group.members.length, 0);
        const modeText = state.mode === "exact" ? "точный" : `похожий >= ${state.threshold.toFixed(2)}`;

        // В массовом режиме показываем монотонную метрику — сколько кластеров уже обработано,
        // чтобы счётчик не "скакал" из‑за пересчёта групп после каждой группировки.
        const rowCount = state.totalRowCount > 0 ? state.totalRowCount : state.items.length;
        if (state.bulkRunning) {
            state.statsNode.textContent = `Строк: ${rowCount} | сгруппировано строк: ${groupedRows} | режим: ${modeText}`;
            return;
        }

        state.statsNode.textContent = `Строк: ${rowCount} | сгруппировано строк: ${groupedRows} в ${state.groups.length} кластерах | режим: ${modeText}`;
    }

    function updateProgressBar() {
        if (!state.progressBarFill || !state.progressBarWrap) {
            return;
        }
        if (state.bulkRunning && state.bulkProgressTotal != null && state.bulkProgressTotal > 0) {
            const done = state.processedKeys.size;
            const total = state.bulkProgressTotal;
            const pct = Math.min(1, done / total);
            const pctRound = Math.round(pct * 100);
            state.progressBarFill.style.width = `${pctRound}%`;
            if (state.progressBarNode) {
                state.progressBarNode.setAttribute("aria-valuenow", pctRound);
            }
            return;
        }
        if (!state.bulkRunning) {
            const current = state.groups.length;
            state.progressBarInitialClusterCount = Math.max(
                state.progressBarInitialClusterCount || 0,
                current
            );
        }
        const initial = state.progressBarInitialClusterCount || 0;
        if (initial === 0) {
            state.progressBarFill.style.width = "0%";
            if (state.progressBarNode) {
                state.progressBarNode.setAttribute("aria-valuenow", 0);
            }
            return;
        }
        const removed = initial - state.groups.length;
        const pct = Math.min(1, Math.max(0, removed / initial));
        const pctRound = Math.round(pct * 100);
        state.progressBarFill.style.width = `${pctRound}%`;
        if (state.progressBarNode) {
            state.progressBarNode.setAttribute("aria-valuenow", pctRound);
        }
    }

    function renderGroups() {
        state.listNode.innerHTML = "";
        if (state.groups.length === 0) {
            const empty = document.createElement("li");
            empty.textContent = "Кластеры не найдены. Проверьте селекторы или режим.";
            state.listNode.appendChild(empty);
            return;
        }

        state.groups.forEach((group, index) => {
            const wrapper = document.createElement("li");
            wrapper.className = "qga-group";
            wrapper.setAttribute("data-group-key", group.key);
            if (state.processedKeys.has(group.key)) {
                wrapper.classList.add("is-processed");
            }

            const title = document.createElement("div");
            title.className = "qga-group-title";
            title.textContent = `#${index + 1} | ${group.members.length} строк`;

            const sample = document.createElement("p");
            sample.className = "qga-group-sample";
            sample.textContent = group.sample;

            wrapper.appendChild(title);
            wrapper.appendChild(sample);

            // Во время массовой группировки скрываем все кнопки в элементах списка,
            // оставляя только номер кластера и текст примера.
            if (!state.bulkRunning) {
                const actions = document.createElement("div");
                actions.className = "qga-inline-actions";

                const highlightButton = document.createElement("button");
                highlightButton.textContent = "Подсветить";
                highlightButton.addEventListener("click", () => highlightGroup(group));

                const nextButton = document.createElement("button");
                nextButton.textContent = "Далее";
                nextButton.addEventListener("click", () => focusNextInGroup(group, { highlight: false }));

                const selectButton = document.createElement("button");
                selectButton.textContent = "Выбрать";
                selectButton.addEventListener("click", () => selectGroup(group, { markProcessed: false, silent: true }));

                const clearSelectButton = document.createElement("button");
                clearSelectButton.textContent = "Снять выбор";
                clearSelectButton.addEventListener("click", () => {
                    clearCurrentSelections();
                });

                const selectAndGroupButton = document.createElement("button");
                selectAndGroupButton.textContent = "Выбрать + Сгруппировать";
                selectAndGroupButton.addEventListener("click", () => selectAndGroupGroup(group));

                actions.appendChild(highlightButton);
                actions.appendChild(nextButton);
                actions.appendChild(selectButton);
                actions.appendChild(clearSelectButton);
                actions.appendChild(selectAndGroupButton);

                wrapper.appendChild(actions);
            }

            state.listNode.appendChild(wrapper);
        });
    }
