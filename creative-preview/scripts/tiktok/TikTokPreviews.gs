/**
 * TIKTOK CREATIVE PREVIEW GENERATOR
 *
 * Works like the Meta generator: run it on the active campaign tab.
 * Tab names must begin with "TikTok -".
 *
 * Required headers in row 1:
 *   TikTok Ad ID | Account | Campaign Name | Ad Set Name | Ad Name | Creative Preview
 * Optional header:
 *   Status
 *
 * • Looks up every TikTok Ad ID (standard AND Smart+ ads) and fills in
 *   Account, Campaign Name, Ad Set Name, Ad Name and Status.
 * • Creative Preview: TikTok's API can't create preview links, so the link comes
 *   from the Ads Manager bulk preview export – either pasted on the same tab
 *   (the "EXPORTED FILE" columns with "Ad ID" + "Preview link" headers) or on a
 *   "TikTok Preview Links" tab.
 * • Columns filled by a formula (e.g. ARRAYFORMULA) are left untouched.
 * • The client approval column and Notes are never modified.
 */

const TT = {
  API_BASE: 'https://business-api.tiktok.com/open_api/v1.3/',
  HEADER_ROW: 1,
  TAB_PREFIX: 'TikTok -',
  SETTINGS_SHEET: 'TikTok Settings',
  LINKS_SHEET: 'TikTok Preview Links'
};

