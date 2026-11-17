# How to use the Creative Preview sheet

This guide is for anyone who **uses** the sheet day to day. No coding needed.

The sheet turns a list of ad IDs into a tidy table the client can review. Each ad gets a row with its account, campaign, ad set, ad name, and a **View Ad** link that opens a preview of the ad. The client then marks each ad in the approval column.

Everything happens from the **Creative Previews** menu at the top of the sheet, next to *Help*.

> **Can't see the Creative Previews menu?** Reload the page. If it still isn't there, ask whoever looks after the sheet.

---

## 1. First time only

**Meta and Pinterest:** nothing to do. They're already connected for everyone.

**TikTok:** each person connects their own TikTok login once. You'll need the App ID, Secret and login link from whoever manages the TikTok developer app.

1. **Creative Previews → TikTok setup → 1. Save TikTok App ID & Secret.** Paste in the App ID, then the Secret.
2. Open the login link you were given, log in to TikTok and approve the ad accounts.
3. TikTok takes you to a new page. Copy that page's **whole web address** from the address bar.
4. Straight away, choose **Creative Previews → TikTok setup → 2. Connect** and paste in the address. The address only works once and expires quickly. If it fails, repeat steps 2 to 4.
5. Choose **TikTok setup → 3. List TikTok accounts.** A **TikTok Settings** tab appears. **Untick** any accounts that don't belong to this client; this makes it faster.

---

## 2. Make a tab for your campaign

Every campaign gets its own tab. Never work on a template tab.

1. Right-click the template tab for your platform (e.g. **Meta - Template**) and choose **Duplicate**.
2. Right-click the new tab, choose **Rename**, and name it **`<Platform> - <Campaign>`**, for example:
   - `Meta - Spring Sale`
   - `TikTok - BFCM`
   - `Pinterest - Summer Launch`

   ⚠️ Remove the **"Copy of"** that Google adds. The tab name must **start** with `Meta -`, `TikTok -` or `Pinterest -`.

---

## 3. Fill it in

### Meta

1. Copy the **Ad IDs** from Meta Ads Manager. Prefixes like `a:` are fine.
2. Paste them into the **Meta Ad ID** column, one per row, starting in row 2.
3. Click **Creative Previews → Generate Meta Previews.**
4. Wait for the pop-up summary.

### TikTok

1. Copy the **Ad IDs** from TikTok Ads Manager and paste them into the **TikTok Ad ID** column, one per row.
2. In TikTok Ads Manager, select the same ads and **export their preview links**.
3. Open the export in Google Sheets, **not Excel**, so long IDs don't get rounded. Copy everything, **including the header row** (it has "Ad ID" and "Preview link"), and paste it into the **TikTok Preview Links** tab. Create that tab if it isn't there.
4. Click **Creative Previews → Generate TikTok Previews.**
5. Wait for the pop-up summary.

> You can paste the export on the campaign tab instead, off to the right. It works, but the tab won't be sorted.

### Pinterest

1. Copy the **Ad IDs** from Pinterest Ads Manager. IDs starting with `PP` are fine.
2. Paste them into the **Pinterest Ad ID** column, one per row.
3. Click **Creative Previews → Generate Pinterest Previews.**
4. Wait for the pop-up summary.

---

## 4. Check the results

The script fills in **Account, Campaign Name, Ad Set Name, Ad Name** and a **View Ad** link for each ad. It then sorts the tab by campaign, ad set and ad name, so related ads sit together.

1. **Read the pop-up.** It says how many rows worked, how many failed, and how many were skipped because they were already done.
2. **Look at the Status column:**

   | Status | What it means | What to do |
   |---|---|---|
   | **Success** | All good | Nothing |
   | **Preview Unavailable** | The ad was found, but there's no preview link | Meta / Pinterest: check the ad is active in Ads Manager. TikTok: paste a fresh preview export. Then click **Generate** again |
   | **ERROR: …rounded…** | The ID lost digits when it was pasted | Paste the ID again. It will paste correctly now |
   | **ERROR: Not a valid … Ad ID** | That isn't an ad ID | Check you copied the **ad** ID, not a campaign or ad set ID |
   | **ERROR: …not found…** | The ad isn't in the accounts the sheet can see | Check the ID. If it's right, ask whoever looks after the sheet to add that account |
   | **ERROR: …more than one account…** (Pinterest) | The same ID is in two accounts | Ask whoever looks after the sheet |
   | **ERROR: \<anything else\>** | The platform refused, e.g. an expired login | Ask whoever looks after the sheet, and pass on the message |

3. **Spot-check 3 links.** Click **View Ad** and make sure each one opens the ad named in that row.
4. **Hover over a View Ad link** (TikTok and Pinterest) to see when it **expires**.

---

## 5. Share with the client

- The client fills in the **approval column** only.
- **Don't type in the approval column yourself,** and don't change its order by sorting columns by hand.
- Use the **Notes** column for anything you want to tell the client.

The scripts never change the approval column. When they sort the tab, each approval moves with its ad.

---

## 6. Adding ads or refreshing links

| You want to… | Do this |
|---|---|
| **Add more ads** to a campaign | Paste the new IDs under the others and click **Generate**. Finished rows are skipped, so it's quick |
| **Retry rows that failed** | Fix the problem and click **Generate** again. Failed rows are retried automatically |
| **Refresh every link**, e.g. creatives changed or links expired | Click **Refresh All … Previews** and say **Yes** |
| **Update TikTok links** before they expire | Paste a fresh export on **TikTok Preview Links** and click **Generate**. The new links are swapped in |

**Preview links expire** (TikTok and Pinterest after about 30 days). If the client will be reviewing for a while, refresh the links before they expire.

---

## Quick fixes

| Problem | Fix |
|---|---|
| "Please select a campaign tab starting with…" | Rename the tab so it starts with `Meta -`, `TikTok -` or `Pinterest -`, and remove "Copy of" |
| "Missing required columns" / "Missing header" | Someone changed a heading in row 1. Duplicate the template tab again, or fix the heading back |
| "TikTok not connected" | Do the TikTok first-time steps in [section 1](#1-first-time-only) |
| "Couldn't read every Pinterest account" | Ask whoever looks after the sheet. Nothing on your tab was changed |
| An ID ends in `000` or shows as `1.7E+18` | The spreadsheet rounded it. Paste the ID again from Ads Manager |
| Nothing happens when I click the menu | Wait a few seconds: big tabs can take a minute. The first time, Google may ask you to **allow** the script. Click through and approve it |

---

## Golden rules

1. **Never work on a template tab.** Always duplicate it first.
2. **Never edit the approval column.** It's the client's.
3. **Never paste passwords, tokens or secrets** into the sheet, chat or screenshots.
4. **Spot-check links** before telling the client the tab is ready.
