# Claude Code — rules for the Creative Preview Toolkit

These rules add to the repo's main `CLAUDE.md`. They do not replace it.

## Goal

Keep the Meta, TikTok and Pinterest approval-sheet workflows working for **any client**. The thing that matters most: each ad gets **its own** correct preview, and client approvals are never lost.

## Keep it generic

- Never add client names, real ad account IDs, real ad IDs, token expiry dates or performance numbers. Use placeholders such as `<Client>` or `123456789`.
- Settings that differ between clients (tab prefixes, header names, API versions) belong in the config block at the top of a script, not scattered through the code.

## Don't break these

- Never write to the `CLIENT APPROVAL` column.
- Match ads by **ID**, never by name. Names repeat across campaigns, regions and audiences.
- In the Meta sheet, `Status` means "did the script succeed for this row". It is not the ad's delivery status.
- Only one `onOpen` per Apps Script project.
- Leave `TEMPLATE` tabs and the `<Platform> - <Campaign>` tab naming alone.
- No secrets in code, logs, docs, tests or commits. Tokens live in Script Properties (Meta) or each person's User Properties (TikTok).
- If a preview refresh fails, show it. Don't silently keep an old link.

## Be honest about status

- `scripts/meta/MetaPreviews.gs` has **not been tested yet**. Don't describe it as tested until someone confirms it has been.
- There is **no Pinterest script** in this repo. Any new one must be clearly labelled as new and tested before use.
- `scripts/tiktok/TikTokPreviews.gs` uses TikTok's API to look up ads, but the most reliable preview links come from the pasted Ads Manager export. Its improved version has only been checked against a simulated sheet, not live TikTok.

## Testing

- Use a copy of the sheet and made-up or non-sensitive ad IDs.
- Check: correct details, the right preview link, an invalid ID, an expired token, a missing preview, duplicate ad names, and that approvals are unchanged.
