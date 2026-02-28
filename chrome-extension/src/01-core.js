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
        verifyPendingManualBfrids: new Set()
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
            window.addEventListener("hashchange", () => {
                if (!isOpenEndsHash() && state.panel) {
                    hidePanel();
                } else {
                    scheduleCollectGroups();
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

                    const respondentIdsByOpenEndId = state.verifyRespondentIdsByOpenEndId;
                    const answersMap = state.verifyAnswersByRespondentId;
                    const idsByQuestionAndValue = state.verifyRespondentIdsByQuestionAndValue;
                    const idsByValueOnly = state.verifyRespondentIdsByValueOnly;
                    if (!answersMap || (!respondentIdsByOpenEndId && !idsByQuestionAndValue && !idsByValueOnly)) {
                        alert("Индекс ответов респондентов недоступен.");
                        return;
                    }

                    let respondentIds = [];

                    if (respondentIdsByOpenEndId && respondentIdsByOpenEndId.size > 0) {
                        if (context.openEndId != null) {
                            const key = String(context.openEndId).trim();
                            const idsFromMap =
                                respondentIdsByOpenEndId.get(key) ||
                                respondentIdsByOpenEndId.get(String(context.openEndId)) ||
                                [];
                            if (Array.isArray(idsFromMap) && idsFromMap.length > 0) {
                                respondentIds = idsFromMap.slice();
                            }
                        }
                        // Выгрузка без колонки openEndId заполняет карту по ключу «переменная||значение». При сгруппированном вопросе ищем по списку переменных из заголовка.
                        if (respondentIds.length === 0) {
                            const questionCode = getVerifyQuestionCode();
                            const valueText = context.valueText || "";
                            if (questionCode && valueText) {
                                const groupedCodes = getVerifyGroupedVariableCodes(questionCode);
                                if (groupedCodes.length > 1) {
                                    const collected = new Set();
                                    for (const code of groupedCodes) {
                                        const key = buildVerifyQuestionValueKey(code, valueText);
                                        const arr = respondentIdsByOpenEndId.get(key) || [];
                                        if (Array.isArray(arr)) arr.forEach((id) => collected.add(String(id)));
                                    }
                                    if (collected.size > 0) respondentIds = Array.from(collected);
                                }
                                if (respondentIds.length === 0) {
                                    const singleCode = getVerifyQuestionBaseCode(questionCode);
                                    const compositeKey = buildVerifyQuestionValueKey(singleCode, valueText);
                                    const fromMap = respondentIdsByOpenEndId.get(compositeKey);
                                    if (Array.isArray(fromMap) && fromMap.length > 0) {
                                        respondentIds = fromMap.slice();
                                    }
                                }
                                if (respondentIds.length === 0) {
                                    const singleCode = getVerifyQuestionBaseCode(questionCode);
                                    const altKey = buildVerifyQuestionValueKey(
                                        singleCode.replace(/\./g, "_"),
                                        valueText
                                    );
                                    const fromAlt = respondentIdsByOpenEndId.get(altKey);
                                    if (Array.isArray(fromAlt) && fromAlt.length > 0) {
                                        respondentIds = fromAlt.slice();
                                    }
                                }
                                if (respondentIds.length === 0) {
                                    const singleCode = getVerifyQuestionBaseCode(questionCode);
                                    const altKey2 = buildVerifyQuestionValueKey(
                                        singleCode.replace(/_/g, "."),
                                        valueText
                                    );
                                    const fromAlt2 = respondentIdsByOpenEndId.get(altKey2);
                                    if (Array.isArray(fromAlt2) && fromAlt2.length > 0) {
                                        respondentIds = fromAlt2.slice();
                                    }
                                }
                            }
                        }
                    }

                    if (respondentIds.length === 0 && idsByQuestionAndValue) {
                        const questionCode = getVerifyQuestionCode();
                        const valueText = context.valueText || "";
                        if (questionCode && valueText) {
                            const groupedCodes = getVerifyGroupedVariableCodes(questionCode);
                            if (groupedCodes.length > 1) {
                                const collected = new Set();
                                for (const code of groupedCodes) {
                                    const key = buildVerifyQuestionValueKey(code, valueText);
                                    const arr = idsByQuestionAndValue.get(key) || [];
                                    if (Array.isArray(arr)) arr.forEach((id) => collected.add(String(id)));
                                }
                                if (collected.size > 0) respondentIds = Array.from(collected);
                            }
                            if (respondentIds.length === 0) {
                                const singleCode = getVerifyQuestionBaseCode(questionCode);
                                const key = buildVerifyQuestionValueKey(singleCode, valueText);
                                const fromIndex = idsByQuestionAndValue.get(key);
                                if (Array.isArray(fromIndex) && fromIndex.length > 0) {
                                    respondentIds = fromIndex.slice();
                                }
                            }
                            if (respondentIds.length === 0) {
                                const singleCode = getVerifyQuestionBaseCode(questionCode);
                                const altKey = buildVerifyQuestionValueKey(
                                    singleCode.replace(/\./g, "_"),
                                    valueText
                                );
                                const fromAlt = idsByQuestionAndValue.get(altKey);
                                if (Array.isArray(fromAlt) && fromAlt.length > 0) {
                                    respondentIds = fromAlt.slice();
                                }
                            }
                            if (respondentIds.length === 0) {
                                const singleCode = getVerifyQuestionBaseCode(questionCode);
                                const altKey2 = buildVerifyQuestionValueKey(
                                    singleCode.replace(/_/g, "."),
                                    valueText
                                );
                                const fromAlt2 = idsByQuestionAndValue.get(altKey2);
                                if (Array.isArray(fromAlt2) && fromAlt2.length > 0) {
                                    respondentIds = fromAlt2.slice();
                                }
                            }
                        }
                    }

                    if (respondentIds.length === 0 && idsByValueOnly) {
                        const valueText = context.valueText || "";
                        if (valueText) {
                            const key = buildVerifyValueOnlyKey(valueText);
                            const fromIndex = idsByValueOnly.get(key);
                            if (Array.isArray(fromIndex) && fromIndex.length > 0) {
                                respondentIds = fromIndex.slice();
                            }
                        }
                    }

                    if (respondentIds.length === 0) {
                        alert(
                            "Не удалось найти респондента для этого ответа в выгрузке OpenEnds. " +
                                "Возможные причины: формат файла выгрузки изменился или ответ не попал в файл."
                        );
                        return;
                    }

                    const uniqueIds = Array.from(new Set(respondentIds.map((id) => String(id))));
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
        ]).then(([indexOk]) => {
            if (indexOk) applyVerifyRowVisibility(gridRoot);
            else applyVerifyRowVisibility(gridRoot);
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
