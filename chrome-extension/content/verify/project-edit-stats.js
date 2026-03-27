"use strict";

var PROJECT_EDIT_STATS_ALLOWED_HASHES =
    typeof PROJECT_EDIT_STATS_ALLOWED_HASHES !== "undefined" && PROJECT_EDIT_STATS_ALLOWED_HASHES
        ? PROJECT_EDIT_STATS_ALLOWED_HASHES
        : new Set(["#options", "#matrix", "#openends", "#multiaccounts", "#manual"]);

var PROJECT_EDIT_STATS_HOST_CLASS =
    typeof PROJECT_EDIT_STATS_HOST_CLASS !== "undefined"
        ? PROJECT_EDIT_STATS_HOST_CLASS
        : "qga-project-edit-stats-host";
var PROJECT_EDIT_STATS_PERCENT_CLASS =
    typeof PROJECT_EDIT_STATS_PERCENT_CLASS !== "undefined"
        ? PROJECT_EDIT_STATS_PERCENT_CLASS
        : "qga-project-edit-stats-percent";
var PROJECT_EDIT_STATS_DANGER_CLASS =
    typeof PROJECT_EDIT_STATS_DANGER_CLASS !== "undefined"
        ? PROJECT_EDIT_STATS_DANGER_CLASS
        : "qga-project-edit-stats-host--danger";
var PROJECT_EDIT_STATS_BREAKDOWN_CARD_CLASS =
    typeof PROJECT_EDIT_STATS_BREAKDOWN_CARD_CLASS !== "undefined"
        ? PROJECT_EDIT_STATS_BREAKDOWN_CARD_CLASS
        : "qga-project-edit-stats-breakdown-card";
var PROJECT_EDIT_STATS_BREAKDOWN_GRID_CLASS =
    typeof PROJECT_EDIT_STATS_BREAKDOWN_GRID_CLASS !== "undefined"
        ? PROJECT_EDIT_STATS_BREAKDOWN_GRID_CLASS
        : "qga-project-edit-stats-breakdown-grid";
var PROJECT_EDIT_STATS_BREAKDOWN_PART_CLASS =
    typeof PROJECT_EDIT_STATS_BREAKDOWN_PART_CLASS !== "undefined"
        ? PROJECT_EDIT_STATS_BREAKDOWN_PART_CLASS
        : "qga-project-edit-stats-breakdown-part";
var PROJECT_EDIT_STATS_BREAKDOWN_LABEL_CLASS =
    typeof PROJECT_EDIT_STATS_BREAKDOWN_LABEL_CLASS !== "undefined"
        ? PROJECT_EDIT_STATS_BREAKDOWN_LABEL_CLASS
        : "qga-project-edit-stats-breakdown-label";
var PROJECT_EDIT_STATS_BREAKDOWN_VALUE_CLASS =
    typeof PROJECT_EDIT_STATS_BREAKDOWN_VALUE_CLASS !== "undefined"
        ? PROJECT_EDIT_STATS_BREAKDOWN_VALUE_CLASS
        : "qga-project-edit-stats-breakdown-value";
var PROJECT_EDIT_STATS_BREAKDOWN_DANGER_CLASS =
    typeof PROJECT_EDIT_STATS_BREAKDOWN_DANGER_CLASS !== "undefined"
        ? PROJECT_EDIT_STATS_BREAKDOWN_DANGER_CLASS
        : "qga-project-edit-stats-breakdown-part--danger";
var PROJECT_EDIT_STATS_ALERT_THRESHOLD =
    typeof PROJECT_EDIT_STATS_ALERT_THRESHOLD !== "undefined"
        ? PROJECT_EDIT_STATS_ALERT_THRESHOLD
        : 4;

var projectEditStatsSyncTimer =
    typeof projectEditStatsSyncTimer !== "undefined" ? projectEditStatsSyncTimer : null;
var projectEditStatsRatingRequestedProjects =
    typeof projectEditStatsRatingRequestedProjects !== "undefined" &&
    projectEditStatsRatingRequestedProjects instanceof Set
        ? projectEditStatsRatingRequestedProjects
        : new Set();
var projectEditStatsRatingPendingProjects =
    typeof projectEditStatsRatingPendingProjects !== "undefined" &&
    projectEditStatsRatingPendingProjects instanceof Set
        ? projectEditStatsRatingPendingProjects
        : new Set();

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

