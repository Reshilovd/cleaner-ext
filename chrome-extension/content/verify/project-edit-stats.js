"use strict";

var PROJECT_EDIT_STATS_ALLOWED_HASHES =
    typeof PROJECT_EDIT_STATS_ALLOWED_HASHES !== "undefined" && PROJECT_EDIT_STATS_ALLOWED_HASHES
        ? PROJECT_EDIT_STATS_ALLOWED_HASHES
        : new Set(["#options", "#matrix", "#openends", "#multiaccounts", "#manual"]);

var PROJECT_EDIT_STATS_PERCENT_CLASS =
    typeof PROJECT_EDIT_STATS_PERCENT_CLASS !== "undefined"
        ? PROJECT_EDIT_STATS_PERCENT_CLASS
        : "qga-project-edit-stats-percent";
var PROJECT_EDIT_STATS_DANGER_CLASS =
    typeof PROJECT_EDIT_STATS_DANGER_CLASS !== "undefined"
        ? PROJECT_EDIT_STATS_DANGER_CLASS
        : "qga-project-edit-stats-host--danger";

var projectEditStatsSyncTimer =
    typeof projectEditStatsSyncTimer !== "undefined" ? projectEditStatsSyncTimer : null;

function setupProjectEditStatsWidget() {
    ensureProjectEditStatsObserver();
    scheduleProjectEditStatsSync(0);
}

function ensureProjectEditStatsObserver() {
    if (!document.body || document.body.dataset.qgaProjectEditStatsObserved === "1") {
        return;
    }

    document.body.dataset.qgaProjectEditStatsObserved = "1";

    const observer = new MutationObserver((mutations) => {
        if (!Array.isArray(mutations) || mutations.length === 0) {
            return;
        }

        const hasRelevantMutation = mutations.some((mutation) => isProjectEditStatsMutationRelevant(mutation));
        if (!hasRelevantMutation) {
            return;
        }

        scheduleProjectEditStatsSync();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });

    window.addEventListener("hashchange", () => {
        scheduleProjectEditStatsSync(0);
    });
}

function isProjectEditStatsMutationRelevant(mutation) {
    if (!mutation) {
        return false;
    }

    const targetElement =
        mutation.target instanceof Element
            ? mutation.target
            : mutation.target && mutation.target.parentElement instanceof Element
                ? mutation.target.parentElement
                : null;

    if (targetElement && targetElement.closest(`.${PROJECT_EDIT_STATS_PERCENT_CLASS}`)) {
        return false;
    }

    const changedNodes = [
        ...Array.from(mutation.addedNodes || []),
        ...Array.from(mutation.removedNodes || [])
    ];

    if (targetElement && targetElement.closest("#divStats")) {
        return true;
    }

    return changedNodes.some((node) => {
        const element = node instanceof Element ? node : node && node.parentElement instanceof Element ? node.parentElement : null;
        if (!element) {
            return false;
        }
        if (element.closest(`.${PROJECT_EDIT_STATS_PERCENT_CLASS}`)) {
            return false;
        }
        return !!(element.closest("#divStats") || element.querySelector("#divStats"));
    });
}

function scheduleProjectEditStatsSync(delayMs) {
    clearTimeout(projectEditStatsSyncTimer);
    const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 120;
    projectEditStatsSyncTimer = setTimeout(() => {
        projectEditStatsSyncTimer = null;
        syncProjectEditStatsWidget();
    }, delay);
}

function isProjectEditStatsHashAllowed() {
    const hash = String(window.location.hash || "").trim().toLowerCase();
    return PROJECT_EDIT_STATS_ALLOWED_HASHES.has(hash);
}

function getProjectEditStatsBinding() {
    const statsRoot = document.getElementById("divStats");
    if (!statsRoot) {
        return null;
    }

    const statsRow = statsRoot.firstElementChild;
    if (!(statsRow instanceof HTMLElement)) {
        return null;
    }

    const cards = Array.from(statsRow.children || []).filter((child) => child instanceof HTMLElement);
    if (cards.length < 3) {
        return null;
    }

    const totalCard = cards[1];
    const currentCard = cards[2];
    const totalNode = totalCard ? totalCard.querySelector("span.c_box_content") : null;
    const currentNode = currentCard ? currentCard.querySelector("span.c_box_content") : null;

    if (!(currentCard instanceof HTMLElement) || !(totalNode instanceof HTMLElement) || !(currentNode instanceof HTMLElement)) {
        return null;
    }

    return {
        currentCard,
        totalNode,
        currentNode
    };
}

function getProjectEditStatsCountFromNode(node) {
    if (!(node instanceof HTMLElement)) {
        return 0;
    }

    const raw = String(node.textContent || "")
        .replace(/\s+/g, "")
        .replace(/[^\d]/g, "");

    if (!raw) {
        return 0;
    }

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getProjectEditStatsCurrentLabel(card) {
    if (!(card instanceof HTMLElement)) {
        return "";
    }

    const labelNode =
        card.querySelector("a") ||
        card.querySelector("button") ||
        card.querySelector("[data-toggle='dropdown']") ||
        card.querySelector(".dropdown-toggle");

    return labelNode ? String(labelNode.textContent || "").replace(/\s+/g, " ").trim() : "";
}

function getProjectEditStatsPercentNode(card) {
    if (!(card instanceof HTMLElement)) {
        return null;
    }

    const node = card.querySelector(`.${PROJECT_EDIT_STATS_PERCENT_CLASS}`);
    return node instanceof HTMLElement ? node : null;
}

function ensureProjectEditStatsPercentNode(card) {
    if (!(card instanceof HTMLElement)) {
        return null;
    }

    card.classList.add("qga-project-edit-stats-host");

    let node = getProjectEditStatsPercentNode(card);
    if (!node) {
        node = document.createElement("span");
        node.className = PROJECT_EDIT_STATS_PERCENT_CLASS;
        node.textContent = "0%";
        card.appendChild(node);
    }

    return node;
}

function removeProjectEditStatsPercentNode() {
    document.querySelectorAll(`.${PROJECT_EDIT_STATS_PERCENT_CLASS}`).forEach((node) => node.remove());
    document.querySelectorAll(".qga-project-edit-stats-host").forEach((node) => {
        if (node instanceof HTMLElement) {
            node.classList.remove("qga-project-edit-stats-host");
            node.classList.remove(PROJECT_EDIT_STATS_DANGER_CLASS);
        }
    });
}

function getProjectEditStatsPercentValue(count, totalCount) {
    if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(totalCount) || totalCount <= 0) {
        return 0;
    }

    const percent = (count / totalCount) * 100;
    if (!Number.isFinite(percent) || percent <= 0) {
        return 0;
    }

    return percent;
}

