# How it works

## The idea

For every campaign you make **one tab** in the client's approval spreadsheet. Each row is one ad. The left-hand columns hold the ad details, plus a link that opens a preview of the ad. The last column is where the client marks it approved (or not).

The tools only ever fill in the detail and preview columns. **They never touch the approval column**, so you can re-run them to refresh links without losing the client's decisions.

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Master template tab | Starts with `TEMPLATE` (and is protected) | `TEMPLATE - Meta` |
| Campaign tab | `<Platform> - <Campaign>` | `Meta - Spring Sale` |
| Approval column header | `CLIENT APPROVAL` | — |

Use the same headers in every client's sheet. The Meta script finds its columns **by header name**, so the order can change but the header spelling must match exactly.

## Sheet layouts (row 1 headers)

**Meta**

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Meta Ad ID | Account | Campaign Name | Ad Set Name | Ad Name | Creative Preview | Status | CLIENT APPROVAL |

`Status` reports **whether the script managed to fetch that row**. It is not the ad's live or paused state in Meta. The possible values are: `Success`, `No preview available`, `Invalid Ad ID`, and `Error: <reason>`.

**TikTok**

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| TikTok Ad ID | Account | Campaign Name | Ad Set Name | Ad Name | Creative Preview | CLIENT APPROVAL |

Paste the raw export starting at **AA2**. The headers in AA2:AG2 are: `Ad Group | Ad Group ID | Ad Name | Ad ID | Creative Name | Preview link | Expiration time`. Formulas in row 2 then fill A, D, E and F (see [`scripts/tiktok/TIKTOK_FORMULAS.md`](scripts/tiktok/TIKTOK_FORMULAS.md)). You type Account and Campaign in yourself.

**Pinterest**

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Pinterest Ad ID | Account | Campaign Name | Ad Set Name | Ad Name | Creative Preview | Status | CLIENT APPROVAL |

This matches the Meta layout, so one template covers both.

## Meta

- An Apps Script menu: **Creative Previews → Generate Meta Previews**.
- For each ad ID it calls the Meta Marketing API for the ad's name, account, campaign, ad set and `preview_shareable_link`. It also looks up each account's name once and remembers it.
- The access token lives in Script Property `META_ACCESS_TOKEN`. It needs `ads_read` and access to every ad account you want to preview.
- One failing row doesn't stop the others. The error is written into that row's Status.
- The API version is set at the top of the script. Check it is still supported before each new client setup.

## TikTok

- No API or script. TikTok Ads Manager's **Bulk Ads Sharing** export already includes a preview link for each ad.
- Use **Bulk Ads Sharing**, not the normal reporting export. The normal export sometimes leaves the Ad ID blank.
- Long IDs can get rounded if the file is opened in Excel first. Import the file straight into Google Sheets **as plain text**.
- Preview links expire. The `Expiration time` column tells you when, so re-export before that date.

## Pinterest

- Pinterest ad IDs in Ads Manager exports may start with a letter prefix (e.g. `PP`). Remove the prefix to get the number the API uses. Check this on one known ad first.
- Pinterest makes previews **per ad group**, not per ad (`POST /v5/ad_accounts/{ad_account_id}/campaign_ad_preview`). The script has to match each preview back to the right ad **by ID**, never by name.
- Your Pinterest developer app needs production access. Check which permissions the preview endpoint currently needs, because it has needed more than read-only access before.
- Preview links expire after roughly 30 days, so refresh them on a schedule.
- If a client has several ad accounts, the script needs to search all of them. Cache the ad lists so it doesn't download every ad on every run.

A ready-made Pinterest script is **not included**. See [`scripts/pinterest/PINTEREST_GUIDE.md`](scripts/pinterest/PINTEREST_GUIDE.md) for what one must do.

## Lessons learned (apply to every client)

1. **Ad names are not unique.** The same name is often reused across regions, audiences or campaigns. Always match by **ID**, never with a name lookup such as `VLOOKUP` on the ad name.
2. **Keep IDs as text.** Spreadsheets round long numbers.
3. **Don't sort or replace raw exports after the client starts approving**, unless you re-match the approvals by ad ID.
4. **Only one `onOpen` function per Apps Script project.** Two of them clash and produce duplicate or missing menus. If you combine platforms, have one function build the whole menu.
5. **Preview links expire.** If a refresh fails, show that the link is out of date rather than quietly keeping the old one.
6. **Tokens expire.** Note each token's expiry date somewhere private, outside this repo, and renew it before then.
