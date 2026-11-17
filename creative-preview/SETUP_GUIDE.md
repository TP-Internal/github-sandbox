# Setup guide (one-off)

Do this once for your team. Then use [`NEW_CLIENT_CHECKLIST.md`](NEW_CLIENT_CHECKLIST.md) for each client.

## What you need

- A Google Workspace account that can edit the approval spreadsheets.
- Access to the clients' ad accounts on each platform.
- For Meta: an access token with read access to ads. For TikTok and Pinterest: access to your company's developer apps (each person connects TikTok; one person connects Pinterest).
- Optional, for editing scripts on your computer: Node.js, Git and `clasp` (Google's command-line tool for Apps Script).

## 1. Build the master template spreadsheet

1. Create a new Google Sheet called something like `Creative Approvals - TEMPLATE`.
2. Add one protected tab per platform: `TEMPLATE - Meta`, `TEMPLATE - TikTok`, `TEMPLATE - Pinterest`.
3. Type the row 1 headers exactly as listed in [`HOW_IT_WORKS.md`](HOW_IT_WORKS.md#sheet-layouts-row-1-headers).
4. Add an empty tab called `TikTok Preview Links`. TikTok exports get pasted here (see [`HOW_IT_WORKS.md`](HOW_IT_WORKS.md#tiktok)).
5. Add a dropdown to the `CLIENT APPROVAL` column (Data → Data validation), e.g. `Approved / Changes needed / Rejected`.

## 2. Add the scripts to the template

1. In the template, open **Extensions → Apps Script**.
2. Add a file called `Menu` and paste in [`scripts/Menu.gs`](scripts/Menu.gs). It builds the **Creative Previews** menu for every platform.
3. Add a file called `MetaPreviews` and paste in [`scripts/meta/MetaPreviews.gs`](scripts/meta/MetaPreviews.gs). Add other platforms' scripts the same way. Only `Menu.gs` may contain an `onOpen` function.
4. Reload the sheet. A **Creative Previews** menu should appear.

Because the script is part of the template, every copy of the template gets it automatically.

## 3. Store access tokens safely

In Apps Script go to **Project Settings → Script Properties** and add:

| Property | Used by |
|---|---|
| `META_ACCESS_TOKEN` | Meta script |
| `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URI`, `PINTEREST_AD_ACCOUNTS` | Pinterest scripts. The login tokens are added for you. See [`scripts/pinterest/PINTEREST_GUIDE.md`](scripts/pinterest/PINTEREST_GUIDE.md) |

TikTok is different: each person connects their own TikTok login from the menu (**Creative Previews → TikTok setup**). Those details are saved privately to that person, not in Script Properties. See [`HOW_IT_WORKS.md`](HOW_IT_WORKS.md#before-you-start-one-off-per-person).

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
- **TikTok:** on a copy, paste a few IDs, including one from a Smart+ campaign and one made-up ID. Paste the export on **TikTok Preview Links**, then run Generate. Check the details, the links, the expiry note on each link, and that the approval column hasn't changed.
- **Pinterest:** on a copy, paste one ad ID from each account in `PINTEREST_AD_ACCOUNTS` (with the `PP` prefix) plus one made-up ID. Run **Check IDs on this tab**, then Generate. Check each link opens the right ad, the made-up ID shows "not found", and approvals haven't changed.

## Troubleshooting

| Problem | Fix |
|---|---|
| Meta: token or permission error | Renew the token. Check it can see that ad account. |
| Meta: "Preview Unavailable" | The ad may be deleted or not viewable. Check it in Ads Manager. The next Generate run tries it again. |
| TikTok: "TikTok not connected" | Run **Creative Previews → TikTok setup → 2. Connect** (each person does this once). |
| TikTok: "Ad ID not found…" | Tick the ad's account on **TikTok Settings**. Check it was approved when you connected. |
| TikTok: "Preview Unavailable" | Paste the Ads Manager preview export, with its header row, on **TikTok Preview Links** and run Generate again. |
| TikTok: IDs ending in 000 | They were rounded. Re-import the file as plain text. |
| Pinterest: "isn't connected" or "login has expired" | Log in again: see [`PINTEREST_GUIDE.md`](scripts/pinterest/PINTEREST_GUIDE.md#4-log-in). |
| Pinterest: "Couldn't read every Pinterest account" | The login lost access to an account, or an ID in `PINTEREST_AD_ACCOUNTS` is wrong. Run **Pinterest setup → 3. Test connection**. |
| Pinterest: "Ad ID not found" | Add the ad's account to `PINTEREST_AD_ACCOUNTS`. Run **Check IDs on this tab**. |
| Duplicate or missing menu | There's more than one `onOpen`. Keep only the one in `Menu.gs`. |
| Old links stopped working | Previews expired. Re-run or re-export. |
