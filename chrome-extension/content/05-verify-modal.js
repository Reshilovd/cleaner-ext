"use strict";

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
            listNode.innerHTML = "";

            if (!answers || answers.length === 0) {
                const empty = document.createElement("li");
                empty.className = "qga-verify-modal__item";
                empty.textContent = "Другие ответы этого респондента в выгрузке не найдены.";
                listNode.appendChild(empty);
            } else {
                for (const answer of answers) {
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
                    listNode.appendChild(item);
                }
            }
        }

        manualBfridsState = loadManualBfridsState();
        manualApiState = loadManualApiState();
        const alreadyInManualSet = getManualBfridsSetForProject(projectIdForModal);
        const isAlreadyInManual = alreadyInManualSet.has(respondentIdStr);
        const hasManualToken = hasVerificationTokenForProject(projectIdForModal);

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
            manualCheckbox.disabled = isAlreadyInManual || isIncorrectFromRating || !hasManualToken;
            if (!isAlreadyInManual && !isIncorrectFromRating && hasManualToken) {
                manualCheckbox.addEventListener("change", () => {
                    const id = manualCheckbox.dataset.respondentId;
                    if (!id) return;
                    if (manualCheckbox.checked) {
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
            if (!hasManualToken) {
                const manualHint = document.createElement("div");
                manualHint.className = "qga-verify-modal__manual-hint";
                manualHint.style.marginTop = "6px";
                manualHint.style.fontSize = "12px";
                manualHint.style.color = "#6b7280";
                manualHint.textContent = "Чтобы добавить в ручную чистку, откройте вкладку «Ручная чистка» этого проекта, нажмите «Добавить брак» и сохраните.";
                footerNode.appendChild(manualHint);
            }
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
            titleNode.textContent = "Респонденты с данным ответом";
        }

        if (listNode) {
            manualBfridsState = loadManualBfridsState();
            manualApiState = loadManualApiState();
            const alreadyInManualSet = getManualBfridsSetForProject(projectIdCandidates);
            const hasManualTokenCandidates = hasVerificationTokenForProject(projectIdCandidates);

            if (!hasManualTokenCandidates && bodyNode) {
                const manualHint = document.createElement("div");
                manualHint.className = "qga-verify-modal__manual-hint";
                manualHint.style.padding = "8px 12px";
                manualHint.style.marginBottom = "8px";
                manualHint.style.fontSize = "12px";
                manualHint.style.color = "#6b7280";
                manualHint.style.background = "#f3f4f6";
                manualHint.style.borderRadius = "4px";
                manualHint.textContent = "Чтобы добавлять респондентов в ручную чистку, откройте вкладку «Ручная чистка» этого проекта, нажмите «Добавить брак» и сохраните.";
                bodyNode.insertBefore(manualHint, listNode);
            }

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
                manualCheckbox.disabled = isAlreadyInManual || isIncorrectFromRating || !hasManualTokenCandidates;
                if (!isAlreadyInManual && !isIncorrectFromRating && hasManualTokenCandidates) {
                    manualCheckbox.addEventListener("change", () => {
                        const id = manualCheckbox.dataset.respondentId;
                        if (!id) return;
                        if (manualCheckbox.checked) {
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

                if (!answers || answers.length === 0) {
                    const empty = document.createElement("div");
                    empty.className = "qga-verify-modal__text";
                    empty.textContent = "Другие ответы этого респондента в выгрузке не найдены.";
                    headerItem.appendChild(empty);
                } else {
                    for (const answer of answers) {
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
                manualRow.style.borderTop = "1px solid #e5e7eb";
                manualRow.style.display = "flex";
                manualRow.style.alignItems = "center";
                manualRow.style.gap = "6px";
                manualRow.appendChild(manualCheckbox);
                manualRow.appendChild(document.createTextNode("В ручную чистку"));
                headerItem.appendChild(manualRow);

                listNode.appendChild(headerItem);
            }
        }

        modal.style.display = "flex";
        return context;
    }
