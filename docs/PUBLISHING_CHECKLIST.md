# Publishing Checklist

## Before first submission

1. Confirm that the extension works only on the intended domains and pages.
2. Verify that `manifest.json` contains only the permissions and host access that are actually required.
3. Replace the support contact placeholder in `docs/PRIVACY_POLICY.md`.
4. Prepare Chrome Web Store screenshots that show:
   - OpenEnds grouping;
   - VerifyMain respondent lookup;
   - manual cleanup workflow;
   - Pyrus to Cleaner project transfer.
5. Decide whether the listing should be `Unlisted` or `Private`.
6. Prepare a ZIP package from the contents of the `chrome-extension` folder.

## Chrome Web Store form

1. Use the text from `docs/CHROME_WEB_STORE_LISTING.md` for:
   - store description;
   - single purpose explanation;
   - permissions justification;
   - privacy answers draft.
2. Host `docs/PRIVACY_POLICY.md` at a public HTTPS URL and paste that URL into the privacy policy field.
3. In the privacy questionnaire, answer consistently with the actual behavior of the extension.
4. Mention clearly that the extension is an internal productivity tool for Cleaner and Pyrus.

## Release workflow

1. Increase `version` in `chrome-extension/manifest.json`.
2. Rebuild or repackage the extension ZIP.
3. Upload the new ZIP to the existing Chrome Web Store item.
4. Wait for review and publication.
5. After approval, users installed from the Store will receive the update automatically.

## Final manual checks

1. Install the packaged build in a clean Chrome profile.
2. Check the extension on:
   - Cleaner project edit page;
   - Cleaner VerifyMain page;
   - Cleaner projects list;
   - Pyrus task page.
3. Confirm there are no console errors on load.
4. Confirm the extension still works after a hard page refresh.
