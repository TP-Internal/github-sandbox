# Pinterest — what a generator script must do

**No Pinterest script is included yet.** If you already have a working one, export it from Apps Script (e.g. `clasp clone`), **remove any tokens, client names and account IDs**, test it, then add it here. If you're writing a new one, label it as new and test it on a copy first.

## Requirements

1. **Input:** ad IDs pasted in column A, one per row.
2. **Clean the IDs:** strip any letter prefix from Ads Manager exports (e.g. `PP123…` → `123…`). Confirm this with one known ad before trusting it.
3. **Multiple ad accounts:** read the client's ad account IDs from Script Properties, never from the code, and search all of them.
4. **Find each ad:** look up its campaign, ad group and name, matching **by ID**.
5. **Get previews:** call `POST /v5/ad_accounts/{ad_account_id}/campaign_ad_preview`. It works per **ad group**, in batches of up to 100. Match each result back to the right ad **by ID, never by name**.
6. **Write output:** Account, Campaign Name, Ad Set Name, Ad Name, a `View Ad` link in Creative Preview, and a Status (`Success`, `No preview available`, `Invalid Ad ID`, `Error: …`).
7. **Never touch** the `CLIENT APPROVAL` column.
8. **No `onOpen`** in this file if the Meta script already provides the menu. Add a menu item to the existing `onOpen` instead.
9. **Diagnostics:** a read-only function that checks a few IDs and reports which account matched, without writing anything to the sheet.

## Practical tips

- Your developer app needs **production** access. Check which permissions the preview endpoint currently needs; read-only access has not always been enough.
- Previews expire after roughly 30 days, so plan a refresh.
- Clients can have thousands of ads. Cache the ad lists rather than downloading everything on every run.
- Plan how tokens get renewed if you want refreshes to run automatically.
- Never log tokens or full API responses.

## Testing

Before using it for a client, test one ad ID from **each** of the client's ad accounts. Check that each link opens the right ad and that the approvals are unchanged.
