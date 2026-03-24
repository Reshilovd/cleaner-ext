"use strict";

var QGA_CONTENT_TOP_WINDOW = window.top === window;
var QGA_CONTENT_ALREADY_LOADED = Boolean(window.__qga_extension_loaded__);
var QGA_CONTENT_SHOULD_RUN = QGA_CONTENT_TOP_WINDOW && !QGA_CONTENT_ALREADY_LOADED;

if (QGA_CONTENT_SHOULD_RUN) {
    window.__qga_extension_loaded__ = true;
    console.info("[QGA] starting extension content script:", window.location.href);
}

var STORAGE_KEY = "__qga_state_v2__";
var PROJECT_PREFILL_STORAGE_KEY = "__qga_project_prefill_v1__";
var PROJECT_PREFILL_STORAGE_FALLBACK_KEY = "__qga_project_prefill_v1_fallback__";
var PROJECT_PREFILL_QUERY_KEY = "qga_prefill";
var PANEL_ID = "qga-panel";
var HIGHLIGHT_CLASS = "qga-highlight";
var OPENENDS_VERIFY_SHORTCUT_BUTTON_ID = "qga-openends-verify-shortcut";
var PYRUS_COPY_BUTTON_ID = "qga-pyrus-copy";
var PYRUS_QUICK_FILL_LINK_CLASS = "qga-pyrus-quick-fill-link";
var PYRUS_QUICK_FILL_BUTTON_ID = "qga-pyrus-quick-fill-single";
var PYRUS_QUICK_FILL_WRAPPER_CLASS = "qga-pyrus-quick-fill-wrapper";
var CLEANER_AUTO_FILL_QUERY_KEY = "qga_autofill";

var PYRUS_FIELD_LABEL_ALIASES = {
        projectId: ["номер в панели pr", "номер в панели", "номер панели pr", "project id панели"],
        plan: ["n"],
        projectName: ["название проекта", "наименование проекта", "project name"],
        dbName: ["sawtooth", "база од", "dbname"]
    };

var MANUAL_BFRIDS_STORAGE_KEY = "__qga_manual_bfrids_v1__";
var MANUAL_API_STATE_STORAGE_KEY = "__qga_manual_api_state_v1__";
var RATING_INCORRECT_IDS_STORAGE_KEY = "__qga_rating_incorrect_ids_v1__";
var VERIFY_INCORRECT_IDS_STORAGE_KEY = "__qga_verify_incorrect_ids_v1__";
var OPENENDS_GROUPS_STORAGE_KEY = "__qga_openends_groups_v1__";
var CLEANER_PROJECTS_FAVORITES_STORAGE_KEY = "__qga_cleaner_projects_favorites_v1__";
var CLEANER_PROJECTS_FAVORITES_ONLY_STORAGE_KEY = "__qga_cleaner_projects_favorites_only_v1__";

var PAGE_KIND = typeof PAGE_KIND !== "undefined" ? PAGE_KIND : null;

