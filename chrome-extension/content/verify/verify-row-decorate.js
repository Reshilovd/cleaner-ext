"use strict";

    function applyVerifyRowVisibility(gridRoot, options) {
        if (!gridRoot) return;
        const rowsFromOptions =
            options && Array.isArray(options.rows)
                ? options.rows.filter((row) => row instanceof HTMLTableRowElement)
                : null;
        const projectId = getProjectIdForVerify();
        const alreadyInManualSet = projectId ? getManualBfridsSetForProject(projectId) : new Set();
        const verifyIncorrectSet = projectId ? getVerifyIncorrectIdsSetForProject(projectId) : new Set();
        const ratingReasonMap = projectId ? getRatingReasonCodesForProject(projectId) : {};
        const rows = rowsFromOptions || gridRoot.querySelectorAll("tr.k-master-row");
        const REASON_ICON_CONFIG = {
            1: { url: chrome.runtime.getURL("icons/inc.png"), alt: "Некорректный ответ" },
            3: { url: chrome.runtime.getURL("icons/table.png"), alt: "Одинаковые табличные ответы" },
            4: { url: chrome.runtime.getURL("icons/speed.png"), alt: "Спидстер" },
            6: { url: chrome.runtime.getURL("icons/manual.png"), alt: "Ручная чистка" }
        };

        const ROW_BG_COLOR = {
            1: "#fee2e2",
            2: "#f3e8ff",
            3: "#dbeafe",
            4: "#ffedd5",
            6: "#fef9c3"
        };
        const ROW_BG_HOVER_COLOR = {
            1: "rgb(250, 204, 204)",
            2: "#e9d5ff",
            3: "#bfdbfe",
            4: "rgb(249, 225, 192)",
            6: "#fef08a"
        };

        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) continue;
            row.classList.remove("qga-verify-row-hidden");
            row.classList.remove("qga-verify-row-gradient-incorrect-speedster");
            ALL_ROW_REASON_CLASSES.forEach((cls) => row.classList.remove(cls));

            const { incorrect, postpone } = getVerifyRowIncorrectPostpone(gridRoot, row);
            const hasManualOverride = incorrect || postpone;

            if (hasManualOverride) {
                row.style.removeProperty("background");
                row.style.removeProperty("background-color");
                row.style.removeProperty("--qga-row-hover-gradient");
                delete row.dataset.qgaRowGradient;
                row.classList.remove("qga-verify-row-gradient-incorrect-speedster");
                if (incorrect) {
                    row.style.setProperty("background", "rgb(250, 204, 204)", "important");
                    row.dataset.qgaManualOverrideBg = "incorrect";
                } else if (postpone) {
                    row.style.setProperty("background", "#e5e7eb", "important");
                    row.dataset.qgaManualOverrideBg = "postpone";
                }
                continue;
            }

            if (row.dataset.qgaManualOverrideBg) {
                row.style.removeProperty("background");
                row.style.removeProperty("background-color");
                delete row.dataset.qgaManualOverrideBg;
            }

            let allCodes = [];
            let topCode = 0;

            if (state.verifyRespondentIndexLoaded) {
                const ids = getRespondentIdsForVerifyRow(row);
                if (ids && ids.length > 0) {
                    const codesSet = [];
                    let hasAnyReasons = false;
                    let hasCleanRespondent = false;

                    for (const respondentId of ids) {
                        const codes = getRespondentAllReasonCodes(
                            respondentId,
                            verifyIncorrectSet,
                            ratingReasonMap,
                            alreadyInManualSet
                        );

                        if (Array.isArray(codes) && codes.length > 0) {
                            hasAnyReasons = true;
                            for (const c of codes) {
                                if (codesSet.indexOf(c) === -1) {
                                    codesSet.push(c);
                                }
                            }
                        } else {
                            hasCleanRespondent = true;
                        }
                    }

                    if (hasAnyReasons && !hasCleanRespondent) {
                        allCodes = codesSet;
                        topCode = getTopReasonCode(allCodes);
                    }
                }
            }

            let appliedGradient = false;
            if (allCodes.length > 1) {
                const colors = allCodes.map((c) => ROW_BG_COLOR[c]).filter(Boolean);
                const hoverColors = allCodes.map((c) => ROW_BG_HOVER_COLOR[c]).filter(Boolean);
                if (colors.length > 1) {
                    row.style.background = "linear-gradient(to right, " + colors.join(", ") + ")";
                    row.dataset.qgaRowGradient = "1";
                    if (hoverColors.length > 1) {
                        row.style.setProperty("--qga-row-hover-gradient", "linear-gradient(to right, " + hoverColors.join(", ") + ")");
                    } else {
                        row.style.removeProperty("--qga-row-hover-gradient");
                    }
                    if (allCodes.includes(1) && allCodes.includes(4)) {
                        row.classList.add("qga-verify-row-gradient-incorrect-speedster");
                    }
                    appliedGradient = true;
                }
            }

            if (!appliedGradient) {
                if (row.dataset.qgaRowGradient === "1") {
                    row.style.removeProperty("background");
                    row.style.removeProperty("--qga-row-hover-gradient");
                    delete row.dataset.qgaRowGradient;
                }
                const rowClass = REASON_CODE_ROW_CLASS[topCode];
                if (rowClass) {
                    row.classList.add(rowClass);
                }
            }

            const firstCell = row.querySelector("td[role='gridcell']");
            if (firstCell) {
                let textWrap = firstCell.querySelector(".qga-cell-text");
                if (!textWrap) {
                    textWrap = document.createElement("span");
                    textWrap.className = "qga-cell-text";
                    while (firstCell.childNodes.length) {
                        textWrap.appendChild(firstCell.childNodes[0]);
                    }
                    firstCell.appendChild(textWrap);
                }

                let iconsWrap = textWrap.querySelector(".qga-reason-icons");
                const neededCodes = allCodes.filter((c) => REASON_ICON_CONFIG[c]);

                if (neededCodes.length > 0) {
                    if (!iconsWrap) {
                        iconsWrap = document.createElement("span");
                        iconsWrap.className = "qga-reason-icons";
                        textWrap.appendChild(iconsWrap);
                    }

                    const currentSrcs = new Set(
                        Array.from(iconsWrap.querySelectorAll("img")).map((img) => img.src)
                    );
                    const neededSrcs = new Set(neededCodes.map((c) => REASON_ICON_CONFIG[c].url));

                    if (currentSrcs.size !== neededSrcs.size || ![...currentSrcs].every((s) => neededSrcs.has(s))) {
                        iconsWrap.innerHTML = "";
                        for (const code of neededCodes) {
                            const cfg = REASON_ICON_CONFIG[code];
                            const icon = document.createElement("img");
                            icon.src = cfg.url;
                            icon.alt = cfg.alt;
                            icon.title = cfg.alt;
                            iconsWrap.appendChild(icon);
                        }
                    }
                } else if (iconsWrap) {
                    iconsWrap.remove();
                }
            }

        }
    }

    /**
     * @param {HTMLElement | null} [triggerButton] — кнопка, по которой кликнули (например «Посмотреть»); на ней показывается анимация загрузки
     */

    function decorateVerifyRows(gridRoot) {
        const headerRow = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
        if (headerRow) {
            const headerCells = headerRow.querySelectorAll("th[role='columnheader']");
            const lastHeaderCell =
                headerCells[headerCells.length - 1] || headerRow.querySelector("th:last-child");

            if (!headerRow.querySelector(".qga-resp-header")) {
                const respHeader = document.createElement("th");
                respHeader.scope = "col";
                respHeader.role = "columnheader";
                respHeader.className = "k-header qga-resp-header";
                respHeader.style.textAlign = "center";
                respHeader.textContent = "Другие ответы";

                headerRow.appendChild(respHeader);
            }

            // Обновляем colgroup: добавляем колонку «Другие ответы» и сужаем «Отложить».
            const updateColgroup = (root) => {
                const colgroup = root ? root.querySelector("colgroup") : null;
                if (!colgroup) {
                    return;
                }
                if (colgroup.querySelector("col.qga-resp-col")) {
                    return;
                }
                const cols = colgroup.querySelectorAll("col");
                if (!cols.length) {
                    return;
                }
                const lastCol = cols[cols.length - 1];

                const respCol = document.createElement("col");
                respCol.className = "qga-resp-col";
                respCol.style.width = "170px";
                colgroup.appendChild(respCol);

                lastCol.style.width = "110px";
            };

            const headerWrap = gridRoot.querySelector(".k-grid-header-wrap");
            const contentWrap = gridRoot.querySelector(".k-grid-content");
            updateColgroup(headerWrap);
            updateColgroup(contentWrap);
        }

        const rows = gridRoot.querySelectorAll("tr.k-master-row");
        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) {
                continue;
            }

            const cells = row.querySelectorAll("td[role='gridcell']");
            const lastCell =
                cells[cells.length - 1] ||
                row.querySelector("td:last-child") ||
                (row.lastElementChild instanceof HTMLTableCellElement ? row.lastElementChild : null);
            if (!lastCell) {
                continue;
            }

            // Добавляем колонку "Другие ответы" (кнопка «Посмотреть»).
            if (!row.querySelector("td.qga-resp-cell")) {
                const respCell = document.createElement("td");
                respCell.className = "qga-resp-cell qga-verify-cell";
                respCell.setAttribute("role", "gridcell");
                respCell.style.textAlign = "center";
                respCell.style.verticalAlign = "middle";
                respCell.style.padding = "0";

                const wrap = document.createElement("div");
                wrap.className = "qga-verify-cell-wrap";
                wrap.style.display = "flex";
                wrap.style.alignItems = "center";
                wrap.style.justifyContent = "center";
                wrap.style.width = "100%";
                wrap.style.height = "100%";

                const button = document.createElement("button");
                button.type = "button";
                button.className = "qga-verify-show-respondent";
                button.textContent = "Посмотреть";

                wrap.appendChild(button);
                respCell.appendChild(wrap);

                const afterLast = lastCell.nextSibling;
                row.insertBefore(respCell, afterLast || null);
            }

            setupVerifyRowExclusiveCheckboxes(gridRoot, row);
        }
        applyVerifyRowVisibility(gridRoot);
    }

    function setupVerifyRowExclusiveCheckboxes(gridRoot, row) {
        if (!gridRoot || !row || !(row instanceof HTMLTableRowElement)) {
            return;
        }
        if (row.dataset.qgaExclusiveCheckboxesBound === "1") {
            return;
        }
        row.dataset.qgaExclusiveCheckboxesBound = "1";

        const { incorrectIndex, postponeIndex } = getVerifyHeaderIndexes(gridRoot);

        const cells = row.querySelectorAll("td[role='gridcell']");
        if (!cells.length) {
            return;
        }

        const incorrectCell =
            incorrectIndex >= 0 && incorrectIndex < cells.length ? cells[incorrectIndex] : null;
        const incorrectCheckbox = incorrectCell
            ? incorrectCell.querySelector("input[type='checkbox']")
            : null;

        const postponeCell =
            postponeIndex >= 0 && postponeIndex < cells.length ? cells[postponeIndex] : null;
        const postponeCheckbox = postponeCell
            ? postponeCell.querySelector("input[type='checkbox']")
            : null;

        const group = [incorrectCheckbox, postponeCheckbox].filter(
            (cb) => cb instanceof HTMLInputElement
        );
        if (group.length <= 1) {
            return;
        }

        const handleChange = (changed) => {
            if (!(changed instanceof HTMLInputElement)) {
                return;
            }
            const isChecked = !!changed.checked;
            if (!isChecked) {
                return;
            }
            for (const cb of group) {
                if (cb === changed) {
                    continue;
                }
                if (!(cb instanceof HTMLInputElement)) {
                    continue;
                }
                if (!cb.checked) {
                    continue;
                }
                cb.checked = false;
                cb.dispatchEvent(
                    new Event("change", {
                        bubbles: true
                    })
                );
            }
        };

        for (const cb of group) {
            if (!(cb instanceof HTMLInputElement)) {
                continue;
            }
            cb.addEventListener("change", () => handleChange(cb));
        }
    }
