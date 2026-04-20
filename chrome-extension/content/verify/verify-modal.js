"use strict";

    function makeVerifyModalHeaderResizable(modal) {
        if (!(modal instanceof HTMLElement) || modal.dataset.qgaVerifyModalHeaderResizable === "1") {
            return;
        }

        const header = modal.querySelector(".qga-verify-modal__header");
        const bottomHandle = modal.querySelector(".qga-verify-modal__resize-bottom");
        if (!(header instanceof HTMLElement)) {
            return;
        }

        modal.dataset.qgaVerifyModalHeaderResizable = "1";
        header.style.cursor = "ns-resize";

        const clampModalHeight = (height, minHeightPx, maxHeightPx) => {
            return Math.min(Math.max(minHeightPx, height), maxHeightPx);
        };

        const setupResize = (event, edge) => {
            if (event.button !== 0) {
                return;
            }
            if (event.target instanceof Element && event.target.closest(".qga-verify-modal__close")) {
                return;
            }
            if (
                edge === "top" &&
                event.target instanceof Element &&
                event.target.closest(".qga-verify-modal__title")
            ) {
                return;
            }
            if (edge === "top" && event.currentTarget instanceof HTMLElement) {
                const rect = event.currentTarget.getBoundingClientRect();
                const gripZonePx = 6;
                if (event.clientY - rect.top > gripZonePx) {
                    return;
                }
            }

            const minHeightPx = 140;
            const startRect = modal.getBoundingClientRect();
            const startHeight = startRect.height;
            const startTop = startRect.top;
            const startBottomOffset = Math.max(
                0,
                (window.innerHeight || document.documentElement.clientHeight || 0) - startRect.bottom
            );
            const startY = event.clientY;
            let latestClientY = startY;
            let rafId = null;

            if (edge === "top") {
                // Ресайз сверху: фиксируем окно по нижней границе, увеличиваем/уменьшаем только высоту.
                modal.style.top = "auto";
                modal.style.bottom = startBottomOffset + "px";
            } else {
                // Ресайз снизу: фиксируем верхнюю границу, меняем нижнюю.
                modal.style.top = startTop + "px";
                modal.style.bottom = "auto";
            }
            modal.style.height = startHeight + "px";

            const applyResizeFrame = () => {
                rafId = null;
                const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

                if (edge === "top") {
                    const maxHeightPx = Math.max(minHeightPx, viewportHeight - startBottomOffset - 12);
                    const delta = startY - latestClientY;
                    const nextHeight = clampModalHeight(startHeight + delta, minHeightPx, maxHeightPx);
                    modal.style.height = nextHeight + "px";
                    return;
                }

                const maxHeightPx = Math.max(minHeightPx, viewportHeight - startTop - 12);
                const delta = latestClientY - startY;
                const nextHeight = clampModalHeight(startHeight + delta, minHeightPx, maxHeightPx);
                modal.style.height = nextHeight + "px";
            };

            const handleMouseMove = (moveEvent) => {
                latestClientY = moveEvent.clientY;
                if (rafId === null) {
                    rafId = requestAnimationFrame(applyResizeFrame);
                }
                moveEvent.preventDefault();
            };

            const handleMouseUp = () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
                if (rafId !== null) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
            event.preventDefault();
        };

        header.addEventListener("mousedown", (event) => setupResize(event, "top"));
        if (bottomHandle instanceof HTMLElement) {
            bottomHandle.addEventListener("mousedown", (event) => setupResize(event, "bottom"));
        }
    }

    function clearVerifyRowPostponeSelection(rowState) {
        if (!rowState || !(rowState.gridRoot instanceof HTMLElement) || !(rowState.row instanceof HTMLTableRowElement)) {
            return;
        }

        const { postponeIndex } = getVerifyHeaderIndexes(rowState.gridRoot);
        if (postponeIndex < 0) {
            return;
        }

        const cells = rowState.row.querySelectorAll("td[role='gridcell']");
        const postponeCell = postponeIndex < cells.length ? cells[postponeIndex] : null;
        const postponeCheckbox = postponeCell
            ? postponeCell.querySelector("input[type='checkbox']")
            : null;

        if (!(postponeCheckbox instanceof HTMLInputElement) || !postponeCheckbox.checked) {
            return;
        }

        postponeCheckbox.checked = false;
        postponeCheckbox.dispatchEvent(
            new Event("change", {
                bubbles: true
            })
        );
    }

    function getVerifyRespondentCandidatesTitle(respondentIds) {
        const uniqueCount = Array.isArray(respondentIds)
            ? new Set(
                respondentIds
                    .map((respondentId) => String(respondentId || "").trim())
                    .filter(Boolean)
            ).size
            : 0;

        const baseTitle = "Респонденты с данным ответом";
        return uniqueCount > 1 ? `${baseTitle} (${uniqueCount})` : baseTitle;
    }

    function getVerifyOpenEndOrderMap() {
        const map = new Map();
        const source = state && state.verifyRespondentIdsByOpenEndId;
        if (!(source instanceof Map)) {
            return map;
        }
        let index = 0;
        source.forEach((_value, key) => {
            const normalizedKey = String(key || "").trim();
            if (!/^\d+$/.test(normalizedKey)) {
                return;
            }
            if (map.has(normalizedKey)) {
                return;
            }
            map.set(normalizedKey, index);
            index += 1;
        });
        return map;
    }

    function getVerifyVariableOrderMap() {
        const map = new Map();
        if (typeof getOpenEndsVariableOrderForProject !== "function") {
            return map;
        }
        const projectKey =
            typeof getProjectIdForGroupsLookup === "function"
                ? getProjectIdForGroupsLookup()
                : typeof getProjectIdForVerify === "function"
                    ? getProjectIdForVerify()
                    : "";
        const orderedCodes = getOpenEndsVariableOrderForProject(projectKey);
        if (!Array.isArray(orderedCodes) || orderedCodes.length === 0) {
            return map;
        }
        for (let i = 0; i < orderedCodes.length; i += 1) {
            const code = String(orderedCodes[i] || "").trim();
            if (code && !map.has(code)) {
                map.set(code, i);
            }
        }
        return map;
    }

    function getVerifyModalAnswerSortKey(answer, openEndOrderMap, variableOrderMap) {
        const questionCodes = parseVerifyVariableCodes(answer && answer.question ? answer.question : "");
        if (questionCodes.length > 0 && variableOrderMap instanceof Map && variableOrderMap.size > 0) {
            let best = Infinity;
            for (const code of questionCodes) {
                const normalized = String(code || "").trim();
                if (normalized && variableOrderMap.has(normalized)) {
                    best = Math.min(best, variableOrderMap.get(normalized));
                }
            }
            if (Number.isFinite(best)) {
                return best;
            }
        }

        const openEndId = String(answer && answer.openEndId != null ? answer.openEndId : "").trim();
        if (openEndId && openEndOrderMap instanceof Map && openEndOrderMap.has(openEndId)) {
            return 100000 + openEndOrderMap.get(openEndId);
        }
        if (/^\d+$/.test(openEndId)) {
            return 200000 + Number(openEndId);
        }

        if (questionCodes.length > 0) {
            const code = String(questionCodes[0]).trim();
            const codeMatch = code.match(/(\d+)/);
            if (codeMatch && codeMatch[1]) {
                return 300000 + Number(codeMatch[1]);
            }
        }

        return 900000;
    }

    function sortVerifyModalAnswersByQuestionOrder(answers) {
        if (!Array.isArray(answers) || answers.length <= 1) {
            return Array.isArray(answers) ? answers.slice() : [];
        }
        const openEndOrderMap = getVerifyOpenEndOrderMap();
        const variableOrderMap = getVerifyVariableOrderMap();
        const splitNaturalTokens = (value) => {
            return String(value || "")
                .trim()
                .toLowerCase()
                .match(/(\d+|[^\d]+)/g) || [];
        };
        const compareNatural = (left, right) => {
            const aTokens = splitNaturalTokens(left);
            const bTokens = splitNaturalTokens(right);
            const maxLen = Math.max(aTokens.length, bTokens.length);
            for (let i = 0; i < maxLen; i += 1) {
                const a = aTokens[i];
                const b = bTokens[i];
                if (a == null) return -1;
                if (b == null) return 1;

                const aNum = /^\d+$/.test(a) ? Number(a) : NaN;
                const bNum = /^\d+$/.test(b) ? Number(b) : NaN;
                const bothNums = Number.isFinite(aNum) && Number.isFinite(bNum);
                if (bothNums) {
                    if (aNum !== bNum) return aNum - bNum;
                    if (a.length !== b.length) return a.length - b.length;
                    continue;
                }
                const byText = a.localeCompare(b, "ru");
                if (byText !== 0) return byText;
            }
            return 0;
        };
        return answers
            .map((answer, index) => ({
                answer,
                index,
                sortKey: getVerifyModalAnswerSortKey(answer, openEndOrderMap, variableOrderMap),
                question: String(answer && answer.question ? answer.question : "").trim()
            }))
            .sort((a, b) => {
                if (a.sortKey !== b.sortKey) {
                    return a.sortKey - b.sortKey;
                }
                const byQuestion = compareNatural(a.question, b.question);
                if (byQuestion !== 0) {
                    return byQuestion;
                }
                return a.index - b.index;
            })
            .map((entry) => entry.answer);
    }

    function showVerifyModalInfoMessage(title, message) {
        let modal = document.querySelector(".qga-verify-modal");
        if (!modal) {
            modal = document.createElement("aside");
            modal.className = "qga-verify-modal";
            modal.innerHTML = `
                <div class="qga-verify-modal__header">
                    <div class="qga-verify-modal__title"></div>
                    <button type="button" class="qga-verify-modal__close" aria-label="Закрыть">×</button>
                </div>
                <div class="qga-verify-modal__body">
                    <ul class="qga-verify-modal__list"></ul>
                </div>
                <div class="qga-verify-modal__resize-bottom" aria-hidden="true"></div>
            `;

            const closeButton = modal.querySelector(".qga-verify-modal__close");
            if (closeButton) {
                closeButton.addEventListener("click", () => {
                    modal.style.display = "none";
                });
            }

            document.addEventListener("click", function closeOnClickOutside(e) {
                if (modal.style.display !== "flex") return;
                if (modal.contains(e.target)) return;
                modal.style.display = "none";
            });

            document.documentElement.appendChild(modal);
            makeVerifyModalHeaderResizable(modal);
        }

        const titleNode = modal.querySelector(".qga-verify-modal__title");
        const bodyNode = modal.querySelector(".qga-verify-modal__body");
        if (titleNode) {
            titleNode.textContent = String(title || "Внимание");
        }
        if (bodyNode) {
            bodyNode.innerHTML = "";
            const wrap = document.createElement("div");
            wrap.className = "qga-verify-modal__message";
            wrap.textContent = String(message || "");
            bodyNode.appendChild(wrap);
        }

        ALL_MODAL_REASON_CLASSES.forEach((cls) => modal.classList.remove(cls));
        modal.classList.remove("qga-verify-modal--candidates");
        modal.style.display = "flex";
    }

    function showVerifyRespondentModal(respondentId, answers, context, rowState) {
        let modal = document.querySelector(".qga-verify-modal");
        if (!modal) {
            modal = document.createElement("aside");
            modal.className = "qga-verify-modal";
            modal.innerHTML = `
                <div class="qga-verify-modal__header">
                    <div class="qga-verify-modal__title"></div>
                    <button type="button" class="qga-verify-modal__close" aria-label="Закрыть">×</button>
                </div>
                <div class="qga-verify-modal__body">
                    <ul class="qga-verify-modal__list"></ul>
                    <div class="qga-verify-modal__footer"></div>
                </div>
                <div class="qga-verify-modal__resize-bottom" aria-hidden="true"></div>
            `;

            const closeButton = modal.querySelector(".qga-verify-modal__close");
            if (closeButton) {
                closeButton.addEventListener("click", () => {
                    modal.style.display = "none";
                });
            }

            document.addEventListener("click", function closeOnClickOutside(e) {
                if (modal.style.display !== "flex") return;
                if (modal.contains(e.target)) return;
                modal.style.display = "none";
            });

            document.documentElement.appendChild(modal);
            makeVerifyModalHeaderResizable(modal);

            const bodyEl = modal.querySelector(".qga-verify-modal__body");
            if (bodyEl) {
                const scrollbarZone = 20;
                bodyEl.addEventListener("mousemove", (e) => {
                    const rect = bodyEl.getBoundingClientRect();
                    const isNearScrollbar = (rect.right - e.clientX) <= scrollbarZone;
                    bodyEl.classList.toggle("qga-verify-modal__body--scrollbar-hover", isNearScrollbar);
                });
                bodyEl.addEventListener("mouseleave", () => {
                    bodyEl.classList.remove("qga-verify-modal__body--scrollbar-hover");
                });
            }
        }

        const titleNode = modal.querySelector(".qga-verify-modal__title");
        const listNode = modal.querySelector(".qga-verify-modal__list");

        let footerNode = modal.querySelector(".qga-verify-modal__footer");
        if (!footerNode) {
            const bodyNode = modal.querySelector(".qga-verify-modal__body");
            footerNode = document.createElement("div");
            footerNode.className = "qga-verify-modal__footer";
            if (bodyNode && bodyNode.appendChild) {
                bodyNode.appendChild(footerNode);
            }
        }

        if (titleNode) {
            titleNode.textContent = String(respondentId);
        }

        const respondentIdStr = String(respondentId).trim();
        const projectIdForModal = getProjectIdForVerify();
        const verifyIncorrectSetForModal = projectIdForModal ? getVerifyIncorrectIdsSetForProject(projectIdForModal) : new Set();
        const ratingReasonMapForModal = projectIdForModal ? getRatingReasonCodesForProject(projectIdForModal) : {};
        const manualSetForModal = projectIdForModal ? getManualBfridsSetForProject(projectIdForModal) : new Set();
        const allCodesForModal = getRespondentAllReasonCodes(respondentIdStr, verifyIncorrectSetForModal, ratingReasonMapForModal, manualSetForModal);
        const topReasonCode = getTopReasonCode(allCodesForModal);
        const isIncorrectFromRating = topReasonCode > 0;

        const MODAL_BG_COLOR = {
            1: "#fee2e2",
            2: "#f3e8ff",
            3: "#dbeafe",
            4: "#ffedd5",
            6: "#fef9c3"
        };

        ALL_MODAL_REASON_CLASSES.forEach((cls) => modal.classList.remove(cls));
        const bodyEl = modal.querySelector(".qga-verify-modal__body");
        const footerEl = modal.querySelector(".qga-verify-modal__footer");
        if (bodyEl) bodyEl.style.removeProperty("background");
        if (footerEl) footerEl.style.removeProperty("background");

        if (allCodesForModal.length > 1) {
            const colors = allCodesForModal.map((c) => MODAL_BG_COLOR[c]).filter(Boolean);
            if (colors.length > 1) {
                const gradient = "linear-gradient(to right, " + colors.join(", ") + ")";
                if (bodyEl) bodyEl.style.background = gradient;
                if (footerEl) footerEl.style.background = gradient;
            }
        } else {
            const modalReasonClass = REASON_CODE_MODAL_CLASS[topReasonCode];
            if (modalReasonClass) {
                modal.classList.add(modalReasonClass);
            }
        }

        if (listNode) {
            const fragment = document.createDocumentFragment();

            const sortedAnswers = sortVerifyModalAnswersByQuestionOrder(answers);
            if (!sortedAnswers || sortedAnswers.length === 0) {
                const empty = document.createElement("li");
                empty.className = "qga-verify-modal__item";
                empty.textContent = "Другие ответы этого респондента в выгрузке не найдены.";
                fragment.appendChild(empty);
            } else {
                for (const answer of sortedAnswers) {
                    const item = document.createElement("li");
                    item.className = "qga-verify-modal__item";

                    const q = document.createElement("div");
                    q.className = "qga-verify-modal__q";
                    q.textContent = answer.question || `OpenEnd Id: ${answer.openEndId}`;

                    const text = document.createElement("div");
                    text.className = "qga-verify-modal__text";
                    text.textContent = answer.value || "";

                    item.appendChild(q);
                    item.appendChild(text);
                    fragment.appendChild(item);
                }
            }

            listNode.replaceChildren(fragment);
        }

        manualBfridsState = loadManualBfridsState();
        manualApiState = loadManualApiState();
        const alreadyInManualSet = getManualBfridsSetForProject(projectIdForModal);
        const isAlreadyInManual = alreadyInManualSet.has(respondentIdStr);

        modal.classList.remove("qga-verify-modal--candidates");
        if (isAlreadyInManual) {
            modal.classList.add("qga-verify-modal--tech-defect");
        } else {
            modal.classList.remove("qga-verify-modal--tech-defect");
        }

        if (footerNode) {
            footerNode.innerHTML = "";
            const manualCheckbox = document.createElement("input");
            manualCheckbox.type = "checkbox";
            manualCheckbox.className = "qga-verify-modal-manual-checkbox";
            manualCheckbox.title = isAlreadyInManual
                ? "Уже в ручной чистке"
                : "Добавить в ручную чистку (по нажатию «Проверить страницу»)";
            manualCheckbox.dataset.respondentId = respondentIdStr;
            manualCheckbox.checked = isAlreadyInManual || state.verifyPendingManualBfrids.has(respondentIdStr);
            manualCheckbox.disabled = isAlreadyInManual || isIncorrectFromRating;
            if (!isAlreadyInManual && !isIncorrectFromRating) {
                manualCheckbox.addEventListener("change", () => {
                    const id = manualCheckbox.dataset.respondentId;
                    if (!id) return;
                    if (manualCheckbox.checked) {
                        clearVerifyRowPostponeSelection(rowState);
                        state.verifyPendingManualBfrids.add(id);
                    } else {
                        state.verifyPendingManualBfrids.delete(id);
                    }
                    updateVerifyMainManualCounter();
                });
            }
            const manualLabel = document.createElement("label");
            manualLabel.className = "qga-verify-modal__footer-label";
            manualLabel.appendChild(manualCheckbox);
            manualLabel.appendChild(document.createTextNode(" В ручную чистку"));
            footerNode.appendChild(manualLabel);
        }

        modal.style.display = "flex";
        return context;
    }

    function showVerifyRespondentCandidates(respondentIds, answersMap, context, rowState) {
        let modal = document.querySelector(".qga-verify-modal");
        if (!modal) {
            modal = document.createElement("aside");
            modal.className = "qga-verify-modal";
            modal.innerHTML = `
                <div class="qga-verify-modal__header">
                    <div class="qga-verify-modal__title"></div>
                    <button type="button" class="qga-verify-modal__close" aria-label="Закрыть">×</button>
                </div>
                <div class="qga-verify-modal__body">
                    <ul class="qga-verify-modal__list"></ul>
                </div>
                <div class="qga-verify-modal__resize-bottom" aria-hidden="true"></div>
            `;

            const closeButton = modal.querySelector(".qga-verify-modal__close");
            if (closeButton) {
                closeButton.addEventListener("click", () => {
                    modal.style.display = "none";
                });
            }

            document.addEventListener("click", function closeOnClickOutside(e) {
                if (modal.style.display !== "flex") return;
                if (modal.contains(e.target)) return;
                modal.style.display = "none";
            });

            document.documentElement.appendChild(modal);
            makeVerifyModalHeaderResizable(modal);

            const bodyEl = modal.querySelector(".qga-verify-modal__body");
            if (bodyEl) {
                const scrollbarZone = 20;
                bodyEl.addEventListener("mousemove", (e) => {
                    const rect = bodyEl.getBoundingClientRect();
                    const isNearScrollbar = (rect.right - e.clientX) <= scrollbarZone;
                    bodyEl.classList.toggle("qga-verify-modal__body--scrollbar-hover", isNearScrollbar);
                });
                bodyEl.addEventListener("mouseleave", () => {
                    bodyEl.classList.remove("qga-verify-modal__body--scrollbar-hover");
                });
            }
        }

        const projectIdCandidates = getProjectIdForVerify();
        const verifyIncorrectSetCandidates = projectIdCandidates ? getVerifyIncorrectIdsSetForProject(projectIdCandidates) : new Set();
        const ratingReasonMapCandidates = projectIdCandidates ? getRatingReasonCodesForProject(projectIdCandidates) : {};

        ALL_MODAL_REASON_CLASSES.forEach((cls) => modal.classList.remove(cls));
        modal.classList.add("qga-verify-modal--candidates");

        const titleNode = modal.querySelector(".qga-verify-modal__title");
        const bodyNode = modal.querySelector(".qga-verify-modal__body");
        if (bodyNode) {
            bodyNode.innerHTML = "<ul class=\"qga-verify-modal__list\"></ul>";
        }
        const listNode = modal.querySelector(".qga-verify-modal__list");

        if (titleNode) {
            titleNode.textContent = getVerifyRespondentCandidatesTitle(respondentIds);
        }

        if (listNode) {
            manualBfridsState = loadManualBfridsState();
            manualApiState = loadManualApiState();
            const alreadyInManualSet = getManualBfridsSetForProject(projectIdCandidates);
            const fragment = document.createDocumentFragment();

            const REASON_CODE_BG_COLOR = {
                1: "#fee2e2",
                2: "#f3e8ff",
                3: "#dbeafe",
                4: "#ffedd5",
                6: "#fef9c3"
            };
            const REASON_CODE_TEXT_COLOR = {
                1: "#b91c1c",
                2: "#6b21a8",
                3: "#1e40af",
                4: "#9a3412",
                6: "#854d0e"
            };

            const CANDIDATE_ICON_CONFIG = {
                1: { url: chrome.runtime.getURL("icons/inc.png"), alt: "Некорректный ответ" },
                4: { url: chrome.runtime.getURL("icons/speed.png"), alt: "Спидстер" },
                6: { url: chrome.runtime.getURL("icons/manual.png"), alt: "Ручная чистка" }
            };

            for (const respondentId of respondentIds) {
                const answers =
                    answersMap.get(String(respondentId)) ||
                    answersMap.get(String(respondentId).trim()) ||
                    [];
                const sortedAnswers = sortVerifyModalAnswersByQuestionOrder(answers);

                const respondentIdStr = String(respondentId).trim();
                const isAlreadyInManual = alreadyInManualSet.has(respondentIdStr);
                const candidateAllCodes = getRespondentAllReasonCodes(respondentIdStr, verifyIncorrectSetCandidates, ratingReasonMapCandidates, alreadyInManualSet);
                const candidateTopCode = getTopReasonCode(candidateAllCodes);
                const isIncorrectFromRating = candidateTopCode > 0;

                const headerItem = document.createElement("li");
                headerItem.className = "qga-verify-modal__item";

                if (candidateAllCodes.length > 1) {
                    const colors = candidateAllCodes.map((c) => REASON_CODE_BG_COLOR[c]).filter(Boolean);
                    if (colors.length > 1) {
                        const gradient = "linear-gradient(to right, " + colors.join(", ") + ")";
                        headerItem.style.background = gradient;
                    }
                } else {
                    const itemReasonClass = REASON_CODE_ITEM_CLASS[candidateTopCode];
                    if (itemReasonClass) {
                        headerItem.classList.add(itemReasonClass);
                    }
                }

                const header = document.createElement("div");
                header.className = "qga-verify-modal__q qga-verify-modal__respondent-header";
                header.style.display = "flex";
                header.style.alignItems = "center";
                header.style.gap = "8px";
                header.style.flexWrap = "wrap";

                if (candidateAllCodes.length > 1) {
                    header.style.background = "transparent";
                    const textColor = REASON_CODE_TEXT_COLOR[candidateTopCode];
                    if (textColor) header.style.color = textColor;
                }

                const manualCheckbox = document.createElement("input");
                manualCheckbox.type = "checkbox";
                manualCheckbox.className = "qga-verify-modal-manual-checkbox";
                manualCheckbox.title = isAlreadyInManual
                    ? "Уже в ручной чистке"
                    : "Добавить в ручную чистку (по нажатию «Проверить страницу»)";
                manualCheckbox.dataset.respondentId = respondentIdStr;
                manualCheckbox.checked = isAlreadyInManual || state.verifyPendingManualBfrids.has(respondentIdStr);
                manualCheckbox.disabled = isAlreadyInManual || isIncorrectFromRating;
                if (!isAlreadyInManual && !isIncorrectFromRating) {
                    manualCheckbox.addEventListener("change", () => {
                        const id = manualCheckbox.dataset.respondentId;
                        if (!id) return;
                        if (manualCheckbox.checked) {
                            clearVerifyRowPostponeSelection(rowState);
                            state.verifyPendingManualBfrids.add(id);
                        } else {
                            state.verifyPendingManualBfrids.delete(id);
                        }
                        updateVerifyMainManualCounter();
                    });
                }

                const idSpan = document.createElement("span");
                idSpan.textContent = `${respondentId}`;

                header.appendChild(idSpan);

                for (const code of candidateAllCodes) {
                    const iconCfg = CANDIDATE_ICON_CONFIG[code];
                    if (iconCfg) {
                        const icon = document.createElement("img");
                        icon.src = iconCfg.url;
                        icon.alt = iconCfg.alt;
                        icon.title = iconCfg.alt;
                        icon.style.width = "16px";
                        icon.style.height = "16px";
                        icon.style.verticalAlign = "middle";
                        header.appendChild(icon);
                    }
                }

                headerItem.appendChild(header);

                if (!sortedAnswers || sortedAnswers.length === 0) {
                    const empty = document.createElement("div");
                    empty.className = "qga-verify-modal__text";
                    empty.textContent = "Другие ответы этого респондента в выгрузке не найдены.";
                    headerItem.appendChild(empty);
                } else {
                    for (const answer of sortedAnswers) {
                        const q = document.createElement("div");
                        q.className = "qga-verify-modal__q";
                        q.textContent = answer.question || `OpenEnd Id: ${answer.openEndId}`;

                        const text = document.createElement("div");
                        text.className = "qga-verify-modal__text";
                        text.textContent = answer.value || "";

                        headerItem.appendChild(q);
                        headerItem.appendChild(text);
                    }
                }

                const manualRow = document.createElement("div");
                manualRow.className = "qga-verify-modal__manual-row";
                manualRow.style.marginTop = "8px";
                manualRow.style.paddingTop = "8px";
                manualRow.style.display = "flex";
                manualRow.style.alignItems = "center";
                manualRow.style.gap = "6px";
                const manualLabel = document.createElement("label");
                manualLabel.className = "qga-verify-modal__footer-label";
                manualLabel.style.display = "inline-flex";
                manualLabel.style.alignItems = "center";
                manualLabel.style.gap = "6px";
                manualLabel.style.cursor = manualCheckbox.disabled ? "default" : "pointer";
                manualLabel.appendChild(manualCheckbox);
                manualLabel.appendChild(document.createTextNode("В ручную чистку"));
                manualRow.appendChild(manualLabel);
                headerItem.appendChild(manualRow);

                fragment.appendChild(headerItem);
            }

            listNode.replaceChildren(fragment);
        }

        modal.style.display = "flex";
        return context;
    }
