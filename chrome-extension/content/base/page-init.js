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

    function isOpenEndsHash() {
        return (window.location.hash || "").toLowerCase() === "#openends";
    }

    function initOpenEndsMode() {
        loadStoredState();
        bindRuntimeMessages();
        waitForBody(() => {
            buildPanel();
            hidePanel();
            setupProjectEditStatsWidget();
            if (typeof setupProjectEditPenaltyToggle === "function") {
                setupProjectEditPenaltyToggle();
            }
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
