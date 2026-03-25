"use strict";

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
            applied.push("projectName");
        }
        if (fillProjectField("#Id", payload.projectId)) {
            applied.push("projectId");
        }
        if (fillProjectField("#Plan", payload.plan)) {
            applied.push("plan");
        }
        if (fillProjectField("#DbName", payload.dbName)) {
            applied.push("dbName");
        }

        return applied;
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
