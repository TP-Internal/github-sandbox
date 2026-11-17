/**
 * TIKTOK CREATIVE PREVIEW GENERATOR
 *
 * Works like the Meta generator: run it on the active campaign tab.
 * Tab names must begin with "TikTok -" (TEMPLATE tabs are refused).
 *
 * Required headers in row 1:
 *   TikTok Ad ID | Account | Campaign Name | Ad Set Name | Ad Name | Creative Preview
 *   ("Ad Group Name" is accepted instead of "Ad Set Name")
 * Optional header:
 *   Status
 *
 * • Looks up each TikTok Ad ID (standard AND Smart+ ads) and fills in
 *   Account, Campaign Name, Ad Set Name, Ad Name and Status.
 * • Creative Preview: the link comes from the Ads Manager bulk preview export
 *   if one is pasted (on the same tab, or on a "TikTok Preview Links" tab,
 *   with "Ad ID" + "Preview link" headers). Otherwise the script asks
 *   TikTok's preview API for one.
 * • Skips rows already done (Status = Success + link). Done rows still pick
 *   up a newer link from a freshly pasted export, with no API call.
 * • Columns filled by a formula (e.g. ARRAYFORMULA) are left untouched.
 * • The client approval column and Notes columns are never modified.
 *
 * Credentials are stored per person (User Properties): TT_APP_ID, TT_SECRET,
 * TT_TOKEN. Each person who runs it does the TikTok setup once.
 * The menu lives in Menu.gs. Do NOT add an onOpen() to this file.
 */

const TT = {
  API_BASE: 'https://business-api.tiktok.com/open_api/v1.3/',
  HEADER_ROW: 1,
  TAB_PREFIX: 'TikTok -',
  SETTINGS_SHEET: 'TikTok Settings',
  LINKS_SHEET: 'TikTok Preview Links',

  // Status value that marks a row as done (skipped on normal runs).
  SUCCESS_STATUS: 'Success',

  // Status / cell text when no preview link could be found.
  // These rows are NOT treated as done, so the next run retries them.
  NO_PREVIEW_STATUS: 'Preview Unavailable',

  // Ad IDs per filtered ad lookup (TikTok's maximum is 100).
  ID_FILTER_SIZE: 100,

  // After generating, group the tab by Campaign > Ad Set > Ad Name.
  // Whole rows move together, so approvals stay with their ad.
  // Skipped automatically if the tab has formula columns or a pasted
  // export (sorting would scramble them). Set false to keep paste order.
  SORT_AFTER_GENERATE: true
};

// ───────────────────────── MAIN GENERATOR ─────────────────────────

/** Menu: new, failed and no-preview rows only. */
function generateTikTokPreviews() {
  ttRunPreviews_(false);
}

/** Menu: re-fetch every row (e.g. after creative swaps or expired links). */
function refreshAllTikTokPreviews() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'Refresh All TikTok Previews',
    'Re-fetch every row on this tab, including ones already marked ' +
    TT.SUCCESS_STATUS + '?',
    ui.ButtonSet.YES_NO
  );
  if (answer === ui.Button.YES) ttRunPreviews_(true);
}

