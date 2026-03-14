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

    const PYRUS_FIELD_LABEL_ALIASES = {
        projectId: ["номер в панели pr", "номер в панели", "номер панели pr", "project id панели"],
        plan: ["n"],
        projectName: ["название проекта", "наименование проекта", "project name"],
        dbName: ["sawtooth", "база од", "dbname"]
    };

    const MANUAL_BFRIDS_STORAGE_KEY = "__qga_manual_bfrids_v1__";
    const MANUAL_API_STATE_STORAGE_KEY = "__qga_manual_api_state_v1__";
    const RATING_INCORRECT_IDS_STORAGE_KEY = "__qga_rating_incorrect_ids_v1__";
    const VERIFY_INCORRECT_IDS_STORAGE_KEY = "__qga_verify_incorrect_ids_v1__";
    const OPENENDS_GROUPS_STORAGE_KEY = "__qga_openends_groups_v1__";
    const PAGE_KIND = detectPageKind();

    const DEFAULT_SETTINGS = {
        rootSelector: "#divOpenEnds",
        itemSelector: "#gridOpenEnds .k-grid-content tbody tr.k-master-row",
        textSelector: "td:nth-child(4), #text",
        variableSelector: "td:nth-child(5)",
        selectControlSelector: "td:first-child input.k-checkbox",
        groupActionSelector: "button[onclick='group()']",
        ungroupActionSelector: "button[onclick='ungroup()']",
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
        pyrusHashListenerAttached: false,
        verifyRespondentIndexLoaded: false,
        verifyRespondentIndexLoading: false,
        verifyRespondentIndexError: null,
        verifyRespondentIdsByOpenEndId: null,
        verifyAnswersByRespondentId: null,
        verifyRespondentIdsByQuestionAndValue: null,
        verifyRespondentIdsByValueOnly: null,
        verifyQuestionCode: null,
        /** ID респондентов, отмеченных в модалке «Другие ответы» для добавления в ручную чистку при нажатии «Проверить страницу». */
        verifyPendingManualBfrids: new Set(),
        /** Кнопка группировки (group()), к которой мы привязываем обновление групп OpenEnds после ручной группировки. */
        manualGroupButtonEl: null,
        manualGroupButtonHandler: null,
        /** Кнопка разгруппировки (ungroup()), после которой тоже нужно обновить сохранённые группы OpenEnds. */
        manualUngroupButtonEl: null,
        manualUngroupButtonHandler: null
    };


    function init() {
        if (PAGE_KIND === "openends") {
            initOpenEndsMode();
            return;
        }

        if (PAGE_KIND === "openends_verify") {
            initOpenEndsVerifyMode();
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

    function isOpenEndsHash() {
        return (window.location.hash || "").toLowerCase() === "#openends";
    }

    function initOpenEndsMode() {
        loadStoredState();
        injectStyles();
        bindRuntimeMessages();
        waitForBody(() => {
            buildPanel();
            hidePanel();
            setupManualPageIntegration();
            const scheduleCollectGroups = () => {
                if (isOpenEndsHash()) {
                    setTimeout(collectOpenEndsGroupsFromPage, 500);
                }
            };
            scheduleCollectGroups();
            ensureManualGroupButtonHooked();
            window.addEventListener("hashchange", () => {
                if (!isOpenEndsHash() && state.panel) {
                    hidePanel();
                } else {
                    scheduleCollectGroups();
                    ensureManualGroupButtonHooked();
                }
            });
        });
    }

    function initOpenEndsVerifyMode() {
        injectStyles();
        waitForBody(() => {
            setupVerifyRespondentEnhancements();
            setupVerifyMainManualIntegration();
        });
    }

    function setupVerifyRespondentEnhancements() {
        const gridRoot = document.querySelector("#grid, #gridOpenEnds");
        if (!gridRoot) {
            return;
        }

        if (!gridRoot.dataset.qgaVerifyBound) {
            gridRoot.dataset.qgaVerifyBound = "1";

            gridRoot.addEventListener("click", async (event) => {
                const target = event.target instanceof HTMLElement ? event.target : null;
                const button = target ? target.closest(".qga-verify-show-respondent") : null;
                if (!button) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                const row = button.closest("tr");
                if (!row) {
                    return;
                }

                const context = resolveVerifyRowContext(row);
                if (!context || (!context.openEndId && !context.valueText)) {
                    alert("Не удалось определить данные ответа для выбранной строки.");
                    return;
                }

                try {
                    const ok = await ensureVerifyRespondentIndexLoaded();
                    if (!ok) {
                        const message =
                            state.verifyRespondentIndexError ||
                            "Не удалось загрузить выгрузку OpenEnds. Подробности в консоли.";
                        alert(message);
                        return;
                    }

                    const answersMap = state.verifyAnswersByRespondentId;
                    if (!answersMap) {
                        alert("Индекс ответов респондентов недоступен.");
                        return;
                    }

                    const uniqueIds = getRespondentIdsForVerifyRow(row);

                    if (uniqueIds.length === 0) {
                        alert(
                            "Не удалось найти респондента для этого ответа в выгрузке OpenEnds. " +
                                "Возможные причины: формат файла выгрузки изменился или ответ не попал в файл."
                        );
                        return;
                    }

                    applyVerifyRowVisibility(gridRoot);
                    const rowState = getVerifyRowIncorrectPostpone(gridRoot, row);

                    if (uniqueIds.length === 1) {
                        const respondentId = uniqueIds[0];
                        const answers =
                            answersMap.get(String(respondentId)) ||
                            answersMap.get(String(respondentId).trim()) ||
                            [];

                        showVerifyRespondentModal(respondentId, answers, context, rowState);
                    } else {
                        showVerifyRespondentCandidates(uniqueIds, answersMap, context, rowState);
                    }
                } catch (error) {
                    console.error("[QGA] Ошибка при загрузке ответов респондента", error);
                    alert("Произошла ошибка при загрузке ответов респондента. Подробности в консоли.");
                }
            });
        }

        decorateVerifyRows(gridRoot);

        const observer = new MutationObserver(() => {
            decorateVerifyRows(gridRoot);
        });
        observer.observe(gridRoot, { childList: true, subtree: true });

        // Загрузить индекс и рейтинг (некорректные ID из Excel «Рейтинг», ReasonCodes=1) при открытии страницы
        const projectId = getProjectIdForVerify();
        Promise.all([
            ensureVerifyRespondentIndexLoaded(),
            projectId ? ensureRatingIncorrectIdsLoaded(projectId) : Promise.resolve(false)
        ]).then(() => {
            applyVerifyRowVisibility(gridRoot);
        });
    }

    function setupVerifyMainManualIntegration() {
        const button = document.querySelector("button[onclick='verifyValues()']");
        if (!button) {
            return;
        }
        if (button.dataset.qgaManualBfridBound === "1") {
            return;
        }
        button.dataset.qgaManualBfridBound = "1";

        const parent = button.parentElement || button.closest("div, span, td, th") || document.body;
        const extraButton = document.createElement("button");
        extraButton.type = button.type || "button";
        extraButton.textContent = button.textContent || "Проверить страницу";
        extraButton.className = button.className || "";

        extraButton.addEventListener("click", async () => {
            if (state.verifyPendingManualBfrids && state.verifyPendingManualBfrids.size > 0) {
                const ids = Array.from(state.verifyPendingManualBfrids);
                try {
                    await sendRespondentIdsToManualCleanup(ids);
                    state.verifyPendingManualBfrids.clear();
                    document.querySelectorAll(".qga-verify-modal-manual-checkbox").forEach((cb) => {
                        if (cb instanceof HTMLInputElement) cb.checked = false;
                    });
                } catch (error) {
                    console.error("[QGA] Ошибка при отправке выбранных в ручную чистку:", error);
                }
            }
            collectVerifyIncorrectIdsAndSave();
            try {
                const gridRoot = document.querySelector("#grid, #gridOpenEnds");
                if (gridRoot && window.jQuery) {
                    const grid = window.jQuery(gridRoot).data("kendoGrid");
                    if (grid && typeof grid.one === "function") {
                        grid.one("dataBound", () => applyVerifyRowVisibility(gridRoot));
                    }
                }
                button.click();
            } catch (error) {
                console.error("[QGA] Не удалось запустить стандартную проверку страницы:", error);
            }
        });

        // Прячем оригинальную кнопку проверки страницы, чтобы пользователь видел только одну,
        // но продолжали использовать её штатный обработчик onclick="verifyValues()".
        button.style.display = "none";

        if (button.nextSibling) {
            parent.insertBefore(extraButton, button.nextSibling);
        } else {
            parent.appendChild(extraButton);
        }
    }

    function detectPageKind() {
        const host = (window.location.hostname || "").toLowerCase();
        const path = (window.location.pathname || "").toLowerCase();

        // Режим OpenEnds на любой странице редактирования проекта; показ панели только при #openEnds
        if (host.endsWith("clr.env7.biz") && path.includes("/lk/project/edit/")) {
            return "openends";
        }

        if (host.endsWith("clr.env7.biz") && path.includes("/lk/openends2/verifymain")) {
            return "openends_verify";
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
        if (!state.panel || !isOpenEndsHash()) {
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
        const rawPayload = await collectPyrusProjectPayloadWithExpansion();
        const notFoundByXPath = rawPayload.notFoundByXPath || [];

        const payload = {
            projectName: rawPayload.projectName,
            projectId: rawPayload.projectId,
            plan: rawPayload.plan,
            dbName: rawPayload.dbName
        };

        const hasAnyValue = Boolean(payload.projectName || payload.projectId || payload.plan || payload.dbName);
        if (!hasAnyValue) {
            const notFoundMsg = notFoundByXPath.length > 0
                ? ` Не удалось найти на странице: ${notFoundByXPath.join(", ")}.`
                : "";
            return {
                ok: false,
                message: `Не удалось найти поля на странице Pyrus.${notFoundMsg} Проверьте, что карточка проекта полностью открыта и группа «Сетап» раскрыта.`
            };
        }

        payload.sourceUrl = window.location.href;
        payload.sourceTitle = document.title || "";
        payload.copiedAt = new Date().toISOString();
        payload.notFoundByXPath = notFoundByXPath;

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
        url.searchParams.set("_t", Date.now().toString());
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
        expandPyrusGroupByTitle("сетап");
        await wait(220);

        const expandedInsideSetup = expandCollapsedGroupsInsideSetup();
        if (expandedInsideSetup > 0) {
            await wait(260);
        }

        const expandedSecondPass = expandCollapsedGroupsInsideSetup();
        if (expandedSecondPass > 0) {
            await wait(320);
        }

        return collectPyrusProjectPayload();
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

        const notFoundByXPath = payload.notFoundByXPath;
        if (notFoundByXPath && notFoundByXPath.length > 0) {
            alert(`Не удалось найти на странице: ${notFoundByXPath.join(", ")}. Остальные поля заполнены.`);
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

    const PYRUS_FIELD_LABELS = {
        projectName: "Название проекта",
        projectId: "ProjectID",
        plan: "N",
        dbName: "База ОД"
    };

    function collectPyrusProjectPayload() {
        const notFoundByXPath = [];
        const fieldMap = collectPyrusFormFieldMap();

        let projectId = sanitizeProjectId(
            findPyrusFormFieldValue(fieldMap, PYRUS_FIELD_LABEL_ALIASES.projectId, (v) => /\d{4,}/.test(v))
        );
        if (!projectId) {
            projectId = extractProjectIdFromPyrusLinks(fieldMap);
        }
        if (!projectId) {
            notFoundByXPath.push(PYRUS_FIELD_LABELS.projectId);
        }

        const plan = sanitizePlan(
            findPyrusFormFieldValue(fieldMap, PYRUS_FIELD_LABEL_ALIASES.plan, (v) => /^\d{1,7}$/.test(v.trim()))
        );
        if (!plan) {
            notFoundByXPath.push(PYRUS_FIELD_LABELS.plan);
        }

        let projectName = cleanupProjectName(
            findPyrusFormFieldValue(fieldMap, PYRUS_FIELD_LABEL_ALIASES.projectName)
        );
        if (!projectName) {
            projectName = cleanupProjectName(extractPyrusProjectName());
        }
        if (!projectName) {
            notFoundByXPath.push(PYRUS_FIELD_LABELS.projectName);
        }

        const dbName = sanitizeDbName(
            findPyrusFormFieldValue(fieldMap, PYRUS_FIELD_LABEL_ALIASES.dbName)
        );
        if (!dbName) {
            notFoundByXPath.push(PYRUS_FIELD_LABELS.dbName);
        }

        console.info("[QGA] Pyrus-поля (по меткам):", {
            projectName,
            projectId,
            plan,
            dbName,
            notFoundByXPath
        });

        return {
            projectName,
            projectId,
            plan,
            dbName,
            notFoundByXPath
        };
    }

    function extractProjectIdFromPyrusLinks(fieldMap) {
        const linkAliases = ["ссылка на pr", "ссылка на чистилку"];
        const idPattern = /(?:panelrider\.com\/projects\/managements\/|Project\/Edit\/)(\d{4,})/;

        for (const alias of linkAliases) {
            const url = findPyrusFormFieldValue(fieldMap, [alias]);
            if (!url) {
                continue;
            }
            const match = url.match(idPattern);
            if (match) {
                return match[1];
            }
        }

        const links = document.querySelectorAll(
            "a[href*='panelrider.com/projects/managements/'], a[href*='Project/Edit/']"
        );
        for (const link of links) {
            const href = link.getAttribute("href") || "";
            const match = href.match(idPattern);
            if (match) {
                return match[1];
            }
        }

        return "";
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
            .qga-verify-cell {
                position: relative;
            }
            .qga-verify-show-respondent {
                position: absolute;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                border: 1px solid #e2e8f0;
                border-radius: 3px;
                padding: 2px 6px;
                margin: 0;
                background: #f8fafc;
                color: #475569;
                cursor: pointer;
                font-size: 11px;
                font-weight: normal;
                white-space: nowrap;
                box-shadow: none;
                transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
            }
            .qga-verify-show-respondent:hover {
                background: #f1f5f9;
                border-color: #cbd5e1;
                color: #334155;
            }
            .qga-verify-cell-wrap {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                white-space: nowrap;
            }
            @property --qga-scrollbar-thumb {
                syntax: "<color>";
                initial-value: rgba(156, 163, 175, 0.25);
                inherits: true;
            }
            .qga-verify-modal {
                position: fixed;
                right: 12px;
                bottom: 12px;
                width: 340px;
                max-height: 65vh;
                z-index: 2147483647;
                background: #fff;
                color: #1f2937;
                border-radius: 6px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.12);
                border: 1px solid #e5e7eb;
                display: none;
                flex-direction: column;
                font: 12px/1.4 "Segoe UI", Tahoma, sans-serif;
                overflow: hidden;
            }
            .qga-verify-modal__header {
                padding: 5px 8px;
                background: #1f2937;
                color: #f9fafb;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 6px;
            }
            .qga-verify-modal__title {
                font-size: 12px;
                font-weight: 600;
            }
            .qga-verify-modal__close {
                border: none;
                background: transparent;
                color: #9ca3af;
                cursor: pointer;
                font-size: 16px;
                line-height: 1;
                padding: 0 2px;
            }
            .qga-verify-modal__close:hover {
                color: #e5e7eb;
            }
            .qga-verify-modal__body {
                padding: 6px 8px;
                overflow: auto;
                --qga-scrollbar-thumb: rgba(156, 163, 175, 0.25);
                transition: --qga-scrollbar-thumb 0.4s ease;
            }
            .qga-verify-modal__body--scrollbar-hover {
                --qga-scrollbar-thumb: #9ca3af;
                transition: --qga-scrollbar-thumb 0.4s ease;
            }
            .qga-verify-modal__body::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }
            .qga-verify-modal__body::-webkit-scrollbar-track {
                background: transparent;
            }
            .qga-verify-modal__body::-webkit-scrollbar-thumb {
                background: var(--qga-scrollbar-thumb);
                border-radius: 3px;
            }
            .qga-verify-modal--candidates .qga-verify-modal__body {
                padding-top: 0;
            }
            .qga-verify-modal--candidates .qga-verify-modal__list {
                margin-top: 0;
                padding-top: 0;
            }
            .qga-verify-modal--candidates .qga-verify-modal__list .qga-verify-modal__item:first-child {
                padding-top: 0;
            }
            .qga-verify-modal--candidates .qga-verify-modal__list .qga-verify-modal__item:first-child .qga-verify-modal__respondent-header {
                padding-top: 0;
                margin-top: 0;
            }
            .qga-verify-modal--candidates .qga-verify-modal__footer {
                display: none;
            }
            .qga-verify-modal__list {
                list-style: none;
                margin: 0;
                padding: 0;
            }
            .qga-verify-modal__item {
                padding: 2px 0;
            }
            .qga-verify-modal__item:not(:first-child) {
                margin-top: 6px;
                padding-top: 6px;
                border-top: 1px solid #e5e7eb;
            }
            .qga-verify-modal__item--tech-defect {
                background: #fef9c3;
                margin-left: -8px;
                margin-right: -8px;
                padding-left: 8px;
                padding-right: 8px;
                padding-top: 4px;
                padding-bottom: 4px;
                border-radius: 4px;
            }
            .qga-verify-modal__item--tech-defect .qga-verify-modal__respondent-header {
                background: #fef9c3;
            }
            .qga-verify-modal__respondent-header {
                position: sticky;
                top: 0;
                z-index: 1;
                background: #fff;
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 3px;
                padding: 2px 0;
                color: #111827;
            }
            .qga-verify-modal__q {
                font-weight: 600;
                font-size: 11px;
                margin-bottom: 0;
                color: #6b7280;
            }
            .qga-verify-modal__q.qga-verify-modal__respondent-header {
                color: #111827;
            }
            .qga-verify-modal__text {
                font-size: 11px;
                color: #374151;
                white-space: pre-wrap;
                word-break: break-word;
                margin-bottom: 2px;
            }
            .qga-verify-modal__item > .qga-verify-modal__text:last-child {
                margin-bottom: 0;
            }
            .qga-verify-modal__footer {
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid #e5e7eb;
            }
            .qga-verify-modal__footer-label {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                font-size: 12px;
                color: #374151;
            }
            .qga-verify-modal--tech-defect .qga-verify-modal__body,
            .qga-verify-modal--tech-defect .qga-verify-modal__footer {
                background: #fef9c3;
            }
            .qga-verify-modal__item--incorrect .qga-verify-modal__respondent-header,
            .qga-verify-modal__item--incorrect {
                background-color: #fee2e2 !important;
            }

            .qga-verify-modal__item--incorrect .qga-verify-modal__respondent-header {
                color: #b91c1c !important;
            }
            .qga-verify-modal__item--disputed .qga-verify-modal__respondent-header,
            .qga-verify-modal__item--disputed {
                background-color: #f3e8ff !important;
            }

            .qga-verify-modal__item--disputed .qga-verify-modal__respondent-header {
                color: #6b21a8 !important;
            }
            .qga-verify-modal__item--duplicate .qga-verify-modal__respondent-header,
            .qga-verify-modal__item--duplicate {
                background-color: #dbeafe !important;
            }

            .qga-verify-modal__item--duplicate .qga-verify-modal__respondent-header {
                color: #1e40af !important;
            }
            .qga-verify-modal__item--speedster .qga-verify-modal__respondent-header,
            .qga-verify-modal__item--speedster {
                background-color: #ffedd5 !important;
            }

            .qga-verify-modal__item--speedster .qga-verify-modal__respondent-header {
                color: #9a3412 !important;
            }
            .qga-verify-modal__item--tech-defect .qga-verify-modal__respondent-header,
            .qga-verify-modal__item--tech-defect {
                background: #fef9c3 !important;
            }
            .qga-verify-modal__item--tech-defect .qga-verify-modal__respondent-header {
                color: #854d0e !important;
            }
            .qga-verify-row-incorrect {
                background-color: #fee2e2 !important;
            }
            .qga-verify-row-incorrect:hover {
                background-color: #fecaca !important;
            }
            .qga-cell-text {
                position: relative;
            }
            .qga-reason-icons {
                position: absolute;
                left: 100%;
                top: 50%;
                transform: translateY(-50%);
                display: grid;
                grid-template-columns: repeat(2, 18px);
                gap: 2px;
                margin-left: 3px;
            }
            .qga-reason-icons img {
                width: 18px;
                height: 18px;
                display: block;
            }
            .qga-verify-row-disputed {
                background-color: #f3e8ff !important;
            }
            .qga-verify-row-disputed:hover {
                background-color: #e9d5ff !important;
            }
            .qga-verify-row-duplicate {
                background-color: #dbeafe !important;
            }
            .qga-verify-row-duplicate:hover {
                background-color: #bfdbfe !important;
            }
            .qga-verify-row-speedster {
                background-color: #ffedd5 !important;
            }
            .qga-verify-row-speedster:hover {
                background-color: #fed7aa !important;
            }
            .qga-verify-row-tech-defect {
                background-color: #fef9c3 !important;
            }
            .qga-verify-row-tech-defect:hover {
                background-color: #fef08a !important;
            }
            .qga-verify-modal--row-incorrect .qga-verify-modal__body,
            .qga-verify-modal--row-incorrect .qga-verify-modal__footer {
                background-color: #fee2e2 !important;
            }
            .qga-verify-modal--row-disputed .qga-verify-modal__body,
            .qga-verify-modal--row-disputed .qga-verify-modal__footer {
                background-color: #f3e8ff !important;
            }
            .qga-verify-modal--row-duplicate .qga-verify-modal__body,
            .qga-verify-modal--row-duplicate .qga-verify-modal__footer {
                background-color: #dbeafe !important;
            }
            .qga-verify-modal--row-speedster .qga-verify-modal__body,
            .qga-verify-modal--row-speedster .qga-verify-modal__footer {
                background-color: #ffedd5 !important;
            }
        `;
        document.documentElement.appendChild(style);
    }
    function getVerifyGridRootByRow(row) {
        if (!row || !(row instanceof HTMLElement)) return null;
        return row.closest("#grid, #gridOpenEnds, [data-role='grid']") || null;
    }

    function findVerifyRowCellByHeader(row, headerMatchers) {
        if (!row || !(row instanceof HTMLTableRowElement) || !Array.isArray(headerMatchers) || !headerMatchers.length) {
            return null;
        }
        const gridRoot = getVerifyGridRootByRow(row);
        const headerRow = gridRoot
            ? gridRoot.querySelector(".k-grid-header thead tr[role='row']")
            : null;
        const headerCells = headerRow ? headerRow.querySelectorAll("th[role='columnheader']") : null;
        const cells = row.querySelectorAll("td[role='gridcell']");
        if (!headerCells || !headerCells.length || !cells.length) {
            return null;
        }
        for (let i = 0; i < headerCells.length && i < cells.length; i += 1) {
            const text = String(headerCells[i].textContent || "").trim().toLowerCase();
            if (!text) continue;
            if (headerMatchers.some((matcher) => text.includes(matcher))) {
                return cells[i];
            }
        }
        return null;
    }

    function resolveVerifyRowContext(row) {
        let openEndId = null;
        let valueText = "";
        let variableText = "";

        const questionElement = getVerifyQuestionElement();
        if (questionElement && questionElement.textContent) {
            const questionText = questionElement.textContent.trim();
            const parsedCodes = parseVerifyVariableCodes(questionText);
            if (parsedCodes.length > 0) {
                const groupedCodes = getVerifyGroupedVariableCodes(parsedCodes[0]);
                if (groupedCodes.length > 0) {
                    variableText = groupedCodes.join("; ");
                } else {
                    variableText = parsedCodes.join("; ");
                }
            }
        }

        if (!valueText) {
            const valueCell =
                row.querySelector("td[role='gridcell'][data-field='Value']") ||
                findVerifyRowCellByHeader(row, ["значен", "value", "ответ", "answer", "openend", "текст"]);
            if (valueCell && valueCell.textContent) {
                valueText = valueCell.textContent.trim();
            }
        }

        if (openEndId == null) {
            const idCell = row.querySelector("td[role='gridcell'][data-field='Id']");
            if (idCell && idCell.textContent) {
                const raw = idCell.textContent.trim();
                if (raw) {
                    openEndId = raw;
                }
            }
        }

        return {
            openEndId,
            valueText,
            variableText,
            variableCodes: parseVerifyVariableCodes(variableText)
        };
    }

    function buildVerifyRowKey(context) {
        if (!context) {
            return null;
        }
        const idPart =
            context.openEndId != null && context.openEndId !== ""
                ? String(context.openEndId).trim()
                : "";
        const valuePart =
            context.valueText && context.valueText !== ""
                ? String(context.valueText).trim().toLowerCase()
                : "";
        if (!idPart && !valuePart) {
            return null;
        }
        return idPart + "||" + valuePart;
    }

    /** Возвращает число N (кол-во ID по ответу) из первой ячейки строки или null. */
    function getVerifyRowN(gridRoot, row) {
        if (!gridRoot || !row) return null;
        const headerRow = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
        const headerCells = headerRow ? headerRow.querySelectorAll("th[role='columnheader']") : null;
        const firstHeaderText = headerCells && headerCells.length
            ? (headerCells[0].textContent || "").trim().toLowerCase()
            : "";
        const cells = row.querySelectorAll("td[role='gridcell']");
        if (!cells.length) return null;
        const firstCell = cells[0];
        const text = (firstCell.textContent || "").trim();
        const num = parseInt(text, 10);
        if (firstHeaderText === "n" || /^\d+$/.test(text)) {
            return Number.isFinite(num) ? num : null;
        }
        return Number.isFinite(num) ? num : null;
    }

    /** Возвращает { incorrect, postpone } по чекбоксам строки. */
    function getVerifyRowIncorrectPostpone(gridRoot, row) {
        const out = { incorrect: false, postpone: false };
        if (!gridRoot || !row || !(row instanceof HTMLTableRowElement)) return out;
        const headerRow = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
        const headerCells = headerRow ? headerRow.querySelectorAll("th[role='columnheader']") : null;
        let incorrectIndex = -1;
        let postponeIndex = -1;
        if (headerCells && headerCells.length) {
            for (let i = 0; i < headerCells.length; i += 1) {
                const text = (headerCells[i].textContent || "").trim().toLowerCase();
                if (incorrectIndex === -1 && text.includes("некоррект")) incorrectIndex = i;
                if (postponeIndex === -1 && text.includes("отлож")) postponeIndex = i;
            }
        }
        const cells = row.querySelectorAll("td[role='gridcell']");
        const incorrectCell = incorrectIndex >= 0 && incorrectIndex < cells.length ? cells[incorrectIndex] : null;
        const postponeCell = postponeIndex >= 0 && postponeIndex < cells.length ? cells[postponeIndex] : null;
        const incorrectCheckbox = incorrectCell ? incorrectCell.querySelector("input[type='checkbox']") : null;
        const postponeCheckbox = postponeCell ? postponeCell.querySelector("input[type='checkbox']") : null;
        out.incorrect = !!(incorrectCheckbox && incorrectCheckbox.checked);
        out.postpone = !!(postponeCheckbox && postponeCheckbox.checked);
        return out;
    }

    /** Возвращает массив respondent IDs для строки по индексу (или пустой массив). */
    function getRespondentIdsForVerifyRow(row) {
        const context = resolveVerifyRowContext(row);
        if (!context || (!context.openEndId && !context.valueText)) return [];
        const respondentIdsByOpenEndId = state.verifyRespondentIdsByOpenEndId;
        const idsByQuestionAndValue = state.verifyRespondentIdsByQuestionAndValue;
        const idsByValueOnly = state.verifyRespondentIdsByValueOnly;
        if (!respondentIdsByOpenEndId && !idsByQuestionAndValue && !idsByValueOnly) return [];
        let respondentIds = [];
        if (respondentIdsByOpenEndId && respondentIdsByOpenEndId.size > 0) {
            if (respondentIds.length === 0) {
                const valueText = context.valueText || "";
                const contextCodes = getVerifyCodesForContext(context);
                if (contextCodes.length > 0 && valueText) {
                    if (contextCodes.length > 1) {
                        const collected = new Set();
                        for (const code of contextCodes) {
                            for (const variant of getVerifyQuestionCodeVariants(code)) {
                                const key = buildVerifyQuestionValueKey(variant, valueText);
                                const arr = respondentIdsByOpenEndId.get(key) || [];
                                if (Array.isArray(arr)) arr.forEach((id) => collected.add(String(id)));
                            }
                        }
                        if (collected.size > 0) respondentIds = Array.from(collected);
                    }
                    if (respondentIds.length === 0) {
                        const singleCode = contextCodes[0];
                        for (const variant of getVerifyQuestionCodeVariants(singleCode)) {
                            const compositeKey = buildVerifyQuestionValueKey(variant, valueText);
                            const fromMap = respondentIdsByOpenEndId.get(compositeKey);
                            if (Array.isArray(fromMap) && fromMap.length > 0) {
                                respondentIds = fromMap.slice();
                                break;
                            }
                        }
                    }
                }
            }
            if (respondentIds.length === 0 && context.openEndId != null) {
                const key = String(context.openEndId).trim();
                const idsFromMap =
                    respondentIdsByOpenEndId.get(key) ||
                    respondentIdsByOpenEndId.get(String(context.openEndId)) ||
                    [];
                if (Array.isArray(idsFromMap) && idsFromMap.length > 0) respondentIds = idsFromMap.slice();
            }
        }
        if (respondentIds.length === 0 && idsByQuestionAndValue) {
            const valueText = context.valueText || "";
            const contextCodes = getVerifyCodesForContext(context);
            if (contextCodes.length > 0 && valueText) {
                if (contextCodes.length > 1) {
                    const collected = new Set();
                    for (const code of contextCodes) {
                        for (const variant of getVerifyQuestionCodeVariants(code)) {
                            const key = buildVerifyQuestionValueKey(variant, valueText);
                            const arr = idsByQuestionAndValue.get(key) || [];
                            if (Array.isArray(arr)) arr.forEach((id) => collected.add(String(id)));
                        }
                    }
                    if (collected.size > 0) respondentIds = Array.from(collected);
                }
                if (respondentIds.length === 0) {
                    const singleCode = contextCodes[0];
                    for (const variant of getVerifyQuestionCodeVariants(singleCode)) {
                        const key = buildVerifyQuestionValueKey(variant, valueText);
                        const fromIndex = idsByQuestionAndValue.get(key);
                        if (Array.isArray(fromIndex) && fromIndex.length > 0) {
                            respondentIds = fromIndex.slice();
                            break;
                        }
                    }
                }
            }
        }
        if (respondentIds.length === 0 && idsByValueOnly && context.valueText) {
            const key = buildVerifyValueOnlyKey(context.valueText);
            const fromIndex = idsByValueOnly.get(key);
            if (Array.isArray(fromIndex) && fromIndex.length > 0) {
                const allowedCodes = getVerifyCodesForContext(context);
                if (allowedCodes.length > 0) {

                    const allowedCodeSet = new Set(
                        allowedCodes.flatMap((code) => getVerifyQuestionCodeVariants(code))
                    );
                    const allowedIds = new Set();
                    const answersMap = state.verifyAnswersByRespondentId || new Map();
                    for (const rawId of fromIndex) {
                        const idStr = String(rawId).trim();
                        if (!idStr) continue;
                        const answersForId =
                            answersMap.get(idStr) ||
                            answersMap.get(idStr.trim()) ||
                            [];
                        const hasAnswerInGroup = answersForId.some((ans) => {
                            const q = String(ans && ans.question ? ans.question : "").trim();
                            const answerValueKey = buildVerifyValueOnlyKey(
                                ans && ans.value ? ans.value : ""
                            );
                            return q && allowedCodeSet.has(q) && answerValueKey === key;
                        });
                        if (hasAnswerInGroup) {
                            allowedIds.add(idStr);
                        }
                    }
                    if (allowedIds.size > 0) {
                        respondentIds = Array.from(allowedIds);
                    }
                } else {
                    respondentIds = fromIndex.slice();
                }
            }
        }
        return Array.from(new Set(respondentIds.map((id) => String(id))));
    }

    /**
     * Подсвечивает строки, где N=1, цветом по приоритетному ReasonCode:
     * 1 — некорректный (красный), 2 — спорное интервью (фиолетовый),
     * 3 — одинаковые ответы (синий), 4 — спидстер (оранжевый),
     * 6 — технический брак (жёлтый).
     */
    function applyVerifyRowVisibility(gridRoot) {
        if (!gridRoot) return;
        const projectId = getProjectIdForVerify();
        const alreadyInManualSet = projectId ? getManualBfridsSetForProject(projectId) : new Set();
        const verifyIncorrectSet = projectId ? getVerifyIncorrectIdsSetForProject(projectId) : new Set();
        const ratingReasonMap = projectId ? getRatingReasonCodesForProject(projectId) : {};
        const rows = gridRoot.querySelectorAll("tr.k-master-row");
        const REASON_ICON_CONFIG = {
            1: { url: chrome.runtime.getURL("icons/inc.png"), alt: "Некорректный ответ" },
            3: { url: chrome.runtime.getURL("icons/table.png"), alt: "Одинаковые табличные ответы" },
            4: { url: chrome.runtime.getURL("icons/speed.png"), alt: "Спидстер" },
            6: { url: chrome.runtime.getURL("icons/manual.png"), alt: "Ручная чистка" }
        };

        const ROW_BG_COLOR = {
            1: "#fee2e2",
            2: "#f3e8ff",
            3: "#dbeafe",
            4: "#ffedd5",
            6: "#fef9c3"
        };

        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) continue;
            row.classList.remove("qga-verify-row-hidden");
            ALL_ROW_REASON_CLASSES.forEach((cls) => row.classList.remove(cls));

            row.style.removeProperty("background");

            const n = getVerifyRowN(gridRoot, row);
            if (n !== 1) {
                continue;
            }

            let allCodes = [];
            let topCode = 0;

            if (state.verifyRespondentIndexLoaded) {
                const ids = getRespondentIdsForVerifyRow(row);
                if (ids.length === 1) {
                    allCodes = getRespondentAllReasonCodes(ids[0], verifyIncorrectSet, ratingReasonMap, alreadyInManualSet);
                    topCode = getTopReasonCode(allCodes);
                }
            }

            if (allCodes.length > 1) {
                const colors = allCodes.map((c) => ROW_BG_COLOR[c]).filter(Boolean);
                if (colors.length > 1) {
                    row.style.background = "linear-gradient(to right, " + colors.join(", ") + ")";
                }
            } else {
                const rowClass = REASON_CODE_ROW_CLASS[topCode];
                if (rowClass) {
                    row.classList.add(rowClass);
                }
            }

            const firstCell = row.querySelector("td[role='gridcell']");
            if (firstCell) {
                let textWrap = firstCell.querySelector(".qga-cell-text");
                if (!textWrap) {
                    textWrap = document.createElement("span");
                    textWrap.className = "qga-cell-text";
                    while (firstCell.childNodes.length) {
                        textWrap.appendChild(firstCell.childNodes[0]);
                    }
                    firstCell.appendChild(textWrap);
                }

                let iconsWrap = textWrap.querySelector(".qga-reason-icons");
                const neededCodes = allCodes.filter((c) => REASON_ICON_CONFIG[c]);

                if (neededCodes.length > 0) {
                    if (!iconsWrap) {
                        iconsWrap = document.createElement("span");
                        iconsWrap.className = "qga-reason-icons";
                        textWrap.appendChild(iconsWrap);
                    }

                    const currentSrcs = new Set(
                        Array.from(iconsWrap.querySelectorAll("img")).map((img) => img.src)
                    );
                    const neededSrcs = new Set(neededCodes.map((c) => REASON_ICON_CONFIG[c].url));

                    if (currentSrcs.size !== neededSrcs.size || ![...currentSrcs].every((s) => neededSrcs.has(s))) {
                        iconsWrap.innerHTML = "";
                        for (const code of neededCodes) {
                            const cfg = REASON_ICON_CONFIG[code];
                            const icon = document.createElement("img");
                            icon.src = cfg.url;
                            icon.alt = cfg.alt;
                            icon.title = cfg.alt;
                            iconsWrap.appendChild(icon);
                        }
                    }
                } else if (iconsWrap) {
                    iconsWrap.remove();
                }
            }

        }
    }

    async function ensureVerifyRespondentIndexLoaded() {
        if (state.verifyRespondentIndexLoaded) {
            return true;
        }

        if (state.verifyRespondentIndexLoading) {
            alert("Идёт загрузка выгрузки OpenEnds, попробуйте ещё раз через несколько секунд.");
            return false;
        }

        const projectId = getProjectIdForVerify();
        if (!projectId) {
            state.verifyRespondentIndexError =
                "Не удалось определить идентификатор проекта (ProjectId) на странице VerifyMain.";
            console.warn("[QGA] VerifyMain: не найден ProjectId для загрузки выгрузки OpenEnds.");
            return false;
        }

        state.verifyRespondentIndexLoading = true;
        state.verifyRespondentIndexError = null;

        try {
            const url = `/lk/OpenEnds2/DownloadOpenEnds/${encodeURIComponent(String(projectId))}`;
            console.info("[QGA] VerifyMain: загрузка выгрузки OpenEnds (XLSX) с", url);

            const response = await fetch(url, { credentials: "include" });
            if (!response.ok) {
                state.verifyRespondentIndexError = `Сервер вернул статус ${response.status} при загрузке OpenEnds.`;
                console.warn("[QGA] VerifyMain: ошибка ответа при загрузке OpenEnds:", response.status);
                return false;
            }

            const buffer = await response.arrayBuffer();
            const parsed = parseOpenEndsFromXlsx(buffer);
            if (!parsed.ok) {
                state.verifyRespondentIndexError = parsed.error || "Не удалось разобрать выгрузку OpenEnds.";
                console.warn("[QGA] VerifyMain: ошибка разбора выгрузки OpenEnds:", parsed.error);
                return false;
            }

            state.verifyRespondentIdsByOpenEndId = parsed.respondentIdsByOpenEndId;
            state.verifyAnswersByRespondentId = parsed.answersByRespondentId;
            state.verifyRespondentIdsByQuestionAndValue = parsed.respondentIdsByQuestionAndValue;
            state.verifyRespondentIdsByValueOnly = parsed.respondentIdsByValueOnly;
            state.verifyRespondentIndexLoaded = true;
            console.info("[QGA] VerifyMain: индекс ответов респондентов успешно построен.");
            return true;
        } catch (error) {
            console.error("[QGA] VerifyMain: исключение при загрузке/разборе OpenEnds:", error);
            state.verifyRespondentIndexError = "Ошибка сети или формата при загрузке выгрузки OpenEnds.";
            return false;
        } finally {
            state.verifyRespondentIndexLoading = false;
        }
    }

    /** Отправить выбранные respondent ID в ручную чистку (вызывается из модалки «Другие ответы»). */
    async function sendRespondentIdsToManualCleanup(idsArray) {
        if (!idsArray || idsArray.length === 0) {
            return;
        }
        const projectId = getProjectIdForVerify();
        if (!projectId) {
            alert("Не удалось определить проект.");
            return;
        }
        const ok = await ensureVerifyRespondentIndexLoaded();
        if (!ok) {
            const message =
                state.verifyRespondentIndexError ||
                "Не удалось загрузить выгрузку OpenEnds. Подробности в консоли.";
            alert(message);
            return;
        }
        const normalized = idsArray.map((id) => String(id).trim()).filter(Boolean);
        if (normalized.length === 0) {
            return;
        }
        addManualBfridsForProject(projectId, normalized);
        try {
            await sendManualBfridsToServer(projectId, normalized);
        } catch (error) {
            console.error("[QGA] Ошибка при отправке bfrid в ручную чистку через API:", error);
            alert("Ошибка при отправке в ручную чистку. Подробности в консоли.");
            return;
        }
        console.info(
            "[QGA] Добавлено bfrid в буфер ручной чистки для проекта",
            projectId,
            "кол-во:",
            normalized.length
        );
    }

    function getProjectIdForVerify() {
        const byId = document.getElementById("ProjectId");
        if (byId && "value" in byId && byId.value) {
            return byId.value;
        }

        const input = document.querySelector("input[name='ProjectId']");
        if (input && "value" in input && input.value) {
            return input.value;
        }

        return null;
    }

    /** ProjectId на странице редактирования проекта (/lk/Project/Edit/123). */
    function getProjectIdFromEditPage() {
        const path = (window.location.pathname || "").trim();
        const match = path.match(/\/lk\/project\/edit\/([^/]+)/i);
        return match && match[1] ? match[1] : null;
    }

    /** ID проекта для поиска сохранённых группировок: на странице проверки это ключ из localStorage (из URL Edit), а не ProjectId из формы. Ищем ссылку на /Project/Edit/ или путь. */
    function getProjectIdForGroupsLookup() {
        const path = (window.location.pathname || "").trim();
        let match = path.match(/\/lk\/project\/edit\/([^/]+)/i);
        if (match && match[1]) return match[1];
        const link = document.querySelector('a[href*="/Project/Edit/"], a[href*="/project/edit/"]');
        if (link && link.href) {
            match = link.href.match(/\/project\/edit\/([^/?#]+)/i);
            if (match && match[1]) return match[1];
        }
        return getProjectIdForVerify();
    }

    function loadOpenEndsGroups() {
        try {
            const raw = localStorage.getItem(OPENENDS_GROUPS_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveOpenEndsGroups(allProjectsGroups) {
        try {
            localStorage.setItem(OPENENDS_GROUPS_STORAGE_KEY, JSON.stringify(allProjectsGroups || {}));
        } catch (e) {}
    }

    /** Собрать с текущей страницы (Project Edit #openEnds) список сгруппированных переменных из колонки «переменная» (Q1_1_other; Q1_2_other; …) и сохранить по projectId. */
    function collectOpenEndsGroupsFromPage() {
        if (!isOpenEndsHash()) return;
        const projectId = getProjectIdFromEditPage();
        if (!projectId) return;
        const root = document.querySelector("#divOpenEnds");
        if (!root) return;
        const rows = root.querySelectorAll("#gridOpenEnds .k-grid-content tbody tr.k-master-row");
        const variableSelector = state.settings.variableSelector || "td:nth-child(5)";
        const groupByCode = {};
        for (const row of rows) {
            const cell = row.querySelector(variableSelector);
            const text = (cell && (cell.textContent || cell.innerText || "").trim()) || "";
            const codes = parseVerifyVariableCodes(text);
            if (codes.length > 1) {
                for (const code of codes) {
                    groupByCode[code] = codes.slice();
                }
            }
        }
        const all = loadOpenEndsGroups();
        all[projectId] = groupByCode;
        saveOpenEndsGroups(all);
    }

    function loadManualBfridsState() {
        try {
            const raw = localStorage.getItem(MANUAL_BFRIDS_STORAGE_KEY);
            if (!raw) {
                return {};
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") {
                return {};
            }
            return parsed;
        } catch (error) {
            console.warn("[QGA] Не удалось прочитать состояние bfrid для ручной чистки из localStorage:", error);
            return {};
        }
    }

    function saveManualBfridsState(stateObject) {
        try {
            localStorage.setItem(MANUAL_BFRIDS_STORAGE_KEY, JSON.stringify(stateObject || {}));
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить состояние bfrid для ручной чистки в localStorage:", error);
        }
    }

    function loadManualApiState() {
        try {
            const raw = localStorage.getItem(MANUAL_API_STATE_STORAGE_KEY);
            if (!raw) {
                return {};
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") {
                return {};
            }
            return parsed;
        } catch (error) {
            console.warn("[QGA] Не удалось прочитать состояние API ручной чистки из localStorage:", error);
            return {};
        }
    }

    function saveManualApiState(stateObject) {
        try {
            localStorage.setItem(MANUAL_API_STATE_STORAGE_KEY, JSON.stringify(stateObject || {}));
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить состояние API ручной чистки в localStorage:", error);
        }
    }

    function loadRatingIncorrectIdsState() {
        try {
            const raw = localStorage.getItem(RATING_INCORRECT_IDS_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            console.warn("[QGA] Не удалось прочитать рейтинг некорректных ID из localStorage:", error);
            return {};
        }
    }

    function saveRatingIncorrectIdsState(stateObject) {
        try {
            localStorage.setItem(RATING_INCORRECT_IDS_STORAGE_KEY, JSON.stringify(stateObject || {}));
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить рейтинг некорректных ID в localStorage:", error);
        }
    }

    function loadVerifyIncorrectIdsState() {
        try {
            const raw = localStorage.getItem(VERIFY_INCORRECT_IDS_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            console.warn("[QGA] Не удалось прочитать локальные некорректные ID из localStorage:", error);
            return {};
        }
    }

    function saveVerifyIncorrectIdsState(stateObject) {
        try {
            localStorage.setItem(VERIFY_INCORRECT_IDS_STORAGE_KEY, JSON.stringify(stateObject || {}));
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить локальные некорректные ID в localStorage:", error);
        }
    }

    /** Множество ID, помеченных как некорректные (чекбокс + «Проверить страницу») по проекту. */
    function getVerifyIncorrectIdsSetForProject(projectId) {
        const set = new Set();
        if (!projectId) return set;
        const key = String(projectId);
        const arr = Array.isArray(verifyIncorrectIdsState[key]) ? verifyIncorrectIdsState[key] : [];
        arr.forEach((t) => {
            const s = String(t).trim();
            if (s) set.add(s);
        });
        return set;
    }

    /** Собирает ID со строк, где отмечен чекбокс «Некорректный», и сохраняет в локальное хранилище (вызывается перед verifyValues()). */
    function collectVerifyIncorrectIdsAndSave() {
        const projectId = getProjectIdForVerify();
        const gridRoot = document.querySelector("#grid, #gridOpenEnds");
        if (!projectId || !gridRoot || !state.verifyRespondentIndexLoaded) return;
        const rows = gridRoot.querySelectorAll("tr.k-master-row");
        const collected = new Set();
        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) continue;
            const { incorrect } = getVerifyRowIncorrectPostpone(gridRoot, row);
            if (!incorrect) continue;
            const ids = getRespondentIdsForVerifyRow(row);
            ids.forEach((id) => collected.add(String(id).trim()));
        }
        if (collected.size === 0) return;
        const key = String(projectId);
        const existing = Array.isArray(verifyIncorrectIdsState[key]) ? verifyIncorrectIdsState[key] : [];
        const merged = new Set([...existing.map((x) => String(x).trim()), ...collected].filter(Boolean));
        verifyIncorrectIdsState[key] = Array.from(merged);
        saveVerifyIncorrectIdsState(verifyIncorrectIdsState);
        console.info("[QGA] Локально сохранены некорректные ID (Проверить страницу), добавлено:", collected.size, "всего:", merged.size);
    }

    function addManualBfridsForProject(projectId, bfrids) {
        if (!projectId || !Array.isArray(bfrids) || bfrids.length === 0) {
            return;
        }
        const key = String(projectId);
        const current = Array.isArray(manualBfridsState[key]) ? manualBfridsState[key] : [];
        const set = new Set(current.map((x) => String(x).trim()).filter(Boolean));
        for (const id of bfrids) {
            const normalized = String(id).trim();
            if (normalized) {
                set.add(normalized);
            }
        }
        manualBfridsState[key] = Array.from(set);
        saveManualBfridsState(manualBfridsState);
    }

    function consumeManualBfridsForProject(projectId) {
        if (!projectId) {
            return [];
        }
        const key = String(projectId);
        const current = Array.isArray(manualBfridsState[key]) ? manualBfridsState[key] : [];
        if (!current.length) {
            return [];
        }
        delete manualBfridsState[key];
        saveManualBfridsState(manualBfridsState);
        return current.map((x) => String(x).trim()).filter(Boolean);
    }

    /** Множество ID респондентов, уже находящихся в ручной чистке по проекту (буфер + сохранённое поле Bfrids). */
    function getManualBfridsSetForProject(projectId) {
        const set = new Set();
        if (!projectId) {
            return set;
        }
        const key = String(projectId);
        const fromBuffer = Array.isArray(manualBfridsState[key]) ? manualBfridsState[key] : [];
        for (const id of fromBuffer) {
            const n = String(id).trim();
            if (n) set.add(n);
        }
        const apiEntry = manualApiState && manualApiState[key];
        const bfridsStr = apiEntry && typeof apiEntry.bfrids === "string" ? apiEntry.bfrids : "";
        if (bfridsStr) {
            const fromApi = bfridsStr.split(/[\s,;]+/).map((x) => String(x).trim()).filter(Boolean);
            for (const id of fromApi) {
                set.add(id);
            }
        }
        return set;
    }

    /**
     * Синхронизирует локальное хранилище (manualApiState и manualBfridsState)
     * с текущим содержимым поля ручной чистки (#Bfrids).
     * Вызывается при ручном удалении/изменении айдишек в textarea.
     */
    function syncManualBfridsFromTextarea(projectId) {
        if (!projectId) {
            return;
        }
        const textarea = document.getElementById("Bfrids");
        if (!textarea) {
            return;
        }
        const raw = (textarea.value || "").trim();
        const idsInTextarea = raw
            .split(/[\s,;]+/)
            .map((x) => String(x).trim())
            .filter(Boolean);

        const key = String(projectId);

        const token = findVerificationTokenInDocument(document);
        const prev =
            manualApiState && typeof manualApiState[key] === "object" ? manualApiState[key] : {};
        manualApiState[key] = {
            token: token || prev.token || "",
            bfrids: idsInTextarea.join("\n")
        };
        saveManualApiState(manualApiState);

        const currentBuffer = Array.isArray(manualBfridsState[key]) ? manualBfridsState[key] : [];
        if (currentBuffer.length > 0) {
            const textareaSet = new Set(idsInTextarea);
            const stillPresent = currentBuffer.filter((id) => textareaSet.has(String(id).trim()));
            if (stillPresent.length === 0) {
                delete manualBfridsState[key];
            } else {
                manualBfridsState[key] = stillPresent;
            }
            saveManualBfridsState(manualBfridsState);
        }
    }

    function attachManualBfridsTextareaSync(projectId) {
        const textarea = document.getElementById("Bfrids");
        if (!textarea || !projectId || textarea.dataset.qgaBfridsSyncAttached === "1") {
            return;
        }
        textarea.dataset.qgaBfridsSyncAttached = "1";
        const sync = () => syncManualBfridsFromTextarea(projectId);
        textarea.addEventListener("input", sync);
        textarea.addEventListener("blur", sync);
        textarea.addEventListener("change", sync);
    }

    function setupManualPageIntegration() {
        const projectId = getProjectIdForVerify();
        if (!projectId) {
            return;
        }

        const attach = () => {
            const button = document.getElementById("btnEditManual");
            if (!button) {
                return;
            }
            if (button.dataset.qgaManualBfridBound === "1") {
                return;
            }
            button.dataset.qgaManualBfridBound = "1";

            button.addEventListener("click", () => {
                // Даём штатной логике editManual() переключить режим и показать textarea,
                // затем подставляем bfrid из буфера.
                setTimeout(() => {
                    try {
                        applyManualBfridsToTextarea(projectId);
                    } catch (error) {
                        console.error("[QGA] Ошибка при применении bfrid к ручной чистке:", error);
                    }
                }, 0);
            });
            attachManualBfridsTextareaSync(projectId);
        };

        attach();

        const observer = new MutationObserver(() => {
            attach();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function applyManualBfridsToTextarea(projectId) {
        const textarea = document.getElementById("Bfrids");
        if (!textarea) {
            return;
        }

        const bfrids = consumeManualBfridsForProject(projectId);
        if (!bfrids.length) {
            return;
        }

        const existingRaw = textarea.value || "";
        const existingSet = new Set(
            existingRaw
                .split(/[\s,;]+/)
                .map((x) => x.trim())
                .filter(Boolean)
        );

        for (const id of bfrids) {
            existingSet.add(String(id).trim());
        }

        const merged = Array.from(existingSet).join("\n");
        textarea.value = merged;

        // Сохраняем актуальное состояние Bfrids и токен для этого проекта,
        // чтобы затем вызывать API с VerifyMain без дополнительных запросов.
        try {
            const token = findVerificationTokenInDocument(document);
            const key = String(projectId);
            const prev =
                manualApiState && typeof manualApiState[key] === "object" ? manualApiState[key] : {};

            manualApiState[key] = {
                token: token || prev.token || "",
                bfrids: merged
            };
            saveManualApiState(manualApiState);
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить состояние API ручной чистки:", error);
        }
        attachManualBfridsTextareaSync(projectId);
    }

    async function sendManualBfridsToServer(projectId, bfrids) {
        if (!projectId || !Array.isArray(bfrids) || bfrids.length === 0) {
            return;
        }

        const manualUrl = buildManualEditPostUrl(projectId);
        if (!manualUrl) {
            console.warn("[QGA] Не удалось определить URL для ручной чистки.");
            return;
        }

        const key = String(projectId);
        const stored =
            manualApiState && typeof manualApiState[key] === "object" ? manualApiState[key] : null;

        const existingBfridsRaw =
            stored && typeof stored.bfrids === "string" ? stored.bfrids : "";

        let verificationToken =
            (stored && typeof stored.token === "string" ? stored.token : "") ||
            findVerificationTokenInDocument(document);

        if (!verificationToken) {
            console.warn(
                "[QGA] Не удалось найти __RequestVerificationToken для проекта",
                projectId
            );
            alert(
                "Не удалось найти токен для ручной чистки. " +
                    "Откройте вкладку «Ручная чистка» этого проекта хотя бы один раз, " +
                    "а затем попробуйте снова."
            );
            return;
        }

        const mergedSet = new Set(
            existingBfridsRaw
                .split(/[\s,;]+/)
                .map((x) => x.trim())
                .filter(Boolean)
        );

        for (const id of bfrids) {
            const normalized = String(id).trim();
            if (normalized) {
                mergedSet.add(normalized);
            }
        }

        const mergedBfrids = Array.from(mergedSet).join("\n");

        const body = new URLSearchParams();
        body.set("ProjectId", String(projectId));
        body.set("Bfrids", mergedBfrids);
        body.set("__RequestVerificationToken", verificationToken);

        try {
            const response = await fetch(manualUrl, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: body.toString()
            });

            if (!response.ok) {
                console.error(
                    "[QGA] Не удалось сохранить данные ручной чистки через API:",
                    response.status,
                    response.statusText
                );
                return;
            }

            // Успешно сохранили на сервере: обновляем локальный снимок,
            // чтобы в следующих запросах не затирать уже добавленные id
            // и не слать повторно одни и те же bfrid.
            try {
                const key = String(projectId);
                const prev =
                    manualApiState && typeof manualApiState[key] === "object"
                        ? manualApiState[key]
                        : {};

                manualApiState[key] = {
                    token: verificationToken || prev.token || "",
                    bfrids: mergedBfrids
                };
                saveManualApiState(manualApiState);
            } catch (updateError) {
                console.warn("[QGA] Не удалось обновить локальный снимок API ручной чистки:", updateError);
            }

            console.info(
                "[QGA] Успешно обновлена ручная чистка через API для проекта",
                projectId,
                "кол-во новых bfrid:",
                bfrids.length
            );
        } catch (error) {
            console.error("[QGA] Ошибка при запросе сохранения ручной чистки:", error);
        }
    }

    function findVerificationTokenInDocument(doc) {
        if (!doc || typeof doc.querySelector !== "function") {
            return "";
        }

        const selectors = [
            "input[name='__RequestVerificationToken']",
            "input[name$='RequestVerificationToken']",
            "input[name*='RequestVerificationToken']"
        ];

        for (const selector of selectors) {
            const input = doc.querySelector(selector);
            if (input && "value" in input && input.value) {
                return String(input.value);
            }
        }

        return "";
    }

    function buildManualEditPostUrl(projectId) {
        if (!projectId) {
            return null;
        }
        const origin = window.location.origin || "";
        const base = origin.replace(/\/+$/, "");
        // POST /api/Project/Manual/{ProjectId} — как в стандартном запросе.
        return base + "/api/Project/Manual/" + encodeURIComponent(String(projectId));
    }

    function buildProjectEditUrl(projectId) {
        if (!projectId) {
            return null;
        }
        const origin = window.location.origin || "";
        const base = origin.replace(/\/+$/, "");
        // Страница редактирования проекта, где есть вкладка «Ручная чистка» и форма с токеном.
        return base + "/lk/Project/Edit/" + encodeURIComponent(String(projectId));
    }

    function parseOpenEndsFromXlsx(arrayBuffer) {
        if (!(arrayBuffer instanceof ArrayBuffer)) {
            return { ok: false, error: "Неверный формат данных при загрузке OpenEnds (ожидался ArrayBuffer)." };
        }

        if (typeof XLSX === "undefined" || typeof XLSX.read !== "function") {
            return {
                ok: false,
                error:
                    "Для разбора файла OpenEnds (XLSX) не найдена библиотека XLSX. " +
                    "Убедитесь, что на страницу подключён XLSX (например, xlsx.full.min.js) и доступен глобальный объект XLSX."
            };
        }

        let workbook = null;
        try {
            workbook = XLSX.read(arrayBuffer, { type: "array" });
        } catch (error) {
            console.error("[QGA] Ошибка XLSX.read при разборе OpenEnds:", error);
            return { ok: false, error: "Не удалось прочитать XLSX-файл OpenEnds (ошибка XLSX.read)." };
        }

        if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
            return { ok: false, error: "Файл OpenEnds не содержит листов или имеет некорректный формат." };
        }

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            return { ok: false, error: "Не удалось найти первый лист в файле OpenEnds." };
        }

        let rows;
        try {
            rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
        } catch (error) {
            console.error("[QGA] Ошибка XLSX.utils.sheet_to_json при разборе OpenEnds:", error);
            return { ok: false, error: "Не удалось преобразовать XLSX в строки (sheet_to_json)." };
        }

        if (!Array.isArray(rows) || rows.length < 2) {
            return { ok: false, error: "Выгрузка OpenEnds пуста или содержит только заголовок." };
        }

        const headerCells = rows[0].map((cell) => String(cell || "").trim());
        const headerNormalized = headerCells.map((cell) => cell.toLowerCase());
        console.info("[QGA] VerifyMain: заголовок OpenEnds XLSX:", headerCells);

        const respondentIndex = headerNormalized.findIndex((name) => {
            return name === "bfrid" || name.includes("respondent") || name.includes("респондент");
        });

        const questionIndex = headerNormalized.findIndex((name) => {
            return (
                name === "имя переменной" ||
                name === "variable" ||
                name.includes("question") ||
                name.includes("qcode") ||
                name.includes("var") ||
                name.includes("variable") ||
                name.includes("вопрос")
            );
        });

        const valueIndex = headerNormalized.findIndex((name) => {
            return (
                name === "значение" ||
                name === "value" ||
                name.includes("text") ||
                name.includes("answer") ||
                name.includes("ответ") ||
                name.includes("openend")
            );
        });

        if (respondentIndex === -1 || questionIndex === -1 || valueIndex === -1) {
            return {
                ok: false,
                error:
                    "Не удалось автоматически определить столбцы респондента/переменной/значения в выгрузке OpenEnds. " +
                    "Проверьте формат файла и, при необходимости, обновите логику парсинга в расширении."
            };
        }

        /** Один openEndId в выгрузке может соответствовать многим респондентам (один и тот же ответ у нескольких человек). */
        const respondentIdsByOpenEndId = new Map();
        const answersByRespondentId = new Map();
        const respondentIdsByQuestionAndValue = new Map();
        const respondentIdsByValueOnly = new Map();

        for (let i = 1; i < rows.length; i += 1) {
            const row = Array.isArray(rows[i]) ? rows[i] : [];
            if (row.length === 0) {
                continue;
            }

            const respondentIdRaw = String(row[respondentIndex] || "").trim();
            if (!respondentIdRaw) {
                continue;
            }

            const respondentId = respondentIdRaw;
            const openEndIdCell = row.find((_, idx) => {
                const name = headerNormalized[idx];
                if (!name) {
                    return false;
                }
                return (
                    name === "id" ||
                    name === "openid" ||
                    name === "openend_id" ||
                    name.includes("openendid") ||
                    (name.endsWith("id") && name.includes("open"))
                );
            });
            const openEndId = openEndIdCell != null ? String(openEndIdCell).trim() || null : null;

            let question = "";
            let value = "";

            if (questionIndex >= 0 && questionIndex < row.length) {
                question = String(row[questionIndex] || "").trim();
            }
            if (valueIndex >= 0 && valueIndex < row.length) {
                value = String(row[valueIndex] || "").trim();
            }

            if (openEndId) {
                if (!respondentIdsByOpenEndId.has(openEndId)) {
                    respondentIdsByOpenEndId.set(openEndId, []);
                }
                respondentIdsByOpenEndId.get(openEndId).push(respondentId);
            }

            // Ключ только по полному коду переменной (Q1_1_other||значение). При сгруппированном вопросе поиск идёт по списку переменных из заголовка.
            if (question && value) {
                const fullKey = buildVerifyQuestionValueKey(question, value);
                if (!respondentIdsByOpenEndId.has(fullKey)) {
                    respondentIdsByOpenEndId.set(fullKey, []);
                }
                const fullArr = respondentIdsByOpenEndId.get(fullKey);
                if (!fullArr.includes(respondentId)) fullArr.push(respondentId);
            }

            if (!answersByRespondentId.has(respondentId)) {
                answersByRespondentId.set(respondentId, []);
            }

            answersByRespondentId.get(respondentId).push({
                openEndId,
                question,
                value
            });

            if (question && value) {
                const fullKey = buildVerifyQuestionValueKey(question, value);
                if (!respondentIdsByQuestionAndValue.has(fullKey)) {
                    respondentIdsByQuestionAndValue.set(fullKey, []);
                }
                respondentIdsByQuestionAndValue.get(fullKey).push(respondentId);
            }

            if (value) {
                const valueKey = buildVerifyValueOnlyKey(value);
                if (!respondentIdsByValueOnly.has(valueKey)) {
                    respondentIdsByValueOnly.set(valueKey, []);
                }
                respondentIdsByValueOnly.get(valueKey).push(respondentId);
            }
        }

        return {
            ok: true,
            respondentIdsByOpenEndId,
            answersByRespondentId,
            respondentIdsByQuestionAndValue,
            respondentIdsByValueOnly
        };
    }

    /**
     * Парсит Excel рейтинга (кнопка «Рейтинг»): колонки Token, ReasonCodes.
     * ReasonCodes может содержать несколько кодов через пробел (например "1 3 6").
     * Возвращает { ok: true, tokenReasonCodes: { [token]: number[] } } или { ok: false, error }.
     */
    function parseRatingXlsx(arrayBuffer) {
        if (!(arrayBuffer instanceof ArrayBuffer)) {
            return { ok: false, error: "Неверный формат данных (ожидался ArrayBuffer)." };
        }
        if (typeof XLSX === "undefined" || typeof XLSX.read !== "function") {
            return { ok: false, error: "Библиотека XLSX недоступна." };
        }
        let workbook;
        try {
            workbook = XLSX.read(arrayBuffer, { type: "array" });
        } catch (error) {
            console.warn("[QGA] Ошибка XLSX.read при разборе рейтинга:", error);
            return { ok: false, error: "Не удалось прочитать XLSX рейтинга." };
        }
        if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
            return { ok: false, error: "Файл рейтинга пуст или некорректен." };
        }
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) return { ok: false, error: "Лист не найден." };
        let rows;
        try {
            rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
        } catch (error) {
            return { ok: false, error: "Не удалось преобразовать лист рейтинга в данные." };
        }
        if (!Array.isArray(rows) || rows.length < 2) {
            return { ok: true, tokenReasonCodes: {} };
        }
        const headerCells = rows[0].map((cell) => String(cell || "").trim());
        const headerLower = headerCells.map((h) => h.toLowerCase());
        const tokenCol = headerLower.findIndex((h) => h === "token");
        const reasonCol = headerLower.findIndex((h) => h === "reasoncodes" || h === "reason codes");
        if (tokenCol === -1 || reasonCol === -1) {
            return { ok: false, error: "В рейтинге не найдены колонки Token или ReasonCodes." };
        }
        const tokenReasonCodes = {};
        for (let i = 1; i < rows.length; i += 1) {
            const row = Array.isArray(rows[i]) ? rows[i] : [];
            const reasonRaw = row[reasonCol];
            if (reasonRaw == null || String(reasonRaw).trim() === "") continue;
            const codes = String(reasonRaw).trim().split(/\s+/).map(Number).filter((n) => n > 0 && Number.isFinite(n));
            if (codes.length === 0) continue;
            const token = String(row[tokenCol] || "").trim();
            if (token) tokenReasonCodes[token] = codes;
        }
        return { ok: true, tokenReasonCodes };
    }

    /** Маппинг token → reason codes из рейтинга для проекта. */
    function getRatingReasonCodesForProject(projectId) {
        if (!projectId) return {};
        const key = String(projectId);
        const data = ratingIncorrectIdsState[key];
        if (!data || typeof data !== "object") return {};
        if (Array.isArray(data)) {
            const map = {};
            data.forEach((t) => { const s = String(t).trim(); if (s) map[s] = [1]; });
            return map;
        }
        return data;
    }

    /** Множество Token (ID) с любым ReasonCode из рейтинга по проекту. */
    function getRatingIncorrectIdsSetForProject(projectId) {
        const map = getRatingReasonCodesForProject(projectId);
        return new Set(Object.keys(map));
    }

    const REASON_CODE_PRIORITY = [1, 6, 3, 4, 2];

    const REASON_CODE_ROW_CLASS = {
        1: "qga-verify-row-incorrect",
        2: "qga-verify-row-disputed",
        3: "qga-verify-row-duplicate",
        4: "qga-verify-row-speedster",
        6: "qga-verify-row-tech-defect"
    };

    const REASON_CODE_ITEM_CLASS = {
        1: "qga-verify-modal__item--incorrect",
        2: "qga-verify-modal__item--disputed",
        3: "qga-verify-modal__item--duplicate",
        4: "qga-verify-modal__item--speedster",
        6: "qga-verify-modal__item--tech-defect"
    };

    const REASON_CODE_MODAL_CLASS = {
        1: "qga-verify-modal--row-incorrect",
        2: "qga-verify-modal--row-disputed",
        3: "qga-verify-modal--row-duplicate",
        4: "qga-verify-modal--row-speedster",
        6: "qga-verify-modal--tech-defect"
    };

    const ALL_ROW_REASON_CLASSES = Object.values(REASON_CODE_ROW_CLASS);
    const ALL_MODAL_REASON_CLASSES = Object.values(REASON_CODE_MODAL_CLASS);
    const ALL_ITEM_REASON_CLASSES = Object.values(REASON_CODE_ITEM_CLASS);

    /**
     * Определяет приоритетный ReasonCode для респондента.
     * Приоритет: 1 (некорректный) > 6 (тех. брак) > 3 (одинаковые) > 4 (спидстер) > 2 (спорный).
     * Возвращает номер кода или 0, если кодов нет.
     */
    function getTopReasonCode(reasonCodes) {
        if (!reasonCodes || !Array.isArray(reasonCodes) || reasonCodes.length === 0) return 0;
        for (const code of REASON_CODE_PRIORITY) {
            if (reasonCodes.includes(code)) return code;
        }
        return reasonCodes[0] || 0;
    }

    /**
     * Определяет приоритетный ReasonCode для респондента по всем источникам.
     * Учитывает: локальную пометку (код 1), рейтинг, технический брак (код 6).
     */
    function getRespondentAllReasonCodes(respondentId, verifyIncorrectSet, ratingReasonMap, manualSet) {
        const id = String(respondentId).trim();
        const codes = [];
        if (verifyIncorrectSet && verifyIncorrectSet.has(id)) codes.push(1);
        if (ratingReasonMap && ratingReasonMap[id]) {
            codes.push(...ratingReasonMap[id]);
        }
        if (manualSet && manualSet.has(id)) codes.push(6);
        return [...new Set(codes)];
    }

    function getRespondentTopReasonCode(respondentId, projectId, verifyIncorrectSet, ratingReasonMap, manualSet) {
        const codes = getRespondentAllReasonCodes(respondentId, verifyIncorrectSet, ratingReasonMap, manualSet);
        return getTopReasonCode(codes);
    }

    /** Загружает Excel рейтинга по projectId (URL: /lk/Project/Ratings/{id}), парсит все ReasonCodes. */
    async function ensureRatingIncorrectIdsLoaded(projectId) {
        if (!projectId) return false;
        const key = String(projectId);
        const url = `/lk/Project/Ratings/${encodeURIComponent(key)}`;
        const referrerUrl = `${window.location.origin}/lk/Project/Edit/${encodeURIComponent(key)}`;
        const acceptHeader = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
        try {
            const response = await fetch(url, {
                credentials: "include",
                referrer: referrerUrl,
                referrerPolicy: "unsafe-url",
                headers: {
                    Accept: acceptHeader
                }
            });
            if (!response.ok) {
                console.warn("[QGA] Рейтинг: ответ сервера", response.status, response.statusText);
                return false;
            }
            const buffer = await response.arrayBuffer();
            const parsed = parseRatingXlsx(buffer);
            if (!parsed.ok) {
                console.warn("[QGA] Рейтинг: не удалось разобрать файл", parsed.error);
                return false;
            }
            ratingIncorrectIdsState[key] = parsed.tokenReasonCodes || {};
            saveRatingIncorrectIdsState(ratingIncorrectIdsState);
            const count = Object.keys(parsed.tokenReasonCodes || {}).length;
            console.info("[QGA] Рейтинг: загружены ID с ReasonCodes, кол-во:", count);
            return true;
        } catch (e) {
            console.warn("[QGA] Рейтинг: ошибка загрузки", e);
            return false;
        }
    }

    function buildVerifyQuestionValueKey(questionCode, valueText) {
        const q = String(questionCode || "").trim();
        const v = String(valueText || "")
            .replace(/\s+/g, " ")
            .trim();
        return `${q}||${v}`;
    }

    function buildVerifyValueOnlyKey(valueText) {
        return String(valueText || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function getVerifyCodesForContext(context) {
        if (context && Array.isArray(context.variableCodes) && context.variableCodes.length > 0) {
            const directCodes = context.variableCodes
                .map((code) => String(code || "").trim())
                .filter(Boolean);
            if (directCodes.length > 1) {
                return directCodes;
            }
            if (directCodes.length === 1) {
                const groupedCodes = getVerifyGroupedVariableCodes(directCodes[0]);
                if (groupedCodes.length > 1) {
                    return groupedCodes.map((code) => String(code || "").trim()).filter(Boolean);
                }
            }
            return directCodes;
        }
        const questionCode = getVerifyQuestionCode();
        if (!questionCode) return [];
        const groupedCodes = getVerifyGroupedVariableCodes(questionCode);
        if (groupedCodes.length > 1) {
            return groupedCodes.map((code) => String(code || "").trim()).filter(Boolean);
        }
        const baseCode = getVerifyQuestionBaseCode(questionCode);
        return baseCode ? [String(baseCode).trim()] : [];
    }

    function getVerifyQuestionCodeVariants(questionCode) {
        const code = String(questionCode || "").trim();
        if (!code) return [];
        const variants = new Set([code]);
        variants.add(code.replace(/\.(?=\d)/g, "_"));
        variants.add(code.replace(/_(?=\d)/g, "."));
        return Array.from(variants).filter(Boolean);
    }

    function parseVerifyVariableCodes(text) {
        const parts = String(text || "")
            .split(/[;\n]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const codes = [];
        for (const part of parts) {
            // Поддерживаем переменные, начинающиеся не только с Q,
            // а с любой буквы (A-Z), далее цифры/буквы/._ и опциональный суффикс _other.
            const m = part.match(/^([A-Za-z]+[0-9A-Za-z_.]*(_other)?)/);
            if (!m || !m[1]) continue;
            const normalized = String(m[1]).trim();
            if (normalized) codes.push(normalized);
        }
        return Array.from(new Set(codes));
    }

    /** Список переменных группы для questionCode. Сначала из данных, собранных на странице Project Edit #openEnds (ключ — ID из URL Edit); иначе из заголовка на странице проверки. */
    function getVerifyGroupedVariableCodes(questionCode) {
        const code = String(questionCode || "").trim();
        const projectKey = getProjectIdForGroupsLookup();
        if (projectKey && code) {
            const all = loadOpenEndsGroups();
            const projectGroups = all[projectKey];
            if (projectGroups) {
                for (const variant of getVerifyQuestionCodeVariants(code)) {
                    if (
                        projectGroups[variant] &&
                        Array.isArray(projectGroups[variant]) &&
                        projectGroups[variant].length > 1
                    ) {
                        return Array.from(new Set(projectGroups[variant]));
                    }
                }
            }
        }
        const questionElement = getVerifyQuestionElement();
        const text = questionElement && questionElement.textContent ? questionElement.textContent : "";
        const variableCodes = parseVerifyVariableCodes(text);
        return variableCodes.length > 1 ? variableCodes : [];
    }

    /** Есть ли на странице список переменных через «;» (Q1_1_other; Q1_2_other; …) — тогда вопрос сгруппирован. */
    function isVerifyQuestionGrouped(questionCode) {
        const code = String(questionCode || "").trim();
        if (!code) return false;
        const variableCodes = getVerifyGroupedVariableCodes(code);
        return variableCodes.length > 1 && variableCodes.includes(code);
    }

    /** Код вопроса для ключа: если не сгруппирован — целиком (Q1_3_other, Q13.1); при сгруппированном поиск идёт по списку переменных из заголовка. */
    function getVerifyQuestionBaseCode(questionCode) {
        return String(questionCode || "").trim();
    }

    function getVerifyQuestionCode() {
        if (typeof state.verifyQuestionCode === "string" && state.verifyQuestionCode) {
            return state.verifyQuestionCode;
        }

        let candidate = "";
        const questionElement = getVerifyQuestionElement();
        const questionText = questionElement && questionElement.textContent ? questionElement.textContent : "";
        const parsedCodes = parseVerifyVariableCodes(questionText);
        if (parsedCodes.length > 0) {
            candidate = parsedCodes[0];
        }

        const sources = [];
        if (questionText) {
            sources.push(questionText);
        }
        const titleNode = document.querySelector("body");
        if (titleNode && titleNode.textContent) {
            sources.push(titleNode.textContent);
        }

        if (!candidate) {
            const combined = sources.join("\n");
            // Код вопроса также может начинаться не только с Q.
            const match = combined.match(/([A-Za-z][0-9A-Za-z_.]*(?:_other)?)/);
            if (match && match[1]) {
                candidate = match[1];
            }
        }

        state.verifyQuestionCode = candidate || null;
        return state.verifyQuestionCode;
    }

    function getVerifyQuestionElement() {
        return (
            document.querySelector("#divVerifyOpenEnds > div.row > div:nth-child(1) > div") ||
            document.querySelector("#divVerifyOpenEnds .row > div:first-child > div") ||
            document.querySelector("#grid, #gridOpenEnds")?.previousElementSibling ||
            null
        );
    }

    function showVerifyRespondentModal(respondentId, answers, context, rowState) {
        let modal = document.querySelector(".qga-verify-modal");
        if (!modal) {
            modal = document.createElement("aside");
            modal.className = "qga-verify-modal";
            modal.innerHTML = `
                <div class="qga-verify-modal__header">
                    <div class="qga-verify-modal__title"></div>
                    <button type="button" class="qga-verify-modal__close" aria-label="Закрыть">×</button>
                </div>
                <div class="qga-verify-modal__body">
                    <ul class="qga-verify-modal__list"></ul>
                    <div class="qga-verify-modal__footer"></div>
                </div>
            `;

            const closeButton = modal.querySelector(".qga-verify-modal__close");
            if (closeButton) {
                closeButton.addEventListener("click", () => {
                    modal.style.display = "none";
                });
            }

            document.addEventListener("click", function closeOnClickOutside(e) {
                if (modal.style.display !== "flex") return;
                if (modal.contains(e.target)) return;
                modal.style.display = "none";
            });

            document.documentElement.appendChild(modal);

            const bodyEl = modal.querySelector(".qga-verify-modal__body");
            if (bodyEl) {
                const scrollbarZone = 20;
                bodyEl.addEventListener("mousemove", (e) => {
                    const rect = bodyEl.getBoundingClientRect();
                    const isNearScrollbar = (rect.right - e.clientX) <= scrollbarZone;
                    bodyEl.classList.toggle("qga-verify-modal__body--scrollbar-hover", isNearScrollbar);
                });
                bodyEl.addEventListener("mouseleave", () => {
                    bodyEl.classList.remove("qga-verify-modal__body--scrollbar-hover");
                });
            }
        }

        const titleNode = modal.querySelector(".qga-verify-modal__title");
        const listNode = modal.querySelector(".qga-verify-modal__list");
        const footerNode = modal.querySelector(".qga-verify-modal__footer");

        if (titleNode) {
            titleNode.textContent = String(respondentId);
        }

        const respondentIdStr = String(respondentId).trim();
        const projectIdForModal = getProjectIdForVerify();
        const verifyIncorrectSetForModal = projectIdForModal ? getVerifyIncorrectIdsSetForProject(projectIdForModal) : new Set();
        const ratingReasonMapForModal = projectIdForModal ? getRatingReasonCodesForProject(projectIdForModal) : {};
        const manualSetForModal = projectIdForModal ? getManualBfridsSetForProject(projectIdForModal) : new Set();
        const allCodesForModal = getRespondentAllReasonCodes(respondentIdStr, verifyIncorrectSetForModal, ratingReasonMapForModal, manualSetForModal);
        const topReasonCode = getTopReasonCode(allCodesForModal);
        const isIncorrectFromRating = topReasonCode > 0;

        const MODAL_BG_COLOR = {
            1: "#fee2e2",
            2: "#f3e8ff",
            3: "#dbeafe",
            4: "#ffedd5",
            6: "#fef9c3"
        };

        ALL_MODAL_REASON_CLASSES.forEach((cls) => modal.classList.remove(cls));
        const bodyEl = modal.querySelector(".qga-verify-modal__body");
        const footerEl = modal.querySelector(".qga-verify-modal__footer");
        if (bodyEl) bodyEl.style.removeProperty("background");
        if (footerEl) footerEl.style.removeProperty("background");

        if (allCodesForModal.length > 1) {
            const colors = allCodesForModal.map((c) => MODAL_BG_COLOR[c]).filter(Boolean);
            if (colors.length > 1) {
                const gradient = "linear-gradient(to right, " + colors.join(", ") + ")";
                if (bodyEl) bodyEl.style.background = gradient;
                if (footerEl) footerEl.style.background = gradient;
            }
        } else {
            const modalReasonClass = REASON_CODE_MODAL_CLASS[topReasonCode];
            if (modalReasonClass) {
                modal.classList.add(modalReasonClass);
            }
        }

        if (listNode) {
            listNode.innerHTML = "";

            if (!answers || answers.length === 0) {
                const empty = document.createElement("li");
                empty.className = "qga-verify-modal__item";
                empty.textContent = "Другие ответы этого респондента в выгрузке не найдены.";
                listNode.appendChild(empty);
            } else {
                for (const answer of answers) {
                    const item = document.createElement("li");
                    item.className = "qga-verify-modal__item";

                    const q = document.createElement("div");
                    q.className = "qga-verify-modal__q";
                    q.textContent = answer.question || `OpenEnd Id: ${answer.openEndId}`;

                    const text = document.createElement("div");
                    text.className = "qga-verify-modal__text";
                    text.textContent = answer.value || "";

                    item.appendChild(q);
                    item.appendChild(text);
                    listNode.appendChild(item);
                }
            }
        }

        manualBfridsState = loadManualBfridsState();
        manualApiState = loadManualApiState();
        const alreadyInManualSet = getManualBfridsSetForProject(projectIdForModal);
        const isAlreadyInManual = alreadyInManualSet.has(respondentIdStr);

        modal.classList.remove("qga-verify-modal--candidates");
        if (isAlreadyInManual) {
            modal.classList.add("qga-verify-modal--tech-defect");
        } else {
            modal.classList.remove("qga-verify-modal--tech-defect");
        }

        if (footerNode) {
            footerNode.innerHTML = "";
            const manualCheckbox = document.createElement("input");
            manualCheckbox.type = "checkbox";
            manualCheckbox.className = "qga-verify-modal-manual-checkbox";
            manualCheckbox.title = isAlreadyInManual
                ? "Уже в ручной чистке"
                : "Добавить в ручную чистку (по нажатию «Проверить страницу»)";
            manualCheckbox.dataset.respondentId = respondentIdStr;
            manualCheckbox.checked = isAlreadyInManual || state.verifyPendingManualBfrids.has(respondentIdStr);
            manualCheckbox.disabled = isAlreadyInManual || isIncorrectFromRating;
            if (!isAlreadyInManual && !isIncorrectFromRating) {
                manualCheckbox.addEventListener("change", () => {
                    const id = manualCheckbox.dataset.respondentId;
                    if (!id) return;
                    if (manualCheckbox.checked) {
                        state.verifyPendingManualBfrids.add(id);
                    } else {
                        state.verifyPendingManualBfrids.delete(id);
                    }
                });
            }
            const manualLabel = document.createElement("label");
            manualLabel.className = "qga-verify-modal__footer-label";
            manualLabel.appendChild(manualCheckbox);
            manualLabel.appendChild(document.createTextNode(" В ручную чистку"));
            footerNode.appendChild(manualLabel);
        }

        modal.style.display = "flex";
        return context;
    }

    function showVerifyRespondentCandidates(respondentIds, answersMap, context, rowState) {
        let modal = document.querySelector(".qga-verify-modal");
        if (!modal) {
            modal = document.createElement("aside");
            modal.className = "qga-verify-modal";
            modal.innerHTML = `
                <div class="qga-verify-modal__header">
                    <div class="qga-verify-modal__title"></div>
                    <button type="button" class="qga-verify-modal__close" aria-label="Закрыть">×</button>
                </div>
                <div class="qga-verify-modal__body">
                    <ul class="qga-verify-modal__list"></ul>
                </div>
            `;

            const closeButton = modal.querySelector(".qga-verify-modal__close");
            if (closeButton) {
                closeButton.addEventListener("click", () => {
                    modal.style.display = "none";
                });
            }

            document.addEventListener("click", function closeOnClickOutside(e) {
                if (modal.style.display !== "flex") return;
                if (modal.contains(e.target)) return;
                modal.style.display = "none";
            });

            document.documentElement.appendChild(modal);

            const bodyEl = modal.querySelector(".qga-verify-modal__body");
            if (bodyEl) {
                const scrollbarZone = 20;
                bodyEl.addEventListener("mousemove", (e) => {
                    const rect = bodyEl.getBoundingClientRect();
                    const isNearScrollbar = (rect.right - e.clientX) <= scrollbarZone;
                    bodyEl.classList.toggle("qga-verify-modal__body--scrollbar-hover", isNearScrollbar);
                });
                bodyEl.addEventListener("mouseleave", () => {
                    bodyEl.classList.remove("qga-verify-modal__body--scrollbar-hover");
                });
            }
        }

        const projectIdCandidates = getProjectIdForVerify();
        const verifyIncorrectSetCandidates = projectIdCandidates ? getVerifyIncorrectIdsSetForProject(projectIdCandidates) : new Set();
        const ratingReasonMapCandidates = projectIdCandidates ? getRatingReasonCodesForProject(projectIdCandidates) : {};

        ALL_MODAL_REASON_CLASSES.forEach((cls) => modal.classList.remove(cls));
        modal.classList.add("qga-verify-modal--candidates");

        const titleNode = modal.querySelector(".qga-verify-modal__title");
        const bodyNode = modal.querySelector(".qga-verify-modal__body");
        if (bodyNode) {
            bodyNode.innerHTML = "<ul class=\"qga-verify-modal__list\"></ul>";
        }
        const listNode = modal.querySelector(".qga-verify-modal__list");

        if (titleNode) {
            titleNode.textContent = "Респонденты с данным ответом";
        }

        if (listNode) {
            manualBfridsState = loadManualBfridsState();
            manualApiState = loadManualApiState();
            const alreadyInManualSet = getManualBfridsSetForProject(projectIdCandidates);

            const REASON_CODE_BG_COLOR = {
                1: "#fee2e2",
                2: "#f3e8ff",
                3: "#dbeafe",
                4: "#ffedd5",
                6: "#fef9c3"
            };
            const REASON_CODE_TEXT_COLOR = {
                1: "#b91c1c",
                2: "#6b21a8",
                3: "#1e40af",
                4: "#9a3412",
                6: "#854d0e"
            };

            const CANDIDATE_ICON_CONFIG = {
                1: { url: chrome.runtime.getURL("icons/inc.png"), alt: "Некорректный ответ" },
                4: { url: chrome.runtime.getURL("icons/speed.png"), alt: "Спидстер" },
                6: { url: chrome.runtime.getURL("icons/manual.png"), alt: "Ручная чистка" }
            };

            for (const respondentId of respondentIds) {
                const answers =
                    answersMap.get(String(respondentId)) ||
                    answersMap.get(String(respondentId).trim()) ||
                    [];

                const respondentIdStr = String(respondentId).trim();
                const isAlreadyInManual = alreadyInManualSet.has(respondentIdStr);
                const candidateAllCodes = getRespondentAllReasonCodes(respondentIdStr, verifyIncorrectSetCandidates, ratingReasonMapCandidates, alreadyInManualSet);
                const candidateTopCode = getTopReasonCode(candidateAllCodes);
                const isIncorrectFromRating = candidateTopCode > 0;

                const headerItem = document.createElement("li");
                headerItem.className = "qga-verify-modal__item";

                if (candidateAllCodes.length > 1) {
                    const colors = candidateAllCodes.map((c) => REASON_CODE_BG_COLOR[c]).filter(Boolean);
                    if (colors.length > 1) {
                        const gradient = "linear-gradient(to right, " + colors.join(", ") + ")";
                        headerItem.style.background = gradient;
                    }
                } else {
                    const itemReasonClass = REASON_CODE_ITEM_CLASS[candidateTopCode];
                    if (itemReasonClass) {
                        headerItem.classList.add(itemReasonClass);
                    }
                }

                const header = document.createElement("div");
                header.className = "qga-verify-modal__q qga-verify-modal__respondent-header";
                header.style.display = "flex";
                header.style.alignItems = "center";
                header.style.gap = "8px";
                header.style.flexWrap = "wrap";

                if (candidateAllCodes.length > 1) {
                    header.style.background = "transparent";
                    const textColor = REASON_CODE_TEXT_COLOR[candidateTopCode];
                    if (textColor) header.style.color = textColor;
                }

                const manualCheckbox = document.createElement("input");
                manualCheckbox.type = "checkbox";
                manualCheckbox.className = "qga-verify-modal-manual-checkbox";
                manualCheckbox.title = isAlreadyInManual
                    ? "Уже в ручной чистке"
                    : "Добавить в ручную чистку (по нажатию «Проверить страницу»)";
                manualCheckbox.dataset.respondentId = respondentIdStr;
                manualCheckbox.checked = isAlreadyInManual || state.verifyPendingManualBfrids.has(respondentIdStr);
                manualCheckbox.disabled = isAlreadyInManual || isIncorrectFromRating;
                if (!isAlreadyInManual && !isIncorrectFromRating) {
                    manualCheckbox.addEventListener("change", () => {
                        const id = manualCheckbox.dataset.respondentId;
                        if (!id) return;
                        if (manualCheckbox.checked) {
                            state.verifyPendingManualBfrids.add(id);
                        } else {
                            state.verifyPendingManualBfrids.delete(id);
                        }
                    });
                }

                const idSpan = document.createElement("span");
                idSpan.textContent = `${respondentId}`;

                header.appendChild(idSpan);

                for (const code of candidateAllCodes) {
                    const iconCfg = CANDIDATE_ICON_CONFIG[code];
                    if (iconCfg) {
                        const icon = document.createElement("img");
                        icon.src = iconCfg.url;
                        icon.alt = iconCfg.alt;
                        icon.title = iconCfg.alt;
                        icon.style.width = "16px";
                        icon.style.height = "16px";
                        icon.style.verticalAlign = "middle";
                        header.appendChild(icon);
                    }
                }

                headerItem.appendChild(header);

                if (!answers || answers.length === 0) {
                    const empty = document.createElement("div");
                    empty.className = "qga-verify-modal__text";
                    empty.textContent = "Другие ответы этого респондента в выгрузке не найдены.";
                    headerItem.appendChild(empty);
                } else {
                    for (const answer of answers) {
                        const q = document.createElement("div");
                        q.className = "qga-verify-modal__q";
                        q.textContent = answer.question || `OpenEnd Id: ${answer.openEndId}`;

                        const text = document.createElement("div");
                        text.className = "qga-verify-modal__text";
                        text.textContent = answer.value || "";

                        headerItem.appendChild(q);
                        headerItem.appendChild(text);
                    }
                }

                const manualRow = document.createElement("div");
                manualRow.className = "qga-verify-modal__manual-row";
                manualRow.style.marginTop = "8px";
                manualRow.style.paddingTop = "8px";
                manualRow.style.borderTop = "1px solid #e5e7eb";
                manualRow.style.display = "flex";
                manualRow.style.alignItems = "center";
                manualRow.style.gap = "6px";
                manualRow.appendChild(manualCheckbox);
                manualRow.appendChild(document.createTextNode("В ручную чистку"));
                headerItem.appendChild(manualRow);

                listNode.appendChild(headerItem);
            }
        }

        modal.style.display = "flex";
        return context;
    }

    function decorateVerifyRows(gridRoot) {
        const headerRow = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
        if (headerRow) {
            const headerCells = headerRow.querySelectorAll("th[role='columnheader']");
            const lastHeaderCell =
                headerCells[headerCells.length - 1] || headerRow.querySelector("th:last-child");

            if (!headerRow.querySelector(".qga-resp-header")) {
                const respHeader = document.createElement("th");
                respHeader.scope = "col";
                respHeader.role = "columnheader";
                respHeader.className = "k-header qga-resp-header";
                respHeader.style.textAlign = "center";
                respHeader.textContent = "Другие ответы";

                headerRow.appendChild(respHeader);
            }

            // Обновляем colgroup: добавляем колонку «Другие ответы» и сужаем «Отложить».
            const updateColgroup = (root) => {
                const colgroup = root ? root.querySelector("colgroup") : null;
                if (!colgroup) {
                    return;
                }
                if (colgroup.querySelector("col.qga-resp-col")) {
                    return;
                }
                const cols = colgroup.querySelectorAll("col");
                if (!cols.length) {
                    return;
                }
                const lastCol = cols[cols.length - 1];

                const respCol = document.createElement("col");
                respCol.className = "qga-resp-col";
                respCol.style.width = "170px";
                colgroup.appendChild(respCol);

                lastCol.style.width = "110px";
            };

            const headerWrap = gridRoot.querySelector(".k-grid-header-wrap");
            const contentWrap = gridRoot.querySelector(".k-grid-content");
            updateColgroup(headerWrap);
            updateColgroup(contentWrap);
        }

        const rows = gridRoot.querySelectorAll("tr.k-master-row");
        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) {
                continue;
            }

            const cells = row.querySelectorAll("td[role='gridcell']");
            const lastCell =
                cells[cells.length - 1] ||
                row.querySelector("td:last-child") ||
                (row.lastElementChild instanceof HTMLTableCellElement ? row.lastElementChild : null);
            if (!lastCell) {
                continue;
            }

            // Добавляем колонку "Другие ответы" (кнопка «Посмотреть»).
            if (!row.querySelector("td.qga-resp-cell")) {
                const respCell = document.createElement("td");
                respCell.className = "qga-resp-cell qga-verify-cell";
                respCell.setAttribute("role", "gridcell");
                respCell.style.textAlign = "center";
                respCell.style.verticalAlign = "middle";
                respCell.style.padding = "0";

                const wrap = document.createElement("div");
                wrap.className = "qga-verify-cell-wrap";
                wrap.style.display = "flex";
                wrap.style.alignItems = "center";
                wrap.style.justifyContent = "center";
                wrap.style.width = "100%";
                wrap.style.height = "100%";

                const button = document.createElement("button");
                button.type = "button";
                button.className = "qga-verify-show-respondent";
                button.textContent = "Посмотреть";

                wrap.appendChild(button);
                respCell.appendChild(wrap);

                const afterLast = lastCell.nextSibling;
                row.insertBefore(respCell, afterLast || null);
            }

            setupVerifyRowExclusiveCheckboxes(gridRoot, row);
        }
        applyVerifyRowVisibility(gridRoot);
    }

    function setupVerifyRowExclusiveCheckboxes(gridRoot, row) {
        if (!gridRoot || !row || !(row instanceof HTMLTableRowElement)) {
            return;
        }
        if (row.dataset.qgaExclusiveCheckboxesBound === "1") {
            return;
        }
        row.dataset.qgaExclusiveCheckboxesBound = "1";

        const headerRow = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
        const headerCells = headerRow
            ? headerRow.querySelectorAll("th[role='columnheader']")
            : null;

        let incorrectIndex = -1;
        let postponeIndex = -1;

        if (headerCells && headerCells.length) {
            for (let i = 0; i < headerCells.length; i += 1) {
                const text = (headerCells[i].textContent || "").trim().toLowerCase();
                if (incorrectIndex === -1 && text.includes("некоррект")) {
                    incorrectIndex = i;
                }
                if (postponeIndex === -1 && text.includes("отлож")) {
                    postponeIndex = i;
                }
            }
        }

        const cells = row.querySelectorAll("td[role='gridcell']");
        if (!cells.length) {
            return;
        }

        const incorrectCell =
            incorrectIndex >= 0 && incorrectIndex < cells.length ? cells[incorrectIndex] : null;
        const incorrectCheckbox = incorrectCell
            ? incorrectCell.querySelector("input[type='checkbox']")
            : null;

        const postponeCell =
            postponeIndex >= 0 && postponeIndex < cells.length ? cells[postponeIndex] : null;
        const postponeCheckbox = postponeCell
            ? postponeCell.querySelector("input[type='checkbox']")
            : null;

        const group = [incorrectCheckbox, postponeCheckbox].filter(
            (cb) => cb instanceof HTMLInputElement
        );
        if (group.length <= 1) {
            return;
        }

        const handleChange = (changed) => {
            if (!(changed instanceof HTMLInputElement)) {
                return;
            }
            const isChecked = !!changed.checked;
            if (!isChecked) {
                return;
            }
            for (const cb of group) {
                if (cb === changed) {
                    continue;
                }
                if (!(cb instanceof HTMLInputElement)) {
                    continue;
                }
                if (!cb.checked) {
                    continue;
                }
                cb.checked = false;
                cb.dispatchEvent(
                    new Event("change", {
                        bubbles: true
                    })
                );
            }
        };

        for (const cb of group) {
            if (!(cb instanceof HTMLInputElement)) {
                continue;
            }
            cb.addEventListener("change", () => handleChange(cb));
        }
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

            const handler = () => {
                try {
                    setTimeout(() => {
                        try {
                            collectOpenEndsGroupsFromPage();
                        } catch (e) {
                            console.warn(
                                `[QGA] Ошибка collectOpenEndsGroupsFromPage после ${label}:`,
                                e
                            );
                        }
                    }, delay);
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
            // Массовая группировка завершена: пересобираем информацию
            // о сгруппированных переменных на странице OpenEnds,
            // чтобы данные были актуальны для Verify.
            try {
                collectOpenEndsGroupsFromPage();
            } catch (e) {
                console.warn("[QGA] Ошибка при collectOpenEndsGroupsFromPage после массовой группировки:", e);
            }
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
    let manualBfridsState = loadManualBfridsState();
    let manualApiState = loadManualApiState();
    let ratingIncorrectIdsState = loadRatingIncorrectIdsState();
    let verifyIncorrectIdsState = loadVerifyIncorrectIdsState();

    init();
})();