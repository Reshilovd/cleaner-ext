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
        const cleanerControl = findPyrusCleanerControl();
        const cleanerReferenceNote = cleanerControl
            ? cleanerControl.closest(".formFieldNote") || cleanerControl.closest(".formFieldButtonWrapper")
            : null;
        const cleanerInsertionAnchor = cleanerReferenceNote || cleanerControl;
        const insertionMode = cleanerInsertionAnchor ? "beforebegin" : "afterend";
        const finalInsertionAnchor = cleanerInsertionAnchor || insertionAnchor;

        const existingButton = document.getElementById(PYRUS_QUICK_FILL_BUTTON_ID);
        if (existingButton) {
            const existingWrapper = existingButton.closest(`.${PYRUS_QUICK_FILL_WRAPPER_CLASS}`) || existingButton;
            if (
                (insertionMode === "beforebegin" && finalInsertionAnchor && finalInsertionAnchor.previousElementSibling === existingWrapper) ||
                (insertionMode === "afterend" && finalInsertionAnchor && finalInsertionAnchor.nextElementSibling === existingWrapper)
            ) {
                enhancePyrusButtonsLayout();
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
        finalInsertionAnchor.insertAdjacentElement(insertionMode, wrapper);
        enhancePyrusButtonsLayout();

        console.info("[QGA] Кнопка В CleanerUI: добавлена перед кнопкой Чистилка");
        return true;
    }

    function bindPyrusHashChange() {
        if (state.pyrusHashListenerAttached) {
            return;
        }

        window.addEventListener("hashchange", () => {
            removeLegacyPyrusCopyButton();
            ensurePyrusQuickFillLinks();
            enhancePyrusButtonsLayout();
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

    function findPyrusCleanerControl() {
        const controls = Array.from(document.querySelectorAll("button, a"))
            .filter((node) => isElementVisible(node));

        return controls.find((node) => {
            const text = normalizeSearchText(node.textContent || "");
            return text === "чистилка";
        }) || null;
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

    function enhancePyrusButtonsLayout() {
        const buttonsHost = findPyrusButtonsHost();
        if (!buttonsHost) {
            return false;
        }

        injectPyrusButtonsLayoutStyles();

        const buttonWrappers = collectPyrusButtonWrappers(buttonsHost);
        if (buttonWrappers.length === 0) {
            return false;
        }

        let board = buttonsHost.querySelector(".qga-pyrus-button-board");
        if (!board) {
            board = createPyrusButtonsBoard();
            buttonsHost.insertBefore(board, buttonWrappers[0]);
        }

        const managerGrid = board.querySelector("[data-qga-role='managers']");
        const devGrid = board.querySelector("[data-qga-role='developers']");
        if (!managerGrid || !devGrid) {
            return false;
        }

        const managerOrder = [
            "заявка на рекрут",
            "считалка",
            "выгрузка базы",
            "добавить подзадачу",
            "квотная",
            "новый клиент"
        ];
        const developerOrder = [
            "генерилка",
            "inspector bot",
            "сетап чистилки",
            "чистилка",
            "сетап рекоделки"
        ];

        const managerMap = new Map();
        const developerMap = new Map();
        const unknownDeveloperItems = [];

        for (const wrapper of buttonWrappers) {
            const label = getPyrusButtonWrapperLabel(wrapper);
            if (!label) {
                continue;
            }

            const managerKey = managerOrder.find((item) => label.includes(item));
            if (managerKey) {
                if (!managerMap.has(managerKey)) {
                    managerMap.set(managerKey, []);
                }
                managerMap.get(managerKey).push(wrapper);
                continue;
            }

            const developerKey = developerOrder.find((item) => label.includes(item));
            if (developerKey) {
                if (!developerMap.has(developerKey)) {
                    developerMap.set(developerKey, []);
                }
                developerMap.get(developerKey).push(wrapper);
                continue;
            }

            unknownDeveloperItems.push(wrapper);
        }

        for (const key of managerOrder) {
            const items = managerMap.get(key) || [];
            for (const item of items) {
                managerGrid.appendChild(item);
            }
        }

        for (const key of developerOrder) {
            const items = developerMap.get(key) || [];
            for (const item of items) {
                devGrid.appendChild(item);
            }
        }

        for (const item of unknownDeveloperItems) {
            devGrid.appendChild(item);
        }

        const newClientItems = findPyrusButtonWrappersByLabel("новый клиент");
        for (const item of newClientItems) {
            item.classList.add("qga-pyrus-button-wrapper--new-client");
            managerGrid.appendChild(item);
        }

        return true;
    }

    function findPyrusButtonsHost() {
        const controls = Array.from(document.querySelectorAll("button, a"))
            .filter((node) => isElementVisible(node));
        const markers = [
            "заявка на рекрут",
            "считалка",
            "новый клиент",
            "выгрузка базы",
            "квотная",
            "чистилка",
            "сетап чистилки",
            "inspector bot"
        ];

        for (const control of controls) {
            const text = normalizeSearchText(control.textContent || "");
            if (!markers.some((marker) => text.includes(marker))) {
                continue;
            }

            const wrapper = control.closest(".formFieldNote, .formFieldButtonWrapper");
            if (wrapper && wrapper.parentElement) {
                return wrapper.parentElement;
            }
        }

        return null;
    }

    function collectPyrusButtonWrappers(buttonsHost) {
        if (!buttonsHost) {
            return [];
        }

        const wrappers = Array.from(buttonsHost.querySelectorAll(".formFieldNote, .formFieldButtonWrapper"));
        return wrappers.filter((wrapper) => {
            if (!wrapper || wrapper.closest(".qga-pyrus-button-board")) {
                return false;
            }
            if (wrapper.parentElement !== buttonsHost) {
                return false;
            }
            const control = wrapper.querySelector("a, button");
            if (!control || !isElementVisible(control)) {
                return false;
            }
            const text = normalizeSearchText(control.textContent || "");
            return isPyrusActionButtonLabel(text);
        });
    }

    function isPyrusActionButtonLabel(text) {
        if (!text) {
            return false;
        }

        const markers = [
            "заявка на рекрут",
            "считалка",
            "новый клиент",
            "выгрузка базы",
            "квотная",
            "чистилка",
            "сетап",
            "inspector bot",
            "генерилка",
            "добавить подзадачу"
        ];
        return markers.some((marker) => text.includes(marker));
    }

    function findPyrusButtonWrappersByLabel(labelPart) {
        const target = normalizeSearchText(labelPart || "");
        if (!target) {
            return [];
        }

        const wrappers = Array.from(document.querySelectorAll(".formFieldNote, .formFieldButtonWrapper"));
        return wrappers.filter((wrapper) => {
            if (!wrapper || wrapper.closest(".qga-pyrus-button-board")) {
                return false;
            }
            const control = wrapper.querySelector("a, button");
            if (!control || !isElementVisible(control)) {
                return false;
            }
            const text = normalizeSearchText(control.textContent || "");
            return text.includes(target);
        });
    }

    function getPyrusButtonWrapperLabel(wrapper) {
        if (!wrapper) {
            return "";
        }
        const control = wrapper.querySelector("a, button");
        if (!control) {
            return "";
        }
        return normalizeSearchText(control.textContent || "");
    }

    function createPyrusButtonsBoard() {
        const board = document.createElement("div");
        board.className = "qga-pyrus-button-board";

        const managersSection = createPyrusButtonsSection("Менеджеры", "managers");
        const developersSection = createPyrusButtonsSection("Программисты", "developers");

        board.appendChild(developersSection);
        board.appendChild(managersSection);
        return board;
    }

    function createPyrusButtonsSection(title, role) {
        const section = document.createElement("section");
        section.className = "qga-pyrus-button-section";

        const header = document.createElement("div");
        header.className = "qga-pyrus-button-section__title";
        header.textContent = title;

        const grid = document.createElement("div");
        grid.className = "qga-pyrus-button-grid";
        grid.setAttribute("data-qga-role", role);

        section.appendChild(header);
        section.appendChild(grid);
        return section;
    }

    function injectPyrusButtonsLayoutStyles() {
        if (document.getElementById("qga-pyrus-buttons-layout-style")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "qga-pyrus-buttons-layout-style";
        style.textContent = `
.qga-pyrus-button-board {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 10px;
    margin-bottom: 4px;
    width: 100%;
    background: transparent;
    color: var(--color-text-main, var(--color-text-primary, inherit));
}
.qga-pyrus-button-section {
    border: 0;
    border-radius: 0;
    padding: 8px 8px 6px;
    background: transparent;
    width: 100%;
}
.qga-pyrus-button-section + .qga-pyrus-button-section {
    border-left: 1px solid var(--color-separator, var(--color-border, #e5e7eb));
    padding-left: 12px;
}
.qga-pyrus-button-section__title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text-secondary, var(--color-text-main, #64748b));
    margin-bottom: 7px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--color-separator, var(--color-border, #eef2f7));
}
.qga-pyrus-button-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 0;
}
.qga-pyrus-button-grid .formFieldNote,
.qga-pyrus-button-grid .formFieldButtonWrapper {
    margin: 0 !important;
}
.qga-pyrus-button-grid .qga-pyrus-button-wrapper--new-client {
    grid-column: auto;
}
.qga-pyrus-button-grid .formFieldNoteButton,
.qga-pyrus-button-grid .linkButton,
.qga-pyrus-button-grid a.linkButton,
.qga-pyrus-button-grid button {
    width: 100% !important;
    min-height: 33px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.qga-pyrus-button-grid .formFieldNoteButton_text {
    max-width: 100%;
}
        `.trim();
        document.head.appendChild(style);
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

            const cleanerUrl = buildCleanerAutoFillUrl(result.payload, {
                includePayload: result.transportMode === "url"
            });
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

        const saveResult = await saveProjectPayload(payload);
        if (!saveResult.ok) {
            return {
                ok: false,
                message: "Не удалось сохранить данные в хранилище расширения."
            };
        }

        return {
            ok: true,
            payload,
            missing: collectMissingProjectPayloadFields(payload),
            transportMode: saveResult.mode
        };
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


