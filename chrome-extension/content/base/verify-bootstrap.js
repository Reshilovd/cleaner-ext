"use strict";

    function initOpenEndsVerifyMode() {
        waitForBody(() => {
            setupVerifyRespondentEnhancements();
            setupVerifyMainManualIntegration();
        });
    }

    function setupVerifyRespondentEnhancements() {
        const gridRoot = document.querySelector("#grid, #gridOpenEnds");
        if (!gridRoot) {
            return;
        }

        if (!gridRoot.dataset.qgaVerifyBound) {
            gridRoot.dataset.qgaVerifyBound = "1";
            const pendingVisibilityRows = new Set();
            let visibilityRafId = 0;

            const scheduleVerifyVisibilityUpdate = (row) => {
                if (row instanceof HTMLTableRowElement) {
                    pendingVisibilityRows.add(row);
                }

                if (visibilityRafId) {
                    return;
                }

                visibilityRafId = window.requestAnimationFrame(() => {
                    visibilityRafId = 0;
                    if (pendingVisibilityRows.size > 0) {
                        const rows = Array.from(pendingVisibilityRows);
                        pendingVisibilityRows.clear();
                        applyVerifyRowVisibility(gridRoot, { rows });
                        return;
                    }
                    applyVerifyRowVisibility(gridRoot);
                });
            };

            gridRoot.addEventListener("click", async (event) => {
                const target = event.target instanceof HTMLElement ? event.target : null;
                const button = target ? target.closest(".qga-verify-show-respondent") : null;
                if (!button) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                const row = button.closest("tr");
                if (!row) {
                    return;
                }

                const context = resolveVerifyRowContext(row);
                if (!context || (!context.openEndId && !context.valueText)) {
                    alert("Не удалось определить данные ответа для выбранной строки.");
                    return;
                }

                const rowState = getVerifyRowIncorrectPostpone(gridRoot, row);

                try {
                    const ok = await ensureVerifyRespondentIndexLoaded(button);
                    if (!ok) {
                        if (state.verifyRespondentIndexError) {
                            console.warn("[QGA]", state.verifyRespondentIndexError);
                        }
                        return;
                    }

                    const answersMap = state.verifyAnswersByRespondentId;
                    if (!answersMap) {
                        alert("Индекс ответов респондентов недоступен.");
                        return;
                    }

                    const uniqueIds = getRespondentIdsForContext(context);

                    if (uniqueIds.length === 0) {
                        alert(
                            "Не удалось найти респондента для этого ответа в выгрузке OpenEnds. " +
                                "Возможные причины: формат файла выгрузки изменился или ответ не попал в файл."
                        );
                        return;
                    }
                    if (uniqueIds.length === 1) {
                        const respondentId = uniqueIds[0];
                        const answers =
                            answersMap.get(String(respondentId)) ||
                            answersMap.get(String(respondentId).trim()) ||
                            [];

                        showVerifyRespondentModal(respondentId, answers, context, rowState);
                    } else {
                        showVerifyRespondentCandidates(uniqueIds, answersMap, context, rowState);
                    }
                } catch (error) {
                    console.error("[QGA] Ошибка при загрузке ответов респондента", error);
                    alert("Произошла ошибка при загрузке ответов респондента. Подробности в консоли.");
                }
            });

            gridRoot.addEventListener("change", (event) => {
                const target = event.target;
                if (!(target instanceof HTMLInputElement)) return;
                if (target.type !== "checkbox") return;
                const row = target.closest("tr.k-master-row");
                scheduleVerifyVisibilityUpdate(row);
            });
        }

        decorateVerifyRows(gridRoot);

        let verifyDecorateTimer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(verifyDecorateTimer);
            verifyDecorateTimer = setTimeout(() => decorateVerifyRows(gridRoot), 150);
        });
        observer.observe(gridRoot, { childList: true, subtree: true });

        // Загрузить индекс и рейтинг (некорректные ID из Excel «Рейтинг», ReasonCodes=1) при открытии страницы
        const projectId = getProjectIdForVerify();
        Promise.all([
            ensureVerifyRespondentIndexLoaded(),
            projectId ? ensureRatingIncorrectIdsLoaded(projectId) : Promise.resolve(false)
        ]).then(() => {
            applyVerifyRowVisibility(gridRoot);
        });
    }

    function setupVerifyMainManualIntegration() {
        const button = document.querySelector("button[onclick='verifyValues()']");
        if (!button) {
            return;
        }
        if (button.dataset.qgaManualBfridBound === "1") {
            updateVerifyMainManualCounter();
            return;
        }
        button.dataset.qgaManualBfridBound = "1";

        const parent = button.parentElement || button.closest("div, span, td, th") || document.body;
        const extraButton = document.createElement("button");
        extraButton.type = button.type || "button";
        extraButton.textContent = button.textContent || "Проверить страницу";
        extraButton.className = (button.className || "").trim();

        const counter = document.createElement("span");
        counter.id = "qga-verify-manual-counter";
        counter.style.display = "none";
        counter.style.alignItems = "center";
        counter.style.marginLeft = "8px";
        counter.style.padding = "4px 8px";
        counter.style.borderRadius = "999px";
        counter.style.border = "1px solid #d1d5db";
        counter.style.background = "#f8fafc";
        counter.style.color = "#475569";
        counter.style.fontSize = "12px";
        counter.style.lineHeight = "1";
        counter.style.verticalAlign = "middle";
        counter.style.whiteSpace = "nowrap";
        counter.style.userSelect = "none";

        const counterLabel = document.createElement("span");
        counterLabel.className = "qga-verify-manual-counter__label";
        counterLabel.style.display = "inline-flex";
        counterLabel.style.alignItems = "center";
        counterLabel.style.lineHeight = "1";

        const counterClear = document.createElement("span");
        counterClear.className = "qga-verify-manual-counter__clear";
        counterClear.textContent = "✕";
        counterClear.setAttribute("aria-hidden", "true");
        counterClear.style.display = "inline-flex";
        counterClear.style.marginLeft = "0";
        counterClear.style.color = "#dc2626";
        counterClear.style.fontSize = "11px";
        counterClear.style.fontWeight = "700";
        counterClear.style.lineHeight = "1";
        counterClear.style.width = "0";
        counterClear.style.height = "14px";
        counterClear.style.overflow = "hidden";
        counterClear.style.borderRadius = "999px";
        counterClear.style.border = "none";
        counterClear.style.background = "#fff1f2";
        counterClear.style.alignItems = "center";
        counterClear.style.justifyContent = "center";
        counterClear.style.opacity = "0";
        counterClear.style.transform = "translateX(-6px)";
        counterClear.style.transition = "opacity 220ms ease, transform 280ms ease, width 280ms ease, margin-left 280ms ease";
        counterClear.style.pointerEvents = "none";

        counter.appendChild(counterLabel);
        counter.appendChild(counterClear);

        counter.addEventListener("mouseenter", () => {
            counter.dataset.qgaHover = "1";
            updateVerifyMainManualCounter();
        });
        counter.addEventListener("mouseleave", () => {
            delete counter.dataset.qgaHover;
            updateVerifyMainManualCounter();
        });
        counter.addEventListener("click", (event) => {
            const count = state.verifyPendingManualBfrids instanceof Set
                ? state.verifyPendingManualBfrids.size
                : 0;
            if (count < 1) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            clearVerifyPendingManualSelections();
        });

        extraButton.addEventListener("click", async () => {
            if (state.verifyPendingManualBfrids && state.verifyPendingManualBfrids.size > 0) {
                const ids = Array.from(state.verifyPendingManualBfrids);
                try {
                    await sendRespondentIdsToManualCleanup(ids);
                    clearVerifyPendingManualSelections();
                } catch (error) {
                    console.error("[QGA] Ошибка при отправке выбранных в ручную чистку:", error);
                }
            }
            collectVerifyIncorrectIdsAndSave();
            try {
                const gridRoot = document.querySelector("#grid, #gridOpenEnds");
                if (gridRoot && window.jQuery) {
                    const grid = window.jQuery(gridRoot).data("kendoGrid");
                    if (grid && typeof grid.one === "function") {
                        grid.one("dataBound", () => applyVerifyRowVisibility(gridRoot));
                    }
                }
                button.click();
            } catch (error) {
                console.error("[QGA] Не удалось запустить стандартную проверку страницы:", error);
            }
        });

        // Прячем оригинальную кнопку проверки страницы, чтобы пользователь видел только одну,
        // но продолжали использовать её штатный обработчик onclick="verifyValues()".
        button.style.display = "none";

        if (button.nextSibling) {
            parent.insertBefore(extraButton, button.nextSibling);
        } else {
            parent.appendChild(extraButton);
        }
        if (extraButton.nextSibling) {
            parent.insertBefore(counter, extraButton.nextSibling);
        } else {
            parent.appendChild(counter);
        }
        updateVerifyMainManualCounter();
    }

    function updateVerifyMainManualCounter() {
        const counter = document.getElementById("qga-verify-manual-counter");
        if (!counter) {
            return;
        }
        const label = counter.querySelector(".qga-verify-manual-counter__label");
        const clear = counter.querySelector(".qga-verify-manual-counter__clear");

        const count = state.verifyPendingManualBfrids instanceof Set
            ? state.verifyPendingManualBfrids.size
            : 0;
        const isHover = counter.dataset.qgaHover === "1";

        counter.style.display = count > 0 ? "inline-flex" : "none";
        counter.style.cursor = count > 0 ? "pointer" : "default";
        if (label) {
            label.textContent = `В ручную: ${count}`;
        }
        if (clear) {
            const showClear = count > 0 && isHover;
            clear.style.opacity = showClear ? "1" : "0";
            clear.style.transform = showClear ? "translateX(0)" : "translateX(-6px)";
            clear.style.width = showClear ? "14px" : "0";
            clear.style.marginLeft = showClear ? "6px" : "0";
            clear.style.pointerEvents = showClear ? "auto" : "none";
        }
        counter.title = count > 0
            ? isHover
                ? `Нажмите, чтобы снять все выбранные чекбоксы ручной чистки (${count}).`
                : `После нажатия «Проверить страницу» будет отправлено ${count} респондентов в ручную чистку.`
            : "После нажатия «Проверить страницу» в ручную чистку никто не отправится.";
        counter.style.fontWeight = count > 0 ? "600" : "400";
        counter.style.background = count > 0 ? "#fff7ed" : "#f8fafc";
        counter.style.borderColor = count > 0 ? "#fdba74" : "#d1d5db";
        counter.style.color = count > 0 ? "#9a3412" : "#475569";
    }

    function clearVerifyPendingManualSelections() {
        if (state.verifyPendingManualBfrids instanceof Set) {
            state.verifyPendingManualBfrids.clear();
        } else {
            state.verifyPendingManualBfrids = new Set();
        }

        document.querySelectorAll(".qga-verify-modal-manual-checkbox").forEach((cb) => {
            if (!(cb instanceof HTMLInputElement)) {
                return;
            }
            if (cb.disabled) {
                return;
            }
            cb.checked = false;
        });

        updateVerifyMainManualCounter();
    }