function ttRunPreviews_(force) {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const tabName = sheet.getName();

  if (/template/i.test(tabName) || !tabName.toLowerCase().startsWith(TT.TAB_PREFIX.toLowerCase())) {
    ui.alert('Please select a campaign tab starting with "' + TT.TAB_PREFIX + '".');
    return;
  }

  try {
    const cols = ttGetColumns_(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow <= TT.HEADER_ROW) { ui.alert('No TikTok Ad IDs found.'); return; }

    const startRow = TT.HEADER_ROW + 1;
    const rowCount = lastRow - TT.HEADER_ROW;
    const col = function (c) { return sheet.getRange(startRow, c, rowCount, 1); };

    // Don't overwrite columns that are driven by a formula
    const hasFormula = {};
    const writable = {};
    ['id', 'account', 'campaign', 'adSet', 'adName', 'preview', 'status'].forEach(function (k) {
      hasFormula[k] = !!cols[k] && ttColumnHasFormula_(sheet, cols[k], startRow, rowCount);
      writable[k] = !!cols[k] && !hasFormula[k];
    });

    // --- Read once ---
    const idRange = col(cols.id);
    const idRaw = idRange.getValues();

    // A huge number = Sheets already rounded the ~19-digit ID; can't be recovered
    const rounded = idRaw.map(function (r) {
      return typeof r[0] === 'number' && Math.abs(r[0]) > Number.MAX_SAFE_INTEGER;
    });
    const idText = idRaw.map(function (r) { return String(r[0] == null ? '' : r[0]).trim(); });
    const adIds = idText.map(function (t, i) { return rounded[i] ? '' : t.replace(/\D/g, ''); });

    const accountVals = col(cols.account).getValues();
    const campaignVals = col(cols.campaign).getValues();
    const adSetVals = col(cols.adSet).getValues();
    const adNameVals = col(cols.adName).getValues();
    const statusVals = cols.status ? col(cols.status).getValues() : null;

    const previewRange = col(cols.preview);
    const previewDisplay = previewRange.getDisplayValues();
    const previewNotes = previewRange.getNotes();
    const previewRich = previewRange.getRichTextValues().map(function (r, i) {
      return r[0] || SpreadsheetApp.newRichTextValue().setText(previewDisplay[i][0]).build();
    });

    const links = ttReadPreviewLinks_(sheet);

    const setLink = function (i, link) {
      previewRich[i] = SpreadsheetApp.newRichTextValue()
        .setText('View Ad').setLinkUrl(link.url).build();
      previewNotes[i][0] = link.expires ? 'Preview link expires: ' + link.expires : '';
    };
    const setError = function (i, message) {
      if (writable.status) {
        statusVals[i][0] = message;
      } else if (writable.preview) {
        previewRich[i] = SpreadsheetApp.newRichTextValue().setText(message).build();
        previewNotes[i][0] = '';
      }
    };
    const hasLink = function (i) { return !!previewRich[i].getLinkUrl(); };
    const isDone = function (i) {
      return statusVals
        ? String(statusVals[i][0]).trim() === TT.SUCCESS_STATUS && hasLink(i)
        : hasLink(i);
    };

    // --- Decide which rows to process ---
    const todo = [];
    let skipped = 0, alreadyDone = 0, failed = 0, linksUpdated = 0;
    let lastIdRow = TT.HEADER_ROW;

    adIds.forEach(function (adId, i) {
      if (rounded[i]) {
        failed++;
        lastIdRow = startRow + i;
        setError(i, 'ERROR: ID was converted to a number and rounded — ' +
          're-paste it (column is now Plain text)');
      } else if (!idText[i]) {
        skipped++;
      } else if (!/^\d{6,25}$/.test(adId)) {
        failed++;
        lastIdRow = startRow + i;
        setError(i, 'ERROR: Not a valid TikTok Ad ID');
      } else if (!force && isDone(i)) {
        alreadyDone++;
        lastIdRow = startRow + i;
        // Freshly pasted export? Swap in the newer link — no API call needed.
        const link = links.byId[adId];
        if (link && writable.preview && link.url !== previewRich[i].getLinkUrl()) {
          setLink(i, link);
          linksUpdated++;
        }
      } else {
        todo.push(i);
        lastIdRow = startRow + i;
      }
    });

    let successful = 0, noPreview = 0;

    if (todo.length) {
      // --- Look up only the ads we still need ---
      const uniqueIds = todo.map(function (i) { return adIds[i]; })
        .filter(function (id, n, all) { return all.indexOf(id) === n; });
      const index = ttFindAds_(uniqueIds);
      const apiLinks = {}; // one preview API call per unique ID at most

      // --- Apply results ---
      todo.forEach(function (i) {
        const adId = adIds[i];
        const ad = index[adId];

        if (!ad) {
          failed++;
          setError(i, 'ERROR: Ad ID not found in authorised TikTok accounts');
          return;
        }

        accountVals[i][0] = ad.account;
        campaignVals[i][0] = ad.campaign;
        adSetVals[i][0] = ad.adgroup;
        adNameVals[i][0] = ad.name;

        // Preview link: pasted export first, then TikTok's preview API
        let link = links.byId[adId];
        if (!link) {
          if (!(adId in apiLinks)) apiLinks[adId] = ttApiPreview_(ad, adId);
          link = apiLinks[adId];
        }

        if (link) {
          setLink(i, link);
          if (statusVals) statusVals[i][0] = TT.SUCCESS_STATUS;
          successful++;
        } else {
          previewRich[i] = SpreadsheetApp.newRichTextValue().setText(TT.NO_PREVIEW_STATUS).build();
          previewNotes[i][0] = '';
          if (statusVals) statusVals[i][0] = TT.NO_PREVIEW_STATUS;
          noPreview++;
        }
      });
    }

    // --- Write once per column (formula columns are left alone) ---
    if (writable.id) idRange.setNumberFormat('@'); // future pastes keep every digit
    if (writable.account) col(cols.account).setValues(accountVals);
    if (writable.campaign) col(cols.campaign).setValues(campaignVals);
    if (writable.adSet) col(cols.adSet).setValues(adSetVals);
    if (writable.adName) col(cols.adName).setValues(adNameVals);
    if (writable.preview) {
      previewRange.setRichTextValues(previewRich.map(function (v) { return [v]; }));
      previewRange.setNotes(previewNotes);
    }
    if (writable.status) col(cols.status).setValues(statusVals);

    // --- Group: Campaign > Ad Set > Ad Name (whole rows move together) ---
    let sortNote = '';
    if (TT.SORT_AFTER_GENERATE && lastIdRow > startRow) {
      const formulaCols = Object.keys(hasFormula).some(function (k) { return hasFormula[k]; });
      if (formulaCols || links.onThisTab) {
        sortNote = '\nNot sorted: this tab has ' +
          (formulaCols ? 'formula columns' : 'a pasted export') +
          ', which sorting would scramble.\n';
      } else {
        SpreadsheetApp.flush();
        sheet.getRange(startRow, 1, lastIdRow - TT.HEADER_ROW, sheet.getLastColumn())
          .sort([
            { column: cols.campaign, ascending: true },
            { column: cols.adSet, ascending: true },
            { column: cols.adName, ascending: true }
          ]);
      }
    }

    ui.alert('TikTok Preview Generation Complete\n\n' +
      'Successful: ' + successful + '\n' +
      'No preview link: ' + noPreview + '\n' +
      'Failed: ' + failed + '\n' +
      'Already done (skipped): ' + alreadyDone +
        (linksUpdated ? ' (' + linksUpdated + ' got a newer link from the export)' : '') + '\n' +
      'Blank rows: ' + skipped + '\n' +
      (noPreview && TT_PREVIEW_API.lastError ? '\nTikTok preview API: ' + TT_PREVIEW_API.lastError + '\n' : '') +
      (noPreview ? '\nTo fill missing links, paste the Ads Manager bulk preview export (with its "Ad ID" and "Preview link" header row) on this tab or on a "' + TT.LINKS_SHEET + '" tab, then run again.\n' : '') +
      sortNote +
      '\nTab: ' + tabName +
      (alreadyDone && !todo.length ? '\n\nUse "Refresh All TikTok Previews" to re-fetch everything.' : ''));

  } catch (error) {
    console.error(error);
    ui.alert('TikTok Preview Generator Error\n\n' + error.message);
  }
}

