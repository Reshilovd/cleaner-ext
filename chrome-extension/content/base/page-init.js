"use strict";

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

    function cleanupLegacyProjectEditPenaltyArtifacts() {
        document
            .querySelectorAll(
                ".qga-project-edit-penalty-header, .qga-project-edit-penalty-cell, .qga-project-edit-penalty-col, [data-qga-penalty-dom='1']"
            )
            .forEach((node) => node.remove());

        const gridRoot = document.querySelector("#gridOpenEnds");
        if (!(gridRoot instanceof HTMLElement) || typeof window.jQuery !== "function") {
            return;
        }

        let grid = null;
        try {
            grid = window.jQuery(gridRoot).data("kendoGrid") || null;
        } catch (error) {
            return;
        }

        if (!grid || !grid.options || !Array.isArray(grid.options.columns) || typeof grid.setOptions !== "function") {
            return;
        }

        const columns = grid.options.columns.filter((column) => {
            const field = String((column && column.field) || "")
                .trim()
                .toLowerCase();
            return field !== "qgpenalty";
        });

        if (columns.length !== grid.options.columns.length) {
            grid.setOptions({ columns });
        }
    }

    function isOpenEndsHash() {
        const hash = String(window.location.hash || "").trim().toLowerCase();
        if (hash === "#openends") {
            return true;
        }

        // После некоторых действий на странице hash может временно сбрасываться,
        // хотя пользователь остаётся на вкладке OpenEnds.
        if (!hash) {
            const openEndsRoot = document.querySelector("#divOpenEnds, #gridOpenEnds");
            return openEndsRoot instanceof HTMLElement;
        }

        return false;
    }

    function initOpenEndsMode() {
        loadStoredState();
        bindRuntimeMessages();
        waitForBody(() => {
            buildPanel();
            hidePanel();
            setupProjectEditStatsWidget();
            if (typeof setupProjectEditFavoriteToggle === "function") {
                setupProjectEditFavoriteToggle();
            }
            cleanupLegacyProjectEditPenaltyArtifacts();
            setupManualPageIntegration();
            setupOpenEndsVerifyShortcut();
            const scheduleCollectGroups = () => {
                if (typeof scheduleOpenEndsGroupsRefreshSync === "function") {
                    scheduleOpenEndsGroupsRefreshSync();
                    return;
                }

                if (isOpenEndsHash()) {
                    setTimeout(collectOpenEndsGroupsFromPage, 500);
                }
            };
            scheduleCollectGroups();
            ensureManualGroupButtonHooked();
            window.addEventListener("hashchange", () => {
                setupOpenEndsVerifyShortcut();
                if (typeof setupProjectEditFavoriteToggle === "function") {
                    setupProjectEditFavoriteToggle();
                }
                if (!isOpenEndsHash() && state.panel) {
                    if (typeof clearScheduledOpenEndsGroupsRefresh === "function") {
                        clearScheduledOpenEndsGroupsRefresh();
                    }
                    hidePanel();
                } else {
                    scheduleCollectGroups();
                    ensureManualGroupButtonHooked();
                }
            });
        });
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
            setupCleanerProjectsAuthorFilter();
            setupCleanerProjectsFavorites();
            setupCleanerProjectsFavoritesOnlyToggle();
            if (!state.cleanerAutoFillTriggered && hasCleanerAutoFillRequest()) {
                state.cleanerAutoFillTriggered = true;
                runCleanerAutoFillFlow();
            }
        });
    }
