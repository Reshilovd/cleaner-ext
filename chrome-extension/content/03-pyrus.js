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


