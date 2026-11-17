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

`Status` is optional and shows **what happened when the script ran on that row**. It is not the ad's live or paused state in Meta. See [Meta → What the Status column means](#what-the-status-column-means).

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

The Meta script reads the ad IDs you paste in, asks Meta for each ad's details and preview link, writes them into the row, then tidies the tab into order.

### Before you start (one-off)

- Two files must be in the spreadsheet's Apps Script project: [`scripts/meta/MetaPreviews.gs`](scripts/meta/MetaPreviews.gs) (the Meta script) and [`scripts/Menu.gs`](scripts/Menu.gs) (the **Creative Previews** menu, shared by all platforms).
- **Script Property needed:** `META_ACCESS_TOKEN`. This is a Meta access token that can read ads (`ads_read`) and has access to **every ad account** whose ads you'll paste in. If the token can't see an account, those rows show an error.
- Tokens expire. When they do, every row fails with a token error and you need to put a new token in.

### What you do

1. Duplicate the Meta `TEMPLATE` tab and name it `Meta - <Campaign>`. The script refuses to run on any tab that doesn't start with `Meta -`, or that starts with `TEMPLATE`.
2. Check row 1 has these headers. The order doesn't matter, but the spelling does (capitals don't):
   - Required: `Meta Ad ID`, `Account`, `Campaign Name`, `Ad Set Name`, `Ad Name`, `Creative Preview`
   - Optional: `Status` (recommended)
3. Paste the ad IDs into the `Meta Ad ID` column, one per row. You can paste them straight from a Meta Ads Manager export. Prefixes such as `a:` are removed automatically.
4. Click **Creative Previews → Generate Meta Previews**.
5. Read the pop-up summary, then check any rows whose Status starts with `ERROR`.

To re-fetch **everything**, for example after creatives have been swapped, use **Creative Previews → Refresh All Meta Previews** instead. It asks you to confirm first.

### What the script does, step by step

1. **Checks the tab name and finds the columns** by their headers. If a required header is missing, it stops and tells you which one.
2. **Cleans each ad ID:** it removes prefixes like `a:`, `c:` or `cg:`, leading apostrophes and spaces. A valid ID is 6 to 25 digits.
3. **Catches rounded IDs.** Meta IDs are about 18 digits long, and Google Sheets rounds any number that long, which breaks it. If an ID was pasted as a number, the row is marked as an error and you need to re-paste it. When the script finishes, it sets the ID column to **plain text** so the next paste keeps all the digits.
4. **Skips rows that are already done.** A row is done if its Status is `Success` and it already has a link. Without a Status column, any row with a link counts as done. This makes re-runs quick: only new or failed rows are fetched. **Refresh All** ignores this and fetches every row.
5. **Asks Meta in batches of 50.** Each request covers up to 50 ads, which is much faster than one at a time. If a batch fails (one bad ID can fail the whole batch), it retries those ads one by one, so only the bad ID shows an error.
6. **Looks up account names.** Meta returns an account number, so the script makes one more batched request to turn it into the account's name.
7. **Fills in each row:** Account, Campaign Name, Ad Set Name, Ad Name, and a **View Ad** link in Creative Preview. If Meta has no preview for that ad, the cell says `Preview Unavailable`.
8. **Writes everything back at once.** This is faster and avoids a half-filled sheet.
9. **Sorts the tab** by Campaign → Ad Set → Ad Name, so related ads sit together. Whole rows move together, so the client's approval stays next to the right ad. Only rows down to the last ad ID are sorted. To keep your paste order, set `SORT_AFTER_GENERATE` to `false` at the top of the script.
10. **Shows a summary**: how many succeeded, had no preview, failed, were already done or were blank, and how many requests were made to Meta.

The approval column is never written to. It only moves when whole rows are sorted.

### What the Status column means

| Status | Meaning | What to do |
|---|---|---|
| `Success` | Details and a working preview link were fetched | Nothing. The row is skipped on later runs |
| `Preview Unavailable` | The ad was found but Meta gave no preview link | Check the ad in Ads Manager (it may be deleted or not previewable). The next **Generate** run tries it again automatically |
| `ERROR: ID was converted to a number and rounded…` | Sheets rounded the ID before the script saw it | Re-paste the original ID. The column is plain text now, so it will paste correctly |
| `ERROR: Not a valid Meta Ad ID` | After cleaning, it isn't 6–25 digits | Check you pasted an **ad** ID, not a name or a campaign ID |
| `ERROR: <message from Meta>` | Meta refused the request, e.g. expired token, no access to that account, or the ad doesn't exist | Fix the cause, then run Generate again (failed rows are retried automatically) |

If there's no Status column, errors are written into the Creative Preview cell instead.

### Settings at the top of the script

| Setting | Default | What it does |
|---|---|---|
| `API_VERSION` | `v26.0` | Which version of Meta's API to use. Meta retires old versions, so check it's still supported |
| `TAB_PREFIX` | `Meta -` | Tabs the script will run on |
| `BATCH_SIZE` | `50` | Ads per request (50 is Meta's maximum) |
| `SUCCESS_STATUS` | `Success` | The Status text that marks a row as done |
| `SORT_AFTER_GENERATE` | `true` | Sort the tab after each run |

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
3. **Only ever move whole rows.** Sorting a single column after the client starts approving separates approvals from their ads. The Meta script sorts whole rows, so that's safe. Don't sort or replace raw exports by hand unless you re-match approvals by ad ID.
4. **Only one `onOpen` function per Apps Script project.** Two of them clash and produce duplicate or missing menus. The one `onOpen` lives in [`scripts/Menu.gs`](scripts/Menu.gs). It only shows menu items for platform scripts that are actually in the project.
5. **Preview links expire.** If a refresh fails, show that the link is out of date rather than quietly keeping the old one.
6. **Tokens expire.** Note each token's expiry date somewhere private, outside this repo, and renew it before then.
