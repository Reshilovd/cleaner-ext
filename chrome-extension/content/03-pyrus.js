"use strict";

    function observePyrusPageForQuickLinks() {
        if (!document.body) {
            return;
        }

        let timer = null;
        const observer = new MutationObserver((mutations) => {
            const ourButton = document.getElementById(PYRUS_QUICK_FILL_BUTTON_ID);
            const isOurChange = mutations.every((m) => ourButton && (ourButton === m.target || ourButton.contains(m.target)));
            if (isOurChange) {
                return;
            }
            clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                removeLegacyPyrusCopyButton();
                ensurePyrusQuickFillLinks();
            }, 180);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function removeLegacyPyrusCopyButton() {
        const legacyButton = document.getElementById(PYRUS_COPY_BUTTON_ID);
        if (legacyButton) {
            legacyButton.remove();
        }

        const legacyQuickFillButtons = document.querySelectorAll(`.${PYRUS_QUICK_FILL_LINK_CLASS}`);
        for (const button of legacyQuickFillButtons) {
            if (button.id === PYRUS_QUICK_FILL_BUTTON_ID) {
                continue;
            }
            button.remove();
        }
    }

    function ensurePyrusQuickFillLinks() {
        if (!isPyrusTaskIdPage()) {
            removeInjectedPyrusQuickFillButtons();
            return false;
        }

        const anchorControl = findPyrusQuickFillReferenceControl();
        if (!anchorControl) {
            console.info("[QGA] Кнопка В CleanerUI: не найдено место вставки (Новый клиент/Чистилка/Inspector Bot)");
            return false;
        }

        const referenceNote = anchorControl.closest(".formFieldNote") || anchorControl.closest(".formFieldButtonWrapper");
        const insertionAnchor = referenceNote || anchorControl;

        const existingButton = document.getElementById(PYRUS_QUICK_FILL_BUTTON_ID);
        if (existingButton) {
            const existingWrapper = existingButton.closest(`.${PYRUS_QUICK_FILL_WRAPPER_CLASS}`) || existingButton;
            if (insertionAnchor.nextElementSibling === existingWrapper) {
                return true;
            }
        }

        removeInjectedPyrusQuickFillButtons();

        const wrapper = createPyrusQuickFillWrapper(referenceNote);
        const button = buildPyrusQuickFillButton(anchorControl);
        if (!button) {
            return false;
        }

        const buttonContainer = wrapper.querySelector(".formFieldNoteControl") || wrapper;
        buttonContainer.appendChild(button);
        insertionAnchor.insertAdjacentElement("afterend", wrapper);

        console.info("[QGA] Кнопка В CleanerUI: добавлена рядом с кнопкой Новый клиент");
        return true;
    }

    function bindPyrusHashChange() {
        if (state.pyrusHashListenerAttached) {
            return;
        }

        window.addEventListener("hashchange", () => {
            removeLegacyPyrusCopyButton();
            ensurePyrusQuickFillLinks();
        });
        state.pyrusHashListenerAttached = true;
    }

    function isPyrusTaskIdPage() {
        const hash = normalizeSingleLine(window.location.hash || "").toLowerCase();
        return /^#id\d+/.test(hash);
    }

    function buildPyrusQuickFillButton(referenceControl) {
        if (!referenceControl) {
            return null;
        }

        const button = document.createElement("a");
        button.href = "#";
        button.id = PYRUS_QUICK_FILL_BUTTON_ID;
        button.className = `linkButton linkButton_theme_gray formFieldNoteButton ${PYRUS_QUICK_FILL_LINK_CLASS}`.trim();
        button.title = "Скопировать данные проекта, открыть CleanerUI и заполнить форму";
        button.setAttribute("role", "button");

        const textSpan = document.createElement("span");
        textSpan.className = "formFieldNoteButton_text";
        textSpan.textContent = "Сетап Чистилки";
        button.appendChild(textSpan);

        button.addEventListener("click", handlePyrusQuickFillClick);

        return button;
    }

    function createPyrusQuickFillWrapper(referenceNote) {
        if (referenceNote && referenceNote.classList.contains("formFieldNote")) {
            const outer = document.createElement("div");
            outer.className = [referenceNote.className, PYRUS_QUICK_FILL_WRAPPER_CLASS].filter(Boolean).join(" ");
            const style = referenceNote.getAttribute("style");
            if (style) {
                outer.setAttribute("style", style);
            }
            outer.style.flex = "0 0 auto";
            outer.style.width = "fit-content";

            const content = document.createElement("div");
            content.className = "formFieldContent formFieldContent_small formFieldNote__content";

            const control = document.createElement("div");
            control.className = "formFieldNoteControl";

            content.appendChild(control);
            outer.appendChild(content);
            return outer;
        }

        const wrapper = document.createElement("div");
        wrapper.className = PYRUS_QUICK_FILL_WRAPPER_CLASS;
        wrapper.style.display = "inline-block";
        wrapper.style.verticalAlign = "top";
        return wrapper;
    }

    function findPyrusQuickFillReferenceControl() {
        const controls = Array.from(document.querySelectorAll("button, a"))
            .filter((node) => isElementVisible(node));

        const priorities = [
            "новый клиент (заявку юристу)",
            "новый клиент",
            "inspector bot",
            "чистилка",
            "генерилка",
            "добавить подзадачу",
            "считалка"
        ];

        for (const marker of priorities) {
            const match = controls.find((node) => isPyrusQuickFillReferenceText(node, marker));
            if (match) {
                return match;
            }
        }

        return null;
    }

    function isPyrusQuickFillReferenceText(node, marker) {
        if (!node || !marker) {
            return false;
        }

        const text = normalizeSearchText(node.textContent || "");
        const normalizedMarker = normalizeSearchText(marker);
        return Boolean(text) && Boolean(normalizedMarker) && text.includes(normalizedMarker);
    }

    function removeInjectedPyrusQuickFillButtons() {
        const selectors = [
            `#${PYRUS_QUICK_FILL_BUTTON_ID}`,
            `.${PYRUS_QUICK_FILL_LINK_CLASS}`,
            `.${PYRUS_QUICK_FILL_WRAPPER_CLASS}`
        ];
        for (const selector of selectors) {
            const nodes = document.querySelectorAll(selector);
            for (const node of nodes) {
                node.remove();
            }
        }
    }

    function normalizeSearchText(value) {
        return normalizeSingleLine(value)
            .toLowerCase()
            .replace(/ё/g, "е")
            .replace(/[^\p{L}\p{N}\s:.-]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    async function handlePyrusQuickFillClick(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const button = event && event.currentTarget instanceof HTMLElement
            ? event.currentTarget
            : null;

        if (button && button.dataset.qgaBusy === "1") {
            return;
        }

        if (button) {
            button.dataset.qgaBusy = "1";
            if (button instanceof HTMLButtonElement) {
                button.disabled = true;
            } else {
                button.setAttribute("aria-disabled", "true");
                button.style.pointerEvents = "none";
                button.style.opacity = "0.6";
            }
        }

        try {
            const result = await copyPyrusPayloadToStorage();
            if (!result.ok) {
                alert(result.message);
                return;
            }

            collapsePyrusGroupsExpandedByExtension();

            const cleanerUrl = buildCleanerAutoFillUrl();
            const openResult = await openCleanerInNewTab(cleanerUrl);
            if (!openResult.ok) {
                alert("Не удалось открыть CleanerUI в новой вкладке. Проверьте, что расширение обновлено, и повторите.");
                return;
            }

        } finally {
            if (button) {
                if (button instanceof HTMLButtonElement) {
                    button.disabled = false;
                } else {
                    button.removeAttribute("aria-disabled");
                    button.style.pointerEvents = "";
                    button.style.opacity = "";
                }
                delete button.dataset.qgaBusy;
            }
        }
    }

    async function copyPyrusPayloadToStorage() {
        // Очистка localStorage перед копированием новых данных
        localStorage.removeItem(PROJECT_PREFILL_STORAGE_KEY);
        localStorage.removeItem(PROJECT_PREFILL_STORAGE_FALLBACK_KEY);

        const rawPayload = await collectPyrusProjectPayloadWithExpansion();
        const notFoundByXPath = rawPayload.notFoundByXPath || [];

        const payload = {
            projectName: rawPayload.projectName,
            projectId: rawPayload.projectId,
            plan: rawPayload.plan,
            dbName: rawPayload.dbName
        };

        const hasAnyValue = Boolean(payload.projectName || payload.projectId || payload.plan || payload.dbName);
        if (!hasAnyValue) {
            const notFoundMsg = notFoundByXPath.length > 0
                ? ` Не удалось найти на странице: ${notFoundByXPath.join(", ")}.`
                : "";
            return {
                ok: false,
                message: `Не удалось найти поля на странице Pyrus.${notFoundMsg} Проверьте, что карточка проекта полностью открыта и группа «Сетап» раскрыта.`
            };
        }

        payload.sourceUrl = window.location.href;
        payload.sourceTitle = document.title || "";
        payload.copiedAt = new Date().toISOString();
        payload.notFoundByXPath = notFoundByXPath;

        const saved = await saveProjectPayload(payload);
        if (!saved) {
            return {
                ok: false,
                message: "Не удалось сохранить данные в хранилище расширения."
            };
        }

        return {
            ok: true,
            payload,
            missing: collectMissingProjectPayloadFields(payload)
        };
    }

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

    function buildCleanerAutoFillUrl() {
        const url = new URL("https://clr.env7.biz/lk");
        url.searchParams.set(CLEANER_AUTO_FILL_QUERY_KEY, "1");
        url.searchParams.set("_t", Date.now().toString());
        return url.toString();
    }

    function openCleanerInNewTab(url) {
        return new Promise((resolve) => {
            const runtime = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage
                ? chrome.runtime
                : null;

            if (runtime) {
                try {
                    runtime.sendMessage(
                        {
                            target: "qga",
                            type: "open_new_tab",
                            url
                        },
                        (response) => {
                            const runtimeError = getChromeRuntimeLastErrorMessage();
                            if (runtimeError) {
                                resolve(tryOpenInNewTabViaWindow(url));
                                return;
                            }
                            if (response && response.ok) {
                                resolve({ ok: true });
                                return;
                            }
                            resolve(tryOpenInNewTabViaWindow(url));
                        }
                    );
                    return;
                } catch (error) {
                    resolve(tryOpenInNewTabViaWindow(url));
                    return;
                }
            }

            resolve(tryOpenInNewTabViaWindow(url));
        });
    }

    function tryOpenInNewTabViaWindow(url) {
        let popup = null;
        try {
            popup = window.open(url, "_blank", "noopener");
        } catch (error) {
            popup = null;
        }

        return popup ? { ok: true } : { ok: false };
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

    function hasCleanerAutoFillRequest() {
        try {
            const url = new URL(window.location.href);
            return url.searchParams.get(CLEANER_AUTO_FILL_QUERY_KEY) === "1";
        } catch (error) {
            return false;
        }
    }

    function clearCleanerAutoFillRequest() {
        try {
            const url = new URL(window.location.href);
            if (!url.searchParams.has(CLEANER_AUTO_FILL_QUERY_KEY)) {
                return;
            }

            url.searchParams.delete(CLEANER_AUTO_FILL_QUERY_KEY);
            const search = url.searchParams.toString();
            const nextUrl = `${url.pathname}${search ? `?${search}` : ""}${url.hash || ""}`;
            window.history.replaceState({}, "", nextUrl);
        } catch (error) {
            // ignore
        }
    }

    async function runCleanerAutoFillFlow() {
        const payload = await readStoredProjectPayload();
        if (!payload) {
            clearCleanerAutoFillRequest();
            alert("Нет сохраненных данных. Сначала нажмите кнопку \"В CleanerUI\" в верхнем блоке кнопок на странице Pyrus (рядом с Новый клиент).");
            return;
        }

        const opened = await ensureCleanerProjectFormOpen();
        if (!opened) {
            clearCleanerAutoFillRequest();
            alert("Не удалось открыть форму \"Добавить проект\" в CleanerUI автоматически. Откройте форму вручную.");
            return;
        }

        const applied = await applyProjectPayloadToCleanerFormWithRetries(payload, 30, 180);
        clearCleanerAutoFillRequest();

        if (applied.length === 0) {
            alert("Данные проекта найдены, но форму не удалось заполнить автоматически.");
            return;
        }

        const notFoundByXPath = payload.notFoundByXPath;
        if (notFoundByXPath && notFoundByXPath.length > 0) {
            alert(`Не удалось найти на странице: ${notFoundByXPath.join(", ")}. Остальные поля заполнены.`);
        }
    }

    async function ensureCleanerProjectFormOpen() {
        if (isCleanerProjectFormOpen()) {
            return true;
        }

        let openButton = null;
        for (let attempt = 0; attempt < 80; attempt += 1) {
            openButton = findCleanerProjectOpenButton();
            if (openButton) {
                break;
            }
            await wait(120);
        }

        if (!openButton) {
            return false;
        }

        openButton.click();

        for (let attempt = 0; attempt < 80; attempt += 1) {
            await wait(140);
            if (isCleanerProjectFormOpen()) {
                return true;
            }
        }

        return false;
    }

    function isCleanerProjectFormOpen() {
        const projectNameInput = document.querySelector("#ProjectName");
        if (!projectNameInput) {
            return false;
        }

        return isElementVisible(projectNameInput);
    }

    function findCleanerProjectOpenButton() {
        const candidates = Array.from(document.querySelectorAll("button, a, [role='button']"));
        for (const candidate of candidates) {
            if (!candidate) {
                continue;
            }
            if (!isElementVisible(candidate)) {
                continue;
            }

            const text = normalizeSingleLine(candidate.textContent || "").toLowerCase();
            if (!text) {
                continue;
            }

            if (text.includes("добавить проект") || text.includes("создать проект")) {
                return candidate;
            }
        }

        return null;
    }

    function isElementVisible(node) {
        if (!node || !(node instanceof Element)) {
            return false;
        }

        if (node.getClientRects().length === 0) {
            return false;
        }

        const style = window.getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden";
    }

    async function applyProjectPayloadToCleanerFormWithRetries(payload, attempts, delayMs) {
        const totalAttempts = clampInt(Number(attempts), 1, 60, 1);
        const waitMs = clampInt(Number(delayMs), 0, 5000, 0);
        const expectedFields = countProjectPayloadFields(payload);
        let bestApplied = [];

        for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
            const applied = applyProjectPayloadToCleanerForm(payload);
            if (applied.length > bestApplied.length) {
                bestApplied = applied;
            }

            if (expectedFields === 0 || applied.length >= expectedFields) {
                return applied;
            }

            if (attempt + 1 < totalAttempts && waitMs > 0) {
                await wait(waitMs);
            }
        }

        return bestApplied;
    }

    function countProjectPayloadFields(payload) {
        if (!payload || typeof payload !== "object") {
            return 0;
        }

        let count = 0;
        if (payload.projectName) {
            count += 1;
        }
        if (payload.projectId) {
            count += 1;
        }
        if (payload.plan) {
            count += 1;
        }
        if (payload.dbName) {
            count += 1;
        }
        return count;
    }

    function applyProjectPayloadToCleanerForm(payload) {
        const applied = [];
        if (!payload || typeof payload !== "object") {
            return applied;
        }

        if (fillProjectField("#ProjectName", payload.projectName)) {
            applied.push("Наименование проекта");
        }
        if (fillProjectField("#Id", payload.projectId)) {
            applied.push("ID проекта");
        }
        if (fillProjectField("#Plan", payload.plan)) {
            applied.push("План");
        }
        if (fillProjectField("#DbName", payload.dbName)) {
            applied.push("База ОД");
        }

        return applied;
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

    function normalizeSingleLine(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function wait(ms) {
        const timeout = Number.isFinite(ms) ? Math.max(0, ms) : 0;
        return new Promise((resolve) => setTimeout(resolve, timeout));
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

    function fillProjectField(selector, value) {
        if (!value) {
            return false;
        }

        const input = document.querySelector(selector);
        if (!input) {
            return false;
        }

        setInputValue(input, value);
        return true;
    }

    function setInputValue(input, value) {
        if (isNumericTextboxInput(input)) {
            setNumericTextboxValue(input, value);
            return;
        }

        writeInputValue(input, value);
        dispatchInputEvents(input);
    }

    function isNumericTextboxInput(input) {
        if (!input || !input.getAttribute) {
            return false;
        }

        const role = (input.getAttribute("data-role") || "").toLowerCase();
        if (role === "numerictextbox") {
            return true;
        }

        return Boolean(input.closest(".k-numerictextbox"));
    }

    function setNumericTextboxValue(input, value) {
        const normalized = String(value == null ? "" : value).trim();
        const wrapper = input.closest(".k-numerictextbox");
        const formattedInput = wrapper ? wrapper.querySelector("input.k-formatted-value") : null;

        writeInputValue(input, normalized);
        input.setAttribute("value", normalized);
        if (normalized) {
            input.setAttribute("aria-valuenow", normalized);
        }
        dispatchInputEvents(input);

        if (formattedInput) {
            writeInputValue(formattedInput, normalized);
            formattedInput.setAttribute("value", normalized);
            if (normalized) {
                formattedInput.setAttribute("aria-valuenow", normalized);
            }
            dispatchInputEvents(formattedInput);
        }
    }

    function writeInputValue(input, value) {
        const prototype = Object.getPrototypeOf(input);
        const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;
        const setter = descriptor && descriptor.set ? descriptor.set : null;

        if (setter) {
            setter.call(input, value);
            return;
        }

        input.value = value;
    }

    function dispatchInputEvents(input) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
    }

    function saveProjectPayload(payload) {
        saveProjectPayloadToLocalStorage(payload);

        const storage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
        if (!storage) {
            return Promise.resolve(true);
        }

        return new Promise((resolve) => {
            try {
                storage.set({ [PROJECT_PREFILL_STORAGE_KEY]: payload }, () => {
                    const lastErrorMessage = getChromeRuntimeLastErrorMessage();
                    if (lastErrorMessage) {
                        console.warn("[QGA] Не удалось сохранить данные проекта в chrome.storage:", lastErrorMessage);
                        resolve(true);
                        return;
                    }
                    resolve(true);
                });
            } catch (error) {
                console.warn("[QGA] Исключение при сохранении в chrome.storage, использован fallback localStorage:", error);
                resolve(true);
            }
        });
    }

    function readStoredProjectPayload() {
        const fallbackPayload = readProjectPayloadFromLocalStorage();

        const storage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
        if (!storage) {
            return Promise.resolve(fallbackPayload);
        }

        return new Promise((resolve) => {
            try {
                storage.get(PROJECT_PREFILL_STORAGE_KEY, (result) => {
                    const lastErrorMessage = getChromeRuntimeLastErrorMessage();
                    if (lastErrorMessage) {
                        console.warn("[QGA] Не удалось прочитать данные проекта из chrome.storage:", lastErrorMessage);
                        resolve(fallbackPayload);
                        return;
                    }

                    if (!result || typeof result !== "object") {
                        resolve(fallbackPayload);
                        return;
                    }

                    const payload = result[PROJECT_PREFILL_STORAGE_KEY];
                    if (!payload || typeof payload !== "object") {
                        resolve(fallbackPayload);
                        return;
                    }

                    saveProjectPayloadToLocalStorage(payload);
                    resolve(payload);
                });
            } catch (error) {
                console.warn("[QGA] Исключение при чтении из chrome.storage, использован fallback localStorage:", error);
                resolve(fallbackPayload);
            }
        });
    }

    function getChromeRuntimeLastErrorMessage() {
        try {
            if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError) {
                return chrome.runtime.lastError.message || "unknown runtime error";
            }
        } catch (error) {
            return String(error && error.message ? error.message : error);
        }
        return "";
    }

    function saveProjectPayloadToLocalStorage(payload) {
        if (!payload || typeof payload !== "object") {
            return;
        }

        const serialized = JSON.stringify(payload);
        if (!serialized) {
            return;
        }

        try {
            localStorage.setItem(PROJECT_PREFILL_STORAGE_FALLBACK_KEY, serialized);
            localStorage.setItem(PROJECT_PREFILL_STORAGE_KEY, serialized);
        } catch (error) {
            console.warn("[QGA] Не удалось записать fallback в localStorage:", error);
        }
    }

    function readProjectPayloadFromLocalStorage() {
        const candidates = [
            PROJECT_PREFILL_STORAGE_KEY,
            PROJECT_PREFILL_STORAGE_FALLBACK_KEY
        ];

        for (const key of candidates) {
            let raw = null;
            try {
                raw = localStorage.getItem(key);
            } catch (error) {
                raw = null;
            }
            if (!raw) {
                continue;
            }

            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") {
                    return parsed;
                }
            } catch (error) {
                continue;
            }
        }

        return null;
    }
