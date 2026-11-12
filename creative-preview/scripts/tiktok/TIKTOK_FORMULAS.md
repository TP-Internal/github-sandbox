# TikTok — formula workflow (no script needed)

Row 1 headers: `A TikTok Ad ID | B Account | C Campaign Name | D Ad Set Name | E Ad Name | F Creative Preview | G CLIENT APPROVAL`.

1. In TikTok Ads Manager, select the campaign's ads and choose **Bulk Ads Sharing** → export.
2. Import the file into Google Sheets **as plain text**. Don't open it in Excel first, or long IDs get rounded.
3. Paste it so the headers sit in **AA2:AG2**: `Ad Group | Ad Group ID | Ad Name | Ad ID | Creative Name | Preview link | Expiration time`. The data starts in row 3. Delete any banner or warning rows above the headers.
4. Put these formulas in row 2.

**A2: Ad ID**
```
=ARRAYFORMULA(IF(AD3:AD="","",TO_TEXT(AD3:AD)))
```

**D2: Ad Set Name (TikTok calls this "Ad Group")**
```
=ARRAYFORMULA(IF(AD3:AD="","",AA3:AA))
```

**E2: Ad Name**
```
=ARRAYFORMULA(IF(AD3:AD="","",AC3:AC))
```

**F2: Preview link**
```
=MAP(AD3:AD,AF3:AF,LAMBDA(id,url,IF(id="","",IF(url="","",HYPERLINK(url,"View Ad")))))
```

5. Type Account (B) and Campaign Name (C) yourself.
6. Hide columns AA:AG.

## Notes

- Column G is the client's. Never overwrite it.
- `TO_TEXT` can't fix digits that were already rounded. Re-import the file if IDs end in `000`.
- Preview links expire at the time shown in column AG. Paste a fresh export before then.
- Once the client starts approving, don't sort or replace the export unless you re-match approvals by Ad ID.