function ttGetColumns_(sheet) {
  const headers = sheet.getRange(TT.HEADER_ROW, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (v) { return String(v).trim().toLowerCase(); });
  const find = function (name) { return headers.indexOf(name.toLowerCase()) + 1; };
  const cols = {
    id: find('TikTok Ad ID'),
    account: find('Account'),
    campaign: find('Campaign Name'),
    adSet: find('Ad Set Name') || find('Ad Group Name'),
    adName: find('Ad Name'),
    preview: find('Creative Preview'),
    status: find('Status')
  };
  const missing = ['id', 'account', 'campaign', 'adSet', 'adName', 'preview']
    .filter(function (k) { return !cols[k]; });
  if (missing.length) throw new Error('Missing required columns: ' + missing.join(', '));
  return cols;
}

function ttColumnHasFormula_(sheet, col, startRow, rowCount) {
  return sheet.getRange(startRow, col, rowCount, 1).getFormulas()
    .some(function (r) { return r[0]; });
}

// ───────────────────────── AD LOOKUP ─────────────────────────
/**
 * Finds the given ad IDs across the authorised TikTok accounts.
 * Standard ads are keyed by ad_id, Smart+ ads by smart_plus_ad_id
 * (the ID shown in Ads Manager and in the preview export).
 *
 * 1. Standard ads: asks each account only for the IDs needed, 100 per call,
 *    instead of downloading every ad. If that filtered call fails, falls
 *    back to listing all the account's ads.
 * 2. Smart+ ads: only for IDs still not found, lists each account's
 *    Smart+ ads (accounts without Smart+ access are ignored).
 */
