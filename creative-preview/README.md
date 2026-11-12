# Creative Preview Toolkit

A repeatable way to build a **client approval sheet** in Google Sheets for ads running on **Meta, TikTok and Pinterest**.

Each ad gets one row with its account, campaign, ad set and ad name, a clickable **View Ad** link, and an approval column the client fills in. The process works the same for any client: copy the template, add the ad IDs or exports, run the generator, then share the sheet.

## Start here

1. [`HOW_IT_WORKS.md`](HOW_IT_WORKS.md): what the sheets look like and how each platform works.
2. [`SETUP_GUIDE.md`](SETUP_GUIDE.md): one-off setup (Apps Script, access keys, the master template).
3. [`NEW_CLIENT_CHECKLIST.md`](NEW_CLIENT_CHECKLIST.md): the steps to repeat for every new client or campaign.
4. [`CLAUDE.md`](CLAUDE.md): rules for Claude Code when changing this toolkit.

## Platforms at a glance

| Platform | What you put in | What you get | Method |
|---|---|---|---|
| Meta | Ad IDs in column A | Account, campaign, ad set, ad name, `View Ad` link, Status | Apps Script + Meta Marketing API |
| TikTok | Ads Manager **Bulk Ads Sharing** export | Ad ID, ad group, ad name, `View Ad` link | Spreadsheet formulas only |
| Pinterest | Ad IDs from Ads Manager export | Account, campaign, ad group, ad name, `View Ad` link | Apps Script + Pinterest Ads API (bring your own script; see guide) |

## Folder layout

```text
creative-preview/
├── README.md                 # this file
├── HOW_IT_WORKS.md           # sheet layouts and platform details
├── SETUP_GUIDE.md            # one-off setup
├── NEW_CLIENT_CHECKLIST.md   # repeat for each client / campaign
├── CLAUDE.md                 # rules for Claude Code
├── .gitignore                # keeps secrets and client data out of Git
└── scripts/
    ├── meta/MetaPreviews.gs          # Meta generator (test on a copy first)
    ├── tiktok/TIKTOK_FORMULAS.md     # TikTok formulas
    └── pinterest/PINTEREST_GUIDE.md  # what a Pinterest generator must do
```

## Golden rules

- **Never commit access keys or tokens.** They go in Apps Script **Script Properties** only.
- **Never commit client data** such as real ad IDs, exports or approval sheets.
- **Never overwrite the client approval column.**
- Test every change on a **copy** of the sheet first.
