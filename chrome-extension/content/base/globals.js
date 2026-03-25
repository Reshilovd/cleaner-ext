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

var manualBfridsState = typeof manualBfridsState !== "undefined" ? manualBfridsState : null;
var manualApiState = typeof manualApiState !== "undefined" ? manualApiState : null;
var ratingIncorrectIdsState = typeof ratingIncorrectIdsState !== "undefined" ? ratingIncorrectIdsState : null;
var verifyIncorrectIdsState = typeof verifyIncorrectIdsState !== "undefined" ? verifyIncorrectIdsState : null;