var DEFAULT_SETTINGS = typeof DEFAULT_SETTINGS !== "undefined" && DEFAULT_SETTINGS ? DEFAULT_SETTINGS : {
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

var STOP_WORDS = typeof STOP_WORDS !== "undefined" && STOP_WORDS ? STOP_WORDS : new Set([
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

var state = typeof state !== "undefined" && state ? state : {
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
        verifyRespondentIndexPromise: null,
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
        manualUngroupButtonHandler: null,
        cleanerProjectsAuthorFilterBound: false,
        cleanerProjectsAuthorFilterObserver: null,
        cleanerProjectsSelectedAuthors: new Set(),
        cleanerProjectsAuthorColumnIndex: -1,
        cleanerProjectsAuthorFilterAuthorsCache: null,
        cleanerProjectsAuthorFilterAuthorsCacheGridRoot: null,
        cleanerProjectsAuthorFilterCacheInvalidatedAt: 0,
        cleanerProjectsAuthorFilterApplyScheduled: false,
        cleanerProjectsAuthorFilterObserverThrottleMs: 120
        ,
        cleanerProjectsFavoritesBound: false,
        cleanerProjectsFavoritesObserver: null,
        cleanerProjectsFavoritesSet: null,
        cleanerProjectsIdColumnIndex: -1,
        cleanerProjectsFavoritesUiScheduled: false,
        cleanerProjectsFavoritesObserverThrottleMs: 160,
        cleanerProjectsFavoritesOnlyEnabled: false,
        cleanerProjectsFavoritesOnlyToggleBound: false,
        cleanerProjectsFavoritesOnlyToggleEl: null,
        cleanerProjectsFavoritesOnlyUiScheduled: false,
        cleanerProjectsFavoritesOnlyObserverThrottleMs: 200,
        pyrusGroupsExpandedByExtension: new Set()
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
            setupOpenEndsVerifyShortcut();
            const scheduleCollectGroups = () => {
                if (isOpenEndsHash()) {
                    setTimeout(collectOpenEndsGroupsFromPage, 500);
                }
            };
            scheduleCollectGroups();
            ensureManualGroupButtonHooked();
            window.addEventListener("hashchange", () => {
                setupOpenEndsVerifyShortcut();
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

                const rowState = getVerifyRowIncorrectPostpone(gridRoot, row);

                try {
                    const ok = await ensureVerifyRespondentIndexLoaded(button);
                    if (!ok) {
                        if (state.verifyRespondentIndexError) {
                            console.warn("[QGA]", state.verifyRespondentIndexError);
                        }
                        return;
                    }

                    const answersMap = state.verifyAnswersByRespondentId;
                    if (!answersMap) {
                        alert("Индекс ответов респондентов недоступен.");
                        return;
                    }

                    const uniqueIds = getRespondentIdsForContext(context);

                    if (uniqueIds.length === 0) {
                        alert(
                            "Не удалось найти респондента для этого ответа в выгрузке OpenEnds. " +
                                "Возможные причины: формат файла выгрузки изменился или ответ не попал в файл."
                        );
                        return;
                    }

                    applyVerifyRowVisibility(gridRoot);

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

            gridRoot.addEventListener("change", (event) => {
                const target = event.target;
                if (!(target instanceof HTMLInputElement)) return;
                if (target.type !== "checkbox") return;
                applyVerifyRowVisibility(gridRoot);
            });
        }

        decorateVerifyRows(gridRoot);

        let verifyDecorateTimer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(verifyDecorateTimer);
            verifyDecorateTimer = setTimeout(() => decorateVerifyRows(gridRoot), 150);
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
            updateVerifyMainManualCounter();
            return;
        }
        button.dataset.qgaManualBfridBound = "1";

        const parent = button.parentElement || button.closest("div, span, td, th") || document.body;
        const extraButton = document.createElement("button");
        extraButton.type = button.type || "button";
        extraButton.textContent = button.textContent || "Проверить страницу";
        extraButton.className = (button.className || "").trim();

        const counter = document.createElement("span");
        counter.id = "qga-verify-manual-counter";
        counter.style.display = "none";
        counter.style.alignItems = "center";
        counter.style.marginLeft = "8px";
        counter.style.padding = "2px 8px";
        counter.style.borderRadius = "999px";
        counter.style.border = "1px solid #d1d5db";
        counter.style.background = "#f8fafc";
        counter.style.color = "#475569";
        counter.style.fontSize = "12px";
        counter.style.lineHeight = "1.4";
        counter.style.verticalAlign = "middle";
        counter.style.whiteSpace = "nowrap";
        counter.style.userSelect = "none";

        const counterLabel = document.createElement("span");
        counterLabel.className = "qga-verify-manual-counter__label";

        const counterClear = document.createElement("span");
        counterClear.className = "qga-verify-manual-counter__clear";
        counterClear.textContent = "x";
        counterClear.setAttribute("aria-hidden", "true");
        counterClear.style.display = "none";
        counterClear.style.marginLeft = "6px";
        counterClear.style.color = "#dc2626";
        counterClear.style.fontSize = "13px";
        counterClear.style.fontWeight = "700";
        counterClear.style.lineHeight = "1";

        counter.appendChild(counterLabel);
        counter.appendChild(counterClear);

        counter.addEventListener("mouseenter", () => {
            counter.dataset.qgaHover = "1";
            updateVerifyMainManualCounter();
        });
        counter.addEventListener("mouseleave", () => {
            delete counter.dataset.qgaHover;
            updateVerifyMainManualCounter();
        });
        counter.addEventListener("click", (event) => {
            const count = state.verifyPendingManualBfrids instanceof Set
                ? state.verifyPendingManualBfrids.size
                : 0;
            if (count < 1) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            clearVerifyPendingManualSelections();
        });

        extraButton.addEventListener("click", async () => {
            if (state.verifyPendingManualBfrids && state.verifyPendingManualBfrids.size > 0) {
                const ids = Array.from(state.verifyPendingManualBfrids);
                try {
                    await sendRespondentIdsToManualCleanup(ids);
                    clearVerifyPendingManualSelections();
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
        if (extraButton.nextSibling) {
            parent.insertBefore(counter, extraButton.nextSibling);
        } else {
            parent.appendChild(counter);
        }
        updateVerifyMainManualCounter();
    }

    function updateVerifyMainManualCounter() {
        const counter = document.getElementById("qga-verify-manual-counter");
        if (!counter) {
            return;
        }
        const label = counter.querySelector(".qga-verify-manual-counter__label");
        const clear = counter.querySelector(".qga-verify-manual-counter__clear");

        const count = state.verifyPendingManualBfrids instanceof Set
            ? state.verifyPendingManualBfrids.size
            : 0;
        const isHover = counter.dataset.qgaHover === "1";

        counter.style.display = count > 0 ? "inline-flex" : "none";
        counter.style.cursor = count > 0 ? "pointer" : "default";
        if (label) {
            label.textContent = `В ручную: ${count}`;
        }
        if (clear) {
            clear.style.display = count > 0 && isHover ? "inline-block" : "none";
        }
        counter.title = count > 0
            ? isHover
                ? `Нажмите, чтобы снять все выбранные чекбоксы ручной чистки (${count}).`
                : `После нажатия «Проверить страницу» будет отправлено ${count} респондентов в ручную чистку.`
            : "После нажатия «Проверить страницу» в ручную чистку никто не отправится.";
        counter.style.fontWeight = count > 0 ? "600" : "400";
        counter.style.background = count > 0 ? "#fff7ed" : "#f8fafc";
        counter.style.borderColor = count > 0 ? "#fdba74" : "#d1d5db";
        counter.style.color = count > 0 ? "#9a3412" : "#475569";
    }

    function clearVerifyPendingManualSelections() {
        if (state.verifyPendingManualBfrids instanceof Set) {
            state.verifyPendingManualBfrids.clear();
        } else {
            state.verifyPendingManualBfrids = new Set();
        }

        document.querySelectorAll(".qga-verify-modal-manual-checkbox").forEach((cb) => {
            if (!(cb instanceof HTMLInputElement)) {
                return;
            }
            if (cb.disabled) {
                return;
            }
            cb.checked = false;
        });

        updateVerifyMainManualCounter();
    }

    function setupOpenEndsVerifyShortcut() {
        ensureOpenEndsVerifyShortcutObserver();
        syncOpenEndsVerifyShortcutButton();
    }

    function ensureOpenEndsVerifyShortcutObserver() {
        if (!document.body || document.body.dataset.qgaOpenEndsVerifyShortcutObserved === "1") {
            return;
        }

        document.body.dataset.qgaOpenEndsVerifyShortcutObserved = "1";

        let timer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                syncOpenEndsVerifyShortcutButton();
            }, 150);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function syncOpenEndsVerifyShortcutButton() {
        const existingButton = document.getElementById(OPENENDS_VERIFY_SHORTCUT_BUTTON_ID);
        if (!isOpenEndsHash()) {
            if (existingButton) {
                existingButton.remove();
            }
            return;
        }

        const pasteButton = findOpenEndsPasteBrandTagsButton();
        if (!pasteButton) {
            if (existingButton) {
                existingButton.remove();
            }
            return;
        }

        const button = existingButton || buildOpenEndsVerifyShortcutButton(pasteButton);
        if (!button) {
            return;
        }

        syncOpenEndsVerifyShortcutButtonAppearance(button, pasteButton);

        const targetUrl = getOpenEndsVerifyShortcutUrl();
        button.disabled = !targetUrl;
        button.dataset.qgaTargetUrl = targetUrl || "";
        button.title = targetUrl
            ? "Перейти к первой ссылке проверки OpenEnds"
            : "Ссылка на проверку недоступна";

        if (pasteButton.nextElementSibling !== button) {
            pasteButton.insertAdjacentElement("afterend", button);
        }
    }

    function findOpenEndsPasteBrandTagsButton() {
        const button = document.querySelector("button[onclick='pasteBrandTags()']");
        return button instanceof HTMLButtonElement ? button : null;
    }

    function buildOpenEndsVerifyShortcutButton(referenceButton) {
        if (!referenceButton) {
            return null;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.id = OPENENDS_VERIFY_SHORTCUT_BUTTON_ID;
        button.textContent = "Перейти к проверке";
        syncOpenEndsVerifyShortcutButtonAppearance(button, referenceButton);
        button.addEventListener("click", handleOpenEndsVerifyShortcutClick);
        return button;
    }

    function syncOpenEndsVerifyShortcutButtonAppearance(button, referenceButton) {
        if (!button || !referenceButton) {
            return;
        }

        button.className = referenceButton.className || "";

        const referenceStyle = referenceButton.getAttribute("style");
        if (referenceStyle) {
            button.setAttribute("style", referenceStyle);
        } else {
            button.removeAttribute("style");
        }

        button.style.marginLeft = "8px";
    }

    function getOpenEndsVerifyShortcutUrl() {
        const link = document.querySelector(".agrid");
        if (!link) {
            return null;
        }

        const rawHref = typeof link.getAttribute === "function"
            ? String(link.getAttribute("href") || "").trim()
            : "";

        if (!rawHref || rawHref === "#") {
            return null;
        }

        if (link instanceof HTMLAnchorElement && link.href) {
            return link.href;
        }

        return rawHref;
    }

    function handleOpenEndsVerifyShortcutClick(event) {
        event.preventDefault();

        const targetUrl = getOpenEndsVerifyShortcutUrl();
        if (!targetUrl) {
            syncOpenEndsVerifyShortcutButton();
            return;
        }

        window.location.assign(targetUrl);
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
            injectStyles();
            removeCleanerFillButtonIfExists();
            setupCleanerProjectsAuthorFilter();
            setupCleanerProjectsFavorites();
            setupCleanerProjectsFavoritesOnlyToggle();
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

