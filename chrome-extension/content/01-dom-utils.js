"use strict";

    function isElementVisible(node) {
        if (!node || !(node instanceof Element)) {
            return false;
        }

        if (node.getClientRects().length === 0) {
            return false;
        }

        const style = window.getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden";
    }
