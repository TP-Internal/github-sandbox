# New client / campaign checklist

Repeat these steps for every client. Copy this list into your ticket or notes and tick each item off.

## A. Once per client

- [ ] Confirm you have access to the client's ad accounts on each platform they use.
- [ ] Confirm the Meta / Pinterest tokens can see those accounts (run one test ad).
- [ ] Make a copy of the master template: **File → Make a copy**, named `<Client> - Creative Approvals`.
- [ ] Delete the template tabs for platforms the client doesn't use. Keep the rest protected.
- [ ] Rename `CLIENT APPROVAL` only if the client wants their own wording. If you do, rename it in every tab.
- [ ] Share the sheet. The client gets edit access to the approval column only: protect the other columns.

## B. Once per campaign

1. [ ] Right-click the platform's `TEMPLATE` tab → **Duplicate**, then rename it `<Platform> - <Campaign>`.
2. [ ] Fill it in:
   - **Meta:** paste the ad IDs into column A, then **Creative Previews → Generate Meta Previews**.
   - **TikTok:** paste the ad IDs into column A. In Ads Manager, export the ads' preview links, import the file as plain text and paste it (with its header row) on the **TikTok Preview Links** tab. Then **Creative Previews → Generate TikTok Previews**.
     *First time for this client?* Run **TikTok setup → 3. List TikTok accounts** and tick only this client's accounts.
   - **Pinterest:** paste the ad IDs (the `PP` prefix is fine) into column A, then **Creative Previews → Generate Pinterest Previews**.
     *First time for this client?* Add their ad account(s) to `PINTEREST_AD_ACCOUNTS` (use **Pinterest setup → 3. Test connection** to find the IDs).
3. [ ] Check the results:
   - [ ] Every row has a `View Ad` link, or a Status explaining why not.
   - [ ] Spot-check 3 links: each opens the ad named in that row.
   - [ ] IDs have all their digits (no rounding).
4. [ ] Note when the preview links expire (TikTok: hover over a `View Ad` cell to see its expiry note; Pinterest: hover over a `View Ad` cell to see its expiry note).
5. [ ] Tell the client the tab is ready.

## C. Refreshing links

- [ ] Re-run the generator **before** the links expire. For TikTok, paste a fresh export on **TikTok Preview Links** first.
- [ ] Afterwards, check that the client's approvals are still next to the right ads.
- [ ] If any rows failed, follow up on them. Don't leave old links looking current.

## D. When the campaign ends

- [ ] Protect the whole tab so no more changes are made.
- [ ] Keep the sheet in your controlled Google Drive. Don't download client data into this repo.