function isProjectEditStatsOwnedElement(element) {
    if (!(element instanceof Element)) {
        return false;
    }

    return !!element.closest(
        `.${PROJECT_EDIT_STATS_PERCENT_CLASS}, .${PROJECT_EDIT_STATS_BREAKDOWN_CARD_CLASS}`
    );
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

    if (targetElement && isProjectEditStatsOwnedElement(targetElement)) {
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
        if (isProjectEditStatsOwnedElement(element)) {
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

    const cards = Array.from(statsRow.children || []).filter((child) => {
        return child instanceof HTMLElement && !child.classList.contains(PROJECT_EDIT_STATS_BREAKDOWN_CARD_CLASS);
    });
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
        statsRow,
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

    card.classList.add(PROJECT_EDIT_STATS_HOST_CLASS);

    let node = getProjectEditStatsPercentNode(card);
    if (!node) {
        node = document.createElement("span");
        node.className = PROJECT_EDIT_STATS_PERCENT_CLASS;
        node.textContent = "0%";
        card.appendChild(node);
    }

    return node;
}

function getProjectEditStatsBreakdownCard(statsRow) {
    if (!(statsRow instanceof HTMLElement)) {
        return null;
    }

    const node = statsRow.querySelector(`.${PROJECT_EDIT_STATS_BREAKDOWN_CARD_CLASS}`);
    return node instanceof HTMLElement ? node : null;
}

function getProjectEditStatsReferenceCardClassName(referenceCard) {
    if (!(referenceCard instanceof HTMLElement)) {
        return PROJECT_EDIT_STATS_BREAKDOWN_CARD_CLASS;
    }

    const classNames = Array.from(referenceCard.classList).filter((className) => {
        return (
            className !== PROJECT_EDIT_STATS_HOST_CLASS &&
            className !== PROJECT_EDIT_STATS_DANGER_CLASS &&
            className !== PROJECT_EDIT_STATS_BREAKDOWN_CARD_CLASS
        );
    });
    classNames.push(PROJECT_EDIT_STATS_BREAKDOWN_CARD_CLASS);

    return classNames.join(" ").trim();
}

function buildProjectEditStatsBreakdownPart(metricKey, labelText, titleText) {
    const part = document.createElement("div");
    part.className = `${PROJECT_EDIT_STATS_BREAKDOWN_PART_CLASS} ${PROJECT_EDIT_STATS_BREAKDOWN_PART_CLASS}--${metricKey}`;
    part.setAttribute("data-qga-project-edit-stats-metric", metricKey);
    part.removeAttribute("title");

    const label = document.createElement("span");
    label.className = PROJECT_EDIT_STATS_BREAKDOWN_LABEL_CLASS;
    label.textContent = labelText;

    const value = document.createElement("span");
    value.className = PROJECT_EDIT_STATS_BREAKDOWN_VALUE_CLASS;
    value.textContent = "...";

    part.appendChild(label);
    part.appendChild(value);

    return part;
}

function getProjectEditStatsStyleReferenceCard(statsRow, fallbackCard) {
    if (!(statsRow instanceof HTMLElement)) {
        return fallbackCard instanceof HTMLElement ? fallbackCard : null;
    }

    const cards = Array.from(statsRow.children || []).filter((child) => {
        return child instanceof HTMLElement && !child.classList.contains(PROJECT_EDIT_STATS_BREAKDOWN_CARD_CLASS);
    });

    return (
        cards.find((card) => card.querySelector(".c_box_header") && card.querySelector(".c_box_content")) ||
        (fallbackCard instanceof HTMLElement ? fallbackCard : null)
    );
}

function syncProjectEditStatsNodeTypography(node, referenceNode, overrides) {
    if (
        !(node instanceof HTMLElement) ||
        !(referenceNode instanceof Element) ||
        typeof window.getComputedStyle !== "function"
    ) {
        return;
    }

    const referenceStyle = window.getComputedStyle(referenceNode);
    if (!referenceStyle) {
        return;
    }

    node.style.fontFamily = referenceStyle.fontFamily;
    node.style.fontSize = referenceStyle.fontSize;
    node.style.fontStyle = referenceStyle.fontStyle;
    node.style.fontWeight = referenceStyle.fontWeight;
    node.style.lineHeight = referenceStyle.lineHeight;
    node.style.letterSpacing = referenceStyle.letterSpacing;
    node.style.color = referenceStyle.color;
    node.style.textTransform = referenceStyle.textTransform;
    node.style.textDecoration = referenceStyle.textDecoration;
    node.style.textAlign = referenceStyle.textAlign;

    Object.entries(overrides || {}).forEach(([key, value]) => {
        node.style[key] = value;
    });
}

function syncProjectEditStatsBreakdownPartShell(part, labelReferenceCard, percentReferenceCard) {
    if (!(part instanceof HTMLElement)) {
        return;
    }

    const labelNode = part.querySelector(`.${PROJECT_EDIT_STATS_BREAKDOWN_LABEL_CLASS}`);
    const valueNode = part.querySelector(`.${PROJECT_EDIT_STATS_BREAKDOWN_VALUE_CLASS}`);
    const labelReferenceNode =
        labelReferenceCard instanceof HTMLElement ? labelReferenceCard.querySelector(".c_box_header") : null;
    const valueReferenceNode =
        percentReferenceCard instanceof HTMLElement
            ? percentReferenceCard.querySelector(`.${PROJECT_EDIT_STATS_PERCENT_CLASS}`)
            : null;

    if (labelNode instanceof HTMLElement && labelReferenceNode instanceof Element) {
        syncProjectEditStatsNodeTypography(labelNode, labelReferenceNode, {
            position: "static",
            left: "auto",
            top: "auto",
            right: "auto",
            bottom: "auto",
            width: "auto",
            height: "auto",
            margin: "0",
            display: "block",
            lineHeight: "25px",
            textAlign: "left",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
        });
    }

    if (valueNode instanceof HTMLElement && valueReferenceNode instanceof Element) {
        syncProjectEditStatsNodeTypography(valueNode, valueReferenceNode, {
            position: "static",
            left: "auto",
            top: "auto",
            right: "auto",
            bottom: "auto",
            marginTop: "6px",
            marginRight: "0",
            marginBottom: "0",
            marginLeft: "0",
            display: "block",
            textAlign: "left",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            userSelect: "none"
        });
    }
}

function syncProjectEditStatsBreakdownCardShell(card, referenceCard) {
    if (!(card instanceof HTMLElement)) {
        return;
    }

    card.className = getProjectEditStatsReferenceCardClassName(referenceCard);

    if (referenceCard instanceof HTMLElement) {
        const styleText = referenceCard.getAttribute("style");
        if (styleText) {
            card.setAttribute("style", styleText);
        } else {
            card.removeAttribute("style");
        }
    }
}

function ensureProjectEditStatsBreakdownCard(statsRow, referenceCard) {
    if (!(statsRow instanceof HTMLElement) || !(referenceCard instanceof HTMLElement)) {
        return null;
    }

    let card = getProjectEditStatsBreakdownCard(statsRow);
    if (!(card instanceof HTMLElement)) {
        const tagName = String(referenceCard.tagName || "div").toLowerCase();
        card = document.createElement(tagName);
    }

    syncProjectEditStatsBreakdownCardShell(card, referenceCard);
    const styleReferenceCard = getProjectEditStatsStyleReferenceCard(statsRow, referenceCard);

    let grid = card.querySelector(`.${PROJECT_EDIT_STATS_BREAKDOWN_GRID_CLASS}`);
    if (!(grid instanceof HTMLElement)) {
        grid = document.createElement("div");
        grid.className = PROJECT_EDIT_STATS_BREAKDOWN_GRID_CLASS;
        grid.appendChild(
            buildProjectEditStatsBreakdownPart("incorrect", "OpenEnds", "Некорректные по OpenEnds")
        );
        grid.appendChild(
            buildProjectEditStatsBreakdownPart("speedster", "Спидстеры", "Спидстеры")
        );
        card.textContent = "";
        card.appendChild(grid);
    }

    grid.querySelectorAll(`.${PROJECT_EDIT_STATS_BREAKDOWN_PART_CLASS}`).forEach((part) => {
        syncProjectEditStatsBreakdownPartShell(part, styleReferenceCard, referenceCard);
    });

    if (card.parentElement !== statsRow || card.previousElementSibling !== referenceCard) {
        statsRow.insertBefore(card, referenceCard.nextElementSibling || null);
    }

    return card;
}

function getProjectEditStatsBreakdownValueNode(card, metricKey) {
    if (!(card instanceof HTMLElement) || !metricKey) {
        return null;
    }

    const metricNode = getProjectEditStatsBreakdownMetricNode(card, metricKey);
    if (!(metricNode instanceof HTMLElement)) {
        return null;
    }

    const valueNode = metricNode.querySelector(`.${PROJECT_EDIT_STATS_BREAKDOWN_VALUE_CLASS}`);
    return valueNode instanceof HTMLElement ? valueNode : null;
}

function getProjectEditStatsBreakdownMetricNode(card, metricKey) {
    if (!(card instanceof HTMLElement) || !metricKey) {
        return null;
    }

    const metricNode = card.querySelector(`[data-qga-project-edit-stats-metric='${metricKey}']`);
    return metricNode instanceof HTMLElement ? metricNode : null;
}

function setProjectEditStatsBreakdownMetric(card, metricKey, labelText, totalCount, state) {
    if (!(card instanceof HTMLElement) || !metricKey || !state || typeof state !== "object") {
        return;
    }

    const metricNode = getProjectEditStatsBreakdownMetricNode(card, metricKey);
    const valueNode = getProjectEditStatsBreakdownValueNode(card, metricKey);
    if (!(metricNode instanceof HTMLElement) || !(valueNode instanceof HTMLElement)) {
        return;
    }

    metricNode.removeAttribute("title");
    metricNode.classList.remove(PROJECT_EDIT_STATS_BREAKDOWN_DANGER_CLASS);

    if (state.mode === "loading") {
        valueNode.textContent = "...";
        return;
    }

    if (state.mode === "unavailable") {
        valueNode.textContent = "-";
        return;
    }

    const count = Number.isFinite(state.count) ? state.count : 0;
    const percentValue = getProjectEditStatsPercentValue(count, totalCount);
    valueNode.textContent = formatProjectEditStatsPercent(count, totalCount);
    metricNode.classList.toggle(PROJECT_EDIT_STATS_BREAKDOWN_DANGER_CLASS, percentValue > PROJECT_EDIT_STATS_ALERT_THRESHOLD);
}

function removeProjectEditStatsUi() {
    document.querySelectorAll(`.${PROJECT_EDIT_STATS_PERCENT_CLASS}`).forEach((node) => node.remove());
    document.querySelectorAll(`.${PROJECT_EDIT_STATS_BREAKDOWN_CARD_CLASS}`).forEach((node) => node.remove());
    document.querySelectorAll(`.${PROJECT_EDIT_STATS_HOST_CLASS}`).forEach((node) => {
        if (node instanceof HTMLElement) {
            node.classList.remove(PROJECT_EDIT_STATS_HOST_CLASS);
            node.classList.remove(PROJECT_EDIT_STATS_DANGER_CLASS);
        }
    });
}

function getProjectEditStatsProjectId() {
    const verifyProjectId =
        typeof getProjectIdForVerify === "function" ? String(getProjectIdForVerify() || "").trim() : "";
    if (verifyProjectId) {
        return verifyProjectId;
    }

    return typeof getProjectIdFromEditPage === "function" ? String(getProjectIdFromEditPage() || "").trim() : "";
}

function hasProjectEditStatsRatingData(projectId) {
    if (!projectId || !ratingIncorrectIdsState || typeof ratingIncorrectIdsState !== "object") {
        return false;
    }

    return Object.prototype.hasOwnProperty.call(ratingIncorrectIdsState, String(projectId));
}

function ensureProjectEditStatsRatingData(projectId) {
    const key = String(projectId || "").trim();
    if (
        !key ||
        hasProjectEditStatsRatingData(key) ||
        projectEditStatsRatingRequestedProjects.has(key) ||
        typeof ensureRatingIncorrectIdsLoaded !== "function"
    ) {
        return;
    }

    projectEditStatsRatingRequestedProjects.add(key);
    projectEditStatsRatingPendingProjects.add(key);

    Promise.resolve(ensureRatingIncorrectIdsLoaded(key))
        .catch(() => false)
        .finally(() => {
            projectEditStatsRatingPendingProjects.delete(key);
            scheduleProjectEditStatsSync(0);
        });
}

function getProjectEditStatsBreakdownCounts(projectId) {
    const incorrectIds = new Set();
    const speedsterIds = new Set();
    if (!projectId) {
        return {
            incorrectCount: 0,
            speedsterCount: 0
        };
    }

    if (typeof getVerifyIncorrectIdsSetForProject === "function") {
        const verifyIncorrectSet = getVerifyIncorrectIdsSetForProject(projectId);
        if (verifyIncorrectSet instanceof Set) {
            verifyIncorrectSet.forEach((respondentId) => {
                const normalizedId = String(respondentId || "").trim();
                if (normalizedId) {
                    incorrectIds.add(normalizedId);
                }
            });
        }
    }

    const ratingReasonMap =
        typeof getRatingReasonCodesForProject === "function" ? getRatingReasonCodesForProject(projectId) : {};

    Object.keys(ratingReasonMap || {}).forEach((respondentId) => {
        const normalizedId = String(respondentId || "").trim();
        const reasonCodes = Array.isArray(ratingReasonMap[respondentId])
            ? ratingReasonMap[respondentId]
                .map((code) => Number(code))
                .filter((code) => Number.isFinite(code))
            : [];

        if (!normalizedId || reasonCodes.length === 0) {
            return;
        }

        if (reasonCodes.includes(1)) {
            incorrectIds.add(normalizedId);
        }
        if (reasonCodes.includes(4)) {
            speedsterIds.add(normalizedId);
        }
    });

    return {
        incorrectCount: incorrectIds.size,
        speedsterCount: speedsterIds.size
    };
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
        removeProjectEditStatsUi();
        return;
    }

    const binding = getProjectEditStatsBinding();
    if (!binding) {
        removeProjectEditStatsUi();
        return;
    }

    const percentNode = ensureProjectEditStatsPercentNode(binding.currentCard);
    if (!(percentNode instanceof HTMLElement)) {
        return;
    }

    const totalCount = getProjectEditStatsCountFromNode(binding.totalNode);
    const currentCount = getProjectEditStatsCountFromNode(binding.currentNode);
    const percentText = formatProjectEditStatsPercent(currentCount, totalCount);
    const currentLabel = getProjectEditStatsCurrentLabel(binding.currentCard);
    const breakdownCard = ensureProjectEditStatsBreakdownCard(binding.statsRow, binding.currentCard);
    const projectId = getProjectEditStatsProjectId();
    const hasRatingData = hasProjectEditStatsRatingData(projectId);

    binding.currentCard.classList.remove(PROJECT_EDIT_STATS_DANGER_CLASS);

    if (projectId && !hasRatingData) {
        ensureProjectEditStatsRatingData(projectId);
    }

    if (breakdownCard instanceof HTMLElement) {
        if (projectId && !hasRatingData) {
            const breakdownState = projectEditStatsRatingPendingProjects.has(projectId) ? "loading" : "unavailable";
            setProjectEditStatsBreakdownMetric(
                breakdownCard,
                "incorrect",
                "Некорректные по OpenEnds",
                totalCount,
                { mode: breakdownState }
            );
            setProjectEditStatsBreakdownMetric(
                breakdownCard,
                "speedster",
                "Спидстеры",
                totalCount,
                { mode: breakdownState }
            );
        } else {
            const breakdownCounts = getProjectEditStatsBreakdownCounts(projectId);
            setProjectEditStatsBreakdownMetric(
                breakdownCard,
                "incorrect",
                "Некорректные по OpenEnds",
                totalCount,
                { mode: "ready", count: breakdownCounts.incorrectCount }
            );
            setProjectEditStatsBreakdownMetric(
                breakdownCard,
                "speedster",
                "Спидстеры",
                totalCount,
                { mode: "ready", count: breakdownCounts.speedsterCount }
            );
        }
    }

    percentNode.textContent = percentText;
    percentNode.title = currentLabel
        ? `${currentLabel}: ${currentCount} из ${totalCount}`
        : `${currentCount} из ${totalCount}`;
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
    if (hasProjectEditPenaltyActiveEditRow(gridRoot)) {
        removeProjectEditPenaltyColumn();
        return;
    }

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

function hasProjectEditPenaltyActiveEditRow(gridRoot) {
    if (!(gridRoot instanceof HTMLElement)) {
        return false;
    }

    return !!gridRoot.querySelector(".k-grid-content tbody tr.k-grid-edit-row");
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
var PROJECT_EDIT_PENALTY_UPDATE_URL =
    typeof PROJECT_EDIT_PENALTY_UPDATE_URL !== "undefined"
        ? PROJECT_EDIT_PENALTY_UPDATE_URL
        : "/lk/OpenEnds2/GroupUpdate";
var PROJECT_EDIT_PENALTY_BRIDGE_SCRIPT =
    typeof PROJECT_EDIT_PENALTY_BRIDGE_SCRIPT !== "undefined"
        ? PROJECT_EDIT_PENALTY_BRIDGE_SCRIPT
        : "content/verify/project-edit-penalty-bridge.js";
var PROJECT_EDIT_PENALTY_BRIDGE_CHANNEL =
    typeof PROJECT_EDIT_PENALTY_BRIDGE_CHANNEL !== "undefined"
        ? PROJECT_EDIT_PENALTY_BRIDGE_CHANNEL
        : "qga-project-edit-penalty";
var PROJECT_EDIT_PENALTY_ENTRY_ID =
    typeof PROJECT_EDIT_PENALTY_ENTRY_ID !== "undefined"
        ? PROJECT_EDIT_PENALTY_ENTRY_ID
        : 1;
var PROJECT_EDIT_PENALTY_ENTRY_VALUE =
    typeof PROJECT_EDIT_PENALTY_ENTRY_VALUE !== "undefined"
        ? PROJECT_EDIT_PENALTY_ENTRY_VALUE
        : "Penalty";
var projectEditPenaltyPendingRows =
    typeof projectEditPenaltyPendingRows !== "undefined" && projectEditPenaltyPendingRows instanceof Set
        ? projectEditPenaltyPendingRows
        : new Set();
var projectEditPenaltyBridgeRequestSeq =
    typeof projectEditPenaltyBridgeRequestSeq !== "undefined"
        ? projectEditPenaltyBridgeRequestSeq
        : 0;
var projectEditPenaltyBridgeRequests =
    typeof projectEditPenaltyBridgeRequests !== "undefined" && projectEditPenaltyBridgeRequests instanceof Map
        ? projectEditPenaltyBridgeRequests
        : new Map();
var projectEditPenaltyBridgeLoadPromise =
    typeof projectEditPenaltyBridgeLoadPromise !== "undefined"
        ? projectEditPenaltyBridgeLoadPromise
        : null;

function setupProjectEditPenaltyToggle() {
    ensureProjectEditPenaltyBridgeListener();
    ensureProjectEditPenaltyToggleObserver();
    ensureProjectEditPenaltyEditModeGuard();
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

function ensureProjectEditPenaltyEditModeGuard() {
    if (!document.body || document.body.dataset.qgaProjectEditPenaltyEditGuardBound === "1") {
        return;
    }

    document.body.dataset.qgaProjectEditPenaltyEditGuardBound = "1";

    const maybeRemovePenaltyBeforeInlineEdit = (event) => {
        if (!isProjectEditPenaltyHashAllowed()) {
            return;
        }

        const target = event.target instanceof Element ? event.target : null;
        if (!(target instanceof Element)) {
            return;
        }

        const editTrigger = target.closest(`${PROJECT_EDIT_PENALTY_GRID_SELECTOR} a.k-grid-edit, ${PROJECT_EDIT_PENALTY_GRID_SELECTOR} .k-grid-edit`);
        if (!(editTrigger instanceof Element)) {
            return;
        }

        removeProjectEditPenaltyColumn();
    };

    document.addEventListener("pointerdown", maybeRemovePenaltyBeforeInlineEdit, true);
    document.addEventListener("click", maybeRemovePenaltyBeforeInlineEdit, true);
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
    if (!(gridRoot instanceof HTMLElement)) {
        return null;
    }

    const candidates = [];

    if (typeof window.jQuery === "function") {
        try {
            candidates.push(window.jQuery(gridRoot).data("kendoGrid") || null);
        } catch (error) {
        }
    }

    if (window.kendo && typeof window.kendo.widgetInstance === "function") {
        try {
            candidates.push(window.kendo.widgetInstance(gridRoot) || null);
        } catch (error) {
        }

        if (typeof window.jQuery === "function") {
            try {
                candidates.push(window.kendo.widgetInstance(window.jQuery(gridRoot)) || null);
            } catch (error) {
            }
        }
    }

    try {
        Object.getOwnPropertyNames(gridRoot).forEach((propertyName) => {
            try {
                const value = gridRoot[propertyName];
                if (isProjectEditPenaltyGridLike(value)) {
                    candidates.push(value);
                }
            } catch (error) {
            }
        });
    } catch (error) {
    }

    return candidates.find((candidate) => isProjectEditPenaltyGridLike(candidate)) || null;
}

function isProjectEditPenaltyGridLike(candidate) {
    return !!(
        candidate &&
        typeof candidate === "object" &&
        typeof candidate.dataItem === "function" &&
        candidate.dataSource &&
        typeof candidate.dataSource === "object"
    );
}

function getProjectEditPenaltyDataSourceItems(dataSource) {
    if (!dataSource || typeof dataSource !== "object") {
        return [];
    }

    try {
        if (typeof dataSource.data === "function") {
            return Array.from(dataSource.data() || []);
        }
    } catch (error) {
    }

    return Array.isArray(dataSource._data) ? dataSource._data.slice() : [];
}

function getProjectEditPenaltyDataItemByRowUid(grid, rowUid) {
    if (!grid || !grid.dataSource || !rowUid) {
        return null;
    }

    if (typeof grid.dataSource.getByUid === "function") {
        try {
            return grid.dataSource.getByUid(rowUid) || null;
        } catch (error) {
        }
    }

    return (
        getProjectEditPenaltyDataSourceItems(grid.dataSource).find((item) => {
            return normalizeProjectEditPenaltyText(item && item.uid) === rowUid;
        }) || null
    );
}

function getProjectEditPenaltyDataItem(gridOrGridRoot, row) {
    const grid =
        gridOrGridRoot && typeof gridOrGridRoot.dataItem === "function"
            ? gridOrGridRoot
            : getProjectEditPenaltyGrid(gridOrGridRoot);
    if (!grid || !(row instanceof HTMLTableRowElement)) {
        return null;
    }

    try {
        const item = grid.dataItem(row);
        if (item) {
            return item;
        }
    } catch (error) {
    }

    const rowUid = normalizeProjectEditPenaltyText(row.getAttribute("data-uid"));
    return getProjectEditPenaltyDataItemByRowUid(grid, rowUid);
}

function getProjectEditPenaltyItems(grid) {
    if (!grid || !grid.dataSource) {
        return [];
    }

    return getProjectEditPenaltyDataSourceItems(grid.dataSource);
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
    if (!grid || !(row instanceof HTMLTableRowElement)) {
        return null;
    }

    try {
        if (typeof grid.dataItem === "function") {
            const item = grid.dataItem(row);
            if (item) {
                return item;
            }
        }
    } catch (error) {
    }

    const rowUid = normalizeProjectEditPenaltyText(row.getAttribute("data-uid"));
    return getProjectEditPenaltyDataItemByRowUid(grid, rowUid);
}

function getProjectEditPenaltyResolvedState(dataItem, rowKey) {
    if (rowKey && projectEditPenaltyToggleState.has(rowKey)) {
        return projectEditPenaltyToggleState.get(rowKey) === true;
    }

    return getProjectEditPenaltyInitialState(dataItem);
}

function getProjectEditPenaltyInitialState(rowOrItem) {
    const row = rowOrItem instanceof HTMLTableRowElement ? rowOrItem : null;
    const dataItem = row ? getProjectEditPenaltyDataItem(getProjectEditPenaltyGridRoot(), row) : rowOrItem;

    if (row) {
        const autoCheckCellText = getProjectEditPenaltyAutoCheckCellDisplayText(row);
        if (autoCheckCellText) {
            return normalizeProjectEditPenaltyText(autoCheckCellText).includes("penalty");
        }
    }

    if (!dataItem || typeof dataItem !== "object") {
        return false;
    }

    const autoCheckData = getProjectEditPenaltyAutoCheckEntries(dataItem);
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
    if (hasProjectEditPenaltyActiveEditRow(gridRoot)) {
        removeProjectEditPenaltyColumn();
        return;
    }

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

function hasProjectEditPenaltyActiveEditRow(gridRoot) {
    if (!(gridRoot instanceof HTMLElement)) {
        return false;
    }

    return !!gridRoot.querySelector(".k-grid-content tbody tr.k-grid-edit-row");
}

function ensureProjectEditPenaltyCell(gridRoot, row, referenceIndex) {
    if (!(gridRoot instanceof HTMLElement) || !(row instanceof HTMLTableRowElement) || referenceIndex < 0) {
        return;
    }

    const referenceCell = row.cells[referenceIndex];
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
        cell.style.verticalAlign = "top";
        cell.style.textAlign = "center";

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

    if (!isProjectEditPenaltyRowBusy(rowKey)) {
        projectEditPenaltyToggleState.set(rowKey, getProjectEditPenaltyInitialState(row));
    }

    ensureProjectEditPenaltySwitchWidget(switchNode, projectEditPenaltyToggleState.get(rowKey) === true, gridRoot);
}

function createProjectEditPenaltySwitch() {
    const wrapper = document.createElement("button");
    wrapper.type = "button";
    wrapper.className = `k-switch k-widget ${PROJECT_EDIT_PENALTY_SWITCH_CLASS} k-switch-off`;
    wrapper.setAttribute("role", "switch");
    wrapper.setAttribute("tabindex", "0");
    wrapper.setAttribute("aria-checked", "false");

    const container = document.createElement("span");
    container.className = "k-switch-container";

    const labelOn = document.createElement("span");
    labelOn.className = "k-switch-label-on";
    labelOn.textContent = "On";

    const labelOff = document.createElement("span");
    labelOff.className = "k-switch-label-off";
    labelOff.textContent = "Off";

    const handle = document.createElement("span");
    handle.className = "k-switch-handle";

    container.appendChild(labelOn);
    container.appendChild(labelOff);
    container.appendChild(handle);

    wrapper.appendChild(container);

    return wrapper;
}

function ensureProjectEditPenaltySwitchWidget(switchNode, checked, gridRoot) {
    if (!(switchNode instanceof HTMLElement)) {
        return;
    }

    bindProjectEditPenaltySwitchIsolation(switchNode);

    if (switchNode.dataset.qgaPenaltyBound !== "1") {
        switchNode.dataset.qgaPenaltyBound = "1";

        switchNode.addEventListener("click", (event) => {
            event.preventDefault();
            toggleProjectEditPenaltySwitchInput(switchNode);
        });

        switchNode.addEventListener("keydown", (event) => {
            if (event.key !== " " && event.key !== "Enter") {
                return;
            }

            event.preventDefault();
            toggleProjectEditPenaltySwitchInput(switchNode);
        });
    }

    syncProjectEditPenaltySwitchNode(switchNode, checked);
    syncProjectEditPenaltySwitchBusyState(switchNode);
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

function toggleProjectEditPenaltySwitchInput(switchNode) {
    if (!(switchNode instanceof HTMLElement)) {
        return;
    }

    const rowKey = String(switchNode.dataset.qgaPenaltyRowKey || "").trim();
    const row = switchNode.closest("tr");
    const gridRoot = switchNode.closest(PROJECT_EDIT_PENALTY_GRID_SELECTOR);
    const dataItem = getProjectEditPenaltyDataItem(gridRoot, row);
    if (!rowKey || !(row instanceof HTMLTableRowElement) || isProjectEditPenaltyRowBusy(rowKey)) {
        return;
    }

    const previousChecked = getProjectEditPenaltySwitchChecked(switchNode);
    const previousAutoCheckText = getProjectEditPenaltyAutoCheckCellDisplayText(row);
    const bridgeRequest = requestProjectEditPenaltyBridgeToggle(row, !previousChecked);

    if (bridgeRequest) {
        const nextChecked = !previousChecked;

        projectEditPenaltyToggleState.set(rowKey, nextChecked);
        syncProjectEditPenaltySwitchNode(switchNode, nextChecked);
        setProjectEditPenaltyRowBusyState(rowKey, true);
        syncProjectEditPenaltySwitchBusyState(switchNode);

        bridgeRequest
            .done((result) => {
                const resolvedChecked = result && typeof result.checked === "boolean" ? result.checked === true : nextChecked;
                const resolvedAutoCheckData = Array.isArray(result && result.autoCheckData)
                    ? result.autoCheckData
                    : nextAutoCheckData;
                const resolvedAutoCheckString =
                    result && typeof result.autoCheckString === "string"
                        ? result.autoCheckString
                        : nextAutoCheckString;

                projectEditPenaltyToggleState.set(rowKey, resolvedChecked);
                syncProjectEditPenaltySwitchNode(switchNode, resolvedChecked);
                syncProjectEditPenaltyAutoCheckCell(row, resolvedAutoCheckData, resolvedAutoCheckString);
            })
            .fail((response) => {
                projectEditPenaltyToggleState.set(rowKey, previousChecked);
                syncProjectEditPenaltySwitchNode(switchNode, previousChecked);
                syncProjectEditPenaltyAutoCheckCell(row, [], previousAutoCheckText);

                if (typeof onFailAjax === "function") {
                    onFailAjax(response);
                } else {
                    console.warn("[QGA] Penalty toggle bridge save failed:", response);
                }
            })
            .always(() => {
                setProjectEditPenaltyRowBusyState(rowKey, false);
                syncProjectEditPenaltySwitchBusyState(switchNode);
            });

        return;
    }

    if (!dataItem || typeof dataItem !== "object") {
        console.warn("[QGA] Penalty toggle: dataItem unavailable for row", row);
        return;
    }

    const previousAutoCheckData = getProjectEditPenaltyAutoCheckEntries(dataItem);
    const previousAutoCheckString = getProjectEditPenaltyAutoCheckStringValue(dataItem);
    const nextChecked = !previousChecked;
    const nextAutoCheckData = buildProjectEditPenaltyNextAutoCheckData(previousAutoCheckData, nextChecked);
    const nextAutoCheckString = buildProjectEditPenaltyRequestAutoCheckString(nextAutoCheckData);

    projectEditPenaltyToggleState.set(rowKey, nextChecked);
    applyProjectEditPenaltyDataItemState(dataItem, nextAutoCheckData, nextAutoCheckString, nextChecked);
    syncProjectEditPenaltySwitchNode(switchNode, nextChecked);
    syncProjectEditPenaltyAutoCheckCell(row, nextAutoCheckData, nextAutoCheckString);
    setProjectEditPenaltyRowBusyState(rowKey, true);
    syncProjectEditPenaltySwitchBusyState(switchNode);

    sendProjectEditPenaltyGroupUpdate(dataItem, nextAutoCheckData, nextAutoCheckString)
        .done((response) => {
            const responseItem = getProjectEditPenaltyResponseItem(response, dataItem);
            const hasResponseAutoCheckState = hasProjectEditPenaltyAutoCheckStateInResponse(responseItem);
            if (responseItem) {
                syncProjectEditPenaltyDataItemFromResponse(dataItem, responseItem);
            }

            const resolvedAutoCheckData = hasResponseAutoCheckState
                ? getProjectEditPenaltyAutoCheckEntries(dataItem)
                : nextAutoCheckData;
            const resolvedAutoCheckString = hasResponseAutoCheckState
                ? getProjectEditPenaltyAutoCheckStringValue(dataItem)
                : nextAutoCheckString;
            const resolvedChecked = hasResponseAutoCheckState
                ? getProjectEditPenaltyInitialState(dataItem)
                : nextChecked;

            applyProjectEditPenaltyDataItemState(
                dataItem,
                resolvedAutoCheckData,
                resolvedAutoCheckString,
                resolvedChecked
            );

            projectEditPenaltyToggleState.set(rowKey, resolvedChecked);
            syncProjectEditPenaltySwitchNode(switchNode, resolvedChecked);
            syncProjectEditPenaltyAutoCheckCell(row, resolvedAutoCheckData, resolvedAutoCheckString);
        })
        .fail((response) => {
            projectEditPenaltyToggleState.set(rowKey, previousChecked);
            applyProjectEditPenaltyDataItemState(
                dataItem,
                previousAutoCheckData,
                previousAutoCheckString,
                previousChecked
            );
            syncProjectEditPenaltySwitchNode(switchNode, previousChecked);
            syncProjectEditPenaltyAutoCheckCell(row, previousAutoCheckData, previousAutoCheckString);

            if (typeof onFailAjax === "function") {
                onFailAjax(response);
            } else {
                console.warn("[QGA] Penalty toggle save failed:", response);
            }
        })
        .always(() => {
            setProjectEditPenaltyRowBusyState(rowKey, false);
            syncProjectEditPenaltySwitchBusyState(switchNode);
        });
}

function getProjectEditPenaltySwitchChecked(switchNode) {
    if (!(switchNode instanceof HTMLElement)) {
        return false;
    }

    if (switchNode.getAttribute("aria-checked") === "true") {
        return true;
    }

    return switchNode.classList.contains("k-switch-on");
}

function syncProjectEditPenaltySwitchNode(switchNode, checked) {
    if (!(switchNode instanceof HTMLElement)) {
        return;
    }

    const isChecked = checked === true;
    switchNode.setAttribute("aria-checked", String(isChecked));
    switchNode.classList.toggle("k-switch-on", isChecked);
    switchNode.classList.toggle("k-switch-off", !isChecked);
}

function isProjectEditPenaltyRowBusy(rowKey) {
    return rowKey ? projectEditPenaltyPendingRows.has(rowKey) : false;
}

function setProjectEditPenaltyRowBusyState(rowKey, isBusy) {
    if (!rowKey) {
        return;
    }

    if (isBusy) {
        projectEditPenaltyPendingRows.add(rowKey);
        return;
    }

    projectEditPenaltyPendingRows.delete(rowKey);
}

function syncProjectEditPenaltySwitchBusyState(switchNode) {
    if (!(switchNode instanceof HTMLElement)) {
        return;
    }

    const rowKey = String(switchNode.dataset.qgaPenaltyRowKey || "").trim();
    const isBusy = isProjectEditPenaltyRowBusy(rowKey);

    if (switchNode instanceof HTMLButtonElement) {
        switchNode.disabled = isBusy;
    }

    switchNode.classList.toggle("qga-project-edit-penalty-switch--busy", isBusy);
    switchNode.setAttribute("aria-disabled", String(isBusy));
}

function getProjectEditPenaltyAutoCheckCellDisplayText(row) {
    if (!(row instanceof HTMLTableRowElement)) {
        return "";
    }

    const gridRoot = row.closest(PROJECT_EDIT_PENALTY_GRID_SELECTOR);
    const autoCheckIndex = getProjectEditPenaltyFieldIndex(gridRoot, "AutoCheckData");
    if (autoCheckIndex < 0) {
        return "";
    }

    const cell = row.cells[autoCheckIndex];
    return cell instanceof HTMLTableCellElement ? String(cell.textContent || "").trim() : "";
}

function ensureProjectEditPenaltyBridgeListener() {
    if (window.__qgaProjectEditPenaltyBridgeListenerBound === true) {
        return;
    }

    window.__qgaProjectEditPenaltyBridgeListenerBound = true;
    window.addEventListener("message", handleProjectEditPenaltyBridgeMessage);
}

function handleProjectEditPenaltyBridgeMessage(event) {
    if (event.source !== window) {
        return;
    }

    const message = event.data;
    if (!message || message.source !== PROJECT_EDIT_PENALTY_BRIDGE_CHANNEL || message.direction !== "response") {
        return;
    }

    const requestId = String(message.requestId || "").trim();
    const pendingRequest = requestId ? projectEditPenaltyBridgeRequests.get(requestId) : null;
    if (!pendingRequest) {
        return;
    }

    projectEditPenaltyBridgeRequests.delete(requestId);
    clearTimeout(pendingRequest.timeoutId);

    if (message.success === true) {
        pendingRequest.resolve(message.payload || {});
        return;
    }

    pendingRequest.reject(message.error || new Error("Penalty bridge request failed"));
}

function ensureProjectEditPenaltyPageBridge() {
    if (projectEditPenaltyBridgeLoadPromise) {
        return projectEditPenaltyBridgeLoadPromise;
    }

    if (
        !(document.documentElement instanceof HTMLElement) ||
        typeof chrome === "undefined" ||
        !chrome.runtime ||
        typeof chrome.runtime.sendMessage !== "function"
    ) {
        projectEditPenaltyBridgeLoadPromise = Promise.reject(new Error("Penalty bridge injection is unavailable"));
        return projectEditPenaltyBridgeLoadPromise;
    }

    projectEditPenaltyBridgeLoadPromise = new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                target: "qga",
                type: "inject_project_edit_penalty_bridge"
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message || "Penalty bridge injection failed"));
                    return;
                }

                if (response && response.ok) {
                    resolve();
                    return;
                }

                reject(new Error(response && response.error ? response.error : "Penalty bridge injection failed"));
            }
        );
    }).catch((error) => {
        projectEditPenaltyBridgeLoadPromise = null;
        throw error instanceof Error ? error : new Error(String(error));
    });

    return projectEditPenaltyBridgeLoadPromise;
}

