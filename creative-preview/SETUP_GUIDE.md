# Setup guide (one-off)

Do this once for your team. Then use [`NEW_CLIENT_CHECKLIST.md`](NEW_CLIENT_CHECKLIST.md) for each client.

## What you need

- A Google Workspace account that can edit the approval spreadsheets.
- Access to the clients' ad accounts on each platform.
- For Meta and Pinterest: an approved developer app and an access token with read access to ads.
- Optional, for editing scripts on your computer: Node.js, Git and `clasp` (Google's command-line tool for Apps Script).

## 1. Build the master template spreadsheet

1. Create a new Google Sheet called something like `Creative Approvals - TEMPLATE`.
2. Add one protected tab per platform: `TEMPLATE - Meta`, `TEMPLATE - TikTok`, `TEMPLATE - Pinterest`.
3. Type the row 1 headers exactly as listed in [`HOW_IT_WORKS.md`](HOW_IT_WORKS.md#sheet-layouts-row-1-headers).
4. On the TikTok tab, add the four formulas from [`scripts/tiktok/TIKTOK_FORMULAS.md`](scripts/tiktok/TIKTOK_FORMULAS.md) to row 2.
5. Add a dropdown to the `CLIENT APPROVAL` column (Data → Data validation), e.g. `Approved / Changes needed / Rejected`.

## 2. Add the scripts to the template

1. In the template, open **Extensions → Apps Script**.
2. Paste in [`scripts/meta/MetaPreviews.gs`](scripts/meta/MetaPreviews.gs) and save.
3. If you add a Pinterest script, make sure the project still has **only one** `onOpen` function.
4. Reload the sheet. A **Creative Previews** menu should appear.

Because the script is part of the template, every copy of the template gets it automatically.

## 3. Store access tokens safely

In Apps Script go to **Project Settings → Script Properties** and add:

| Property | Used by |
|---|---|
| `META_ACCESS_TOKEN` | Meta script |
| `PINTEREST_ACCESS_TOKEN` (plus whatever your Pinterest script needs) | Pinterest script |

TikTok needs no token.

- **Never** paste a token into the code, a GitHub issue, a pull request or a chat.
- Anyone who can edit the Apps Script project can read these properties, so keep the editor list short.
- Tokens expire. Record each token's expiry date privately and renew it before then. If a token is ever exposed, revoke it and make a new one.

## 4. (Optional) Keep scripts in Git with clasp

```bash
npm install -g @google/clasp
```

```bash
clasp login
```

```bash
clasp clone YOUR_SCRIPT_ID
```

Then edit, check your changes, and send them back to Google:

```bash
clasp push
```

- Don't commit `.clasp.json`: it holds the private project ID. The `.gitignore` already blocks it.
- Only run `clasp push` after a pull request has been reviewed and the change tested on a copy.

## 5. Check it works

- **Meta:** on a copy, run one ad you know is valid and one deliberately wrong ID. Check that the details are right, the link opens the right ad, Status is correct, and the approval column hasn't changed.
- **TikTok:** paste a real export. Check that the IDs still have all their digits and the links open.
- **Pinterest:** test one ad ID from each ad account and check that each link opens the right ad.

## Troubleshooting

| Problem | Fix |
|---|---|
| Meta: token or permission error | Renew the token. Check it can see that ad account. |
| Meta: "No preview available" | The ad may be deleted or not viewable. Check it in Ads Manager. |
| TikTok: Ad ID blank | Use the **Bulk Ads Sharing** export, not the normal report export. |
| TikTok: IDs ending in 000 | They were rounded. Re-import the file as plain text. |
| Pinterest: wrong preview on an ad | You're matching by name. Match by ID. |
| Duplicate or missing menu | There's more than one `onOpen`. Keep exactly one. |
| Old links stopped working | Previews expired. Re-run or re-export. |