function ttFindAds_(adIds) {
  const remaining = {};
  adIds.forEach(function (id) { remaining[String(id)] = true; });
  const left = function () { return Object.keys(remaining); };
  const found = {};
  const advertisers = ttGetAdvertisers_();

  const add = function (adv, id, x, smartPlus) {
    id = String(id);
    if (!remaining[id]) return;
    found[id] = {
      advertiserId: adv.id,
      smartPlus: smartPlus,
      account: adv.name,
      campaign: x.campaign_name || '',
      adgroup: x.adgroup_name || '',
      name: x.ad_name || ''
    };
    delete remaining[id];
  };

  // 1. Standard ads, filtered by ID
  for (let a = 0; a < advertisers.length && left().length; a++) {
    const adv = advertisers[a];
    const ids = left();
    try {
      for (let i = 0; i < ids.length; i += TT.ID_FILTER_SIZE) {
        ttPaged_('ad/get/', {
          advertiser_id: adv.id, page_size: 1000,
          filtering: { ad_ids: ids.slice(i, i + TT.ID_FILTER_SIZE) }
        }).forEach(function (x) { add(adv, x.ad_id, x, false); });
      }
    } catch (e) {
      console.warn('Filtered lookup failed for account ' + adv.id + ', listing all ads: ' + e.message);
      ttPaged_('ad/get/', { advertiser_id: adv.id, page_size: 1000 })
        .forEach(function (x) { add(adv, x.ad_id, x, false); });
    }
  }

  // 2. Smart+ ads, only for whatever is still missing
  for (let a = 0; a < advertisers.length && left().length; a++) {
    const adv = advertisers[a];
    try {
      ttPaged_('smart_plus/ad/get/', { advertiser_id: adv.id, page_size: 100 })
        .forEach(function (x) { add(adv, x.smart_plus_ad_id, x, true); });
    } catch (e) { /* account without Smart+ access – ignore */ }
  }
  return found;
}

/** Ticked accounts on the "TikTok Settings" tab, or every authorised account if there isn't one. */
function ttGetAdvertisers_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TT.SETTINGS_SHEET);
  if (sh && sh.getLastRow() > 1) {
    const list = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getDisplayValues()
      .filter(function (r) { return r[1] && String(r[2]).toUpperCase() === 'TRUE'; })
      .map(function (r) { return { name: String(r[0]).trim(), id: String(r[1]).replace(/\D/g, '') }; });
    if (list.length) return list;
  }
  const props = PropertiesService.getUserProperties();
  const json = ttGet_('oauth2/advertiser/get/', {
    app_id: props.getProperty('TT_APP_ID'), secret: props.getProperty('TT_SECRET')
  });
  return ((json.data && json.data.list) || []).map(function (a) {
    return { name: a.advertiser_name || String(a.advertiser_id), id: String(a.advertiser_id) };
  });
}

// ───────────────────────── PREVIEW LINKS (TikTok API) ─────────────────────────
// Smart+ ads:   POST smart_plus/ad/preview/        { preview_type: 'AD', smart_plus_ad_id }
// Standard ads: POST creative/ads_preview/create/  { preview_type: 'AD', ad_id }
// Both return data.preview_link, valid for 30 days.
const TT_PREVIEW_API = { lastError: '' };

function ttApiPreview_(ad, adId) {
  try {
    const json = ad.smartPlus
      ? ttPost_('smart_plus/ad/preview/', {
          advertiser_id: ad.advertiserId, preview_type: 'AD', smart_plus_ad_id: adId })
      : ttPost_('creative/ads_preview/create/', {
          advertiser_id: ad.advertiserId, preview_type: 'AD', ad_id: adId });
    const d = json.data || {};
    const url = d.preview_link || ttFindValue_(d, function (k, v) {
      return typeof v === 'string' && /^https?:\/\//.test(v) && /link/i.test(k);
    });
    if (url) {
      const exp = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      return { url: url, expires: Utilities.formatDate(exp, Session.getScriptTimeZone(), 'd MMM yyyy') + ' (approx. – 30 days)' };
    }
    TT_PREVIEW_API.lastError = 'replied without a link: ' + JSON.stringify(d).slice(0, 300);
  } catch (e) {
    TT_PREVIEW_API.lastError = e.message;
  }
  return null;
}

