(function () {
    "use strict";

    if (window.top !== window) {
        return;
    }
    if (window.__qga_extension_loaded__) {
        return;
    }
    window.__qga_extension_loaded__ = true;

    console.info("[QGA] запуск content-скрипта расширения:", window.location.href);

    const STORAGE_KEY = "__qga_state_v2__";
    const PROJECT_PREFILL_STORAGE_KEY = "__qga_project_prefill_v1__";
    const PROJECT_PREFILL_STORAGE_FALLBACK_KEY = "__qga_project_prefill_v1_fallback__";
    const PANEL_ID = "qga-panel";
    const HIGHLIGHT_CLASS = "qga-highlight";
    const PYRUS_COPY_BUTTON_ID = "qga-pyrus-copy";
    const PYRUS_QUICK_FILL_LINK_CLASS = "qga-pyrus-quick-fill-link";
    const PYRUS_QUICK_FILL_BUTTON_ID = "qga-pyrus-quick-fill-single";
    const PYRUS_QUICK_FILL_WRAPPER_CLASS = "qga-pyrus-quick-fill-wrapper";
    const CLEANER_AUTO_FILL_QUERY_KEY = "qga_autofill";
    const PAGE_KIND = detectPageKind();

    const DEFAULT_SETTINGS = {
        rootSelector: "#divOpenEnds",
        itemSelector: "#gridOpenEnds .k-grid-content tbody tr.k-master-row",
        textSelector: "td:nth-child(4), #text",
        variableSelector: "td:nth-child(5)",
        selectControlSelector: "td:first-child input.k-checkbox",
        groupActionSelector: "button[onclick='group()']",
        minGroupSize: 2,
        similarThreshold: 0.86,
        maxItemsForSimilarMode: 1500,
        autoRescan: true,
        clearSelectionBeforeSelect: true,
        postGroupRescanDelayMs: 500,
        splitByVariableInBulk: false
    };

    const STOP_WORDS = new Set([
        "a",
        "an",
        "and",
        "or",
        "the",
        "to",
        "of",
        "in",
        "on",
        "for",
        "is",
        "are",
        "be",
        "и",
        "в",
        "во",
        "на",
        "по",
        "с",
        "со",
        "к",
        "ко",
        "от",
        "до",
        "из",
        "за",
        "для",
        "что",
        "как",
        "это",
        "или",
        "а",
        "но",
        "не"
    ]);

    const state = {
        settings: { ...DEFAULT_SETTINGS },
        mode: "exact",
        threshold: DEFAULT_SETTINGS.similarThreshold,
        items: [],
        totalRowCount: 0,
        groups: [],
        processedKeys: new Set(),
        highlightedNodes: new Set(),
        groupBlockIndexes: new Map(),
        panelVisible: false,
        selectorsVisible: false,
        bulkRunning: false,
        bulkTimer: null,
        bulkPass: 0,
        bulkGroupsInPass: 0,
        bulkGroupsTotal: 0,
        bulkProgressTotal: null,
        bulkMaxPasses: 8,
        observer: null,
        panel: null,
        listNode: null,
        statsNode: null,
        statsRowNode: null,
        loadingNode: null,
        loading: false,
        progressBarInitialClusterCount: 0,
        progressBarNode: null,
        progressBarFill: null,
        progressBarText: null,
        progressBarWrap: null,
        progressBarRemovedOverride: null,
        gridAllPageSizeEnsured: false,
        cleanerAutoFillTriggered: false,
        pyrusHashListenerAttached: false
    };

    init();

    function init() {
        if (PAGE_KIND === "openends") {
            initOpenEndsMode();
            return;
        }

        if (PAGE_KIND === "pyrus_task") {
            initPyrusMode();
            return;
        }

        if (PAGE_KIND === "cleaner_projects") {
            initCleanerProjectsMode();
        }
    }

    function initOpenEndsMode() {
        loadStoredState();
        injectStyles();
        bindRuntimeMessages();
        waitForBody(() => {
            buildPanel();
            hidePanel();
        });
    }

    function detectPageKind() {
        const host = (window.location.hostname || "").toLowerCase();
        const path = (window.location.pathname || "").toLowerCase();

        if (host.endsWith("clr.env7.biz") && path.includes("/lk/project/edit/")) {
            return "openends";
        }

        if (host.endsWith("pyrus.com") && path.startsWith("/t")) {
            return "pyrus_task";
        }

        if (host.endsWith("clr.env7.biz") && (path === "/lk" || path === "/lk/" || path.startsWith("/lk/projects"))) {
            return "cleaner_projects";
        }

        return "other";
    }

    function bindRuntimeMessages() {
        if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) {
            return;
        }

        chrome.runtime.onMessage.addListener((message) => {
            if (!message || message.target !== "qga") {
                return;
            }

            if (message.type === "toggle_panel") {
                togglePanelVisibility();
            } else if (message.type === "show_panel") {
                showPanel();
            } else if (message.type === "hide_panel") {
                hidePanel();
            }
        });
    }

    function togglePanelVisibility() {
        if (!state.panel) {
            waitForBody(() => {
                if (!state.panel) {
                    buildPanel();
                }
                togglePanelVisibility();
            });
            return;
        }

        if (state.panelVisible) {
            hidePanel();
        } else {
            showPanel();
        }
    }

    function showPanel() {
        if (!state.panel) {
            return;
        }
        state.panel.style.display = "flex";
        state.panelVisible = true;
        updateBulkButtonState();
        setupAutoRescanObserver();
        rescan();
    }

    function hidePanel() {
        if (!state.panel) {
            return;
        }
        state.panel.style.display = "none";
        state.panelVisible = false;
        if (state.observer) {
            state.observer.disconnect();
            state.observer = null;
        }
        if (state.bulkRunning) {
            stopBulkGrouping();
        }
    }

    function waitForBody(callback) {
        if (document.body) {
            callback();
            return;
        }
        const observer = new MutationObserver(() => {
            if (document.body) {
                observer.disconnect();
                callback();
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function initPyrusMode() {
        waitForBody(() => {
            removeLegacyPyrusCopyButton();
            ensurePyrusQuickFillLinks();
            observePyrusPageForQuickLinks();
            bindPyrusHashChange();
        });
    }

    function initCleanerProjectsMode() {
        waitForBody(() => {
            removeCleanerFillButtonIfExists();
            if (!state.cleanerAutoFillTriggered && hasCleanerAutoFillRequest()) {
                state.cleanerAutoFillTriggered = true;
                runCleanerAutoFillFlow();
            }
        });
    }

    function removeCleanerFillButtonIfExists() {
        const button = document.querySelector("#qga-cleaner-fill");
        if (!button) {
            return;
        }

        const wrapper = button.parentElement;
        button.remove();

        if (wrapper && wrapper.childElementCount === 0) {
            wrapper.remove();
        }
    }

    function observePyrusPageForQuickLinks() {
        if (!document.body) {
            return;
        }

        let timer = null;
        const observer = new MutationObserver((mutations) => {
            const ourButton = document.getElementById(PYRUS_QUICK_FILL_BUTTON_ID);
            const isOurChange = mutations.every((m) => ourButton && (ourButton === m.target || ourButton.contains(m.target)));
            if (isOurChange) {
                return;
            }
            clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                removeLegacyPyrusCopyButton();
                ensurePyrusQuickFillLinks();
            }, 180);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function removeLegacyPyrusCopyButton() {
        const legacyButton = document.getElementById(PYRUS_COPY_BUTTON_ID);
        if (legacyButton) {
            legacyButton.remove();
        }

        const legacyQuickFillButtons = document.querySelectorAll(`.${PYRUS_QUICK_FILL_LINK_CLASS}`);
        for (const button of legacyQuickFillButtons) {
            if (button.id === PYRUS_QUICK_FILL_BUTTON_ID) {
                continue;
            }
            button.remove();
        }
    }

    function ensurePyrusQuickFillLinks() {
        if (!isPyrusTaskIdPage()) {
            removeInjectedPyrusQuickFillButtons();
            return false;
        }

        const anchorControl = findPyrusQuickFillReferenceControl();
        if (!anchorControl) {
            console.info("[QGA] Кнопка В CleanerUI: не найдено место вставки (Новый клиент/Чистилка/Inspector Bot)");
            return false;
        }

        const referenceNote = anchorControl.closest(".formFieldNote") || anchorControl.closest(".formFieldButtonWrapper");
        const insertionAnchor = referenceNote || anchorControl;

        const existingButton = document.getElementById(PYRUS_QUICK_FILL_BUTTON_ID);
        if (existingButton) {
            const existingWrapper = existingButton.closest(`.${PYRUS_QUICK_FILL_WRAPPER_CLASS}`) || existingButton;
            if (insertionAnchor.nextElementSibling === existingWrapper) {
                return true;
            }
        }

        removeInjectedPyrusQuickFillButtons();

        const wrapper = createPyrusQuickFillWrapper(referenceNote);
        const button = buildPyrusQuickFillButton(anchorControl);
        if (!button) {
            return false;
        }

        const buttonContainer = wrapper.querySelector(".formFieldNoteControl") || wrapper;
        buttonContainer.appendChild(button);
        insertionAnchor.insertAdjacentElement("afterend", wrapper);

        console.info("[QGA] Кнопка В CleanerUI: добавлена рядом с кнопкой Новый клиент");
        return true;
    }

    function bindPyrusHashChange() {
        if (state.pyrusHashListenerAttached) {
            return;
        }

        window.addEventListener("hashchange", () => {
            removeLegacyPyrusCopyButton();
            ensurePyrusQuickFillLinks();
        });
        state.pyrusHashListenerAttached = true;
    }

    function isPyrusTaskIdPage() {
        const hash = normalizeSingleLine(window.location.hash || "").toLowerCase();
        return /^#id\d+/.test(hash);
    }

    function buildPyrusQuickFillButton(referenceControl) {
        if (!referenceControl) {
            return null;
        }

        const button = document.createElement("a");
        button.href = "#";
        button.id = PYRUS_QUICK_FILL_BUTTON_ID;
        button.className = `linkButton linkButton_theme_gray formFieldNoteButton ${PYRUS_QUICK_FILL_LINK_CLASS}`.trim();
        button.title = "Скопировать данные проекта, открыть CleanerUI и заполнить форму";
        button.setAttribute("role", "button");

        const textSpan = document.createElement("span");
        textSpan.className = "formFieldNoteButton_text";
        textSpan.textContent = "Сетап Чистилки";
        button.appendChild(textSpan);

        button.addEventListener("click", handlePyrusQuickFillClick);

        return button;
    }

    function createPyrusQuickFillWrapper(referenceNote) {
        if (referenceNote && referenceNote.classList.contains("formFieldNote")) {
            const outer = document.createElement("div");
            outer.className = [referenceNote.className, PYRUS_QUICK_FILL_WRAPPER_CLASS].filter(Boolean).join(" ");
            const style = referenceNote.getAttribute("style");
            if (style) {
                outer.setAttribute("style", style);
            }
            outer.style.flex = "0 0 auto";
            outer.style.width = "fit-content";

            const content = document.createElement("div");
            content.className = "formFieldContent formFieldContent_small formFieldNote__content";

            const control = document.createElement("div");
            control.className = "formFieldNoteControl";

            content.appendChild(control);
            outer.appendChild(content);
            return outer;
        }

        const wrapper = document.createElement("div");
        wrapper.className = PYRUS_QUICK_FILL_WRAPPER_CLASS;
        wrapper.style.display = "inline-block";
        wrapper.style.verticalAlign = "top";
        return wrapper;
    }

    function findPyrusQuickFillReferenceControl() {
        const controls = Array.from(document.querySelectorAll("button, a"))
            .filter((node) => isElementVisible(node));

        const priorities = [
            "новый клиент (заявку юристу)",
            "новый клиент",
            "inspector bot",
            "чистилка",
            "генерилка",
            "добавить подзадачу",
            "считалка"
        ];

        for (const marker of priorities) {
            const match = controls.find((node) => isPyrusQuickFillReferenceText(node, marker));
            if (match) {
                return match;
            }
        }

        return null;
    }

    function isPyrusQuickFillReferenceText(node, marker) {
        if (!node || !marker) {
            return false;
        }

        const text = normalizeSearchText(node.textContent || "");
        const normalizedMarker = normalizeSearchText(marker);
        return Boolean(text) && Boolean(normalizedMarker) && text.includes(normalizedMarker);
    }

    function removeInjectedPyrusQuickFillButtons() {
        const selectors = [
            `#${PYRUS_QUICK_FILL_BUTTON_ID}`,
            `.${PYRUS_QUICK_FILL_LINK_CLASS}`,
            `.${PYRUS_QUICK_FILL_WRAPPER_CLASS}`
        ];
        for (const selector of selectors) {
            const nodes = document.querySelectorAll(selector);
            for (const node of nodes) {
                node.remove();
            }
        }
    }

    function normalizeSearchText(value) {
        return normalizeSingleLine(value)
            .toLowerCase()
            .replace(/ё/g, "е")
            .replace(/[^\p{L}\p{N}\s:.-]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    async function handlePyrusQuickFillClick(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const button = event && event.currentTarget instanceof HTMLElement
            ? event.currentTarget
            : null;

        if (button && button.dataset.qgaBusy === "1") {
            return;
        }

        if (button) {
            button.dataset.qgaBusy = "1";
            if (button instanceof HTMLButtonElement) {
                button.disabled = true;
            } else {
                button.setAttribute("aria-disabled", "true");
                button.style.pointerEvents = "none";
                button.style.opacity = "0.6";
            }
        }

        try {
            const result = await copyPyrusPayloadToStorage();
            if (!result.ok) {
                alert(result.message);
                return;
            }

            const cleanerUrl = buildCleanerAutoFillUrl();
            const openResult = await openCleanerInNewTab(cleanerUrl);
            if (!openResult.ok) {
                alert("Не удалось открыть CleanerUI в новой вкладке. Проверьте, что расширение обновлено, и повторите.");
                return;
            }

            if (result.missing.length > 0) {
                alert(`Данные сохранены, но не найдены поля: ${result.missing.join(", ")}. Форма заполнится частично.`);
            }
        } finally {
            if (button) {
                if (button instanceof HTMLButtonElement) {
                    button.disabled = false;
                } else {
                    button.removeAttribute("aria-disabled");
                    button.style.pointerEvents = "";
                    button.style.opacity = "";
                }
                delete button.dataset.qgaBusy;
            }
        }
    }

    async function copyPyrusPayloadToStorage() {
        const payload = await collectPyrusProjectPayloadWithExpansion();
        const hasAnyValue = Boolean(payload.projectName || payload.projectId || payload.plan || payload.dbName);
        if (!hasAnyValue) {
            return {
                ok: false,
                message: "Не удалось найти поля на странице Pyrus. Проверьте, что карточка проекта полностью открыта."
            };
        }

        payload.sourceUrl = window.location.href;
        payload.sourceTitle = document.title || "";
        payload.copiedAt = new Date().toISOString();

        const saved = await saveProjectPayload(payload);
        if (!saved) {
            return {
                ok: false,
                message: "Не удалось сохранить данные в хранилище расширения."
            };
        }

        return {
            ok: true,
            payload,
            missing: collectMissingProjectPayloadFields(payload)
        };
    }

    function collectMissingProjectPayloadFields(payload) {
        const missing = [];
        if (!payload || typeof payload !== "object") {
            return missing;
        }

        if (!payload.projectName) {
            missing.push("Название проекта");
        }
        if (!payload.projectId) {
            missing.push("Номер в панели PR");
        }
        if (!payload.plan) {
            missing.push("N");
        }
        if (!payload.dbName) {
            missing.push("Sawtooth");
        }

        return missing;
    }

    function buildCleanerAutoFillUrl() {
        const url = new URL("https://clr.env7.biz/lk");
        url.searchParams.set(CLEANER_AUTO_FILL_QUERY_KEY, "1");
        return url.toString();
    }

    function openCleanerInNewTab(url) {
        return new Promise((resolve) => {
            const runtime = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage
                ? chrome.runtime
                : null;

            if (runtime) {
                try {
                    runtime.sendMessage(
                        {
                            target: "qga",
                            type: "open_new_tab",
                            url
                        },
                        (response) => {
                            const runtimeError = getChromeRuntimeLastErrorMessage();
                            if (runtimeError) {
                                resolve(tryOpenInNewTabViaWindow(url));
                                return;
                            }
                            if (response && response.ok) {
                                resolve({ ok: true });
                                return;
                            }
                            resolve(tryOpenInNewTabViaWindow(url));
                        }
                    );
                    return;
                } catch (error) {
                    resolve(tryOpenInNewTabViaWindow(url));
                    return;
                }
            }

            resolve(tryOpenInNewTabViaWindow(url));
        });
    }

    function tryOpenInNewTabViaWindow(url) {
        let popup = null;
        try {
            popup = window.open(url, "_blank", "noopener");
        } catch (error) {
            popup = null;
        }

        return popup ? { ok: true } : { ok: false };
    }

    async function collectPyrusProjectPayloadWithExpansion() {
        let payload = collectPyrusProjectPayload();
        if (payload.plan) {
            return payload;
        }

        const expandedSetup = expandPyrusGroupByTitle("сетап");
        if (expandedSetup > 0) {
            await wait(220);
            payload = collectPyrusProjectPayload();
            if (payload.plan) {
                return payload;
            }
        }

        const expandedInsideSetup = expandCollapsedGroupsInsideSetup();
        if (expandedInsideSetup > 0) {
            await wait(260);
            payload = collectPyrusProjectPayload();
            if (payload.plan) {
                return payload;
            }
        }

        const expandedSecondPass = expandCollapsedGroupsInsideSetup();
        if (expandedSecondPass > 0) {
            await wait(320);
            payload = collectPyrusProjectPayload();
        }

        return payload;
    }

    function hasCleanerAutoFillRequest() {
        try {
            const url = new URL(window.location.href);
            return url.searchParams.get(CLEANER_AUTO_FILL_QUERY_KEY) === "1";
        } catch (error) {
            return false;
        }
    }

    function clearCleanerAutoFillRequest() {
        try {
            const url = new URL(window.location.href);
            if (!url.searchParams.has(CLEANER_AUTO_FILL_QUERY_KEY)) {
                return;
            }

            url.searchParams.delete(CLEANER_AUTO_FILL_QUERY_KEY);
            const search = url.searchParams.toString();
            const nextUrl = `${url.pathname}${search ? `?${search}` : ""}${url.hash || ""}`;
            window.history.replaceState({}, "", nextUrl);
        } catch (error) {
            // ignore
        }
    }

    async function runCleanerAutoFillFlow() {
        const payload = await readStoredProjectPayload();
        if (!payload) {
            clearCleanerAutoFillRequest();
            alert("Нет сохраненных данных. Сначала нажмите кнопку \"В CleanerUI\" в верхнем блоке кнопок на странице Pyrus (рядом с Новый клиент).");
            return;
        }

        const opened = await ensureCleanerProjectFormOpen();
        if (!opened) {
            clearCleanerAutoFillRequest();
            alert("Не удалось открыть форму \"Добавить проект\" в CleanerUI автоматически. Откройте форму вручную.");
            return;
        }

        const applied = await applyProjectPayloadToCleanerFormWithRetries(payload, 30, 180);
        clearCleanerAutoFillRequest();

        if (applied.length === 0) {
            alert("Данные проекта найдены, но форму не удалось заполнить автоматически.");
            return;
        }

        const missing = collectMissingProjectPayloadFields(payload);
        if (missing.length > 0) {
            alert(`Форма заполнена частично. Не найдены поля: ${missing.join(", ")}.`);
        }
    }

    async function ensureCleanerProjectFormOpen() {
        if (isCleanerProjectFormOpen()) {
            return true;
        }

        let openButton = null;
        for (let attempt = 0; attempt < 80; attempt += 1) {
            openButton = findCleanerProjectOpenButton();
            if (openButton) {
                break;
            }
            await wait(120);
        }

        if (!openButton) {
            return false;
        }

        openButton.click();

        for (let attempt = 0; attempt < 80; attempt += 1) {
            await wait(140);
            if (isCleanerProjectFormOpen()) {
                return true;
            }
        }

        return false;
    }

    function isCleanerProjectFormOpen() {
        const projectNameInput = document.querySelector("#ProjectName");
        if (!projectNameInput) {
            return false;
        }

        return isElementVisible(projectNameInput);
    }

    function findCleanerProjectOpenButton() {
        const candidates = Array.from(document.querySelectorAll("button, a, [role='button']"));
        for (const candidate of candidates) {
            if (!candidate) {
                continue;
            }
            if (!isElementVisible(candidate)) {
                continue;
            }

            const text = normalizeSingleLine(candidate.textContent || "").toLowerCase();
            if (!text) {
                continue;
            }

            if (text.includes("добавить проект") || text.includes("создать проект")) {
                return candidate;
            }
        }

        return null;
    }

    function isElementVisible(node) {
        if (!node || !(node instanceof Element)) {
            return false;
        }

        if (node.getClientRects().length === 0) {
            return false;
        }

        const style = window.getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden";
    }

    async function applyProjectPayloadToCleanerFormWithRetries(payload, attempts, delayMs) {
        const totalAttempts = clampInt(Number(attempts), 1, 60, 1);
        const waitMs = clampInt(Number(delayMs), 0, 5000, 0);
        const expectedFields = countProjectPayloadFields(payload);
        let bestApplied = [];

        for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
            const applied = applyProjectPayloadToCleanerForm(payload);
            if (applied.length > bestApplied.length) {
                bestApplied = applied;
            }

            if (expectedFields === 0 || applied.length >= expectedFields) {
                return applied;
            }

            if (attempt + 1 < totalAttempts && waitMs > 0) {
                await wait(waitMs);
            }
        }

        return bestApplied;
    }

    function countProjectPayloadFields(payload) {
        if (!payload || typeof payload !== "object") {
            return 0;
        }

        let count = 0;
        if (payload.projectName) {
            count += 1;
        }
        if (payload.projectId) {
            count += 1;
        }
        if (payload.plan) {
            count += 1;
        }
        if (payload.dbName) {
            count += 1;
        }
        return count;
    }

    function applyProjectPayloadToCleanerForm(payload) {
        const applied = [];
        if (!payload || typeof payload !== "object") {
            return applied;
        }

        if (fillProjectField("#ProjectName", payload.projectName)) {
            applied.push("Наименование проекта");
        }
        if (fillProjectField("#Id", payload.projectId)) {
            applied.push("ID проекта");
        }
        if (fillProjectField("#Plan", payload.plan)) {
            applied.push("План");
        }
        if (fillProjectField("#DbName", payload.dbName)) {
            applied.push("База ОД");
        }

        return applied;
    }

    function collectPyrusProjectPayload() {
        const projectName = cleanupProjectName(extractPyrusProjectName());
        const formFieldMap = collectPyrusFormFieldMap();

        const projectIdFromStructuredFields = findPyrusFormFieldValue(
            formFieldMap,
            ["Номер в панели PR", "Номер в панели ПР", "Номер панели PR", "Номер панели ПР", "Panel PR", "PR", "ПР"],
            (value) => /\d{4,}/.test(value)
        );
        const planFromStructuredFields = findPyrusFormFieldValue(
            formFieldMap,
            ["N", "Н", "№", "План (N)", "План N", "План Н", "План"],
            (value) => /\d{1,7}/.test(value)
        );
        const dbNameFromStructuredFields = findPyrusFormFieldValue(
            formFieldMap,
            ["Sawtooth", "База ОД"],
            (value) => /[A-Za-zА-Яа-я0-9]/.test(value)
        );

        const projectId = sanitizeProjectId(
            projectIdFromStructuredFields || findFieldValueByLabels(
                ["Номер в панели PR", "Номер в панели ПР", "Номер панели PR", "Номер панели ПР", "Номер в панели", "Panel PR", "PR", "ПР"],
                (value) => /\d{4,}/.test(value)
            )
        );
        const plan = sanitizePlan(
            planFromStructuredFields || findFieldValueByLabels(
                ["N", "Н", "№", "План (N)", "План N", "План Н", "План"],
                (value) => /\d{1,7}/.test(value)
            )
        );
        const dbName = sanitizeDbName(
            dbNameFromStructuredFields || findFieldValueByLabels(
                ["Sawtooth", "База ОД"],
                (value) => /[A-Za-zА-Яа-я0-9]/.test(value)
            )
        );

        console.info("[QGA] Pyrus-поля:", {
            detectedFields: Array.from(formFieldMap.entries()).map(([label, value]) => `${label} => ${value}`),
            projectIdFromStructuredFields,
            planFromStructuredFields,
            dbNameFromStructuredFields,
            projectId,
            plan,
            dbName
        });

        return {
            projectName,
            projectId,
            plan,
            dbName
        };
    }

    function extractPyrusProjectName() {
        const selectors = [
            ".sideBySideHeader__titleFull",
            "[data-test-id='sideBySideHeaderTitle'] .sideBySideHeader__titleFull",
            "[data-test-id='sideBySideHeaderTitle']"
        ];

        for (const selector of selectors) {
            const node = document.querySelector(selector);
            if (!node) {
                continue;
            }
            const text = normalizeSingleLine(node.textContent || "");
            if (text) {
                return text;
            }
        }

        return normalizeSingleLine(document.title || "");
    }

    function cleanupProjectName(value) {
        const text = normalizeSingleLine(value);
        if (!text) {
            return "";
        }

        return text
            .replace(/^проект\s*[:\-]\s*/i, "")
            .replace(/^project\s*[:\-]\s*/i, "")
            .trim();
    }

    function getPyrusGroupTitleButtons(root) {
        const scope = root || document;
        return Array.from(scope.querySelectorAll("button[data-test-id='formFieldGroupTitle']"));
    }

    function getPyrusGroupButtonTitle(button) {
        if (!button) {
            return "";
        }

        const titleNode =
            button.querySelector("[data-test-id='formFieldTitleText'] .formFieldTitle__textValue") ||
            button.querySelector(".formFieldTitle__textValue") ||
            button.querySelector("[data-test-id='formFieldTitleText']");
        return normalizeSingleLine((titleNode && titleNode.textContent) || button.textContent || "");
    }

    function isPyrusGroupButtonCollapsed(button) {
        if (!button) {
            return false;
        }

        const ariaExpanded = (button.getAttribute("aria-expanded") || "").toLowerCase();
        if (ariaExpanded === "true") {
            return false;
        }
        if (ariaExpanded === "false") {
            return true;
        }

        if (button.classList.contains("formFieldGroupTitle_expanded")) {
            return false;
        }
        if (button.querySelector(".formFieldGroupTitle__icon_expanded")) {
            return false;
        }

        const baseWrapper = button.closest(".formFieldBaseWrapper");
        if (baseWrapper) {
            const voidInputWrapper = baseWrapper.querySelector(":scope > .formFieldBaseWrapper__otherWrapper > .formFieldBaseWrapper__inputWrapper_void");
            if (voidInputWrapper) {
                return true;
            }
        }

        return true;
    }

    function clickPyrusGroupButton(button) {
        if (!button) {
            return false;
        }

        try {
            button.click();
            return true;
        } catch (error) {
            return false;
        }
    }

    function expandPyrusGroupByTitle(titlePart) {
        const target = normalizeSingleLine(titlePart).toLowerCase();
        if (!target) {
            return 0;
        }

        const buttons = getPyrusGroupTitleButtons();
        let expanded = 0;

        for (const button of buttons) {
            const title = getPyrusGroupButtonTitle(button).toLowerCase();
            if (!title || !title.includes(target)) {
                continue;
            }
            if (!isPyrusGroupButtonCollapsed(button)) {
                continue;
            }

            if (clickPyrusGroupButton(button)) {
                expanded += 1;
            }
        }

        return expanded;
    }

    function findSetupGroupContainer() {
        const setupButtons = getPyrusGroupTitleButtons().filter((button) => {
            const title = getPyrusGroupButtonTitle(button).toLowerCase();
            return title.includes("сетап");
        });

        if (setupButtons.length === 0) {
            return null;
        }

        const setupButton = setupButtons[0];
        return setupButton.closest(".formFieldGroup") || setupButton.closest(".formFieldBaseWrapper") || null;
    }

    function expandCollapsedGroupsInsideSetup() {
        const setupContainer = findSetupGroupContainer();
        if (!setupContainer) {
            return 0;
        }

        const buttons = getPyrusGroupTitleButtons(setupContainer);
        let expanded = 0;

        for (const button of buttons) {
            const title = getPyrusGroupButtonTitle(button).toLowerCase();
            if (title.includes("сетап")) {
                continue;
            }
            if (!isPyrusGroupButtonCollapsed(button)) {
                continue;
            }

            if (clickPyrusGroupButton(button)) {
                expanded += 1;
            }
        }

        return expanded;
    }

    function collectPyrusFormFieldMap() {
        const fieldMap = new Map();
        const labelNodes = document.querySelectorAll("[data-test-id='formFieldTitleText'], .formFieldTitle__textValue");

        for (const labelNode of labelNodes) {
            if (!labelNode) {
                continue;
            }

            const rawLabel = normalizeSingleLine(labelNode.textContent || "");
            const rawValue = normalizeSingleLine(extractPyrusFieldValueByLabelNode(labelNode));
            if (!rawLabel || !rawValue) {
                continue;
            }

            const normalizedLabel = normalizePyrusFieldLabel(rawLabel);
            if (!normalizedLabel) {
                continue;
            }

            if (!fieldMap.has(normalizedLabel)) {
                fieldMap.set(normalizedLabel, rawValue);
            }
        }

        return fieldMap;
    }

    function extractPyrusFieldValueByLabelNode(labelNode) {
        if (!labelNode) {
            return "";
        }

        const wrapper =
            labelNode.closest("[data-test-id='formFieldBaseWrapper']") ||
            labelNode.closest(".formFieldBaseWrapper") ||
            labelNode.closest(".formField");

        const candidates = [];
        if (wrapper) {
            const wrapperCandidates = wrapper.querySelectorAll(
                "[data-test-id='formFieldValue'], .multiLineInputContent [contenteditable='true'], .singleLineInputContent [contenteditable='true'], [contenteditable='true'], input, textarea, select"
            );
            for (const node of wrapperCandidates) {
                candidates.push(node);
            }
        }

        if (labelNode.parentElement && labelNode.parentElement.nextElementSibling) {
            candidates.push(labelNode.parentElement.nextElementSibling);
        }

        const seen = new Set();
        for (const node of candidates) {
            if (!node || seen.has(node)) {
                continue;
            }
            seen.add(node);

            const raw = normalizeSingleLine(readNodeCandidateValue(node) || node.innerText || node.textContent || "");
            if (!raw) {
                continue;
            }

            const normalizedRaw = normalizePyrusFieldLabel(raw);
            const normalizedLabel = normalizePyrusFieldLabel(labelNode.textContent || "");
            if (!normalizedRaw || normalizedRaw === normalizedLabel) {
                continue;
            }

            return raw;
        }

        return "";
    }

    function normalizePyrusFieldLabel(label) {
        return normalizeSingleLine(label)
            .replace(/[×xх]\s*$/i, "")
            .replace(/[\/\\|]+$/g, "")
            .replace(/[:：]\s*$/g, "")
            .replace(/\s+/g, " ")
            .toLowerCase()
            .trim();
    }

    function findPyrusFormFieldValue(fieldMap, aliases, validator) {
        if (!fieldMap || fieldMap.size === 0 || !Array.isArray(aliases) || aliases.length === 0) {
            return "";
        }

        const normalizedAliases = aliases
            .map((alias) => normalizeLabelForMatch(alias))
            .filter(Boolean);

        const normalizedFieldMap = new Map();
        for (const [label, value] of fieldMap.entries()) {
            const normalizedLabel = normalizeLabelForMatch(label);
            if (!normalizedLabel || normalizedFieldMap.has(normalizedLabel)) {
                continue;
            }
            normalizedFieldMap.set(normalizedLabel, value);
        }

        for (const alias of normalizedAliases) {
            const direct = normalizedFieldMap.get(alias);
            if (!direct) {
                continue;
            }

            const value = normalizeSingleLine(direct);
            if (!value) {
                continue;
            }
            if (typeof validator === "function" && !validator(value)) {
                continue;
            }
            return value;
        }

        for (const [label, rawValue] of normalizedFieldMap.entries()) {
            const value = normalizeSingleLine(rawValue);
            if (!value) {
                continue;
            }
            for (const alias of normalizedAliases) {
                if (!alias) {
                    continue;
                }

                if (alias.length <= 2) {
                    const parts = label.split(/\s+/g);
                    if (!parts.includes(alias)) {
                        continue;
                    }
                } else if (!label.includes(alias)) {
                    continue;
                }

                if (typeof validator === "function" && !validator(value)) {
                    continue;
                }
                return value;
            }
        }

        return "";
    }

    function normalizeLabelForMatch(label) {
        return normalizePyrusFieldLabel(label)
            .replace(/[“”"']/g, "")
            .replace(/ё/g, "е")
            .replace(/№/g, "n")
            .replace(/[^a-zа-я0-9\s]/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function findFieldValueByLabels(labels, validator) {
        for (const label of labels) {
            const candidates = collectFieldValueCandidates(label);
            for (const candidate of candidates) {
                const value = normalizeSingleLine(candidate);
                if (!value) {
                    continue;
                }
                if (typeof validator === "function" && !validator(value)) {
                    continue;
                }
                return value;
            }
        }
        return "";
    }

    function collectFieldValueCandidates(label) {
        const values = [];
        const textElements = document.querySelectorAll("label, dt, dd, th, td, strong, b, span, div, p");

        for (const element of textElements) {
            const text = normalizeSingleLine(element.textContent || "");
            if (!text || text.length > 180) {
                continue;
            }
            if (!isLabelMatch(text, label)) {
                continue;
            }

            const ownValue = extractValueFromLabelText(text, label);
            if (ownValue) {
                values.push(ownValue);
            }

            values.push(...getNearbyFieldValues(element, label));
        }

        const bodyText = document.body ? (document.body.innerText || "") : "";
        if (bodyText) {
            const pattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s*[:\\-–]?\\s*([^\\n\\r]+)`, "gim");
            let match = pattern.exec(bodyText);
            let guard = 0;
            while (match && guard < 20) {
                values.push(match[1]);
                match = pattern.exec(bodyText);
                guard += 1;
            }
        }

        return uniqStrings(values.map((item) => normalizeSingleLine(item)).filter(Boolean));
    }

    function isLabelMatch(text, label) {
        const normalizedText = normalizeSingleLine(text).toLowerCase();
        const normalizedLabel = normalizeSingleLine(label).toLowerCase();
        if (!normalizedText || !normalizedLabel) {
            return false;
        }

        if (normalizedText === normalizedLabel) {
            return true;
        }

        if (
            normalizedText.startsWith(`${normalizedLabel}:`) ||
            normalizedText.startsWith(`${normalizedLabel} -`) ||
            normalizedText.startsWith(`${normalizedLabel} –`)
        ) {
            return true;
        }

        if (normalizedLabel.length >= 3 && normalizedText.includes(normalizedLabel) && normalizedText.length <= normalizedLabel.length + 40) {
            return true;
        }

        return false;
    }

    function extractValueFromLabelText(text, label) {
        const normalized = normalizeSingleLine(text);
        if (!normalized) {
            return "";
        }

        const strictPattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s*[:\\-–]\\s*(.+)$`, "i");
        const strictMatch = normalized.match(strictPattern);
        if (strictMatch && strictMatch[1]) {
            return normalizeSingleLine(strictMatch[1]);
        }

        const loosePattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s+(.+)$`, "i");
        const looseMatch = normalized.match(loosePattern);
        if (looseMatch && looseMatch[1] && looseMatch[1].length <= 120) {
            return normalizeSingleLine(looseMatch[1]);
        }

        return "";
    }

    function getNearbyFieldValues(node, label) {
        const candidates = [];

        if (!node) {
            return candidates;
        }

        if (node.nextElementSibling) {
            candidates.push(node.nextElementSibling);
        }
        if (node.previousElementSibling) {
            candidates.push(node.previousElementSibling);
        }

        if (node.parentElement) {
            for (const sibling of node.parentElement.children) {
                if (sibling !== node) {
                    candidates.push(sibling);
                }
            }
            if (node.parentElement.nextElementSibling) {
                candidates.push(node.parentElement.nextElementSibling);
            }
        }

        const row = node.closest("tr, [role='row'], li");
        if (row) {
            for (const child of row.children) {
                if (child !== node && !child.contains(node)) {
                    candidates.push(child);
                }
            }
        }

        const result = [];
        const seen = new Set();

        for (const candidate of candidates) {
            if (!candidate || seen.has(candidate)) {
                continue;
            }
            seen.add(candidate);

            const rawText = readNodeCandidateValue(candidate);
            if (!rawText) {
                continue;
            }

            const text = normalizeSingleLine(rawText);
            if (!text) {
                continue;
            }

            if (isLabelMatch(text, label)) {
                continue;
            }

            const extracted = extractValueFromLabelText(text, label);
            if (extracted) {
                result.push(extracted);
            } else {
                result.push(text);
            }
        }

        return result;
    }

    function readNodeCandidateValue(node) {
        if (!node) {
            return "";
        }

        if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
            return node.value || node.getAttribute("value") || "";
        }

        const input = node.querySelector("input, textarea, select");
        if (input) {
            if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) {
                return input.value || input.getAttribute("value") || "";
            }
        }

        return node.textContent || "";
    }

    function normalizeSingleLine(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function wait(ms) {
        const timeout = Number.isFinite(ms) ? Math.max(0, ms) : 0;
        return new Promise((resolve) => setTimeout(resolve, timeout));
    }

    function sanitizeProjectId(value) {
        const text = normalizeSingleLine(value);
        if (!text) {
            return "";
        }

        const match = text.match(/\d{4,}/);
        return match ? match[0] : "";
    }

    function sanitizePlan(value) {
        const text = normalizeSingleLine(value);
        if (!text) {
            return "";
        }

        const match = text.match(/\d{1,7}/);
        if (!match) {
            return "";
        }

        const parsed = Number.parseInt(match[0], 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return "";
        }

        return String(parsed);
    }

    function sanitizeDbName(value) {
        const text = normalizeSingleLine(value);
        if (!text) {
            return "";
        }

        const match = text.match(/[A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9_.-]*/);
        return match ? match[0] : "";
    }

    function fillProjectField(selector, value) {
        if (!value) {
            return false;
        }

        const input = document.querySelector(selector);
        if (!input) {
            return false;
        }

        setInputValue(input, value);
        return true;
    }

    function setInputValue(input, value) {
        if (isNumericTextboxInput(input)) {
            setNumericTextboxValue(input, value);
            return;
        }

        writeInputValue(input, value);
        dispatchInputEvents(input);
    }

    function isNumericTextboxInput(input) {
        if (!input || !input.getAttribute) {
            return false;
        }

        const role = (input.getAttribute("data-role") || "").toLowerCase();
        if (role === "numerictextbox") {
            return true;
        }

        return Boolean(input.closest(".k-numerictextbox"));
    }

    function setNumericTextboxValue(input, value) {
        const normalized = String(value == null ? "" : value).trim();
        const wrapper = input.closest(".k-numerictextbox");
        const formattedInput = wrapper ? wrapper.querySelector("input.k-formatted-value") : null;

        writeInputValue(input, normalized);
        input.setAttribute("value", normalized);
        if (normalized) {
            input.setAttribute("aria-valuenow", normalized);
        }
        dispatchInputEvents(input);

        if (formattedInput) {
            writeInputValue(formattedInput, normalized);
            formattedInput.setAttribute("value", normalized);
            if (normalized) {
                formattedInput.setAttribute("aria-valuenow", normalized);
            }
            dispatchInputEvents(formattedInput);
        }
    }

    function writeInputValue(input, value) {
        const prototype = Object.getPrototypeOf(input);
        const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;
        const setter = descriptor && descriptor.set ? descriptor.set : null;

        if (setter) {
            setter.call(input, value);
            return;
        }

        input.value = value;
    }

    function dispatchInputEvents(input) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
    }

    function saveProjectPayload(payload) {
        saveProjectPayloadToLocalStorage(payload);

        const storage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
        if (!storage) {
            return Promise.resolve(true);
        }

        return new Promise((resolve) => {
            try {
                storage.set({ [PROJECT_PREFILL_STORAGE_KEY]: payload }, () => {
                    const lastErrorMessage = getChromeRuntimeLastErrorMessage();
                    if (lastErrorMessage) {
                        console.warn("[QGA] Не удалось сохранить данные проекта в chrome.storage:", lastErrorMessage);
                        resolve(true);
                        return;
                    }
                    resolve(true);
                });
            } catch (error) {
                console.warn("[QGA] Исключение при сохранении в chrome.storage, использован fallback localStorage:", error);
                resolve(true);
            }
        });
    }

    function readStoredProjectPayload() {
        const fallbackPayload = readProjectPayloadFromLocalStorage();

        const storage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
        if (!storage) {
            return Promise.resolve(fallbackPayload);
        }

        return new Promise((resolve) => {
            try {
                storage.get(PROJECT_PREFILL_STORAGE_KEY, (result) => {
                    const lastErrorMessage = getChromeRuntimeLastErrorMessage();
                    if (lastErrorMessage) {
                        console.warn("[QGA] Не удалось прочитать данные проекта из chrome.storage:", lastErrorMessage);
                        resolve(fallbackPayload);
                        return;
                    }

                    if (!result || typeof result !== "object") {
                        resolve(fallbackPayload);
                        return;
                    }

                    const payload = result[PROJECT_PREFILL_STORAGE_KEY];
                    if (!payload || typeof payload !== "object") {
                        resolve(fallbackPayload);
                        return;
                    }

                    saveProjectPayloadToLocalStorage(payload);
                    resolve(payload);
                });
            } catch (error) {
                console.warn("[QGA] Исключение при чтении из chrome.storage, использован fallback localStorage:", error);
                resolve(fallbackPayload);
            }
        });
    }

    function getChromeRuntimeLastErrorMessage() {
        try {
            if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError) {
                return chrome.runtime.lastError.message || "unknown runtime error";
            }
        } catch (error) {
            return String(error && error.message ? error.message : error);
        }
        return "";
    }

    function saveProjectPayloadToLocalStorage(payload) {
        if (!payload || typeof payload !== "object") {
            return;
        }

        const serialized = JSON.stringify(payload);
        if (!serialized) {
            return;
        }

        try {
            localStorage.setItem(PROJECT_PREFILL_STORAGE_FALLBACK_KEY, serialized);
            localStorage.setItem(PROJECT_PREFILL_STORAGE_KEY, serialized);
        } catch (error) {
            console.warn("[QGA] Не удалось записать fallback в localStorage:", error);
        }
    }

    function readProjectPayloadFromLocalStorage() {
        const candidates = [
            PROJECT_PREFILL_STORAGE_KEY,
            PROJECT_PREFILL_STORAGE_FALLBACK_KEY
        ];

        for (const key of candidates) {
            let raw = null;
            try {
                raw = localStorage.getItem(key);
            } catch (error) {
                raw = null;
            }
            if (!raw) {
                continue;
            }

            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") {
                    return parsed;
                }
            } catch (error) {
                continue;
            }
        }

        return null;
    }

    function escapeRegExp(value) {
        return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function uniqStrings(values) {
        const seen = new Set();
        const result = [];

        for (const value of values) {
            if (!value || seen.has(value)) {
                continue;
            }
            seen.add(value);
            result.push(value);
        }

        return result;
    }

    function loadStoredState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return;
            }
            const stored = JSON.parse(raw);
            if (!stored || typeof stored !== "object") {
                return;
            }
            if (stored.settings && typeof stored.settings === "object") {
                state.settings = { ...DEFAULT_SETTINGS, ...stored.settings };
            }
            if (stored.mode === "exact" || stored.mode === "similar") {
                state.mode = stored.mode;
            }
            if (typeof stored.threshold === "number") {
                state.threshold = clamp(stored.threshold, 0.5, 1);
            }
            if (Array.isArray(stored.processedKeys)) {
                state.processedKeys = new Set(stored.processedKeys);
            }
        } catch (error) {
            console.warn("[QGA] Не удалось загрузить состояние:", error);
        }
    }

    function saveStoredState() {
        const payload = {
            settings: state.settings,
            mode: state.mode,
            threshold: state.threshold,
            processedKeys: Array.from(state.processedKeys)
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function injectStyles() {
        const style = document.createElement("style");
        style.textContent = `
            #${PANEL_ID} {
                position: fixed;
                top: 12px;
                right: 12px;
                width: 410px;
                max-height: calc(100vh - 24px);
                z-index: 2147483647;
                background: #ffffff;
                color: #1f2937;
                border: 1px solid #d1d5db;
                border-radius: 12px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
                font: 12px/1.4 "Segoe UI", Tahoma, sans-serif;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            #${PANEL_ID} * {
                box-sizing: border-box;
            }
            #${PANEL_ID} .qga-header {
                background: #111827;
                color: #f9fafb;
                padding: 10px 12px;
                font-size: 13px;
                font-weight: 600;
            }
            #${PANEL_ID} .qga-section {
                padding: 10px 12px;
                border-bottom: 1px solid #e5e7eb;
            }
            #${PANEL_ID} .qga-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-bottom: 8px;
            }
            #${PANEL_ID} label {
                display: block;
                margin-bottom: 4px;
                color: #4b5563;
                font-size: 11px;
            }
            #${PANEL_ID} input[type='text'],
            #${PANEL_ID} input[type='number'],
            #${PANEL_ID} select {
                width: 100%;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                padding: 6px;
                font-size: 12px;
                background: #ffffff;
            }
            #${PANEL_ID} .qga-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 6px;
            }
            #${PANEL_ID} button {
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                padding: 6px 8px;
                background: #f8fafc;
                cursor: pointer;
                font-size: 11px;
            }
            #${PANEL_ID} button:hover {
                background: #eef2ff;
            }
            #${PANEL_ID} .qga-stats {
                color: #1f2937;
                font-size: 11px;
            }
            #${PANEL_ID} .qga-stats-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin-bottom: 4px;
                min-height: 18px;
            }
            #${PANEL_ID} .qga-progress-wrap {
                margin-bottom: 8px;
                display: none;
            }
            #${PANEL_ID} .qga-progress-wrap.qga-progress-visible {
                display: block;
            }
            #${PANEL_ID} .qga-progress-bar {
                height: 8px;
                background: #e5e7eb;
                border-radius: 4px;
                overflow: hidden;
            }
            #${PANEL_ID} .qga-progress-fill {
                height: 100%;
                background: #6366f1;
                border-radius: 4px;
                transition: width 0.2s ease;
            }
            #${PANEL_ID} .qga-progress-text {
                display: none;
            }
            #${PANEL_ID} .qga-loading {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-size: 11px;
                color: #6b7280;
            }
            #${PANEL_ID} .qga-spinner {
                width: 12px;
                height: 12px;
                border-radius: 999px;
                border: 2px solid #e5e7eb;
                border-top-color: #6366f1;
                animation: qga-spin 0.8s linear infinite;
            }
            @keyframes qga-spin {
                to {
                    transform: rotate(360deg);
                }
            }
            #${PANEL_ID} .qga-list {
                list-style: none;
                margin: 0;
                padding: 0;
                overflow: auto;
                max-height: 44vh;
            }
            #${PANEL_ID} .qga-group {
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 8px;
                margin-bottom: 8px;
            }
            #${PANEL_ID} .qga-group.qga-group--processed .qga-group-title::before {
                content: "✓ ";
                color: #059669;
                font-weight: 700;
            }
            #${PANEL_ID} .qga-group-title {
                font-weight: 600;
                margin-bottom: 4px;
                font-size: 12px;
            }
            #${PANEL_ID} .qga-group-sample {
                margin: 0 0 6px 0;
                color: #4b5563;
                font-size: 11px;
                line-height: 1.35;
                white-space: pre-wrap;
                word-break: break-word;
            }
            #${PANEL_ID} .qga-inline-actions {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
            }
            #${PANEL_ID}.qga-bulk-running .qga-group {
                background-color: #f3f4f6;
            }
            #${PANEL_ID}.qga-bulk-running .qga-group button {
                pointer-events: none;
                opacity: 0.6;
                cursor: not-allowed;
            }
            .${HIGHLIGHT_CLASS} {
                outline: 2px solid #f59e0b !important;
                outline-offset: 2px !important;
                background-color: rgba(245, 158, 11, 0.08) !important;
                scroll-margin-top: 120px;
            }
        `;
        document.documentElement.appendChild(style);
    }

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
})();
