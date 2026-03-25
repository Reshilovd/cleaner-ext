"use strict";

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
