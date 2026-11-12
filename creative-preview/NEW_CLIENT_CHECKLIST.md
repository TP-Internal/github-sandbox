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
   - **TikTok:** in Ads Manager, select the ads → **Bulk Ads Sharing** → export. Import it into Google Sheets as plain text and paste it at **AA2**. Type in Account and Campaign. Hide columns AA:AG.
   - **Pinterest:** paste the ad IDs into column A and run your Pinterest generator.
3. [ ] Check the results:
   - [ ] Every row has a `View Ad` link, or a Status explaining why not.
   - [ ] Spot-check 3 links: each opens the ad named in that row.
   - [ ] IDs have all their digits (no rounding).
4. [ ] Note when the preview links expire (TikTok: `Expiration time` column; Pinterest: about 30 days).
5. [ ] Tell the client the tab is ready.

## C. Refreshing links

- [ ] Re-run the generator (Meta / Pinterest) or paste a fresh export (TikTok) **before** the links expire.
- [ ] Afterwards, check that the client's approvals are still next to the right ads.
- [ ] If any rows failed, follow up on them. Don't leave old links looking current.

## D. When the campaign ends

- [ ] Protect the whole tab so no more changes are made.
- [ ] Keep the sheet in your controlled Google Drive. Don't download client data into this repo.
