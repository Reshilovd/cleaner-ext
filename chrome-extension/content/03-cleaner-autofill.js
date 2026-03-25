"use strict";

    var CLEANER_AUTO_FILL_MISSING_PAYLOAD_MESSAGE =
        "\u041d\u0435\u0442 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043d\u044b\u0445 \u0434\u0430\u043d\u043d\u044b\u0445. " +
        "\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0443 " +
        "\"\u0412 CleanerUI\" \u0432 \u0432\u0435\u0440\u0445\u043d\u0435\u043c \u0431\u043b\u043e\u043a\u0435 \u043a\u043d\u043e\u043f\u043e\u043a " +
        "\u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435 Pyrus " +
        "(\u0440\u044f\u0434\u043e\u043c \u0441 \u041d\u043e\u0432\u044b\u0439 \u043a\u043b\u0438\u0435\u043d\u0442).";

    var CLEANER_AUTO_FILL_OPEN_FORM_MESSAGE =
        "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0444\u043e\u0440\u043c\u0443 " +
        "\"\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442\" \u0432 CleanerUI " +
        "\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438. " +
        "\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0444\u043e\u0440\u043c\u0443 \u0432\u0440\u0443\u0447\u043d\u0443\u044e.";

    var CLEANER_AUTO_FILL_APPLY_FAILED_MESSAGE =
        "\u0414\u0430\u043d\u043d\u044b\u0435 \u043f\u0440\u043e\u0435\u043a\u0442\u0430 \u043d\u0430\u0439\u0434\u0435\u043d\u044b, " +
        "\u043d\u043e \u0444\u043e\u0440\u043c\u0443 \u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c " +
        "\u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438.";

    var CLEANER_PROJECT_OPEN_TEXT_MARKERS = [
        "\u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442",
        "\u0441\u043e\u0437\u0434\u0430\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442"
    ];

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
            url.searchParams.delete(PROJECT_PREFILL_QUERY_KEY);
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
            alert(CLEANER_AUTO_FILL_MISSING_PAYLOAD_MESSAGE);
            return;
        }

        const opened = await ensureCleanerProjectFormOpen();
        if (!opened) {
            clearCleanerAutoFillRequest();
            alert(CLEANER_AUTO_FILL_OPEN_FORM_MESSAGE);
            return;
        }

        const applied = await applyProjectPayloadToCleanerFormWithRetries(payload, 30, 180);
        clearCleanerAutoFillRequest();

        if (applied.length === 0) {
            alert(CLEANER_AUTO_FILL_APPLY_FAILED_MESSAGE);
            return;
        }

        const notFoundByXPath = payload.notFoundByXPath;
        if (notFoundByXPath && notFoundByXPath.length > 0) {
            alert(
                `\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043d\u0430\u0439\u0442\u0438 ` +
                `\u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435: ${notFoundByXPath.join(", ")}. ` +
                `\u041e\u0441\u0442\u0430\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f ` +
                `\u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u044b.`
            );
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

            if (CLEANER_PROJECT_OPEN_TEXT_MARKERS.some((marker) => text.includes(marker))) {
                return candidate;
            }
        }

        return null;
    }