// ───────────────────────── MAIN GENERATOR ─────────────────────────
function generateTikTokPreviews() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const tabName = sheet.getName();

  if (/template/i.test(tabName) || !tabName.toLowerCase().startsWith(TT.TAB_PREFIX.toLowerCase())) {
    ui.alert('Please select a campaign tab starting with "TikTok -".');
    return;
  }

  try {
    const cols = ttGetColumns_(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow <= TT.HEADER_ROW) { ui.alert('No TikTok Ad IDs found.'); return; }

    const startRow = TT.HEADER_ROW + 1;
    const rowCount = lastRow - TT.HEADER_ROW;
    const adIds = sheet.getRange(startRow, cols.id, rowCount, 1).getDisplayValues()
      .map(function (r) { return String(r[0]).replace(/\D/g, ''); });

    const wanted = adIds.filter(function (x) { return x; });
    if (!wanted.length) { ui.alert('No TikTok Ad IDs found.'); return; }

    // Look up all the ads, plus any pasted preview links
    const index = ttFindAds_(wanted);
    const links = ttReadPreviewLinks_(sheet);

    // Don't overwrite columns that are driven by a formula
    const writable = {};
    ['account', 'campaign', 'adSet', 'adName', 'preview', 'status'].forEach(function (k) {
      writable[k] = cols[k] && !ttColumnHasFormula_(sheet, cols[k], startRow, rowCount);
    });

    let successful = 0, failed = 0, skipped = 0, noLink = 0;

    adIds.forEach(function (adId, i) {
      const row = startRow + i;
      if (!adId) { skipped++; return; }
      const ad = index[adId];

      if (!ad) {
        failed++;
        const target = writable.status ? cols.status : (writable.preview ? cols.preview : 0);
        if (target) sheet.getRange(row, target).setValue('ERROR: Ad ID not found in authorised TikTok accounts');
        return;
      }

      if (writable.account) sheet.getRange(row, cols.account).setValue(ad.account);
      if (writable.campaign) sheet.getRange(row, cols.campaign).setValue(ad.campaign);
      if (writable.adSet) sheet.getRange(row, cols.adSet).setValue(ad.adgroup);
      if (writable.adName) sheet.getRange(row, cols.adName).setValue(ad.name);

      // Preview link: pasted export first, then try TikTok's preview API
      const link = links[adId] || ttApiPreview_(ad, adId);
      if (writable.preview) {
        const cell = sheet.getRange(row, cols.preview);
        if (link) {
          cell.setRichTextValue(SpreadsheetApp.newRichTextValue()
            .setText('View Ad').setLinkUrl(link.url).build());
          cell.setNote(link.expires ? 'Preview link expires: ' + link.expires : '');
        } else {
          cell.setValue('Preview Unavailable');
          cell.setNote('');
        }
      }
      if (!link) noLink++;

      // Status = result of the preview generation (not ad delivery)
      if (writable.status) {
        sheet.getRange(row, cols.status).setValue(link ? 'Success' : 'Preview Unavailable');
      }
      successful++;
    });

    ui.alert('TikTok Preview Generation Complete\n\n' +
      'Successful: ' + successful + '\n' +
      'Failed: ' + failed + '\n' +
      'Skipped: ' + skipped + '\n' +
      'Missing preview link: ' + noLink + '\n' +
      (noLink && TT_PREVIEW_API.lastError ? '\nTikTok preview API: ' + TT_PREVIEW_API.lastError + '\n' : '') +
      (noLink ? '\nTo fill missing links, paste the Ads Manager bulk preview export (with its "Ad ID" and "Preview link" header row) on this tab or on a "TikTok Preview Links" tab, then run again.\n' : '') +
      '\nTab: ' + tabName);

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
 */
function ttFindAds_(adIds) {
  const remaining = {};
  adIds.forEach(function (id) { remaining[id] = true; });
  const found = {};

  const advertisers = ttGetAdvertisers_();
  for (let a = 0; a < advertisers.length && Object.keys(remaining).length; a++) {
    const adv = advertisers[a];
    const add = function (id, x) {
      id = String(id);
      if (!remaining[id]) return;
      found[id] = {
        advertiserId: adv.id,
        smartPlus: !x.ad_id,
        account: adv.name,
        campaign: x.campaign_name || '',
        adgroup: x.adgroup_name || '',
        name: x.ad_name || '',
        status: ttStatusName_(x)
      };
      delete remaining[id];
    };
    ttPaged_('ad/get/', { advertiser_id: adv.id, page_size: 1000 })
      .forEach(function (x) { add(x.ad_id, x); });
    if (!Object.keys(remaining).length) break;
    try {
      ttPaged_('smart_plus/ad/get/', { advertiser_id: adv.id, page_size: 100 })
        .forEach(function (x) { add(x.smart_plus_ad_id, x); });
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

function ttStatusName_(x) {
  const s = x.secondary_status || '';
  const map = {
    AD_STATUS_DELIVERY_OK: 'Active',
    AD_STATUS_DISABLE: 'Paused',
    AD_STATUS_CAMPAIGN_DISABLE: 'Campaign off',
    AD_STATUS_ADGROUP_DISABLE: 'Ad group off'
  };
  return map[s] || s.replace(/^AD_STATUS_/, '').replace(/_/g, ' ').toLowerCase()
    .replace(/^\w/, function (c) { return c.toUpperCase(); });
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
/** Reads pasted export(s) on this tab and on the "TikTok Preview Links" tab → { adId: {url, expires} } */
function ttReadPreviewLinks_(sheet) {
  const out = {};
  const parse = function (data) {
    let idCol = -1, urlCol = -1, expCol = -1;
    data.forEach(function (r) {
      const lower = r.map(function (v) { return String(v).trim().toLowerCase(); });
      if (lower.indexOf('ad id') > -1 &&
          lower.some(function (v) { return /preview link|^url/.test(v); })) {
        idCol = lower.indexOf('ad id');
        urlCol = lower.findIndex(function (v) { return /preview link|^url/.test(v); });
        expCol = lower.findIndex(function (v) { return /expir/.test(v); });
        return;
      }
      if (idCol < 0 || urlCol < 0) return;
      const id = String(r[idCol]).replace(/\D/g, '');
      const url = String(r[urlCol]).trim();
      if (id && /^https?:\/\//.test(url)) out[id] = { url: url, expires: expCol > -1 ? r[expCol] : '' };
    });
  };
  const linksTab = SpreadsheetApp.getActive().getSheetByName(TT.LINKS_SHEET);
  if (linksTab && linksTab.getLastRow() > 1) parse(linksTab.getDataRange().getDisplayValues());
  parse(sheet.getDataRange().getDisplayValues()); // same-tab export wins
  return out;
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
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = UrlFetchApp.fetch(TT.API_BASE + path + '?' + qs, {
      headers: { 'Access-Token': token }, muteHttpExceptions: true
    });
    const json = JSON.parse(resp.getContentText());
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
