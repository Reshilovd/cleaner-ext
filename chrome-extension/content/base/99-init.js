"use strict";

if (QGA_CONTENT_SHOULD_RUN) {
    PAGE_KIND = detectPageKind();
    manualBfridsState = loadManualBfridsState();
    manualApiState = loadManualApiState();
    ratingIncorrectIdsState = loadRatingIncorrectIdsState();
    verifyIncorrectIdsState = loadVerifyIncorrectIdsState();
    init();
}
