"use strict";

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

    async function collectPyrusProjectPayloadWithExpansion() {
        expandPyrusGroupByTitle("сетап");
        expandPyrusGroupByTitle("ссылки");
        await wait(220);

        const expandedInsideSetup = expandCollapsedGroupsInsideSetup();
        if (expandedInsideSetup > 0) {
            await wait(260);
        }

        const expandedSecondPass = expandCollapsedGroupsInsideSetup();
        if (expandedSecondPass > 0) {
            await wait(320);
        }

        return collectPyrusProjectPayload();
    }


    var PYRUS_FIELD_LABELS = typeof PYRUS_FIELD_LABELS !== "undefined" && PYRUS_FIELD_LABELS ? PYRUS_FIELD_LABELS : {
        projectName: "Название проекта",
        projectId: "ProjectID",
        plan: "N",
        dbName: "База ОД"
    };

    function collectPyrusProjectPayload() {
        const notFoundByXPath = [];
        const fieldMap = collectPyrusFormFieldMap();

        let projectId = sanitizeProjectId(
            findPyrusFormFieldValue(fieldMap, PYRUS_FIELD_LABEL_ALIASES.projectId, (v) => /\d{4,}/.test(v))
        );
        if (!projectId) {
            projectId = extractProjectIdFromPyrusLinks(fieldMap);
        }
        if (!projectId) {
            notFoundByXPath.push(PYRUS_FIELD_LABELS.projectId);
        }

        const plan = sanitizePlan(
            findPyrusFormFieldValue(fieldMap, PYRUS_FIELD_LABEL_ALIASES.plan, (v) => /^\d{1,7}$/.test(v.trim()))
        );
        if (!plan) {
            notFoundByXPath.push(PYRUS_FIELD_LABELS.plan);
        }

        let projectName = cleanupProjectName(
            findPyrusFormFieldValue(fieldMap, PYRUS_FIELD_LABEL_ALIASES.projectName)
        );
        if (!projectName) {
            projectName = cleanupProjectName(extractPyrusProjectName());
        }
        if (!projectName) {
            notFoundByXPath.push(PYRUS_FIELD_LABELS.projectName);
        }

        const dbName = sanitizeDbName(
            findPyrusFormFieldValue(fieldMap, PYRUS_FIELD_LABEL_ALIASES.dbName)
        );
        if (!dbName) {
            notFoundByXPath.push(PYRUS_FIELD_LABELS.dbName);
        }

        console.info("[QGA] Pyrus-поля (по меткам):", {
            projectName,
            projectId,
            plan,
            dbName,
            notFoundByXPath
        });

        return {
            projectName,
            projectId,
            plan,
            dbName,
            notFoundByXPath
        };
    }

    function extractProjectIdFromPyrusLinks(fieldMap) {
        const linkAliases = ["ссылка на pr", "ссылка на чистилку"];
        const idPattern = /(?:panelrider\.com\/projects\/managements\/|Project\/Edit\/)(\d{4,})/;

        for (const alias of linkAliases) {
            const url = findPyrusFormFieldValue(fieldMap, [alias]);
            if (!url) {
                continue;
            }
            const match = url.match(idPattern);
            if (match) {
                return match[1];
            }
        }

        const links = document.querySelectorAll(
            "a[href*='panelrider.com/projects/managements/'], a[href*='Project/Edit/']"
        );
        for (const link of links) {
            const href = link.getAttribute("href") || "";
            const match = href.match(idPattern);
            if (match) {
                return match[1];
            }
        }

        return "";
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
                state.pyrusGroupsExpandedByExtension.add(titlePart);
            }
        }

        return expanded;
    }

    function collapsePyrusGroupByTitle(titlePart) {
        const target = normalizeSingleLine(titlePart).toLowerCase();
        if (!target) {
            return 0;
        }

        const buttons = getPyrusGroupTitleButtons();
        let collapsed = 0;

        for (const button of buttons) {
            const title = getPyrusGroupButtonTitle(button).toLowerCase();
            if (!title || !title.includes(target)) {
                continue;
            }
            if (isPyrusGroupButtonCollapsed(button)) {
                continue;
            }

            if (clickPyrusGroupButton(button)) {
                collapsed += 1;
            }
        }

        return collapsed;
    }

    function collapsePyrusGroupsExpandedByExtension() {
        const groups = Array.from(state.pyrusGroupsExpandedByExtension);
        state.pyrusGroupsExpandedByExtension.clear();
        for (const group of groups) {
            collapsePyrusGroupByTitle(group);
        }
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
                state.pyrusGroupsExpandedByExtension.add(title);
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
