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

Use the same headers in every client's sheet. The scripts find their columns **by header name**, so the order can change but the header spelling must match exactly.

## Sheet layouts (row 1 headers)

**Meta**

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Meta Ad ID | Account | Campaign Name | Ad Set Name | Ad Name | Creative Preview | Status | CLIENT APPROVAL |

`Status` is optional and shows **what happened when the script ran on that row**. It is not the ad's live or paused state in Meta. See [Meta → What the Status column means](#what-the-status-column-means).

**TikTok**

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| TikTok Ad ID | Account | Campaign Name | Ad Set Name | Ad Name | Creative Preview | Status | CLIENT APPROVAL |

The same layout as Meta. `Ad Group Name` is also accepted instead of `Ad Set Name`. See [TikTok](#tiktok) for how preview links get in.

**Pinterest**

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Pinterest Ad ID | Account | Campaign Name | Ad Set Name | Ad Name | Creative Preview | Status | CLIENT APPROVAL |

This matches the Meta and TikTok layouts, so one template covers all three.

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

The TikTok script reads the ad IDs you paste in, looks up each ad's account, campaign, ad group and name through TikTok's API, and adds a preview link. Like Meta, it skips finished rows and sorts the tab.

**Where the preview links come from:** the most reliable source is TikTok Ads Manager's **bulk preview export**. If you paste it into the sheet, the script takes each ad's link from there. For ads that have no link in the export, the script asks TikTok's preview API instead. That doesn't always return a link, so if rows say `Preview Unavailable`, paste the export.

### Before you start (one-off, per person)

TikTok's login is saved **per person**, not for the whole spreadsheet. Everyone who runs the TikTok script does these steps once. They're kept in that person's own private settings (Apps Script *User Properties*: `TT_APP_ID`, `TT_SECRET`, `TT_TOKEN`), so they don't appear in Script Properties.

1. Make sure `TikTokPreviews.gs` and `Menu.gs` are in the spreadsheet's Apps Script project.
2. Get the **App ID**, **Secret** and **authorisation link** from your company's TikTok for Business developer app (Marketing API). Ask whoever manages it.
3. **Creative Previews → TikTok setup → 1. Save TikTok App ID & Secret** and paste the App ID and Secret.
4. Open the authorisation link, log in to TikTok and approve the ad accounts. TikTok then sends you to another page: copy that page's **whole web address** (it contains an `auth_code`).
5. **Creative Previews → TikTok setup → 2. Connect** and paste the address. Do this straight away: the code only works once and expires quickly. If it fails, authorise again for a fresh one.
6. *(Recommended)* **Creative Previews → TikTok setup → 3. List TikTok accounts.** This makes a **TikTok Settings** tab listing every account you can access:
   - **Column A** is the name shown in the `Account` column. You can change it, e.g. to a friendlier name.
   - **Untick** the accounts that don't belong to this client. The script then only searches the ticked accounts, which is faster. If nothing is ticked, it searches all of them.
   - Run it again whenever accounts change. Your names and ticks are kept.

### What you do

1. Duplicate the TikTok `TEMPLATE` tab and name it `TikTok - <Campaign>`. The script refuses to run on any other tab, or on a tab with "template" in its name.
2. Check row 1 has these headers (any order; capitals don't matter):
   - Required: `TikTok Ad ID`, `Account`, `Campaign Name`, `Ad Set Name` (or `Ad Group Name`), `Ad Name`, `Creative Preview`
   - Optional: `Status` (recommended)
3. Paste the ad IDs into the `TikTok Ad ID` column, one per row.
4. **Get the preview links:** in TikTok Ads Manager, select the ads and export the bulk preview links. Import the file into Google Sheets **as plain text** and paste it into a tab called **TikTok Preview Links**. The export must keep its header row, which includes `Ad ID` and `Preview link`. One links tab can hold exports for every campaign.
5. Click **Creative Previews → Generate TikTok Previews**.
6. Read the pop-up summary, then check any rows whose Status starts with `ERROR` or says `Preview Unavailable`.

To re-fetch **everything** (for example after creatives have been swapped), use **Creative Previews → Refresh All TikTok Previews**.

**Links expire.** When you paste a fresh export, just run **Generate** again. Finished rows pick up the newer links straight from the export, without contacting TikTok.

### What the script does, step by step

1. **Checks the tab name and finds the columns** by their headers.
2. **Cleans each ID:** it keeps only the digits. A valid ID is 6 to 25 digits.
3. **Catches rounded IDs.** TikTok IDs are about 19 digits long, and Google Sheets rounds numbers that long, which breaks them. Those rows are marked as errors, and the ID column is set to **plain text** so the next paste keeps every digit.
4. **Reads any pasted export**, from the **TikTok Preview Links** tab and from the campaign tab itself. It collects each ad's link and its expiry time. If both have a link for the same ad, the campaign tab's copy wins.
5. **Skips rows that are already done** (Status `Success` with a link). If a newer export has a different link for a done row, the link is swapped in without contacting TikTok. **Refresh All** ignores this and processes every row.
6. **Finds the ads.** For each account (only the ticked accounts if there's a TikTok Settings tab), it asks TikTok for just the IDs it needs, up to 100 per request. Any ID still not found is then checked against that account's **Smart+** ads.
7. **Fills in each row:** Account, Campaign Name, Ad Set Name (TikTok's "ad group"), Ad Name, and a **View Ad** link. The link's expiry date is added as a **note** on the cell: hover over it to see it. Links from the API are given an estimated expiry 30 days ahead.
8. **Leaves formula columns alone.** If a column is filled by a formula, the script doesn't write to it.
9. **Writes everything back at once.**
10. **Sorts the tab** by Campaign → Ad Set → Ad Name, moving whole rows. It **won't sort** a tab that has formula columns or an export pasted on it, because sorting would scramble them. This is why the TikTok Preview Links tab is the recommended place for the export.
11. **Shows a summary** of how many succeeded, had no preview link, failed, were already done or were blank. If TikTok's preview API gave an error, the summary shows that too.

The approval column is never written to.

### What the Status column means

| Status | Meaning | What to do |
|---|---|---|
| `Success` | Details and a preview link were added | Nothing. Skipped on later runs (but still picks up newer links from a fresh export) |
| `Preview Unavailable` | The ad was found but no link came from the export or the API | Paste the bulk preview export (with its header row) and run **Generate** again |
| `ERROR: ID was converted to a number and rounded…` | Sheets rounded the ID before the script saw it | Re-paste the original ID. The column is plain text now |
| `ERROR: Not a valid TikTok Ad ID` | It isn't 6–25 digits | Check you pasted an **ad** ID |
| `ERROR: Ad ID not found in authorised TikTok accounts` | None of the searched accounts has this ad | Check the ID. Make sure its account is ticked on **TikTok Settings** and was approved when you connected |

If there's no Status column, errors are written into the Creative Preview cell instead.

### Settings at the top of the script

| Setting | Default | What it does |
|---|---|---|
| `TAB_PREFIX` | `TikTok -` | Tabs the script will run on |
| `SETTINGS_SHEET` | `TikTok Settings` | Name of the account list tab |
| `LINKS_SHEET` | `TikTok Preview Links` | Name of the tab for pasted exports |
| `SUCCESS_STATUS` | `Success` | The Status text that marks a row as done |
| `ID_FILTER_SIZE` | `100` | Ad IDs per lookup (100 is TikTok's maximum) |
| `SORT_AFTER_GENERATE` | `true` | Sort the tab after each run (where it's safe) |

### Without the API

If someone can't connect to TikTok, the older formula-only method still works: see [`scripts/tiktok/TIKTOK_FORMULAS.md`](scripts/tiktok/TIKTOK_FORMULAS.md). It doesn't fill in the Account or Campaign columns, and it doesn't sort.

## Pinterest

The Pinterest script reads the ad IDs you paste in, finds each ad in your Pinterest ad accounts, and fills in its account, campaign, ad group, name and a preview link. Like Meta and TikTok, it skips finished rows and sorts the tab.

Pinterest uses **two script files**: `PinterestAuth.gs` connects the spreadsheet to Pinterest (done once), and `PinterestPreviews.gs` is the everyday generator.

### Before you start (one-off, for the whole spreadsheet)

Follow [`scripts/pinterest/PINTEREST_GUIDE.md`](scripts/pinterest/PINTEREST_GUIDE.md). In short, you publish the project as a Web App, add three Script Properties, log in from the menu, then list the ad accounts to search in **`PINTEREST_AD_ACCOUNTS`**. One login covers everyone who uses the spreadsheet, and it renews itself automatically.

### What you do

1. Duplicate the Pinterest `TEMPLATE` tab and name it `Pinterest - <Campaign>`. The script refuses to run on `TEMPLATE` tabs.
2. Check row 1 has these headers (any order; capitals don't matter):
   - Required: `Pinterest Ad ID`, `Account`, `Campaign Name`, `Ad Set Name`, `Ad Name`, `Creative Preview`
   - Optional: `Status` (recommended)
3. Paste the ad IDs into the `Pinterest Ad ID` column, one per row. IDs from an Ads Manager export start with `PP` (e.g. `PP687…`). That's fine: the script removes it.
4. Click **Creative Previews → Generate Pinterest Previews**.
5. Read the pop-up summary, then check any rows whose Status starts with `ERROR` or says `Preview Unavailable`.

To re-fetch **everything**, for example after creatives have been swapped or links have expired, use **Creative Previews → Refresh All Pinterest Previews**.

Unsure why an ID isn't working? **Pinterest setup → Check IDs on this tab** shows which account each of the first 10 IDs is in, without changing anything. **Check preview for first ID** shows exactly what Pinterest returns for that ad's preview.

### What the script does, step by step

1. **Checks the tab and finds the columns** by their headers.
2. **Cleans each ID:** removes the `PP` prefix, apostrophes and spaces. A valid ID is 6 to 25 digits.
3. **Skips rows that are already done** (Status `Success` with a link). If every row is done, it doesn't contact Pinterest at all. **Refresh All** ignores this.
4. **Renews the login** if it expires within 2 days.
5. **Finds the ads.** In each account listed in `PINTEREST_AD_ACCOUNTS`, it asks for only the IDs on your tab, up to 100 per request. For any ID it can't find that way, it then searches every ad in every account. That's thorough but slow, so fix or remove IDs that are reported as not found.
6. **Stops safely.** If any account can't be read (e.g. lost access), **nothing on the sheet is changed** and the pop-up says which account failed.
7. **Checks for duplicates.** If the same ID turns up in more than one account, the row is marked as an error rather than guessing.
8. **Looks up only the ad groups and campaigns** those ads belong to, to fill in the names.
9. **Gets the previews.** Pinterest makes previews **per ad group**, not per ad, so the script asks for each ad group's previews (up to 100 ad groups per request). It then matches each preview back to the right ad **by ID**, never by name. Only active, unexpired links are used.
10. **Fills in each row:** Account (the name you gave it in `PINTEREST_AD_ACCOUNTS`), Campaign Name, Ad Set Name (Pinterest's "ad group"), Ad Name, and a **View Ad** link. The link's expiry date is added as a **note** on the cell: hover over it to see it.
11. **If no new preview comes back,** any old link is **kept** but marked: Status becomes `Preview Unavailable` and the cell note says the old link may have expired. The row is tried again on the next run.
12. **Writes everything back at once,** then **sorts the tab** by Campaign → Ad Set → Ad Name, moving whole rows. It won't sort a tab with formula columns.
13. **Shows a summary,** including Pinterest's own explanation if a preview request failed.

The approval column is never written to.

### What the Status column means

| Status | Meaning | What to do |
|---|---|---|
| `Success` | Details and a current preview link were added | Nothing. Skipped on later runs |
| `Preview Unavailable` | The ad was found but Pinterest gave no active preview | Check the ad is active in Ads Manager. Use **Check preview for first ID** to see Pinterest's reply. Retried automatically next run |
| `ERROR: Not a valid Pinterest Ad ID` | It isn't 6–25 digits, even after removing `PP` | Check you pasted an **ad** ID |
| `ERROR: Ad ID not found in the Pinterest accounts set up` | None of the accounts in `PINTEREST_AD_ACCOUNTS` has it | Check the ID, and that its account is in `PINTEREST_AD_ACCOUNTS` |
| `ERROR: Ad ID found in more than one account (…)` | The same ID is in two accounts, so the script won't guess | Run **Check IDs on this tab**, then remove the wrong account from `PINTEREST_AD_ACCOUNTS` |
| `ERROR: ID was converted to a number and rounded…` | Sheets rounded the ID | Re-paste it. The column is plain text now |

If there's no Status column, errors are written into the Creative Preview cell instead.

### Settings at the top of the script

| Setting | Default | What it does |
|---|---|---|
| `SUCCESS_STATUS` | `Success` | The Status text that marks a row as done |
| `BATCH_SIZE` | `100` | IDs per lookup, and ad groups per preview request |
| `FULL_SCAN_IF_NOT_FOUND` | `true` | Search every ad when the quick lookup can't find an ID. Set to `false` on very large accounts if not-found IDs make runs slow |
| `REFRESH_DAYS_BEFORE_EXPIRY` | `2` | How early to renew the login |
| `SORT_AFTER_GENERATE` | `true` | Sort the tab after each run |

## Lessons learned (apply to every client)

1. **Ad names are not unique.** The same name is often reused across regions, audiences or campaigns. Always match by **ID**, never with a name lookup such as `VLOOKUP` on the ad name.
2. **Keep IDs as text.** Spreadsheets round long numbers.
3. **Only ever move whole rows.** Sorting a single column after the client starts approving separates approvals from their ads. All three scripts sort whole rows, so that's safe. Don't sort or replace raw exports by hand unless you re-match approvals by ad ID.
4. **Only one `onOpen` function per Apps Script project.** Two of them clash and produce duplicate or missing menus. The one `onOpen` lives in [`scripts/Menu.gs`](scripts/Menu.gs). It only shows menu items for platform scripts that are actually in the project.
5. **Preview links expire.** If a refresh fails, show that the link is out of date rather than quietly keeping the old one.
6. **Tokens expire.** The Pinterest script renews its own login. For Meta, note the token's expiry date somewhere private, outside this repo, and renew it before then.
