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
        : 5;

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
var PROJECT_EDIT_STATS_RELEVANT_STORAGE_KEYS =
    typeof PROJECT_EDIT_STATS_RELEVANT_STORAGE_KEYS !== "undefined" &&
    PROJECT_EDIT_STATS_RELEVANT_STORAGE_KEYS instanceof Set
        ? PROJECT_EDIT_STATS_RELEVANT_STORAGE_KEYS
        : new Set([VERIFY_INCORRECT_IDS_STORAGE_KEY, RATING_INCORRECT_IDS_STORAGE_KEY]);

function setupProjectEditStatsWidget() {
    ensureProjectEditStatsObserver();
    refreshProjectEditStatsRatingDataIfStale();
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
    window.addEventListener(PROJECT_EDIT_STATS_DIRTY_EVENT_NAME, handleProjectEditStatsDirtyEvent);
    window.addEventListener("storage", handleProjectEditStatsStorageChange);
    window.addEventListener("focus", handleProjectEditStatsResume);
    document.addEventListener("visibilitychange", handleProjectEditStatsResume);
}

function handleProjectEditStatsDirtyEvent(event) {
    const storageKey =
        event && event.detail && typeof event.detail.storageKey === "string"
            ? event.detail.storageKey
            : "";

    if (storageKey && !PROJECT_EDIT_STATS_RELEVANT_STORAGE_KEYS.has(storageKey)) {
        return;
    }

    scheduleProjectEditStatsSync(0);
}

function handleProjectEditStatsStorageChange(event) {
    if (!event || event.storageArea !== localStorage) {
        return;
    }

    const storageKey = typeof event.key === "string" ? event.key : "";
    if (!PROJECT_EDIT_STATS_RELEVANT_STORAGE_KEYS.has(storageKey)) {
        return;
    }

    reloadProjectEditStatsStateFromStorage(storageKey);
    scheduleProjectEditStatsSync(0);
}

function handleProjectEditStatsResume() {
    if (document.visibilityState === "hidden" || !isProjectEditStatsHashAllowed()) {
        return;
    }

    refreshProjectEditStatsRatingDataIfStale();
    scheduleProjectEditStatsSync(0);
}

function reloadProjectEditStatsStateFromStorage(storageKey) {
    switch (storageKey) {
        case VERIFY_INCORRECT_IDS_STORAGE_KEY:
            if (typeof loadVerifyIncorrectIdsState === "function") {
                verifyIncorrectIdsState = loadVerifyIncorrectIdsState();
            }
            break;
        case RATING_INCORRECT_IDS_STORAGE_KEY:
            if (typeof loadRatingIncorrectIdsState === "function") {
                ratingIncorrectIdsState = loadRatingIncorrectIdsState();
            }
            break;
        default:
            break;
    }
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
    if (PROJECT_EDIT_STATS_ALLOWED_HASHES.has(hash)) {
        return true;
    }

    // После некоторых действий (например, pasteBrandTags) хэш может временно очищаться.
    // Если при этом на странице виден блок статистики проекта, оставляем виджет активным.
    if (!hash) {
        const statsRoot = document.getElementById("divStats");
        return statsRoot instanceof HTMLElement;
    }

    return false;
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
    const force = !!(arguments[1] && arguments[1].force);
    if (
        !key ||
        typeof ensureRatingIncorrectIdsLoaded !== "function"
    ) {
        return;
    }

    if (!force && (hasProjectEditStatsRatingData(key) || projectEditStatsRatingRequestedProjects.has(key))) {
        return;
    }

    if (projectEditStatsRatingPendingProjects.has(key)) {
        return;
    }

    if (force) {
        projectEditStatsRatingRequestedProjects.delete(key);
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

function getProjectEditStatsRatingUpdatedAt(projectId) {
    if (typeof getRatingIncorrectIdsUpdatedAt !== "function") {
        return 0;
    }

    return getRatingIncorrectIdsUpdatedAt(projectId);
}

function isProjectEditStatsRatingExpired(projectId) {
    const updatedAt = getProjectEditStatsRatingUpdatedAt(projectId);
    if (!updatedAt) {
        return true;
    }

    return Date.now() - updatedAt >= PROJECT_EDIT_STATS_RATING_TTL_MS;
}

function refreshProjectEditStatsRatingDataIfStale() {
    if (!isProjectEditStatsHashAllowed()) {
        return false;
    }

    const projectId = getProjectEditStatsProjectId();
    if (!projectId) {
        return false;
    }

    if (!hasProjectEditStatsRatingData(projectId)) {
        ensureProjectEditStatsRatingData(projectId);
        return true;
    }

    if (projectEditStatsRatingPendingProjects.has(projectId) || !isProjectEditStatsRatingExpired(projectId)) {
        return false;
    }

    ensureProjectEditStatsRatingData(projectId, { force: true });
    return true;
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

