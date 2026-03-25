"use strict";

    function setupOpenEndsVerifyShortcut() {
        ensureOpenEndsVerifyShortcutObserver();
        syncOpenEndsVerifyShortcutButton();
    }

    function ensureOpenEndsVerifyShortcutObserver() {
        if (!document.body || document.body.dataset.qgaOpenEndsVerifyShortcutObserved === "1") {
            return;
        }

        document.body.dataset.qgaOpenEndsVerifyShortcutObserved = "1";

        let timer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                syncOpenEndsVerifyShortcutButton();
            }, 150);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function syncOpenEndsVerifyShortcutButton() {
        const existingButton = document.getElementById(OPENENDS_VERIFY_SHORTCUT_BUTTON_ID);
        if (!isOpenEndsHash()) {
            if (existingButton) {
                existingButton.remove();
            }
            return;
        }

        const pasteButton = findOpenEndsPasteBrandTagsButton();
        if (!pasteButton) {
            if (existingButton) {
                existingButton.remove();
            }
            return;
        }

        const button = existingButton || buildOpenEndsVerifyShortcutButton(pasteButton);
        if (!button) {
            return;
        }

        syncOpenEndsVerifyShortcutButtonAppearance(button, pasteButton);

        const targetUrl = getOpenEndsVerifyShortcutUrl();
        button.disabled = !targetUrl;
        button.dataset.qgaTargetUrl = targetUrl || "";
        button.title = targetUrl
            ? "Перейти к первой ссылке проверки OpenEnds"
            : "Ссылка на проверку недоступна";

        if (pasteButton.nextElementSibling !== button) {
            pasteButton.insertAdjacentElement("afterend", button);
        }
    }

    function findOpenEndsPasteBrandTagsButton() {
        const button = document.querySelector("button[onclick='pasteBrandTags()']");
        return button instanceof HTMLButtonElement ? button : null;
    }

    function buildOpenEndsVerifyShortcutButton(referenceButton) {
        if (!referenceButton) {
            return null;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.id = OPENENDS_VERIFY_SHORTCUT_BUTTON_ID;
        button.textContent = "Перейти к проверке";
        syncOpenEndsVerifyShortcutButtonAppearance(button, referenceButton);
        button.addEventListener("click", handleOpenEndsVerifyShortcutClick);
        return button;
    }

    function syncOpenEndsVerifyShortcutButtonAppearance(button, referenceButton) {
        if (!button || !referenceButton) {
            return;
        }

        button.className = referenceButton.className || "";

        const referenceStyle = referenceButton.getAttribute("style");
        if (referenceStyle) {
            button.setAttribute("style", referenceStyle);
        } else {
            button.removeAttribute("style");
        }

        button.style.marginLeft = "8px";
    }

    function getOpenEndsVerifyShortcutUrl() {
        const link = document.querySelector(".agrid");
        if (!link) {
            return null;
        }

        const rawHref = typeof link.getAttribute === "function"
            ? String(link.getAttribute("href") || "").trim()
            : "";

        if (!rawHref || rawHref === "#") {
            return null;
        }

        if (link instanceof HTMLAnchorElement && link.href) {
            return link.href;
        }

        return rawHref;
    }

    function handleOpenEndsVerifyShortcutClick(event) {
        event.preventDefault();

        const targetUrl = getOpenEndsVerifyShortcutUrl();
        if (!targetUrl) {
            syncOpenEndsVerifyShortcutButton();
            return;
        }

        window.location.assign(targetUrl);
    }
