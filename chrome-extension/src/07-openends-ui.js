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

    function extractItems() {
        const root = findRootElement();
        let rows = [];
        try {
            rows = Array.from(root.querySelectorAll(state.settings.itemSelector));
        } catch (error) {
            console.warn("[QGA] Некорректный селектор строк:", state.settings.itemSelector, error);
            return [];
        }

        const items = [];
        const totalRows = rows.length;
        for (let i = 0; i < rows.length; i += 1) {
            const node = rows[i];
            const questionText = extractQuestionText(node);
            const normalizedQuestion = normalizeText(questionText || "");
            const variablePrefix = extractVariablePrefix(node);

            let rawText = "";
            let normalized = "";
            let tokens = [];
            let matchSource = "text";

            if (normalizedQuestion) {
                rawText = questionText;
                let groupingKey = normalizedQuestion;

                if (state.settings.splitByVariableInBulk && variablePrefix) {
                    const normalizedPrefix = normalizeText(variablePrefix);
                    if (normalizedPrefix) {
                        groupingKey = `${normalizedQuestion}|var:${normalizedPrefix}`;
                    }
                }

                normalized = groupingKey;
                tokens = tokenize(normalizedQuestion);
            } else if (variablePrefix) {
                const normalizedPrefix = normalizeText(variablePrefix);
                if (!normalizedPrefix) {
                    continue;
                }
                rawText = `Префикс переменной: ${variablePrefix}`;
                normalized = `__var_prefix__:${normalizedPrefix}`;
                tokens = [normalizedPrefix];
                matchSource = "variable_prefix";
            } else {
                continue;
            }

            items.push({
                id: String(i),
                node,
                rawText,
                normalized,
                tokens,
                matchSource,
                variablePrefix,
                selectControl: findSelectControl(node)
            });
        }

        return { items, totalRows };
    }

    function extractQuestionText(node) {
        return extractTextBySelector(node, state.settings.textSelector);
    }

    function extractVariablePrefix(node) {
        const variableText = extractTextBySelector(node, state.settings.variableSelector);
        const fromVariableCell = parseVariablePrefix(variableText);
        if (fromVariableCell) {
            return fromVariableCell;
        }

        const rowText = ((node.innerText || node.textContent || "").trim()).replace(/\s+/g, " ");
        return parseVariablePrefix(rowText);
    }

    function extractTextBySelector(node, selector) {
        if (!selector) {
            return "";
        }
        try {
            const targetNode = node.querySelector(selector);
            if (!targetNode) {
                return "";
            }
            return ((targetNode.innerText || targetNode.textContent || "").trim()).replace(/\s+/g, " ");
        } catch (error) {
            return "";
        }
    }

    function parseVariablePrefix(value) {
        if (!value) {
            return "";
        }

        const chunks = value
            .split(/[,;]+/)
            .map((chunk) => chunk.trim())
            .filter(Boolean);

        for (const chunk of chunks) {
            const match = chunk.match(/\b([A-Za-z0-9]+)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*\b/);
            if (match && match[1]) {
                return match[1].toUpperCase();
            }
        }

        const fallbackMatch = value.match(/\b([A-Za-z0-9]+)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*\b/);
        if (fallbackMatch && fallbackMatch[1]) {
            return fallbackMatch[1].toUpperCase();
        }

        return "";
    }

    function findSelectControl(node) {
        if (!state.settings.selectControlSelector) {
            return null;
        }
        try {
            if (node.matches(state.settings.selectControlSelector)) {
                return node;
            }
            return node.querySelector(state.settings.selectControlSelector);
        } catch (error) {
            return null;
        }
    }

    function normalizeText(value) {
        return value
            .toLowerCase()
            .replace(/ё/g, "е")
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function tokenize(value) {
        return value
            .split(" ")
            .map((token) => token.trim())
            .filter((token) => token.length > 1)
            .filter((token) => !STOP_WORDS.has(token))
            .filter((token) => !/^\d+$/.test(token));
    }

    function createGroups(items, mode, threshold) {
        if (mode === "similar") {
            if (items.length > state.settings.maxItemsForSimilarMode) {
                console.warn(`[QGA] Режим похожести пропущен: строк=${items.length}, лимит=${state.settings.maxItemsForSimilarMode}.`);
                return buildExactGroups(items);
            }
            return buildSimilarGroups(items, threshold);
        }
        return buildExactGroups(items);
    }

    function buildExactGroups(items) {
        const grouped = new Map();
        for (const item of items) {
            if (!grouped.has(item.normalized)) {
                grouped.set(item.normalized, []);
            }
            grouped.get(item.normalized).push(item);
        }

        const groups = [];
        for (const [key, members] of grouped.entries()) {
            groups.push({
                key,
                sample: members[0].rawText,
                members
            });
        }
        return groups;
    }

    function buildSimilarGroups(items, threshold) {
        const dsu = new DisjointSet(items.length);
        const tokenBuckets = new Map();
        const normalizedIndex = new Map();

        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            for (const token of item.tokens) {
                if (!tokenBuckets.has(token)) {
                    tokenBuckets.set(token, []);
                }
                tokenBuckets.get(token).push(i);
            }
            if (normalizedIndex.has(item.normalized)) {
                dsu.union(i, normalizedIndex.get(item.normalized));
            } else {
                normalizedIndex.set(item.normalized, i);
            }
        }

        const seenPairs = new Set();
        for (const bucket of tokenBuckets.values()) {
            if (bucket.length < 2) {
                continue;
            }
            for (let a = 0; a < bucket.length - 1; a += 1) {
                for (let b = a + 1; b < bucket.length; b += 1) {
                    const i = bucket[a];
                    const j = bucket[b];
                    const pairKey = i < j ? `${i}:${j}` : `${j}:${i}`;
                    if (seenPairs.has(pairKey)) {
                        continue;
                    }
                    seenPairs.add(pairKey);
                    if (isSimilar(items[i], items[j], threshold)) {
                        dsu.union(i, j);
                    }
                }
            }
        }

        const grouped = new Map();
        for (let i = 0; i < items.length; i += 1) {
            const root = dsu.find(i);
            if (!grouped.has(root)) {
                grouped.set(root, []);
            }
            grouped.get(root).push(items[i]);
        }

        const groups = [];
        for (const members of grouped.values()) {
            const sorted = members.slice().sort((a, b) => a.rawText.length - b.rawText.length);
            groups.push({
                key: sorted[0].normalized,
                sample: sorted[0].rawText,
                members: sorted
            });
        }
        return groups;
    }

    function isSimilar(a, b, threshold) {
        if (a.normalized === b.normalized) {
            return true;
        }
        if (a.matchSource === "variable_prefix" || b.matchSource === "variable_prefix") {
            return false;
        }
        const lenRatio = Math.min(a.normalized.length, b.normalized.length) / Math.max(a.normalized.length, b.normalized.length);
        if (lenRatio < 0.72) {
            return false;
        }
        if (a.tokens.length === 0 || b.tokens.length === 0) {
            return false;
        }

        const aSet = new Set(a.tokens);
        const bSet = new Set(b.tokens);
        let intersection = 0;
        for (const token of aSet) {
            if (bSet.has(token)) {
                intersection += 1;
            }
        }
        const union = aSet.size + bSet.size - intersection;
        if (union === 0) {
            return false;
        }
        return (intersection / union) >= threshold;
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

    function clearHighlights() {
        state.highlightedNodes.forEach((node) => node.classList.remove(HIGHLIGHT_CLASS));
        state.highlightedNodes.clear();
        updateBulkButtonState();
    }

    function highlightGroup(group, options = {}) {
        clearHighlights();

        for (const item of group.members) {
            item.node.classList.add(HIGHLIGHT_CLASS);
            state.highlightedNodes.add(item.node);
        }

        let scrollTarget = null;
        let scrollBlock = "nearest";
        let scrollBehavior = "smooth";
        if (options.scrollToNode && options.scrollToNode.nodeName) {
            scrollTarget = options.scrollToNode;
            scrollBlock = "start";
            scrollBehavior = options.scrollBehavior === "auto" ? "auto" : "smooth";
        } else if (typeof options.focusIndex === "number") {
            const focusIndex = clampInt(options.focusIndex, 0, group.members.length - 1, 0);
            const member = group.members[focusIndex];
            scrollTarget = member && member.node ? member.node : null;
        }
        if (!scrollTarget && group.members[0]) {
            scrollTarget = group.members[0].node;
        }
        if (scrollTarget) {
            scrollTarget.scrollIntoView({ behavior: scrollBehavior, block: scrollBlock });
        }

        updateBulkButtonState();
    }

    function focusNextInGroup(group, options = {}) {
        if (!group || !Array.isArray(group.members) || group.members.length === 0) {
            return;
        }

        const blocks = getBlocksForGroup(group);
        if (blocks.length === 0) {
            return;
        }

        if (!state.groupBlockIndexes || !(state.groupBlockIndexes instanceof Map)) {
            state.groupBlockIndexes = new Map();
        }

        let currentBlockIndex = state.groupBlockIndexes.has(group.key)
            ? Number(state.groupBlockIndexes.get(group.key))
            : NaN;

        if (!Number.isFinite(currentBlockIndex) || currentBlockIndex < 0 || currentBlockIndex >= blocks.length) {
            currentBlockIndex = getFirstVisibleBlockIndex(blocks);
        }

        const nextBlockIndex = (currentBlockIndex + 1) % blocks.length;
        state.groupBlockIndexes.set(group.key, nextBlockIndex);

        const targetBlock = blocks[nextBlockIndex];
        const firstRowOfBlock = targetBlock && targetBlock[0] ? targetBlock[0] : null;
        const isWrapToFirst = nextBlockIndex === 0;

        if (options.highlight === false) {
            // В режиме «Далее» без подсветки просто скроллим к следующему блоку,
            // не изменяя текущую подсветку (если она есть).
            if (firstRowOfBlock && firstRowOfBlock.node) {
                firstRowOfBlock.node.scrollIntoView({
                    behavior: isWrapToFirst ? "auto" : "smooth",
                    block: "nearest"
                });
            }
            return;
        }

        if (firstRowOfBlock && firstRowOfBlock.node) {
            highlightGroup(group, {
                scrollToNode: firstRowOfBlock.node,
                scrollBehavior: isWrapToFirst ? "auto" : "smooth"
            });
        } else {
            highlightGroup(group);
        }
    }

    function getBlocksForGroup(group) {
        if (!group || !Array.isArray(group.members) || group.members.length === 0) {
            return [];
        }

        const sorted = group.members.slice().sort((a, b) => Number(a.id) - Number(b.id));
        const blocks = [];
        let currentBlock = [];
        let prevIndex = -2;

        for (const item of sorted) {
            const idx = Number(item.id);
            if (Number.isNaN(idx)) {
                continue;
            }
            if (idx !== prevIndex + 1 && currentBlock.length > 0) {
                blocks.push(currentBlock);
                currentBlock = [];
            }
            currentBlock.push(item);
            prevIndex = idx;
        }

        if (currentBlock.length > 0) {
            blocks.push(currentBlock);
        }

        return blocks;
    }

    function getFirstVisibleBlockIndex(blocks) {
        const viewportTop = 0;
        const viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;
        if (!viewportBottom || blocks.length === 0) {
            return 0;
        }

        for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
            const block = blocks[blockIndex];
            if (!Array.isArray(block)) {
                continue;
            }
            for (const item of block) {
                if (!item || !item.node || typeof item.node.getBoundingClientRect !== "function") {
                    continue;
                }
                const rect = item.node.getBoundingClientRect();
                if (!rect) {
                    continue;
                }
                const isVisible = rect.bottom > viewportTop && rect.top < viewportBottom;
                if (isVisible) {
                    return blockIndex;
                }
            }
        }

        return 0;
    }

    function selectGroup(group, options = {}) {
        const markProcessed = options.markProcessed !== false;
        const clearSelection = options.clearSelection !== false && state.settings.clearSelectionBeforeSelect;
        const silent = options.silent === true;

        if (!silent) {
            highlightGroup(group, options);
        }
        if (clearSelection) {
            clearCurrentSelections();
        }

        for (const item of group.members) {
            activateSelectControl(item.selectControl, item.node);
        }

        if (markProcessed) {
            markProcessedGroup(group.key);
        }
    }

    function selectAndGroupGroup(group) {
        selectGroup(group, { markProcessed: false, clearSelection: true });
        if (triggerGroupAction()) {
            markProcessedGroup(group.key);
        }
    }

    function selectNextGroup() {
        const next = state.groups.find((group) => !state.processedKeys.has(group.key));
        if (!next) {
            alert("Необработанных кластеров больше нет.");
            return;
        }
        selectGroup(next, { markProcessed: true, clearSelection: true });
    }

    function selectAndGroupNextGroup() {
        const next = state.groups.find((group) => !state.processedKeys.has(group.key));
        if (!next) {
            alert("Необработанных кластеров больше нет.");
            return;
        }
        selectGroup(next, { markProcessed: false, clearSelection: true });
        if (triggerGroupAction()) {
            markProcessedGroup(next.key);
        }
    }

    function toggleGroupAll() {
        if (state.bulkRunning) {
            stopBulkGrouping();
            return;
        }

        startBulkGrouping();
    }

    function startBulkGrouping() {
        // Массовая обработка всегда стартует "с нуля".
        state.processedKeys.clear();
        saveStoredState();
        renderStats();
        renderGroups();

        state.bulkPass = 1;
        state.bulkGroupsInPass = 0;
        state.bulkGroupsTotal = 0;
        state.bulkProgressTotal = state.groups.length > 0 ? state.groups.length : null;
        state.bulkRunning = true;
        updateBulkButtonState();
        if (state.progressBarWrap) {
            state.progressBarWrap.classList.add("qga-progress-visible");
        }
        renderGroups();

        runBulkGroupingStep();
    }

    function stopBulkGrouping() {
        state.bulkRunning = false;
        if (state.progressBarWrap) {
            state.progressBarWrap.classList.remove("qga-progress-visible");
        }
        if (state.bulkTimer) {
            clearTimeout(state.bulkTimer);
            state.bulkTimer = null;
        }
        updateBulkButtonState();
        renderGroups();
    }

    function runBulkGroupingStep() {
        if (!state.bulkRunning) {
            return;
        }

        rescan();

        // В массовом режиме просто берём первый доступный кластер,
        // пока их список не опустеет, не фильтруя по processedKeys.
        const next = state.groups[0];
        if (!next) {
            stopBulkGrouping();
            return;
        }

        // В массовом режиме не подсвечиваем строки и не скроллим к ним,
        // чтобы процесс оставался незаметным для пользователя.
        selectGroup(next, { markProcessed: false, clearSelection: true, silent: true });
        if (!triggerGroupAction({ scheduleRescan: false })) {
            stopBulkGrouping();
            return;
        }

        markProcessedGroup(next.key);
        state.bulkGroupsInPass += 1;
        state.bulkGroupsTotal += 1;

        const delay = clampInt(
            Number(state.settings.postGroupRescanDelayMs),
            200,
            10000,
            DEFAULT_SETTINGS.postGroupRescanDelayMs
        ) + 400;

        state.bulkTimer = setTimeout(() => {
            state.bulkTimer = null;
            rescan();
            runBulkGroupingStep();
        }, delay);
    }

    function getPagerRoot() {
        return document.querySelector("#gridOpenEnds .k-pager-wrap, #gridOpenEnds .k-grid-pager");
    }

    function ensureGridPageSizeAll() {
        const pager = getPagerRoot();
        if (!pager) {
            return { ensured: false, changed: false };
        }

        const sizesContainer =
            pager.querySelector(".k-pager-sizes") ||
            pager.querySelector("[data-role='dropdownlist'][aria-controls*='gridOpenEnds']") ||
            null;

        let select = sizesContainer ? sizesContainer.querySelector("select") : null;
        if (!(select instanceof HTMLSelectElement)) {
            return { ensured: false, changed: false };
        }

        const options = Array.from(select.options || []);
        if (options.length === 0) {
            return { ensured: false, changed: false };
        }

        const normalize = (value) => normalizeSingleLine(value).toLowerCase();

        let targetOption = options.find((option) => {
            const text = normalize(option.textContent || "");
            const val = normalize(option.value || "");
            if (!text && !val) {
                return false;
            }
            return (
                text === "all" ||
                text === "все" ||
                text.includes("all") ||
                text.includes("все") ||
                val === "all"
            );
        });

        if (!targetOption) {
            let best = null;
            let bestValue = -Infinity;
            for (const option of options) {
                const numeric = Number.parseInt(option.value, 10);
                if (!Number.isFinite(numeric)) {
                    continue;
                }
                if (numeric > bestValue) {
                    bestValue = numeric;
                    best = option;
                }
            }
            targetOption = best || options[options.length - 1];
        }

        if (!targetOption) {
            return { ensured: false, changed: false };
        }

        if (select.value === targetOption.value) {
            return { ensured: true, changed: false };
        }

        select.value = targetOption.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        select.dispatchEvent(new Event("input", { bubbles: true }));

        return { ensured: true, changed: true };
    }

    function updateBulkButtonState() {
        if (!state.panel) {
            return;
        }
        state.panel.classList.toggle("qga-bulk-running", state.bulkRunning);

        const bulkButton = state.panel.querySelector("#qga-group-all");
        const clearHighlightButton = state.panel.querySelector("#qga-clear");
        if (!bulkButton && !clearHighlightButton) {
            return;
        }

        const hasGroups = Array.isArray(state.groups) && state.groups.length > 0;
        if (bulkButton) {
            bulkButton.textContent = state.bulkRunning ? "Остановить группировку" : "Сгруппировать все";
            // Кнопка должна оставаться активной во время массовой группировки,
            // чтобы пользователь мог её остановить.
            bulkButton.disabled = !hasGroups;
        }

        if (clearHighlightButton) {
            const hasHighlights = state.highlightedNodes && state.highlightedNodes.size > 0;
            clearHighlightButton.disabled = !hasHighlights;
        }
    }

    function clearCurrentSelections() {
        for (const item of state.items) {
            deactivateSelectControl(item.selectControl);
        }
    }

    function triggerGroupAction(options = {}) {
        let triggered = false;
        let button = null;
        const scheduleRescan = options.scheduleRescan !== false;

        if (state.settings.groupActionSelector) {
            try {
                button = document.querySelector(state.settings.groupActionSelector);
            } catch (error) {
                button = null;
            }
        }

        if (button) {
            button.click();
            triggered = true;
        }

        if (!triggered) {
            alert("Не найдена кнопка группировки. Проверьте селектор кнопки.");
            return false;
        }

        if (scheduleRescan) {
            schedulePostGroupRescan();
        }
        return true;
    }

    function schedulePostGroupRescan() {
        const delay = clampInt(Number(state.settings.postGroupRescanDelayMs), 300, 10000, DEFAULT_SETTINGS.postGroupRescanDelayMs);
        setTimeout(() => rescan(), delay);
        setTimeout(() => rescan(), delay + 900);
    }

    function markClusterProcessedInUI(groupKey) {
        if (!state.listNode) return;
        const wrapper = Array.from(state.listNode.children).find(
            (el) => el.getAttribute("data-group-key") === groupKey
        );
        if (!wrapper) return;
        wrapper.classList.add("qga-group--processed");
        setTimeout(() => {
            if (wrapper.parentNode) wrapper.remove();
        }, 300);
    }

    function markProcessedGroup(groupKey) {
        state.processedKeys.add(groupKey);
        saveStoredState();
        renderStats();
        markClusterProcessedInUI(groupKey);
        if (state.bulkRunning) {
            updateProgressBar();
        }
    }

    function activateSelectControl(control, fallbackNode) {
        setControlChecked(control, true, fallbackNode);
    }

    function deactivateSelectControl(control) {
        setControlChecked(control, false, null);
    }

    function setControlChecked(control, shouldCheck, fallbackNode) {
        if (!control) {
            if (shouldCheck && fallbackNode) {
                fallbackNode.click();
            }
            return;
        }

        const tag = control.tagName ? control.tagName.toLowerCase() : "";
        const type = (control.type || "").toLowerCase();

        if (tag === "input" && (type === "checkbox" || type === "radio")) {
            if (control.checked === shouldCheck) {
                return;
            }
            control.click();
            if (control.checked !== shouldCheck) {
                control.checked = shouldCheck;
                control.dispatchEvent(new Event("input", { bubbles: true }));
                control.dispatchEvent(new Event("change", { bubbles: true }));
            }
            return;
        }

        if (shouldCheck) {
            control.click();
        }
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function clampInt(value, min, max, fallback) {
        if (!Number.isFinite(value)) {
            return fallback;
        }
        const intValue = Math.round(value);
        return Math.min(max, Math.max(min, intValue));
    }

    class DisjointSet {
        constructor(size) {
            this.parent = Array.from({ length: size }, (_, index) => index);
            this.rank = Array.from({ length: size }, () => 0);
        }

        find(index) {
            if (this.parent[index] !== index) {
                this.parent[index] = this.find(this.parent[index]);
            }
            return this.parent[index];
        }

        union(a, b) {
            const rootA = this.find(a);
            const rootB = this.find(b);
            if (rootA === rootB) {
                return;
            }
            if (this.rank[rootA] < this.rank[rootB]) {
                this.parent[rootA] = rootB;
            } else if (this.rank[rootA] > this.rank[rootB]) {
                this.parent[rootB] = rootA;
            } else {
                this.parent[rootB] = rootA;
                this.rank[rootA] += 1;
            }
        }
    }