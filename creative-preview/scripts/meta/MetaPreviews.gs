/**
 * Meta Creative Preview generator — works for any client.
 *
 * STATUS: NOT YET TESTED. Run it on a COPY of the sheet before using it for real.
 *
 * How to use:
 *   1. Put this in the spreadsheet's Apps Script project (Extensions → Apps Script).
 *   2. Add Script Property META_ACCESS_TOKEN (Project Settings → Script Properties).
 *   3. Open a "Meta - <Campaign>" tab, paste ad IDs into the "Meta Ad ID" column,
 *      then choose Creative Previews → Generate Meta Previews.
 *
 * "Status" reports whether the script succeeded for that row.
 * It is NOT the ad's live/paused state in Meta.
 * The approval column is never read or written.
 */

// ---- Settings: the only part you should need to change -------------------
const META_CONFIG = {
  API_VERSION: 'v26.0',              // check it is still supported before use
  TOKEN_PROPERTY: 'META_ACCESS_TOKEN',
  TAB_PREFIX: 'Meta -',              // tabs the script is allowed to run on
  TEMPLATE_PREFIX: 'TEMPLATE',       // tabs it must never run on
  HEADERS: {                         // must match row 1 exactly (case ignored)
    id: 'Meta Ad ID',
    account: 'Account',
    campaign: 'Campaign Name',
    adset: 'Ad Set Name',
    name: 'Ad Name',
    preview: 'Creative Preview',
    status: 'Status'                 // optional column
  }
};
// --------------------------------------------------------------------------

// Keep ONLY ONE onOpen() per Apps Script project. If you add Pinterest,
// add its menu item here instead of writing a second onOpen().
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Creative Previews')
    .addItem('Generate Meta Previews', 'generateMetaPreviews')
    .addToUi();
}

function metaApiGet_(path, params = {}) {
  const token = PropertiesService.getScriptProperties()
    .getProperty(META_CONFIG.TOKEN_PROPERTY);
  if (!token) throw new Error(META_CONFIG.TOKEN_PROPERTY + ' missing in Script Properties');
  const query = Object.entries(params)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
  const url = 'https://graph.facebook.com/' + META_CONFIG.API_VERSION +
    '/' + path + (query ? '?' + query : '');
  const res = UrlFetchApp.fetch(url, {
    method: 'get', headers: {Authorization: 'Bearer ' + token},
    muteHttpExceptions: true
  });
  let data;
  try { data = JSON.parse(res.getContentText()); }
  catch (_) { throw new Error('Non-JSON Meta API response (HTTP ' + res.getResponseCode() + ')'); }
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300 || data.error) {
    throw new Error((data.error && data.error.message) || ('HTTP ' + res.getResponseCode()));
  }
  return data;
}

function metaColumns_(sheet) {
  const heads = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0].map(s => String(s).trim().toLowerCase());
  const c = {};
  for (const [key, header] of Object.entries(META_CONFIG.HEADERS)) {
    c[key] = heads.indexOf(header.toLowerCase()) + 1; // 0 = not found
  }
  for (const key of ['id', 'account', 'campaign', 'adset', 'name', 'preview']) {
    if (!c[key]) throw new Error('Missing column header: "' + META_CONFIG.HEADERS[key] + '"');
  }
  return c;
}

function generateMetaPreviews() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const tab = sheet.getName();
  if (tab.toUpperCase().startsWith(META_CONFIG.TEMPLATE_PREFIX.toUpperCase()) ||
      !tab.toLowerCase().startsWith(META_CONFIG.TAB_PREFIX.toLowerCase())) {
    ui.alert('Select a campaign tab starting "' + META_CONFIG.TAB_PREFIX +
      '" (not a ' + META_CONFIG.TEMPLATE_PREFIX + ' tab).');
    return;
  }
  let c;
  try { c = metaColumns_(sheet); } catch (err) { ui.alert(err.message); return; }

  const last = sheet.getLastRow();
  if (last <= 1) { ui.alert('No Ad IDs found.'); return; }
  const ids = sheet.getRange(2, c.id, last - 1, 1).getDisplayValues();
  const accountCache = {};
  let ok = 0, failed = 0, skipped = 0, noPreview = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i][0]).trim(), row = i + 2;
    if (!id) { skipped++; continue; }
    try {
      if (!/^\d+$/.test(id)) {
        if (c.status) sheet.getRange(row, c.status).setValue('Invalid Ad ID');
        failed++; continue;
      }
      const ad = metaApiGet_(encodeURIComponent(id), {
        fields: 'id,name,account_id,campaign{id,name},adset{id,name},preview_shareable_link'
      });
      const aid = String(ad.account_id || '');
      if (aid && !Object.prototype.hasOwnProperty.call(accountCache, aid)) {
        accountCache[aid] = metaApiGet_('act_' + encodeURIComponent(aid), {fields: 'name'}).name || aid;
      }
      sheet.getRange(row, c.account).setValue(aid ? accountCache[aid] : '');
      sheet.getRange(row, c.campaign).setValue(ad.campaign?.name || '');
      sheet.getRange(row, c.adset).setValue(ad.adset?.name || '');
      sheet.getRange(row, c.name).setValue(ad.name || '');
      if (ad.preview_shareable_link) {
        const link = SpreadsheetApp.newRichTextValue().setText('View Ad')
          .setLinkUrl(ad.preview_shareable_link).build();
        sheet.getRange(row, c.preview).setRichTextValue(link);
        if (c.status) sheet.getRange(row, c.status).setValue('Success');
        ok++;
      } else {
        sheet.getRange(row, c.preview).setValue('Preview Unavailable');
        if (c.status) sheet.getRange(row, c.status).setValue('No preview available');
        noPreview++;
      }
    } catch (err) {
      failed++;
      const msg = String(err.message || err).slice(0, 250);
      if (c.status) sheet.getRange(row, c.status).setValue('Error: ' + msg);
      else sheet.getRange(row, c.preview).setValue('Error: ' + msg);
      console.error('Meta Ad row ' + row + ': ' + msg); // never log the token
    }
  }
  ui.alert('Meta previews done: ' + ok + ' success; ' + noPreview + ' no preview; ' +
    failed + ' failed; ' + skipped + ' blank rows skipped.');
}