function getProjectEditPenaltyPageBridgeSource() {
    return `;(${projectEditPenaltyPageBridgeBootstrap.toString()})();`;
}

function projectEditPenaltyPageBridgeBootstrap() {
    if (window.__qgaProjectEditPenaltyPageBridgeInstalled === true) {
        return;
    }

    window.__qgaProjectEditPenaltyPageBridgeInstalled = true;

    const CHANNEL = "qga-project-edit-penalty";
    const GRID_SELECTOR = "#gridOpenEnds";
    const UPDATE_URL = "/lk/OpenEnds2/GroupUpdate";
    const PENALTY_ENTRY_ID = 1;
    const PENALTY_ENTRY_VALUE = "Penalty";

    window.addEventListener("message", (event) => {
        if (event.source !== window) {
            return;
        }

        const message = event.data;
        if (!message || message.source !== CHANNEL || message.direction !== "request") {
            return;
        }

        if (message.action === "toggle") {
            handleToggleRequest(message);
        }
    });

    async function handleToggleRequest(message) {
        const requestId = String(message && message.requestId || "").trim();
        const payload = message && message.payload && typeof message.payload === "object" ? message.payload : {};
        const rowUid = String(payload.rowUid || "").trim();
        const checked = payload.checked === true;

        try {
            if (!rowUid) {
                throw new Error("Penalty bridge rowUid is missing");
            }

            const gridRoot = document.querySelector(GRID_SELECTOR);
            const grid = getGrid(gridRoot);
            if (!grid) {
                throw new Error("Penalty bridge grid is unavailable");
            }

            const dataItem = getDataItemByRowUid(grid, rowUid);
            if (!dataItem) {
                throw new Error(`Penalty bridge dataItem is unavailable for rowUid ${rowUid}`);
            }

            const previousAutoCheckData = getAutoCheckEntries(dataItem);
            const previousAutoCheckString = getAutoCheckStringValue(dataItem);
            const previousChecked = getInitialState(dataItem);
            const nextAutoCheckData = buildNextAutoCheckData(previousAutoCheckData, checked);
            const nextAutoCheckString = buildRequestAutoCheckString(nextAutoCheckData);

            applyDataItemState(dataItem, nextAutoCheckData, nextAutoCheckString, checked);

            try {
                const response = await sendGroupUpdate(dataItem, nextAutoCheckData, nextAutoCheckString);
                const responseItem = getResponseItem(response, dataItem);
                if (responseItem) {
                    syncDataItemFromResponse(dataItem, responseItem);
                } else {
                    applyDataItemState(dataItem, nextAutoCheckData, nextAutoCheckString, checked);
                }

                const resolvedAutoCheckData = getAutoCheckEntries(dataItem);
                const resolvedAutoCheckString = getAutoCheckStringValue(dataItem);
                const resolvedChecked = getInitialState(dataItem);

                postResponse(requestId, true, {
                    checked: resolvedChecked,
                    autoCheckData: resolvedAutoCheckData,
                    autoCheckString: resolvedAutoCheckString
                });
            } catch (error) {
                applyDataItemState(dataItem, previousAutoCheckData, previousAutoCheckString, previousChecked);
                throw error;
            }
        } catch (error) {
            postResponse(requestId, false, null, serializeError(error));
        }
    }

    function postResponse(requestId, success, payload, error) {
        window.postMessage(
            {
                source: CHANNEL,
                direction: "response",
                requestId: requestId || "",
                success: success === true,
                payload: payload || null,
                error: error || null
            },
            "*"
        );
    }

    function serializeError(error) {
        if (!error) {
            return "Unknown penalty bridge error";
        }

        if (typeof error === "string") {
            return error;
        }

        if (typeof error.message === "string" && error.message) {
            return error.message;
        }

        return String(error);
    }

    function getGrid(gridRoot) {
        if (!(gridRoot instanceof HTMLElement)) {
            return null;
        }

        if (typeof window.jQuery === "function") {
            try {
                const grid = window.jQuery(gridRoot).data("kendoGrid");
                if (isGridLike(grid)) {
                    return grid;
                }
            } catch (error) {
            }
        }

        if (window.kendo && typeof window.kendo.widgetInstance === "function") {
            try {
                const grid = window.kendo.widgetInstance(gridRoot);
                if (isGridLike(grid)) {
                    return grid;
                }
            } catch (error) {
            }
        }

        return null;
    }

    function isGridLike(candidate) {
        return !!(
            candidate &&
            typeof candidate === "object" &&
            typeof candidate.dataItem === "function" &&
            candidate.dataSource &&
            typeof candidate.dataSource === "object"
        );
    }

    function getDataItemByRowUid(grid, rowUid) {
        if (!grid || !grid.dataSource || !rowUid) {
            return null;
        }

        if (typeof grid.dataSource.getByUid === "function") {
            try {
                const item = grid.dataSource.getByUid(rowUid);
                if (item) {
                    return item;
                }
            } catch (error) {
            }
        }

        return getDataSourceItems(grid.dataSource).find((item) => {
            return String(item && item.uid || "").trim() === rowUid;
        }) || null;
    }

    function getDataSourceItems(dataSource) {
        if (!dataSource || typeof dataSource !== "object") {
            return [];
        }

        try {
            if (typeof dataSource.data === "function") {
                return Array.from(dataSource.data() || []);
            }
        } catch (error) {
        }

        return Array.isArray(dataSource._data) ? dataSource._data.slice() : [];
    }

    function normalizeText(value) {
        return String(value == null ? "" : value)
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function getInitialState(dataItem) {
        if (!dataItem || typeof dataItem !== "object") {
            return false;
        }

        const autoCheckData = getAutoCheckEntries(dataItem);
        if (autoCheckData.some((entry) => isPenaltyAutoCheckEntry(entry))) {
            return true;
        }

        return normalizeText(dataItem.AutoCheckString).includes("penalty");
    }

    function getAutoCheckEntries(dataItem) {
        const rawEntries =
            dataItem && typeof dataItem === "object"
                ? Array.isArray(dataItem.AutoCheckData)
                    ? dataItem.AutoCheckData
                    : dataItem.AutoCheckData && typeof dataItem.AutoCheckData.toJSON === "function"
                        ? dataItem.AutoCheckData.toJSON()
                        : []
                : [];

        const normalizedEntries = rawEntries
            .map((entry) => normalizeAutoCheckEntry(entry))
            .filter((entry) => entry && entry.Value);

        if (normalizedEntries.length > 0) {
            return normalizedEntries;
        }

        return parseAutoCheckStringEntries(getAutoCheckStringValue(dataItem));
    }

    function getAutoCheckStringValue(dataItem) {
        return String(dataItem && dataItem.AutoCheckString != null ? dataItem.AutoCheckString : "").trim();
    }

    function normalizeAutoCheckEntry(entry) {
        if (!entry) {
            return null;
        }

        const numericId = Number(entry.Id != null ? entry.Id : entry.id);
        const value = String(entry.Value != null ? entry.Value : entry.value != null ? entry.value : "").trim();
        if (!value) {
            return null;
        }

        return {
            Id: Number.isFinite(numericId) ? numericId : 0,
            Value: value
        };
    }

    function parseAutoCheckStringEntries(value) {
        return String(value || "")
            .split(/[;,]/)
            .map((entryValue) => buildAutoCheckEntryFromValue(entryValue))
            .filter((entry) => entry && entry.Value);
    }

    function buildAutoCheckEntryFromValue(value) {
        const trimmedValue = String(value || "").trim();
        if (!trimmedValue) {
            return null;
        }

        const normalizedValue = normalizeText(trimmedValue);
        if (normalizedValue === normalizeText(PENALTY_ENTRY_VALUE)) {
            return {
                Id: PENALTY_ENTRY_ID,
                Value: PENALTY_ENTRY_VALUE
            };
        }

        if (normalizedValue === "brand") {
            return {
                Id: 2,
                Value: "Brand"
            };
        }

        return {
            Id: 0,
            Value: trimmedValue
        };
    }

    function isPenaltyAutoCheckEntry(entry) {
        const normalizedEntry = normalizeAutoCheckEntry(entry);
        if (!normalizedEntry) {
            return false;
        }

        return (
            normalizedEntry.Id === Number(PENALTY_ENTRY_ID) ||
            normalizeText(normalizedEntry.Value) === normalizeText(PENALTY_ENTRY_VALUE)
        );
    }

    function buildNextAutoCheckData(entries, includePenalty) {
        const nextEntries = Array.isArray(entries)
            ? entries
                .map((entry) => normalizeAutoCheckEntry(entry))
                .filter((entry) => entry && !isPenaltyAutoCheckEntry(entry))
            : [];

        if (includePenalty) {
            nextEntries.push({
                Id: Number(PENALTY_ENTRY_ID),
                Value: String(PENALTY_ENTRY_VALUE)
            });
        }

        return nextEntries.sort((left, right) => {
            const leftId = Number.isFinite(left && left.Id) ? left.Id : Number.MAX_SAFE_INTEGER;
            const rightId = Number.isFinite(right && right.Id) ? right.Id : Number.MAX_SAFE_INTEGER;
            if (leftId !== rightId) {
                return leftId - rightId;
            }

            return String(left && left.Value || "").localeCompare(String(right && right.Value || ""));
        });
    }

    function buildRequestAutoCheckString(entries) {
        if (!Array.isArray(entries) || entries.length !== 1) {
            return "";
        }

        return String(entries[0] && entries[0].Value || "").trim();
    }

    function applyDataItemState(dataItem, autoCheckData, autoCheckString, isChecked) {
        if (!dataItem || typeof dataItem !== "object") {
            return;
        }

        setDataItemField(
            dataItem,
            "AutoCheckData",
            autoCheckData.map((entry) => ({
                Id: entry.Id,
                Value: entry.Value
            }))
        );
        setDataItemField(dataItem, "AutoCheckString", autoCheckString);
        setDataItemField(dataItem, "QgaPenalty", isChecked === true);
    }

    function setDataItemField(dataItem, fieldName, value) {
        if (!dataItem || typeof dataItem !== "object" || !fieldName) {
            return;
        }

        dataItem[fieldName] = value;
    }

    async function sendGroupUpdate(dataItem, autoCheckData, autoCheckString) {
        const payload = buildGroupUpdatePayload(dataItem, autoCheckData, autoCheckString);

        if (typeof window.jQuery === "function" && window.jQuery.ajax) {
            return await new Promise((resolve, reject) => {
                window.jQuery.ajax({
                    url: UPDATE_URL,
                    type: "POST",
                    data: payload,
                    contentType: "application/x-www-form-urlencoded; charset=UTF-8",
                    processData: false,
                    headers: {
                        "X-Requested-With": "XMLHttpRequest"
                    }
                })
                    .done((response) => {
                        resolve(response);
                    })
                    .fail((jqXHR, textStatus, errorThrown) => {
                        reject(parseJqueryAjaxError(jqXHR, textStatus, errorThrown));
                    });
            });
        }

        const response = await fetch(UPDATE_URL, {
            method: "POST",
            credentials: "include",
            headers: {
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest"
            },
            body: payload
        });

        const responseText = await response.text();
        const responseData = parseResponseText(responseText);
        if (!response.ok) {
            throw responseData || new Error(`Penalty bridge request failed with status ${response.status}`);
        }

        return responseData;
    }

    function parseJqueryAjaxError(jqXHR, textStatus, errorThrown) {
        if (jqXHR && typeof jqXHR.responseJSON !== "undefined" && jqXHR.responseJSON != null) {
            return jqXHR.responseJSON;
        }

        if (jqXHR && typeof jqXHR.responseText === "string" && jqXHR.responseText.trim()) {
            return parseResponseText(jqXHR.responseText);
        }

        return errorThrown || textStatus || jqXHR || new Error("Penalty bridge jQuery.ajax request failed");
    }

    function parseResponseText(responseText) {
        const text = String(responseText || "").trim();
        if (!text) {
            return null;
        }

        try {
            return JSON.parse(text);
        } catch (error) {
            return text;
        }
    }

    function buildGroupUpdatePayload(dataItem, autoCheckData, autoCheckString) {
        const params = new URLSearchParams();
        const normalizedAutoCheckData = Array.isArray(autoCheckData) ? autoCheckData : [];
        const shouldSendAutoCheckData = normalizedAutoCheckData.length > 0;

        params.set("sort", "");
        params.set("group", "");
        params.set("filter", "");
        params.set("Id", stringifyPayloadValue(dataItem && dataItem.Id));
        params.set("Name", stringifyPayloadValue(dataItem && dataItem.Name));
        params.set("Label", stringifyPayloadValue(dataItem && dataItem.Label));
        params.set("Vars", stringifyPayloadValue(dataItem && dataItem.Vars));
        params.set("NotVerifiedCount", stringifyPayloadValue(dataItem && dataItem.NotVerifiedCount));
        params.set("NotVerifiedInterviewCount", stringifyPayloadValue(dataItem && dataItem.NotVerifiedInterviewCount));
        params.set("Order", stringifyPayloadValue(dataItem && dataItem.Order));
        params.set("IsCheck", stringifyBoolean(dataItem && dataItem.IsCheck));
        if (autoCheckString != null && String(autoCheckString).trim() !== "") {
            params.set("AutoCheckString", stringifyPayloadValue(autoCheckString));
        }
        params.set("IsMultiCheck", stringifyBoolean(dataItem && dataItem.IsMultiCheck));
        params.set("BrandTags", "");
        params.set("BrandTagsString", stringifyPayloadValue(dataItem && dataItem.BrandTagsString));

        if (shouldSendAutoCheckData) {
            normalizedAutoCheckData.forEach((entry, index) => {
                params.set(`AutoCheckData[${index}].Id`, stringifyPayloadValue(entry && entry.Id));
                params.set(`AutoCheckData[${index}].Value`, stringifyPayloadValue(entry && entry.Value));
            });
        }

        getBrandTags(dataItem).forEach((entry, index) => {
            params.set(`BrandTags[${index}].id`, stringifyPayloadValue(entry && entry.id));
            params.set(`BrandTags[${index}].description`, stringifyPayloadValue(entry && entry.description));
        });

        return params.toString();
    }

    function getBrandTags(dataItem) {
        const rawTags =
            dataItem && typeof dataItem === "object"
                ? Array.isArray(dataItem.BrandTags)
                    ? dataItem.BrandTags
                    : dataItem.BrandTags && typeof dataItem.BrandTags.toJSON === "function"
                        ? dataItem.BrandTags.toJSON()
                        : []
                : [];

        return rawTags
            .map((entry) => {
                const id = entry && (entry.id != null ? entry.id : entry.Id);
                const description = entry && (entry.description != null ? entry.description : entry.Description);

                return {
                    id: id == null ? "" : id,
                    description: description == null ? "" : description
                };
            })
            .filter((entry) => entry.id !== "" || entry.description !== "");
    }

    function stringifyPayloadValue(value) {
        return value == null ? "" : String(value);
    }

    function stringifyBoolean(value) {
        return value === true || String(value).toLowerCase() === "true" ? "true" : "false";
    }

    function getResponseItem(response, dataItem) {
        const rows = response && Array.isArray(response.Data) ? response.Data : [];
        if (!rows.length) {
            return null;
        }

        const targetId = stringifyPayloadValue(dataItem && dataItem.Id);
        return rows.find((row) => stringifyPayloadValue(row && row.Id) === targetId) || rows[0] || null;
    }

    function syncDataItemFromResponse(dataItem, responseItem) {
        if (!dataItem || typeof dataItem !== "object" || !responseItem || typeof responseItem !== "object") {
            return;
        }

        [
            "Id",
            "Name",
            "Label",
            "Vars",
            "NotVerifiedCount",
            "NotVerifiedInterviewCount",
            "Order",
            "IsCheck",
            "IsMultiCheck"
        ].forEach((fieldName) => {
            if (Object.prototype.hasOwnProperty.call(responseItem, fieldName)) {
                setDataItemField(dataItem, fieldName, responseItem[fieldName]);
            }
        });

        setDataItemField(dataItem, "QgaPenalty", getInitialState(dataItem));
    }
}

function requestProjectEditPenaltyBridgeToggle(row, checked) {
    const rowUid = getProjectEditPenaltyBridgeRowUid(row);
    if (!rowUid) {
        return null;
    }

    return createProjectEditPenaltyAsyncRequest(
        ensureProjectEditPenaltyPageBridge().then(() => {
            return new Promise((resolve, reject) => {
                const requestId = `qga-penalty-${Date.now()}-${++projectEditPenaltyBridgeRequestSeq}`;
                const timeoutId = setTimeout(() => {
                    projectEditPenaltyBridgeRequests.delete(requestId);
                    reject(new Error("Penalty bridge request timed out"));
                }, 15000);

                projectEditPenaltyBridgeRequests.set(requestId, {
                    resolve,
                    reject,
                    timeoutId
                });

                window.postMessage(
                    {
                        source: PROJECT_EDIT_PENALTY_BRIDGE_CHANNEL,
                        direction: "request",
                        action: "toggle",
                        requestId,
                        payload: {
                            rowUid,
                            checked: checked === true
                        }
                    },
                    "*"
                );
            });
        })
    );
}

function getProjectEditPenaltyBridgeRowUid(row) {
    return row instanceof HTMLTableRowElement ? String(row.getAttribute("data-uid") || "").trim() : "";
}

function getProjectEditPenaltyAutoCheckEntries(dataItem) {
    const rawEntries =
        dataItem && typeof dataItem === "object"
            ? Array.isArray(dataItem.AutoCheckData)
                ? dataItem.AutoCheckData
                : dataItem.AutoCheckData && typeof dataItem.AutoCheckData.toJSON === "function"
                    ? dataItem.AutoCheckData.toJSON()
                    : []
            : [];

    const normalizedEntries = rawEntries
        .map((entry) => normalizeProjectEditPenaltyAutoCheckEntry(entry))
        .filter((entry) => entry && entry.Value);

    if (normalizedEntries.length > 0) {
        return normalizedEntries;
    }

    return parseProjectEditPenaltyAutoCheckStringEntries(getProjectEditPenaltyAutoCheckStringValue(dataItem));
}

function normalizeProjectEditPenaltyAutoCheckEntry(entry) {
    if (!entry) {
        return null;
    }

    const numericId = Number(entry.Id != null ? entry.Id : entry.id);
    const value = String(entry.Value != null ? entry.Value : entry.value != null ? entry.value : "").trim();
    if (!value) {
        return null;
    }

    return {
        Id: Number.isFinite(numericId) ? numericId : 0,
        Value: value
    };
}

function parseProjectEditPenaltyAutoCheckStringEntries(value) {
    return String(value || "")
        .split(/[;,]/)
        .map((entryValue) => buildProjectEditPenaltyAutoCheckEntryFromValue(entryValue))
        .filter((entry) => entry && entry.Value);
}

function buildProjectEditPenaltyAutoCheckEntryFromValue(value) {
    const trimmedValue = String(value || "").trim();
    if (!trimmedValue) {
        return null;
    }

    const normalizedValue = normalizeProjectEditPenaltyText(trimmedValue);
    if (normalizedValue === normalizeProjectEditPenaltyText(PROJECT_EDIT_PENALTY_ENTRY_VALUE)) {
        return {
            Id: Number(PROJECT_EDIT_PENALTY_ENTRY_ID),
            Value: String(PROJECT_EDIT_PENALTY_ENTRY_VALUE)
        };
    }

    if (normalizedValue === "brand") {
        return {
            Id: 2,
            Value: "Brand"
        };
    }

    return {
        Id: 0,
        Value: trimmedValue
    };
}

function isProjectEditPenaltyAutoCheckEntry(entry) {
    const normalizedEntry = normalizeProjectEditPenaltyAutoCheckEntry(entry);
    if (!normalizedEntry) {
        return false;
    }

    return (
        normalizedEntry.Id === Number(PROJECT_EDIT_PENALTY_ENTRY_ID) ||
        normalizeProjectEditPenaltyText(normalizedEntry.Value) === normalizeProjectEditPenaltyText(PROJECT_EDIT_PENALTY_ENTRY_VALUE)
    );
}

function buildProjectEditPenaltyNextAutoCheckData(entries, includePenalty) {
    const nextEntries = Array.isArray(entries)
        ? entries
            .map((entry) => normalizeProjectEditPenaltyAutoCheckEntry(entry))
            .filter((entry) => entry && !isProjectEditPenaltyAutoCheckEntry(entry))
        : [];

    if (includePenalty) {
        nextEntries.push({
            Id: Number(PROJECT_EDIT_PENALTY_ENTRY_ID),
            Value: String(PROJECT_EDIT_PENALTY_ENTRY_VALUE)
        });
    }

    return nextEntries.sort((left, right) => {
        const leftId = Number.isFinite(left && left.Id) ? left.Id : Number.MAX_SAFE_INTEGER;
        const rightId = Number.isFinite(right && right.Id) ? right.Id : Number.MAX_SAFE_INTEGER;
        if (leftId !== rightId) {
            return leftId - rightId;
        }

        return String(left && left.Value || "").localeCompare(String(right && right.Value || ""));
    });
}

function buildProjectEditPenaltyRequestAutoCheckString(entries) {
    if (!Array.isArray(entries) || entries.length !== 1) {
        return "";
    }

    return String(entries[0] && entries[0].Value || "").trim();
}

function buildProjectEditPenaltyDisplayAutoCheckString(entries, fallbackValue) {
    if (Array.isArray(entries) && entries.length > 0) {
        return entries
            .map((entry) => String(entry && entry.Value || "").trim())
            .filter(Boolean)
            .join(", ");
    }

    const normalizedFallbackValue = String(fallbackValue || "").trim();
    return normalizedFallbackValue || "Не выбрано";
}

function getProjectEditPenaltyAutoCheckStringValue(dataItem) {
    return String(dataItem && dataItem.AutoCheckString != null ? dataItem.AutoCheckString : "").trim();
}

function applyProjectEditPenaltyDataItemState(dataItem, autoCheckData, autoCheckString, isChecked) {
    if (!dataItem || typeof dataItem !== "object") {
        return;
    }

    setProjectEditPenaltyDataItemField(
        dataItem,
        "AutoCheckData",
        autoCheckData.map((entry) => ({
            Id: entry.Id,
            Value: entry.Value
        }))
    );
    setProjectEditPenaltyDataItemField(dataItem, "AutoCheckString", autoCheckString);
    setProjectEditPenaltyDataItemField(dataItem, PROJECT_EDIT_PENALTY_FIELD, isChecked === true);
}

function setProjectEditPenaltyDataItemField(dataItem, fieldName, value) {
    if (!dataItem || typeof dataItem !== "object" || !fieldName) {
        return;
    }

    dataItem[fieldName] = value;
}

function sendProjectEditPenaltyGroupUpdate(dataItem, autoCheckData, autoCheckString) {
    const payload = buildProjectEditPenaltyGroupUpdatePayload(dataItem, autoCheckData, autoCheckString);

    if (typeof window.jQuery === "function" && window.jQuery.ajax) {
        return window.jQuery.ajax({
            url: PROJECT_EDIT_PENALTY_UPDATE_URL,
            type: "POST",
            data: payload,
            contentType: "application/x-www-form-urlencoded; charset=UTF-8",
            processData: false,
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            }
        });
    }

    if (typeof fetch === "function") {
        return createProjectEditPenaltyAsyncRequest(
            fetch(PROJECT_EDIT_PENALTY_UPDATE_URL, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Accept": "application/json, text/plain, */*",
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: payload
            }).then(async (response) => {
                const responseText = await response.text();
                const responseData = parseProjectEditPenaltyResponseText(responseText);

                if (!response.ok) {
                    throw responseData || new Error(`Penalty toggle request failed with status ${response.status}`);
                }

                return responseData;
            })
        );
    }

    return createProjectEditPenaltyAsyncRequest(Promise.reject(new Error("Penalty toggle transport is unavailable")));
}

function createProjectEditPenaltyAsyncRequest(promise) {
    let doneCallback = null;
    let failCallback = null;
    let alwaysCallback = null;

    Promise.resolve(promise)
        .then((result) => {
            if (typeof doneCallback === "function") {
                doneCallback(result);
            }
        })
        .catch((error) => {
            if (typeof failCallback === "function") {
                failCallback(error);
            }
        })
        .finally(() => {
            if (typeof alwaysCallback === "function") {
                alwaysCallback();
            }
        });

    return {
        done(callback) {
            doneCallback = callback;
            return this;
        },
        fail(callback) {
            failCallback = callback;
            return this;
        },
        always(callback) {
            alwaysCallback = callback;
            return this;
        }
    };
}

function parseProjectEditPenaltyResponseText(responseText) {
    const text = String(responseText || "").trim();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return text;
    }
}

function buildProjectEditPenaltyGroupUpdatePayload(dataItem, autoCheckData, autoCheckString) {
    const params = new URLSearchParams();
    const normalizedAutoCheckData = Array.isArray(autoCheckData) ? autoCheckData : [];
    const shouldSendAutoCheckData = normalizedAutoCheckData.length > 0;

    params.set("sort", "");
    params.set("group", "");
    params.set("filter", "");
    params.set("Id", stringifyProjectEditPenaltyPayloadValue(dataItem && dataItem.Id));
    params.set("Name", stringifyProjectEditPenaltyPayloadValue(dataItem && dataItem.Name));
    params.set("Label", stringifyProjectEditPenaltyPayloadValue(dataItem && dataItem.Label));
    params.set("Vars", stringifyProjectEditPenaltyPayloadValue(dataItem && dataItem.Vars));
    params.set("NotVerifiedCount", stringifyProjectEditPenaltyPayloadValue(dataItem && dataItem.NotVerifiedCount));
    params.set(
        "NotVerifiedInterviewCount",
        stringifyProjectEditPenaltyPayloadValue(dataItem && dataItem.NotVerifiedInterviewCount)
    );
    params.set("Order", stringifyProjectEditPenaltyPayloadValue(dataItem && dataItem.Order));
    params.set("IsCheck", stringifyProjectEditPenaltyBoolean(dataItem && dataItem.IsCheck));
    if (autoCheckString != null && String(autoCheckString).trim() !== "") {
        params.set("AutoCheckString", stringifyProjectEditPenaltyPayloadValue(autoCheckString));
    }
    params.set("IsMultiCheck", stringifyProjectEditPenaltyBoolean(dataItem && dataItem.IsMultiCheck));
    params.set("BrandTags", "");
    params.set("BrandTagsString", stringifyProjectEditPenaltyPayloadValue(dataItem && dataItem.BrandTagsString));

    if (shouldSendAutoCheckData) {
        normalizedAutoCheckData.forEach((entry, index) => {
            params.set(`AutoCheckData[${index}].Id`, stringifyProjectEditPenaltyPayloadValue(entry && entry.Id));
            params.set(`AutoCheckData[${index}].Value`, stringifyProjectEditPenaltyPayloadValue(entry && entry.Value));
        });
    }

    getProjectEditPenaltyBrandTags(dataItem).forEach((entry, index) => {
        params.set(`BrandTags[${index}].id`, stringifyProjectEditPenaltyPayloadValue(entry && entry.id));
        params.set(`BrandTags[${index}].description`, stringifyProjectEditPenaltyPayloadValue(entry && entry.description));
    });

    return params.toString();
}

function getProjectEditPenaltyBrandTags(dataItem) {
    const rawTags =
        dataItem && typeof dataItem === "object"
            ? Array.isArray(dataItem.BrandTags)
                ? dataItem.BrandTags
                : dataItem.BrandTags && typeof dataItem.BrandTags.toJSON === "function"
                    ? dataItem.BrandTags.toJSON()
                    : []
            : [];

    return rawTags
        .map((entry) => {
            const id = entry && (entry.id != null ? entry.id : entry.Id);
            const description = entry && (entry.description != null ? entry.description : entry.Description);

            return {
                id: id == null ? "" : id,
                description: description == null ? "" : description
            };
        })
        .filter((entry) => entry.id !== "" || entry.description !== "");
}

function stringifyProjectEditPenaltyPayloadValue(value) {
    return value == null ? "" : String(value);
}

function stringifyProjectEditPenaltyBoolean(value) {
    return value === true || String(value).toLowerCase() === "true" ? "true" : "false";
}

function getProjectEditPenaltyResponseItem(response, dataItem) {
    const rows = response && Array.isArray(response.Data) ? response.Data : [];
    if (!rows.length) {
        return null;
    }

    const targetId = stringifyProjectEditPenaltyPayloadValue(dataItem && dataItem.Id);
    return rows.find((row) => stringifyProjectEditPenaltyPayloadValue(row && row.Id) === targetId) || rows[0] || null;
}

function hasProjectEditPenaltyAutoCheckStateInResponse(responseItem) {
    return !!(
        responseItem &&
        typeof responseItem === "object" &&
        (
            Object.prototype.hasOwnProperty.call(responseItem, "AutoCheckData") ||
            Object.prototype.hasOwnProperty.call(responseItem, "AutoCheckString")
        )
    );
}

function syncProjectEditPenaltyDataItemFromResponse(dataItem, responseItem) {
    if (!dataItem || typeof dataItem !== "object" || !responseItem || typeof responseItem !== "object") {
        return;
    }

    [
        "Id",
        "Name",
        "Label",
        "Vars",
        "NotVerifiedCount",
        "NotVerifiedInterviewCount",
        "Order",
        "IsCheck",
        "IsMultiCheck",
        "AutoCheckData",
        "AutoCheckString",
        "BrandTags",
        "BrandTagsString"
    ].forEach((fieldName) => {
        if (Object.prototype.hasOwnProperty.call(responseItem, fieldName)) {
            setProjectEditPenaltyDataItemField(dataItem, fieldName, responseItem[fieldName]);
        }
    });

    setProjectEditPenaltyDataItemField(
        dataItem,
        PROJECT_EDIT_PENALTY_FIELD,
        getProjectEditPenaltyInitialState(dataItem)
    );
}

function syncProjectEditPenaltyAutoCheckCell(row, autoCheckData, autoCheckString) {
    if (!(row instanceof HTMLTableRowElement)) {
        return;
    }

    const gridRoot = row.closest(PROJECT_EDIT_PENALTY_GRID_SELECTOR);
    const autoCheckIndex = getProjectEditPenaltyFieldIndex(gridRoot, "AutoCheckData");
    if (autoCheckIndex < 0) {
        return;
    }

    const cell = row.cells[autoCheckIndex];
    if (!(cell instanceof HTMLTableCellElement)) {
        return;
    }

    const displayValue = buildProjectEditPenaltyDisplayAutoCheckString(autoCheckData, autoCheckString);
    const textHolder = cell.querySelector("span");
    if (textHolder instanceof HTMLElement) {
        textHolder.textContent = displayValue;
        return;
    }

    cell.textContent = displayValue;
}

function getProjectEditPenaltyFieldIndex(gridRoot, fieldName) {
    const headerRow = getProjectEditPenaltyHeaderRow(gridRoot);
    if (!(headerRow instanceof HTMLTableRowElement) || !fieldName) {
        return -1;
    }

    const header = headerRow.querySelector(`th[role='columnheader'][data-field='${fieldName}']`);
    return header instanceof HTMLTableCellElement && Number.isFinite(header.cellIndex) ? header.cellIndex : -1;
}
