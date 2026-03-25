"use strict";

    async function ensureVerifyRespondentIndexLoaded(triggerButton) {
        if (state.verifyRespondentIndexLoaded) {
            return true;
        }

        if (state.verifyRespondentIndexPromise) {
            return await waitForVerifyRespondentIndexPromise(state.verifyRespondentIndexPromise, triggerButton);
        }

        const projectId = getProjectIdForVerify();
        if (!projectId) {
            state.verifyRespondentIndexError =
                "Не удалось определить идентификатор проекта (ProjectId) на странице VerifyMain.";
            console.warn("[QGA] VerifyMain: не найден ProjectId для загрузки выгрузки OpenEnds.");
            return false;
        }

        state.verifyRespondentIndexLoading = true;
        state.verifyRespondentIndexError = null;

        const loadPromise = (async () => {
            try {
                const url = `/lk/OpenEnds2/DownloadOpenEnds/${encodeURIComponent(String(projectId))}`;
                console.info("[QGA] VerifyMain: загрузка выгрузки OpenEnds (XLSX) с", url);

                const response = await fetch(url, { credentials: "include" });
                if (!response.ok) {
                    state.verifyRespondentIndexError = `Сервер вернул статус ${response.status} при загрузке OpenEnds.`;
                    console.warn("[QGA] VerifyMain: ошибка ответа при загрузке OpenEnds:", response.status);
                    return false;
                }

                const buffer = await response.arrayBuffer();
                const parsed = parseOpenEndsFromXlsx(buffer);
                if (!parsed.ok) {
                    state.verifyRespondentIndexError = parsed.error || "Не удалось разобрать выгрузку OpenEnds.";
                    console.warn("[QGA] VerifyMain: ошибка разбора выгрузки OpenEnds:", parsed.error);
                    return false;
                }

                state.verifyRespondentIdsByOpenEndId = parsed.respondentIdsByOpenEndId;
                state.verifyAnswersByRespondentId = parsed.answersByRespondentId;
                state.verifyRespondentIdsByQuestionAndValue = parsed.respondentIdsByQuestionAndValue;
                state.verifyRespondentIdsByValueOnly = parsed.respondentIdsByValueOnly;
                state.verifyRespondentIndexLoaded = true;
                console.info("[QGA] VerifyMain: индекс ответов респондентов успешно построен.");
                return true;
            } catch (error) {
                console.error("[QGA] VerifyMain: исключение при загрузке/разборе OpenEnds:", error);
                state.verifyRespondentIndexError = "Ошибка сети или формата при загрузке выгрузки OpenEnds.";
                return false;
            } finally {
                state.verifyRespondentIndexLoading = false;
                if (state.verifyRespondentIndexPromise === loadPromise) {
                    state.verifyRespondentIndexPromise = null;
                }
            }
        })();

        state.verifyRespondentIndexPromise = loadPromise;
        return await waitForVerifyRespondentIndexPromise(loadPromise, triggerButton);
    }

    async function waitForVerifyRespondentIndexPromise(promise, triggerButton) {
        if (!promise) {
            return false;
        }

        const button = triggerButton instanceof HTMLElement ? triggerButton : null;
        const shouldRestoreDisabled =
            button && "disabled" in button && button.disabled === false;

        if (shouldRestoreDisabled) {
            button.disabled = true;
        }

        try {
            return await promise;
        } finally {
            if (shouldRestoreDisabled) {
                button.disabled = false;
            }
        }
    }

    /** Отправить выбранные respondent ID в ручную чистку (вызывается из модалки «Другие ответы»). */
    async function sendRespondentIdsToManualCleanup(idsArray) {
        if (!idsArray || idsArray.length === 0) {
            return;
        }
        const projectId = getProjectIdForVerify();
        if (!projectId) {
            alert("Не удалось определить проект.");
            return;
        }
        const ok = await ensureVerifyRespondentIndexLoaded();
        if (!ok) {
            if (state.verifyRespondentIndexError) {
                console.warn("[QGA]", state.verifyRespondentIndexError);
            }
            return;
        }
        const normalized = idsArray.map((id) => String(id).trim()).filter(Boolean);
        if (normalized.length === 0) {
            return;
        }
        addManualBfridsForProject(projectId, normalized);
        try {
            await sendManualBfridsToServer(projectId, normalized);
        } catch (error) {
            console.error("[QGA] Ошибка при отправке bfrid в ручную чистку через API:", error);
            alert("Ошибка при отправке в ручную чистку. Подробности в консоли.");
            return;
        }
        console.info(
            "[QGA] Добавлено bfrid в буфер ручной чистки для проекта",
            projectId,
            "кол-во:",
            normalized.length
        );
    }