/** Searches a nested response for the first key/value matching test(key, value). */
function ttFindValue_(obj, test) {
  if (!obj || typeof obj !== 'object') return null;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (test(keys[i], v)) return v;
  }
  for (let i = 0; i < keys.length; i++) {
    const found = ttFindValue_(obj[keys[i]], test);
    if (found) return found;
  }
  return null;
}

function ttPost_(path, body) {
  const token = PropertiesService.getUserProperties().getProperty('TT_TOKEN');
  if (!token) throw new Error('TikTok not connected – use Creative Previews → TikTok setup → Connect.');
  const resp = UrlFetchApp.fetch(TT.API_BASE + path, {
    method: 'post', contentType: 'application/json',
    headers: { 'Access-Token': token },
    payload: JSON.stringify(body), muteHttpExceptions: true
  });
  let json;
  try { json = JSON.parse(resp.getContentText()); }
  catch (e) { throw new Error('HTTP ' + resp.getResponseCode() + ' (endpoint not available)'); }
  if (json.code !== 0) throw new Error('error ' + json.code + ': ' + json.message);
  return json;
}

// ───────────────────────── PREVIEW LINKS (from Ads Manager export) ─────────────────────────
/**
 * Reads pasted export(s) on this tab and on the "TikTok Preview Links" tab.
 * Returns { byId: { adId: {url, expires} }, onThisTab: true if this tab has an export }.
 */
function ttReadPreviewLinks_(sheet) {
  const out = {};
  const parse = function (data) {
    let idCol = -1, urlCol = -1, expCol = -1, foundHeader = false;
    data.forEach(function (r) {
      const lower = r.map(function (v) { return String(v).trim().toLowerCase(); });
      if (lower.indexOf('ad id') > -1 &&
          lower.some(function (v) { return /preview link|^url/.test(v); })) {
        idCol = lower.indexOf('ad id');
        urlCol = lower.findIndex(function (v) { return /preview link|^url/.test(v); });
        expCol = lower.findIndex(function (v) { return /expir/.test(v); });
        foundHeader = true;
        return;
      }
      if (idCol < 0 || urlCol < 0) return;
      const id = String(r[idCol]).replace(/\D/g, '');
      const url = String(r[urlCol]).trim();
      if (id && /^https?:\/\//.test(url)) out[id] = { url: url, expires: expCol > -1 ? r[expCol] : '' };
    });
    return foundHeader;
  };
  const linksTab = SpreadsheetApp.getActive().getSheetByName(TT.LINKS_SHEET);
  if (linksTab && linksTab.getLastRow() > 1) parse(linksTab.getDataRange().getDisplayValues());
  const onThisTab = parse(sheet.getDataRange().getDisplayValues()); // same-tab export wins
  return { byId: out, onThisTab: onThisTab };
}

// ───────────────────────── TIKTOK SETUP (one-off) ─────────────────────────
function ttSaveAppCredentials() {
  const ui = SpreadsheetApp.getUi();
  const id = ui.prompt('TikTok App ID', 'Paste the App ID from your TikTok app page:', ui.ButtonSet.OK_CANCEL);
  if (id.getSelectedButton() !== ui.Button.OK || !id.getResponseText().trim()) return;
  const secret = ui.prompt('TikTok Secret', 'Paste the Secret from your TikTok app page:', ui.ButtonSet.OK_CANCEL);
  if (secret.getSelectedButton() !== ui.Button.OK || !secret.getResponseText().trim()) return;
  PropertiesService.getUserProperties().setProperties({
    TT_APP_ID: id.getResponseText().trim(), TT_SECRET: secret.getResponseText().trim()
  });
  ui.alert('App ID and Secret saved.');
}

function ttConnect() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getUserProperties();
  const appId = props.getProperty('TT_APP_ID');
  const secret = props.getProperty('TT_SECRET');
  if (!appId || !secret) { ui.alert('Run "Save TikTok App ID & Secret" first.'); return; }
  const res = ui.prompt('TikTok auth code',
    'Paste the auth_code (or the whole address) from after authorising – use it straight away, it works once:',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  let code = res.getResponseText().trim();
  const m = code.match(/auth_code=([^&]+)/);
  if (m) code = decodeURIComponent(m[1]);
  if (!code) return;
  const resp = UrlFetchApp.fetch(TT.API_BASE + 'oauth2/access_token/', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ app_id: appId, secret: secret, auth_code: code }),
    muteHttpExceptions: true
  });
  const json = JSON.parse(resp.getContentText());
  if (json.code !== 0 || !json.data || !json.data.access_token) {
    ui.alert('TikTok said: ' + (json.message || resp.getContentText()) +
      '\n\nAuth codes only work once and expire quickly – authorise again for a fresh one.');
    return;
  }
  props.setProperty('TT_TOKEN', json.data.access_token);
  ui.alert('Connected! Advertiser accounts authorised: ' + ((json.data.advertiser_ids || []).length));
}