function formatProjectEditStatsPercent(count, totalCount) {
    const percent = getProjectEditStatsPercentValue(count, totalCount);
    if (percent <= 0) {
        return "0%";
    }

    return `${percent.toFixed(1).replace(/\.0$/, "")}%`;
}

function isProjectEditStatsOverallLabel(labelText) {
    const normalized = String(labelText || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    return normalized.includes("общий");
}

function syncProjectEditStatsWidget() {
    if (!isProjectEditStatsHashAllowed()) {
        removeProjectEditStatsPercentNode();
        return;
    }

    const binding = getProjectEditStatsBinding();
    if (!binding) {
        removeProjectEditStatsPercentNode();
        return;
    }

    const percentNode = ensureProjectEditStatsPercentNode(binding.currentCard);
    if (!(percentNode instanceof HTMLElement)) {
        return;
    }

    const totalCount = getProjectEditStatsCountFromNode(binding.totalNode);
    const currentCount = getProjectEditStatsCountFromNode(binding.currentNode);
    const percentText = formatProjectEditStatsPercent(currentCount, totalCount);
    const percentValue = getProjectEditStatsPercentValue(currentCount, totalCount);
    const currentLabel = getProjectEditStatsCurrentLabel(binding.currentCard);

    percentNode.textContent = percentText;
    percentNode.title = currentLabel
        ? `${currentLabel}: ${currentCount} из ${totalCount}`
        : `${currentCount} из ${totalCount}`;
    binding.currentCard.classList.toggle(
        PROJECT_EDIT_STATS_DANGER_CLASS,
        isProjectEditStatsOverallLabel(currentLabel) && percentValue > 5
    );
}

var PROJECT_EDIT_PENALTY_ALLOWED_HASH =
    typeof PROJECT_EDIT_PENALTY_ALLOWED_HASH !== "undefined"
        ? PROJECT_EDIT_PENALTY_ALLOWED_HASH
        : "#openends";
var PROJECT_EDIT_PENALTY_GRID_SELECTOR =
    typeof PROJECT_EDIT_PENALTY_GRID_SELECTOR !== "undefined"
        ? PROJECT_EDIT_PENALTY_GRID_SELECTOR
        : "#gridOpenEnds";
var PROJECT_EDIT_PENALTY_REFERENCE_FIELD =
    typeof PROJECT_EDIT_PENALTY_REFERENCE_FIELD !== "undefined"
        ? PROJECT_EDIT_PENALTY_REFERENCE_FIELD
        : "IsCheck";
var PROJECT_EDIT_PENALTY_TEXT_FIELD =
    typeof PROJECT_EDIT_PENALTY_TEXT_FIELD !== "undefined"
        ? PROJECT_EDIT_PENALTY_TEXT_FIELD
        : "AutoCheckData";
var PROJECT_EDIT_PENALTY_HEADER_CLASS =
    typeof PROJECT_EDIT_PENALTY_HEADER_CLASS !== "undefined"
        ? PROJECT_EDIT_PENALTY_HEADER_CLASS
        : "qga-project-edit-penalty-header";
var PROJECT_EDIT_PENALTY_CELL_CLASS =
    typeof PROJECT_EDIT_PENALTY_CELL_CLASS !== "undefined"
        ? PROJECT_EDIT_PENALTY_CELL_CLASS
        : "qga-project-edit-penalty-cell";
var PROJECT_EDIT_PENALTY_COL_CLASS =
    typeof PROJECT_EDIT_PENALTY_COL_CLASS !== "undefined"
        ? PROJECT_EDIT_PENALTY_COL_CLASS
        : "qga-project-edit-penalty-col";
var PROJECT_EDIT_PENALTY_SWITCH_CLASS =
    typeof PROJECT_EDIT_PENALTY_SWITCH_CLASS !== "undefined"
        ? PROJECT_EDIT_PENALTY_SWITCH_CLASS
        : "qga-project-edit-penalty-switch";
var PROJECT_EDIT_PENALTY_CELL_WRAP_CLASS =
    typeof PROJECT_EDIT_PENALTY_CELL_WRAP_CLASS !== "undefined"
        ? PROJECT_EDIT_PENALTY_CELL_WRAP_CLASS
        : "qga-project-edit-penalty-cell-wrap";
var PROJECT_EDIT_PENALTY_SWITCH_TRACK_CLASS =
    typeof PROJECT_EDIT_PENALTY_SWITCH_TRACK_CLASS !== "undefined"
        ? PROJECT_EDIT_PENALTY_SWITCH_TRACK_CLASS
        : "qga-project-edit-penalty-switch-track";
var PROJECT_EDIT_PENALTY_SWITCH_THUMB_CLASS =
    typeof PROJECT_EDIT_PENALTY_SWITCH_THUMB_CLASS !== "undefined"
        ? PROJECT_EDIT_PENALTY_SWITCH_THUMB_CLASS
        : "qga-project-edit-penalty-switch-thumb";

var projectEditPenaltyToggleSyncTimer =
    typeof projectEditPenaltyToggleSyncTimer !== "undefined" ? projectEditPenaltyToggleSyncTimer : null;
var projectEditPenaltyToggleState =
    typeof projectEditPenaltyToggleState !== "undefined" && projectEditPenaltyToggleState instanceof Map
        ? projectEditPenaltyToggleState
        : new Map();

function setupProjectEditPenaltyToggle() {
    ensureProjectEditPenaltyToggleObserver();
    ensureProjectEditPenaltyToggleEvents();
    scheduleProjectEditPenaltyToggleSync(0);
}

function ensureProjectEditPenaltyToggleObserver() {
    if (!document.body || document.body.dataset.qgaProjectEditPenaltyObserved === "1") {
        return;
    }

    document.body.dataset.qgaProjectEditPenaltyObserved = "1";

    const observer = new MutationObserver((mutations) => {
        if (!Array.isArray(mutations) || mutations.length === 0) {
            return;
        }

        const hasRelevantMutation = mutations.some((mutation) => isProjectEditPenaltyMutationRelevant(mutation));
        if (!hasRelevantMutation) {
            return;
        }

        scheduleProjectEditPenaltyToggleSync();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    window.addEventListener("hashchange", () => {
        scheduleProjectEditPenaltyToggleSync(0);
    });
}

function ensureProjectEditPenaltyToggleEvents() {
    if (!document.body || document.body.dataset.qgaProjectEditPenaltyEventsBound === "1") {
        return;
    }

    document.body.dataset.qgaProjectEditPenaltyEventsBound = "1";

    const getPenaltySwitchFromEvent = (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        return target ? target.closest(`.${PROJECT_EDIT_PENALTY_SWITCH_CLASS}`) : null;
    };

    const stopPenaltySwitchEvent = (event) => {
        const switchNode = getPenaltySwitchFromEvent(event);
        if (!(switchNode instanceof HTMLElement)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
        }
    };

    const captureTargets = [window, document, document.body].filter(Boolean);

    ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "focusin"].forEach((eventName) => {
        captureTargets.forEach((target) => {
            target.addEventListener(eventName, stopPenaltySwitchEvent, true);
        });
    });

    window.addEventListener("click", (event) => {
        const switchNode = getPenaltySwitchFromEvent(event);
        if (!(switchNode instanceof HTMLElement)) {
            return;
        }

        stopPenaltySwitchEvent(event);
        toggleProjectEditPenaltySwitch(switchNode);
    }, true);

    window.addEventListener("keydown", (event) => {
        const switchNode = getPenaltySwitchFromEvent(event);
        if (!(switchNode instanceof HTMLElement)) {
            return;
        }
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }

        if (!(target instanceof HTMLElement) || target.closest(`.${PROJECT_EDIT_PENALTY_SWITCH_CLASS}`) !== switchNode) {
            return;
        }

        stopPenaltySwitchEvent(event);
        toggleProjectEditPenaltySwitch(switchNode);
    }, true);
}

function isProjectEditPenaltyMutationRelevant(mutation) {
    if (!mutation) {
        return false;
    }

    const targetElement =
        mutation.target instanceof Element
            ? mutation.target
            : mutation.target && mutation.target.parentElement instanceof Element
                ? mutation.target.parentElement
                : null;
    const changedNodes = [
        ...Array.from(mutation.addedNodes || []),
        ...Array.from(mutation.removedNodes || [])
    ];

    const hasNonOwnedChange = changedNodes.some((node) => {
        const element = node instanceof Element ? node : node && node.parentElement instanceof Element ? node.parentElement : null;
        if (!element) {
            return false;
        }
        if (isProjectEditPenaltyOwnedElement(element)) {
            return false;
        }
        return !!(element.closest(PROJECT_EDIT_PENALTY_GRID_SELECTOR) || element.querySelector(PROJECT_EDIT_PENALTY_GRID_SELECTOR));
    });

    if (hasNonOwnedChange) {
        return true;
    }

    if (!targetElement || isProjectEditPenaltyOwnedElement(targetElement)) {
        return false;
    }

    return changedNodes.length === 0 && !!targetElement.closest(PROJECT_EDIT_PENALTY_GRID_SELECTOR);
}

function isProjectEditPenaltyOwnedElement(element) {
    if (!(element instanceof Element)) {
        return false;
    }

    return !!element.closest(
        `.${PROJECT_EDIT_PENALTY_HEADER_CLASS}, .${PROJECT_EDIT_PENALTY_CELL_CLASS}, .${PROJECT_EDIT_PENALTY_COL_CLASS}`
    );
}

function scheduleProjectEditPenaltyToggleSync(delayMs) {
    clearTimeout(projectEditPenaltyToggleSyncTimer);
    const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 140;
    projectEditPenaltyToggleSyncTimer = setTimeout(() => {
        projectEditPenaltyToggleSyncTimer = null;
        syncProjectEditPenaltyToggle();
    }, delay);
}

function isProjectEditPenaltyHashAllowed() {
    return String(window.location.hash || "").trim().toLowerCase() === PROJECT_EDIT_PENALTY_ALLOWED_HASH;
}

function getProjectEditPenaltyGridRoot() {
    const gridRoot = document.querySelector(PROJECT_EDIT_PENALTY_GRID_SELECTOR);
    return gridRoot instanceof HTMLElement ? gridRoot : null;
}

function getProjectEditPenaltyHeaderRow(gridRoot) {
    if (!(gridRoot instanceof HTMLElement)) {
        return null;
    }

    const row = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
    return row instanceof HTMLTableRowElement ? row : null;
}

function getProjectEditPenaltyDataCells(row) {
    if (!(row instanceof HTMLTableRowElement)) {
        return [];
    }

    return Array.from(row.querySelectorAll("td[role='gridcell']")).filter(
        (cell) => !cell.classList.contains(PROJECT_EDIT_PENALTY_CELL_CLASS)
    );
}

function findProjectEditPenaltyReferenceHeader(headerRow) {
    if (!(headerRow instanceof HTMLTableRowElement)) {
        return null;
    }

    const byField = headerRow.querySelector(
        `th[role='columnheader'][data-field='${PROJECT_EDIT_PENALTY_REFERENCE_FIELD}']`
    );
    if (byField instanceof HTMLTableCellElement) {
        return byField;
    }

    const fallbackCells = Array.from(headerRow.querySelectorAll("th[role='columnheader']")).filter(
        (cell) => !cell.classList.contains(PROJECT_EDIT_PENALTY_HEADER_CLASS)
    );

    return (
        fallbackCells.find((cell) => {
            const fieldName = normalizeProjectEditPenaltyText(cell.getAttribute("data-field"));
            return fieldName === normalizeProjectEditPenaltyText(PROJECT_EDIT_PENALTY_REFERENCE_FIELD);
        }) || null
    );
}

function getProjectEditPenaltyReferenceIndex(headerRow, referenceHeader) {
    if (!(headerRow instanceof HTMLTableRowElement) || !(referenceHeader instanceof HTMLTableCellElement)) {
        return -1;
    }

    return Number.isFinite(referenceHeader.cellIndex) ? referenceHeader.cellIndex : -1;
}

function ensureProjectEditPenaltyHeader(headerRow, referenceHeader) {
    if (!(headerRow instanceof HTMLTableRowElement) || !(referenceHeader instanceof HTMLTableCellElement)) {
        return null;
    }

    let header = headerRow.querySelector(`th.${PROJECT_EDIT_PENALTY_HEADER_CLASS}`);
    if (!(header instanceof HTMLTableCellElement)) {
        header = document.createElement("th");
        header.scope = "col";
        header.role = "columnheader";
        header.className = `k-header ${PROJECT_EDIT_PENALTY_HEADER_CLASS}`;
        header.setAttribute("data-field", "QgaPenalty");
        header.textContent = "Penalty";
    }

    if (header.parentElement !== headerRow || header.previousElementSibling !== referenceHeader) {
        headerRow.insertBefore(header, referenceHeader.nextElementSibling || null);
    }

    return header;
}

function ensureProjectEditPenaltyCol(root, referenceIndex) {
    if (!(root instanceof HTMLElement) || !Number.isFinite(referenceIndex) || referenceIndex < 0) {
        return null;
    }

    const colgroup = root.querySelector("colgroup");
    if (!(colgroup instanceof Element)) {
        return null;
    }

    const cols = Array.from(colgroup.querySelectorAll("col")).filter(
        (col) => !col.classList.contains(PROJECT_EDIT_PENALTY_COL_CLASS)
    );
    const referenceCol = cols[referenceIndex];
    if (!(referenceCol instanceof HTMLTableColElement)) {
        return null;
    }

    let penaltyCol = colgroup.querySelector(`col.${PROJECT_EDIT_PENALTY_COL_CLASS}`);
    if (!(penaltyCol instanceof HTMLTableColElement)) {
        penaltyCol = document.createElement("col");
        penaltyCol.className = PROJECT_EDIT_PENALTY_COL_CLASS;
    }

    penaltyCol.style.width = "96px";
    if (penaltyCol.parentElement !== colgroup || penaltyCol.previousElementSibling !== referenceCol) {
        colgroup.insertBefore(penaltyCol, referenceCol.nextElementSibling || null);
    }

    return penaltyCol;
}

function syncProjectEditPenaltyToggle() {
    if (!isProjectEditPenaltyHashAllowed()) {
        removeProjectEditPenaltyColumn();
        return;
    }

    const gridRoot = getProjectEditPenaltyGridRoot();
    const headerRow = getProjectEditPenaltyHeaderRow(gridRoot);
    const referenceHeader = findProjectEditPenaltyReferenceHeader(headerRow);
    const referenceIndex = getProjectEditPenaltyReferenceIndex(headerRow, referenceHeader);

    if (!(gridRoot instanceof HTMLElement) || !(headerRow instanceof HTMLTableRowElement) || referenceIndex < 0) {
        return;
    }

    ensureProjectEditPenaltyHeader(headerRow, referenceHeader);

    const headerWrap = gridRoot.querySelector(".k-grid-header-wrap");
    const contentWrap = gridRoot.querySelector(".k-grid-content");
    ensureProjectEditPenaltyCol(headerWrap, referenceIndex);
    ensureProjectEditPenaltyCol(contentWrap, referenceIndex);

    const rows = gridRoot.querySelectorAll(".k-grid-content tbody tr.k-master-row");
    rows.forEach((row) => ensureProjectEditPenaltyCell(gridRoot, row, referenceIndex));
}

function ensureProjectEditPenaltyCell(gridRoot, row, referenceIndex) {
    if (!(gridRoot instanceof HTMLElement) || !(row instanceof HTMLTableRowElement) || referenceIndex < 0) {
        return;
    }

    const referenceCell = row.cells[referenceIndex];
    if (!(referenceCell instanceof HTMLTableCellElement)) {
        return;
    }

    const rowKey = buildProjectEditPenaltyRowKey(gridRoot, row);
    if (!rowKey) {
        return;
    }

    let cell = row.querySelector(`td.${PROJECT_EDIT_PENALTY_CELL_CLASS}`);
    if (!(cell instanceof HTMLTableCellElement)) {
        cell = document.createElement("td");
        cell.className = PROJECT_EDIT_PENALTY_CELL_CLASS;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("data-field", "QgaPenalty");
        cell.style.padding = "0";

        const wrap = document.createElement("div");
        wrap.className = PROJECT_EDIT_PENALTY_CELL_WRAP_CLASS;

        const switchNode = createProjectEditPenaltySwitch();
        wrap.appendChild(switchNode);
        cell.appendChild(wrap);
    }

    if (cell.parentElement !== row || cell.previousElementSibling !== referenceCell) {
        row.insertBefore(cell, referenceCell.nextElementSibling || null);
    }

    const switchNode = cell.querySelector(`.${PROJECT_EDIT_PENALTY_SWITCH_CLASS}`);
    if (!(switchNode instanceof HTMLElement)) {
        return;
    }

    switchNode.dataset.qgaPenaltyRowKey = rowKey;

    if (!projectEditPenaltyToggleState.has(rowKey)) {
        projectEditPenaltyToggleState.set(rowKey, getProjectEditPenaltyInitialState(row));
    }

    syncProjectEditPenaltySwitchUI(switchNode, projectEditPenaltyToggleState.get(rowKey) === true);
}

function createProjectEditPenaltySwitch() {
    const switchButton = document.createElement("button");
    switchButton.type = "button";
    switchButton.className = PROJECT_EDIT_PENALTY_SWITCH_CLASS;
    switchButton.setAttribute("role", "switch");
    switchButton.setAttribute("tabindex", "0");

    const track = document.createElement("span");
    track.className = PROJECT_EDIT_PENALTY_SWITCH_TRACK_CLASS;
    track.setAttribute("aria-hidden", "true");

    const thumb = document.createElement("span");
    thumb.className = PROJECT_EDIT_PENALTY_SWITCH_THUMB_CLASS;
    thumb.setAttribute("aria-hidden", "true");

    track.appendChild(thumb);
    switchButton.appendChild(track);

    return switchButton;
}

function toggleProjectEditPenaltySwitch(switchNode) {
    if (!(switchNode instanceof HTMLElement)) {
        return;
    }

    const rowKey = String(switchNode.dataset.qgaPenaltyRowKey || "").trim();
    if (!rowKey) {
        return;
    }

    const nextState = !(projectEditPenaltyToggleState.get(rowKey) === true);
    projectEditPenaltyToggleState.set(rowKey, nextState);
    syncProjectEditPenaltySwitchUI(switchNode, nextState);
}

function syncProjectEditPenaltySwitchUI(root, checked) {
    if (!(root instanceof HTMLElement)) {
        return;
    }

    const isChecked = Boolean(checked);
    root.className = isChecked
        ? `${PROJECT_EDIT_PENALTY_SWITCH_CLASS} ${PROJECT_EDIT_PENALTY_SWITCH_CLASS}--on`
        : `${PROJECT_EDIT_PENALTY_SWITCH_CLASS} ${PROJECT_EDIT_PENALTY_SWITCH_CLASS}--off`;
    root.setAttribute("aria-checked", String(isChecked));
}

function getProjectEditPenaltyInitialState(row) {
    if (!(row instanceof HTMLTableRowElement)) {
        return false;
    }

    const autoCheckCell = row.querySelector(`td[data-field='${PROJECT_EDIT_PENALTY_TEXT_FIELD}']`);
    const rawText = autoCheckCell ? autoCheckCell.textContent || "" : "";
    const normalized = normalizeProjectEditPenaltyText(rawText);

    return normalized.includes("penalty");
}

function buildProjectEditPenaltyRowKey(gridRoot, row) {
    const keyParts = [];
    const projectId = typeof getProjectIdFromEditPage === "function" ? getProjectIdFromEditPage() : "";
    const dataItem = getProjectEditPenaltyDataItem(gridRoot, row);
    let dataItemUid = "";

    if (projectId) {
        keyParts.push(`project:${normalizeProjectEditPenaltyText(projectId)}`);
    }

    if (dataItem && typeof dataItem === "object") {
        const idValue = normalizeProjectEditPenaltyText(dataItem.Id);
        const varsValue = normalizeProjectEditPenaltyText(dataItem.Vars || dataItem.Variable);
        const labelValue = normalizeProjectEditPenaltyText(dataItem.Title || dataItem.Label || dataItem.Mark);
        dataItemUid = normalizeProjectEditPenaltyText(dataItem.uid);

        if (idValue) {
            keyParts.push(`id:${idValue}`);
        }
        if (varsValue) {
            keyParts.push(`vars:${varsValue}`);
        }
        if (labelValue) {
            keyParts.push(`label:${labelValue}`);
        }
    }

    const varsText = getProjectEditPenaltyRowCellText(row, [
        "td[data-field='Vars']",
        "td[data-field='Variable']",
        "td:nth-child(5)"
    ]);
    const markText = getProjectEditPenaltyRowCellText(row, [
        "td[data-field='Mark']",
        "td[data-field='Title']",
        "td:nth-child(4)"
    ]);
    const groupText = getProjectEditPenaltyRowCellText(row, [
        "td[data-field='Group']",
        "td:nth-child(3)"
    ]);

    if (varsText) {
        keyParts.push(`vars-cell:${varsText}`);
    }
    if (markText) {
        keyParts.push(`mark-cell:${markText}`);
    }
    if (groupText) {
        keyParts.push(`group-cell:${groupText}`);
    }

    const hasStableIdentity = keyParts.length > (projectId ? 1 : 0);
    if (!hasStableIdentity && dataItemUid) {
        keyParts.push(`uid:${dataItemUid}`);
    }

    const rowUid = normalizeProjectEditPenaltyText(row.getAttribute("data-uid"));
    if (!hasStableIdentity && !dataItemUid && rowUid) {
        keyParts.push(`row:${rowUid}`);
    }

    return keyParts.length > 0 ? keyParts.join("|") : "";
}

function getProjectEditPenaltyDataItem(gridRoot, row) {
    if (!(gridRoot instanceof HTMLElement) || !(row instanceof HTMLTableRowElement) || typeof window.jQuery !== "function") {
        return null;
    }

    try {
        const grid = window.jQuery(gridRoot).data("kendoGrid");
        if (!grid || typeof grid.dataItem !== "function") {
            return null;
        }
        return grid.dataItem(row) || null;
    } catch (error) {
        return null;
    }
}

function getProjectEditPenaltyRowCellText(row, selectors) {
    if (!(row instanceof HTMLTableRowElement) || !Array.isArray(selectors)) {
        return "";
    }

    for (const selector of selectors) {
        if (!selector) {
            continue;
        }
        const cell = row.querySelector(selector);
        const text = normalizeProjectEditPenaltyText(cell ? cell.textContent || "" : "");
        if (text) {
            return text;
        }
    }

    return "";
}

function normalizeProjectEditPenaltyText(value) {
    return String(value == null ? "" : value)
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function removeProjectEditPenaltyColumn() {
    document.querySelectorAll(`.${PROJECT_EDIT_PENALTY_HEADER_CLASS}`).forEach((node) => node.remove());
    document.querySelectorAll(`.${PROJECT_EDIT_PENALTY_CELL_CLASS}`).forEach((node) => node.remove());
    document.querySelectorAll(`.${PROJECT_EDIT_PENALTY_COL_CLASS}`).forEach((node) => node.remove());
}

var PROJECT_EDIT_PENALTY_FIELD =
    typeof PROJECT_EDIT_PENALTY_FIELD !== "undefined"
        ? PROJECT_EDIT_PENALTY_FIELD
        : "QgaPenalty";
var PROJECT_EDIT_PENALTY_TITLE =
    typeof PROJECT_EDIT_PENALTY_TITLE !== "undefined"
        ? PROJECT_EDIT_PENALTY_TITLE
        : "Penalty";
var PROJECT_EDIT_PENALTY_WIDTH =
    typeof PROJECT_EDIT_PENALTY_WIDTH !== "undefined"
        ? PROJECT_EDIT_PENALTY_WIDTH
        : "96px";
var PROJECT_EDIT_PENALTY_INPUT_CLASS =
    typeof PROJECT_EDIT_PENALTY_INPUT_CLASS !== "undefined"
        ? PROJECT_EDIT_PENALTY_INPUT_CLASS
        : "qga-project-edit-penalty-input";

function setupProjectEditPenaltyToggle() {
    ensureProjectEditPenaltyToggleObserver();
    scheduleProjectEditPenaltyToggleSync(0);
}

function ensureProjectEditPenaltyToggleObserver() {
    if (!document.body || document.body.dataset.qgaProjectEditPenaltyObserved === "1") {
        return;
    }

    document.body.dataset.qgaProjectEditPenaltyObserved = "1";

    const observer = new MutationObserver((mutations) => {
        if (!Array.isArray(mutations) || mutations.length === 0) {
            return;
        }

        const hasRelevantMutation = mutations.some((mutation) => isProjectEditPenaltyMutationRelevant(mutation));
        if (!hasRelevantMutation) {
            return;
        }

        scheduleProjectEditPenaltyToggleSync();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    window.addEventListener("hashchange", () => {
        scheduleProjectEditPenaltyToggleSync(0);
    });
}

function isProjectEditPenaltyMutationRelevant(mutation) {
    if (!mutation) {
        return false;
    }

    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes || []),
        ...Array.from(mutation.removedNodes || [])
    ];

    return nodes.some((node) => isProjectEditPenaltyRelevantNode(node));
}

function isProjectEditPenaltyRelevantNode(node) {
    const element =
        node instanceof Element
            ? node
            : node && node.parentElement instanceof Element
                ? node.parentElement
                : null;

    if (!(element instanceof Element)) {
        return false;
    }

    if (element.matches(PROJECT_EDIT_PENALTY_GRID_SELECTOR) || element.closest(PROJECT_EDIT_PENALTY_GRID_SELECTOR)) {
        return true;
    }

    if (element.id === "divOpenEnds" || element.closest("#divOpenEnds")) {
        return true;
    }

    return !!element.querySelector(PROJECT_EDIT_PENALTY_GRID_SELECTOR);
}

function scheduleProjectEditPenaltyToggleSync(delayMs) {
    clearTimeout(projectEditPenaltyToggleSyncTimer);
    const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 120;
    projectEditPenaltyToggleSyncTimer = setTimeout(() => {
        projectEditPenaltyToggleSyncTimer = null;
        syncProjectEditPenaltyToggle();
    }, delay);
}

function syncProjectEditPenaltyToggle() {
    if (!isProjectEditPenaltyHashAllowed()) {
        return;
    }

    const gridRoot = getProjectEditPenaltyGridRoot();
    const grid = getProjectEditPenaltyGrid(gridRoot);
    if (!grid) {
        return;
    }

    ensureProjectEditPenaltyGridHooks(grid);
    applyProjectEditPenaltyStateToDataItems(grid);

    if (ensureProjectEditPenaltyColumn(grid)) {
        scheduleProjectEditPenaltyToggleSync(0);
        return;
    }

    ensureProjectEditPenaltySwitches(grid);
}

function getProjectEditPenaltyGrid(gridRoot) {
    if (!(gridRoot instanceof HTMLElement) || typeof window.jQuery !== "function") {
        return null;
    }

    try {
        return window.jQuery(gridRoot).data("kendoGrid") || null;
    } catch (error) {
        return null;
    }
}

function ensureProjectEditPenaltyGridHooks(grid) {
    if (!grid || !grid.element || !grid.element[0]) {
        return;
    }

    const gridElement = grid.element[0];
    if (!(gridElement instanceof HTMLElement) || gridElement.dataset.qgaProjectEditPenaltyHooksBound === "1") {
        return;
    }

    gridElement.dataset.qgaProjectEditPenaltyHooksBound = "1";

    if (typeof grid.bind === "function") {
        grid.bind("dataBinding", () => {
            applyProjectEditPenaltyStateToDataItems(grid);
        });

        grid.bind("dataBound", () => {
            applyProjectEditPenaltyStateToDataItems(grid);
            ensureProjectEditPenaltySwitches(grid);
        });
    }
}

function ensureProjectEditPenaltyColumn(grid) {
    const columns = getProjectEditPenaltyColumns(grid);
    if (!Array.isArray(columns) || columns.length === 0) {
        return false;
    }

    if (columns.some((column) => isProjectEditPenaltyColumn(column))) {
        return false;
    }

    const referenceIndex = columns.findIndex((column) => {
        return normalizeProjectEditPenaltyText(column && column.field) === normalizeProjectEditPenaltyText(PROJECT_EDIT_PENALTY_REFERENCE_FIELD);
    });

    if (referenceIndex < 0 || typeof grid.setOptions !== "function") {
        return false;
    }

    const nextColumns = columns.slice();
    nextColumns.splice(referenceIndex + 1, 0, buildProjectEditPenaltyColumnDefinition());
    grid.setOptions({ columns: nextColumns });

    return true;
}

function getProjectEditPenaltyColumns(grid) {
    if (!grid || !grid.options || !Array.isArray(grid.options.columns)) {
        return [];
    }

    return grid.options.columns.slice();
}

function isProjectEditPenaltyColumn(column) {
    return normalizeProjectEditPenaltyText(column && column.field) === normalizeProjectEditPenaltyText(PROJECT_EDIT_PENALTY_FIELD);
}

function buildProjectEditPenaltyColumnDefinition() {
    return {
        field: PROJECT_EDIT_PENALTY_FIELD,
        title: PROJECT_EDIT_PENALTY_TITLE,
        width: PROJECT_EDIT_PENALTY_WIDTH,
        filterable: false,
        sortable: false,
        encoded: false,
        attributes: {
            class: PROJECT_EDIT_PENALTY_CELL_CLASS,
            style: "vertical-align: top;text-align: center;padding: 0;"
        },
        headerAttributes: {
            class: PROJECT_EDIT_PENALTY_HEADER_CLASS,
            style: "text-align: center;"
        },
        template:
            "<div class='qga-project-edit-penalty-cell-wrap'>" +
            "<input id='qgaPenalty_#=Id#' class='qga-project-edit-penalty-input' # if (QgaPenalty) { # checked='checked' # } # type='checkbox' />" +
            "</div>"
    };
}

function applyProjectEditPenaltyStateToDataItems(grid) {
    const items = getProjectEditPenaltyItems(grid);
    items.forEach((item) => {
        if (!item || typeof item !== "object") {
            return;
        }

        const rowKey = buildProjectEditPenaltyItemKey(item);
        const nextState = getProjectEditPenaltyResolvedState(item, rowKey);
        item[PROJECT_EDIT_PENALTY_FIELD] = nextState;
    });
}

function getProjectEditPenaltyItems(grid) {
    if (!grid || !grid.dataSource || typeof grid.dataSource.data !== "function") {
        return [];
    }

    try {
        return Array.from(grid.dataSource.data() || []);
    } catch (error) {
        return [];
    }
}

function ensureProjectEditPenaltySwitches(grid) {
    if (!grid || !grid.element || !grid.element[0] || typeof window.jQuery !== "function") {
        return;
    }

    const inputs = grid.element[0].querySelectorAll(`.${PROJECT_EDIT_PENALTY_INPUT_CLASS}`);
    inputs.forEach((input) => ensureProjectEditPenaltySwitch(grid, input));
}

function ensureProjectEditPenaltySwitch(grid, input) {
    if (!(input instanceof HTMLInputElement) || typeof window.jQuery !== "function") {
        return;
    }

    const row = input.closest("tr");
    const dataItem = getProjectEditPenaltyDataItem(grid, row);
    if (!dataItem) {
        return;
    }

    const rowKey = buildProjectEditPenaltyItemKey(dataItem, row);
    if (!rowKey) {
        return;
    }

    input.dataset.qgaPenaltyRowKey = rowKey;
    const checked = getProjectEditPenaltyResolvedState(dataItem, rowKey);
    const $input = window.jQuery(input);
    let switchWidget = $input.data("kendoSwitch");

    if (!switchWidget && typeof $input.kendoSwitch === "function") {
        $input.kendoSwitch();
        switchWidget = $input.data("kendoSwitch");
    }

    if (switchWidget && input.dataset.qgaPenaltyBound !== "1") {
        input.dataset.qgaPenaltyBound = "1";
        switchWidget.bind("change", function (event) {
            const element =
                this.element && this.element[0] instanceof HTMLInputElement
                    ? this.element[0]
                    : input;
            const key = String(element.dataset.qgaPenaltyRowKey || "").trim();
            const nextState = event && event.checked === true;

            if (!key) {
                return;
            }

            projectEditPenaltyToggleState.set(key, nextState);

            const currentRow = element.closest("tr");
            const currentItem = getProjectEditPenaltyDataItem(grid, currentRow);
            if (currentItem && typeof currentItem === "object") {
                currentItem[PROJECT_EDIT_PENALTY_FIELD] = nextState;
            }
        });
    }

    if (switchWidget && typeof switchWidget.check === "function") {
        if (switchWidget.check() !== checked) {
            switchWidget.check(checked);
        }
    } else {
        input.checked = checked;
    }
}

function getProjectEditPenaltyDataItem(gridOrGridRoot, row) {
    const grid =
        gridOrGridRoot && typeof gridOrGridRoot.dataItem === "function"
            ? gridOrGridRoot
            : getProjectEditPenaltyGrid(gridOrGridRoot);
    if (!grid || !(row instanceof HTMLTableRowElement) || typeof grid.dataItem !== "function") {
        return null;
    }

    try {
        return grid.dataItem(row) || null;
    } catch (error) {
        return null;
    }
}

function getProjectEditPenaltyResolvedState(dataItem, rowKey) {
    if (rowKey && projectEditPenaltyToggleState.has(rowKey)) {
        return projectEditPenaltyToggleState.get(rowKey) === true;
    }

    return getProjectEditPenaltyInitialState(dataItem);
}

function getProjectEditPenaltyInitialState(rowOrItem) {
    const dataItem =
        rowOrItem instanceof HTMLTableRowElement
            ? getProjectEditPenaltyDataItem(getProjectEditPenaltyGridRoot(), rowOrItem)
            : rowOrItem;
    if (!dataItem || typeof dataItem !== "object") {
        return false;
    }

    const autoCheckData = Array.isArray(dataItem.AutoCheckData) ? dataItem.AutoCheckData : [];
    const hasPenaltyInArray = autoCheckData.some((entry) => {
        const value =
            entry && typeof entry === "object"
                ? entry.Value || entry.value || entry.Name || entry.name || ""
                : entry;
        return normalizeProjectEditPenaltyText(value).includes("penalty");
    });

    if (hasPenaltyInArray) {
        return true;
    }

    return normalizeProjectEditPenaltyText(dataItem.AutoCheckString).includes("penalty");
}

function buildProjectEditPenaltyItemKey(dataItem, row) {
    const keyParts = [];
    const projectId = typeof getProjectIdFromEditPage === "function" ? getProjectIdFromEditPage() : "";

    if (projectId) {
        keyParts.push(`project:${normalizeProjectEditPenaltyText(projectId)}`);
    }

    if (dataItem && typeof dataItem === "object") {
        const idValue = normalizeProjectEditPenaltyText(dataItem.Id);
        const varsValue = normalizeProjectEditPenaltyText(dataItem.Vars || dataItem.Variable || dataItem.Name);
        const labelValue = normalizeProjectEditPenaltyText(dataItem.Label || dataItem.Title || dataItem.Mark);
        const uidValue = normalizeProjectEditPenaltyText(dataItem.uid);

        if (idValue) {
            keyParts.push(`id:${idValue}`);
        }
        if (varsValue) {
            keyParts.push(`vars:${varsValue}`);
        }
        if (labelValue) {
            keyParts.push(`label:${labelValue}`);
        }
        if (!idValue && uidValue) {
            keyParts.push(`uid:${uidValue}`);
        }
    }

    if (keyParts.length === (projectId ? 1 : 0) && row instanceof HTMLTableRowElement) {
        const rowUid = normalizeProjectEditPenaltyText(row.getAttribute("data-uid"));
        if (rowUid) {
            keyParts.push(`row:${rowUid}`);
        }
    }

    return keyParts.length > 0 ? keyParts.join("|") : "";
}

function syncProjectEditPenaltyToggle() {
    if (!isProjectEditPenaltyHashAllowed()) {
        removeProjectEditPenaltyColumn();
        return;
    }

    const gridRoot = getProjectEditPenaltyGridRoot();
    const headerRow = getProjectEditPenaltyHeaderRow(gridRoot);
    const referenceHeader = findProjectEditPenaltyReferenceHeader(headerRow);
    const referenceIndex = getProjectEditPenaltyReferenceIndex(headerRow, referenceHeader);

    if (!(gridRoot instanceof HTMLElement) || !(headerRow instanceof HTMLTableRowElement) || referenceIndex < 0) {
        return;
    }

    ensureProjectEditPenaltyHeader(headerRow, referenceHeader);

    const headerWrap = gridRoot.querySelector(".k-grid-header-wrap");
    const contentWrap = gridRoot.querySelector(".k-grid-content");
    ensureProjectEditPenaltyCol(headerWrap, referenceIndex);
    ensureProjectEditPenaltyCol(contentWrap, referenceIndex);

    const rows = gridRoot.querySelectorAll(".k-grid-content tbody tr.k-master-row");
    rows.forEach((row) => ensureProjectEditPenaltyCell(gridRoot, row, referenceIndex));
}

function ensureProjectEditPenaltyCell(gridRoot, row, referenceIndex) {
    if (!(gridRoot instanceof HTMLElement) || !(row instanceof HTMLTableRowElement) || referenceIndex < 0) {
        return;
    }

    const cells = getProjectEditPenaltyDataCells(row);
    const referenceCell = cells[referenceIndex];
    if (!(referenceCell instanceof HTMLTableCellElement)) {
        return;
    }

    const rowKey = buildProjectEditPenaltyRowKey(gridRoot, row) || buildProjectEditPenaltyItemKey(getProjectEditPenaltyDataItem(gridRoot, row), row);
    if (!rowKey) {
        return;
    }

    let cell = row.querySelector(`td.${PROJECT_EDIT_PENALTY_CELL_CLASS}`);
    if (!(cell instanceof HTMLTableCellElement)) {
        cell = document.createElement("td");
        cell.className = PROJECT_EDIT_PENALTY_CELL_CLASS;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("data-field", PROJECT_EDIT_PENALTY_FIELD);
        cell.style.padding = "0";

        const wrap = document.createElement("div");
        wrap.className = PROJECT_EDIT_PENALTY_CELL_WRAP_CLASS;

        const switchNode = createProjectEditPenaltySwitch();
        wrap.appendChild(switchNode);
        cell.appendChild(wrap);
    }

    if (cell.parentElement !== row || cell.previousElementSibling !== referenceCell) {
        row.insertBefore(cell, referenceCell.nextElementSibling || null);
    }

    const switchNode = cell.querySelector(`.${PROJECT_EDIT_PENALTY_INPUT_CLASS}`);
    if (!(switchNode instanceof HTMLInputElement)) {
        return;
    }

    switchNode.dataset.qgaPenaltyRowKey = rowKey;

    if (!projectEditPenaltyToggleState.has(rowKey)) {
        projectEditPenaltyToggleState.set(rowKey, getProjectEditPenaltyInitialState(row));
    }

    ensureProjectEditPenaltySwitchWidget(switchNode, projectEditPenaltyToggleState.get(rowKey) === true, gridRoot);
}

function createProjectEditPenaltySwitch() {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = PROJECT_EDIT_PENALTY_INPUT_CLASS;
    return input;
}

function ensureProjectEditPenaltySwitchWidget(input, checked, gridRoot) {
    if (!(input instanceof HTMLInputElement)) {
        return;
    }

    bindProjectEditPenaltySwitchIsolation(input);

    if (typeof window.jQuery === "function") {
        const $input = window.jQuery(input);
        let switchWidget = $input.data("kendoSwitch");

        if (!switchWidget && typeof $input.kendoSwitch === "function") {
            $input.kendoSwitch();
            switchWidget = $input.data("kendoSwitch");
        }

        if (switchWidget && input.dataset.qgaPenaltyBound !== "1") {
            input.dataset.qgaPenaltyBound = "1";
            switchWidget.bind("change", function (event) {
                const element =
                    this.element && this.element[0] instanceof HTMLInputElement
                        ? this.element[0]
                        : input;
                const rowKey = String(element.dataset.qgaPenaltyRowKey || "").trim();
                if (!rowKey) {
                    return;
                }

                projectEditPenaltyToggleState.set(rowKey, event && event.checked === true);
            });
        }

        if (switchWidget && typeof switchWidget.wrapper !== "undefined" && switchWidget.wrapper && switchWidget.wrapper[0]) {
            bindProjectEditPenaltySwitchIsolation(switchWidget.wrapper[0]);
        }

        if (switchWidget && typeof switchWidget.check === "function") {
            if (switchWidget.check() !== checked) {
                switchWidget.check(checked);
            }
            return;
        }
    }

    if (input.dataset.qgaPenaltyFallbackBound !== "1") {
        input.dataset.qgaPenaltyFallbackBound = "1";
        input.addEventListener("change", () => {
            const rowKey = String(input.dataset.qgaPenaltyRowKey || "").trim();
            if (!rowKey) {
                return;
            }

            projectEditPenaltyToggleState.set(rowKey, input.checked === true);
        });
    }

    input.checked = checked;
}

function bindProjectEditPenaltySwitchIsolation(node) {
    if (!(node instanceof HTMLElement) || node.dataset.qgaPenaltyIsolationBound === "1") {
        return;
    }

    node.dataset.qgaPenaltyIsolationBound = "1";

    ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "keydown"].forEach((eventName) => {
        node.addEventListener(eventName, (event) => {
            event.stopPropagation();
        });
    });
}
