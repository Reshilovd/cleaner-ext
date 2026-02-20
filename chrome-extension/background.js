chrome.action.onClicked.addListener((tab) => {
    if (!tab || !tab.id) {
        return;
    }

    chrome.tabs.sendMessage(tab.id, { target: "qga", type: "toggle_panel" }, () => {
        // If there is no receiver on this page, ignore the runtime error.
        void chrome.runtime.lastError;
    });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.target !== "qga") {
        return;
    }

    if (message.type !== "open_new_tab") {
        return;
    }

    const url = typeof message.url === "string" ? message.url.trim() : "";
    if (!url) {
        sendResponse({ ok: false, error: "empty url" });
        return;
    }

    try {
        chrome.tabs.create({ url, active: true }, () => {
            if (chrome.runtime.lastError) {
                sendResponse({ ok: false, error: chrome.runtime.lastError.message || "tabs.create failed" });
                return;
            }
            sendResponse({ ok: true });
        });
    } catch (error) {
        sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
    }

    return true;
});