function ttListAdvertisers() {
  const props = PropertiesService.getUserProperties();
  const json = ttGet_('oauth2/advertiser/get/', {
    app_id: props.getProperty('TT_APP_ID'), secret: props.getProperty('TT_SECRET')
  });
  const list = (json.data && json.data.list) || [];
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(TT.SETTINGS_SHEET);
  if (!sh) sh = ss.insertSheet(TT.SETTINGS_SHEET);
  const existing = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 3).getDisplayValues().forEach(function (r) {
      existing[String(r[1]).replace(/\D/g, '')] = r;
    });
  }
  sh.clear();
  sh.getRange('B:B').setNumberFormat('@');
  sh.getRange(1, 1, 1, 3).setValues([['Account name (shown in "Account" column)', 'TikTok advertiser ID', 'Include']])
    .setFontWeight('bold').setBackground('#f1f3f4');
  if (list.length) {
    sh.getRange(2, 1, list.length, 2).setValues(list.map(function (a) {
      const e = existing[String(a.advertiser_id)];
      return [e ? e[0] : (a.advertiser_name || ''), String(a.advertiser_id)];
    }));
    sh.getRange(2, 3, list.length, 1).insertCheckboxes();
    list.forEach(function (a, i) {
      const e = existing[String(a.advertiser_id)];
      if (!e || String(e[2]).toUpperCase() === 'TRUE') sh.getRange(i + 2, 3).check();
    });
  }
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 3);
  ss.setActiveSheet(sh);
}

// ───────────────────────── API HELPERS ─────────────────────────
function ttGet_(path, params) {
  const token = PropertiesService.getUserProperties().getProperty('TT_TOKEN');
  if (!token) throw new Error('TikTok not connected – use Creative Previews → TikTok setup → Connect.');
  const qs = Object.keys(params).filter(function (k) { return params[k] !== undefined && params[k] !== null; })
    .map(function (k) {
      const v = typeof params[k] === 'object' ? JSON.stringify(params[k]) : params[k];
      return encodeURIComponent(k) + '=' + encodeURIComponent(v);
    }).join('&');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = UrlFetchApp.fetch(TT.API_BASE + path + '?' + qs, {
      headers: { 'Access-Token': token }, muteHttpExceptions: true
    });
    let json;
    try { json = JSON.parse(resp.getContentText()); }
    catch (e) { throw new Error('TikTok API returned HTTP ' + resp.getResponseCode() + ' (not JSON)'); }
    if (json.code === 0) return json;
    if (json.code === 40100 && attempt < 3) { Utilities.sleep(3000 * attempt); continue; }
    throw new Error('TikTok API error ' + json.code + ': ' + json.message);
  }
}

function ttPaged_(path, params) {
  const all = [];
  let page = 1;
  while (true) {
    const p = JSON.parse(JSON.stringify(params));
    p.page = page;
    const json = ttGet_(path, p);
    const list = (json.data && json.data.list) || [];
    list.forEach(function (x) { all.push(x); });
    const info = (json.data && json.data.page_info) || {};
    if (!list.length || !info.total_page || page >= info.total_page) break;
    page++;
    Utilities.sleep(200);
  }
  return all;
}
