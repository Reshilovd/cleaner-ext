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
