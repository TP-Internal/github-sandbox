/**
 * PINTEREST CREATIVE PREVIEW GENERATOR
 * Version 5.0 — any number of ad accounts
 *
 * Run on the active campaign tab (TEMPLATE tabs are refused).
 *
 * Required headers in row 1 (any order, capitals don't matter):
 *   Pinterest Ad ID | Account | Campaign Name | Ad Set Name |
 *   Ad Name | Creative Preview
 * Optional header:
 *   Status
 *
 * • Ad IDs can be pasted straight from an Ads Manager export,
 *   including the "PP" prefix (PP123… → 123…).
 * • Looks up only the ads on the tab, then only their ad groups and
 *   campaigns. It checks one ad to find which account owns the tab's ads,
 *   then asks that account for the rest in one go.
 * • Previews come from Pinterest's ad-group preview endpoint and are
 *   matched back to each ad by ID, never by name.
 * • Skips rows already done (Status = Success + link). Use
 *   "Refresh All Pinterest Previews" to redo every row.
 * • If any account can't be read, nothing on the sheet is changed.
 * • The client approval column is never modified.
 *
 * Script Properties:
 *   PINTEREST_ACCESS_TOKEN   (saved by the login setup in PinterestAuth.gs)
 *   PINTEREST_AD_ACCOUNTS    e.g. {"Client A": "1234567890", "Client B": "2345678901"}
 *
 * The login is refreshed automatically before it expires, if
 * PinterestAuth.gs is in the project.
 * The menu lives in Menu.gs. Do NOT add an onOpen() to this file.
 */

const PIN = {
  API: 'https://api.pinterest.com/v5',
  HEADER_ROW: 1,
  HEADERS: {
    id: 'Pinterest Ad ID',
    account: 'Account',
    campaign: 'Campaign Name',
    adSet: 'Ad Set Name',
    adName: 'Ad Name',
    preview: 'Creative Preview',
    status: 'Status' // optional
  },

  // Status value that marks a row as done (skipped on normal runs).
  SUCCESS_STATUS: 'Success',

  // Status when the ad was found but no preview came back.
  // These rows are NOT treated as done, so the next run retries them.
  NO_PREVIEW_STATUS: 'Preview Unavailable',

  // IDs per filtered lookup, and ad groups per preview request.
  BATCH_SIZE: 100,

  // If an ID isn't found by the quick lookup, download every ad in every
  // account to look for it (slow on big accounts, but thorough).
  FULL_SCAN_IF_NOT_FOUND: true,

  // Refresh the login this many days before it expires.
  REFRESH_DAYS_BEFORE_EXPIRY: 2,

  // After generating, group the tab by Campaign > Ad Set > Ad Name.
  // Whole rows move together, so approvals stay with their ad.
  // Skipped automatically if a column is filled by a formula.
  SORT_AFTER_GENERATE: true
};


// ==========================================
// CONFIGURATION AND LOGIN
// ==========================================

function pinConfig_() {
  pinEnsureFreshToken_();

  const props = PropertiesService.getScriptProperties();
  const token = (props.getProperty('PINTEREST_ACCESS_TOKEN') || '').trim();
  const raw = props.getProperty('PINTEREST_AD_ACCOUNTS');

  if (!token) {
    throw new Error('Pinterest isn\'t connected. Use Creative Previews → ' +
      'Pinterest setup → 1. Start login.');
  }
  if (!raw) {
    throw new Error('Add PINTEREST_AD_ACCOUNTS to Script Properties, e.g. ' +
      '{"Client A": "1234567890"}. Pinterest setup → 3. Test connection ' +
      'lists your account IDs.');
  }

  let accounts;
  try {
    accounts = JSON.parse(raw);
  } catch (e) {
    throw new Error('PINTEREST_AD_ACCOUNTS must be valid JSON, e.g. ' +
      '{"Client A": "1234567890"}');
  }

  if (!accounts || Array.isArray(accounts) || typeof accounts !== 'object' ||
      !Object.keys(accounts).length) {
    throw new Error('PINTEREST_AD_ACCOUNTS needs at least one account, e.g. ' +
      '{"Client A": "1234567890"}');
  }

  for (const [name, id] of Object.entries(accounts)) {
    if (!/^\d+$/.test(String(id))) {
      throw new Error('Invalid account ID for ' + name);
    }
  }

  return { token, accounts };
}

/** Refreshes the login if it expires soon (needs PinterestAuth.gs). */
function pinEnsureFreshToken_() {
  const props = PropertiesService.getScriptProperties();
  const expiresAt = Number(props.getProperty('PINTEREST_ACCESS_EXPIRES_AT'));
  if (!expiresAt || typeof pinterestRefreshAccessToken !== 'function') return;

  const margin = PIN.REFRESH_DAYS_BEFORE_EXPIRY * 24 * 3600 * 1000;
  if (expiresAt - Date.now() > margin) return;

  try {
    pinterestRefreshAccessToken();
  } catch (error) {
    throw new Error('The Pinterest login has expired and couldn\'t be refreshed ' +
      '(' + error.message.slice(0, 200) + '). Use Pinterest setup → ' +
      '1. Start login to connect again.');
  }
}


// ==========================================
// ACTIVE SHEET AND HEADERS
// ==========================================

function pinSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  if (sheet.getName().toUpperCase().startsWith('TEMPLATE')) {
    throw new Error('Duplicate the template tab first.');
  }

  const headers = sheet
    .getRange(PIN.HEADER_ROW, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(x => String(x).trim().toLowerCase());

  const cols = {};
  for (const [key, name] of Object.entries(PIN.HEADERS)) {
    cols[key] = headers.indexOf(name.toLowerCase()) + 1; // 0 = not found
  }

  const missing = Object.keys(cols)
    .filter(key => key !== 'status' && !cols[key])
    .map(key => PIN.HEADERS[key]);
  if (missing.length) {
    throw new Error('Missing header(s): ' + missing.join(', '));
  }

  return { sheet, cols };
}

/**
 * Turns a pasted ID into the number the API uses.
 * "PP123", " 123 ", "'123" → "123". Returns '' if it isn't an ID.
 */
function pinCleanId_(value) {
  const id = String(value == null ? '' : value)
    .trim()
    .replace(/^'+/, '')
    .replace(/\s+/g, '')
    .replace(/^PP/i, '');
  return /^\d{6,25}$/.test(id) ? id : '';
}


// ==========================================
// PINTEREST API HELPERS
// ==========================================

function pinRequest_(url, token, method, payload) {
  const options = {
    method: method || 'get',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  };

  if (payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  for (let attempt = 1; ; attempt++) {
    const response = UrlFetchApp.fetch(url, options);
    const status = response.getResponseCode();
    const body = response.getContentText();

    // Too many requests: wait and try again (up to 3 times)
    if (status === 429 && attempt < 3) {
      Utilities.sleep(2000 * attempt);
      continue;
    }

    if (status < 200 || status >= 300) {
      throw new Error('HTTP ' + status + ': ' + body.substring(0, 400));
    }

    try {
      return body ? JSON.parse(body) : {};
    } catch (e) {
      throw new Error('Pinterest replied with something unexpected (HTTP ' +
        status + ')');
    }
  }
}

/** Every page of /ad_accounts/{id}/{resource}, optionally filtered. */
function pinList_(accountId, resource, token, filter) {
  const items = [];
  let bookmark = null;
  let pages = 0;

  do {
    let url = PIN.API + '/ad_accounts/' + encodeURIComponent(accountId) +
      '/' + resource + '?page_size=100' + (filter ? '&' + filter : '');

    if (bookmark) url += '&bookmark=' + encodeURIComponent(bookmark);

    const result = pinRequest_(url, token);
    items.push(...(result.items || []));

    bookmark = result.bookmark || null;
    pages++;

    if (pages > 200) throw new Error('Pagination safety limit reached.');
  } while (bookmark);

  return items.map(item => item.data || item);
}

/**
 * Fetches only the given IDs of a resource (ads, ad_groups, campaigns),
 * BATCH_SIZE at a time. Results are always checked against the IDs asked
 * for, so a filter Pinterest ignores can't cause wrong matches.
 * If the filtered request fails and fullFallback is true, lists everything.
 */
function pinListByIds_(accountId, resource, param, ids, token, fullFallback) {
  const wanted = new Set(ids.map(String));
  if (!wanted.size) return [];

  let items = [];
  try {
    for (let i = 0; i < ids.length; i += PIN.BATCH_SIZE) {
      const chunk = ids.slice(i, i + PIN.BATCH_SIZE);
      const page = pinList_(accountId, resource, token,
        param + '=' + encodeURIComponent(chunk.join(',')));
      items.push(...page);
      // Got items we didn't ask for? Then the filter was ignored and this
      // was already the full list, so don't download it again per chunk.
      const inChunk = new Set(chunk.map(String));
      if (page.some(x => !inChunk.has(String(x.id)))) break;
    }
    items = items.filter(x => wanted.has(String(x.id)));
    if (!fullFallback || items.length >= wanted.size) return items;
  } catch (error) {
    if (!fullFallback) throw error;
    console.warn('Filtered ' + resource + ' lookup failed, listing all: ' + error.message);
  }
  return pinList_(accountId, resource, token).filter(x => wanted.has(String(x.id)));
}


/**
 * True if Pinterest refused because the IDs belong to a different
 * ad account (HTTP 403, code 1902 "...does not match discovered advertiser").
 */
function pinIsWrongAccount_(error) {
  return /"code"\s*:\s*1902|does not match discovered advertiser/i.test(error.message);
}

/**
 * Finds which of the given ad IDs are in one account, BATCH_SIZE at a time.
 *
 * Pinterest refuses the whole request if ANY ID in it belongs to another
 * account. When that happens the batch is split in half and each half is
 * tried again, until the IDs that belong elsewhere are on their own and
 * can be skipped. A tab whose ads are all in one account still needs
 * just one request per 100 IDs.
 */
function pinAdsInAccount_(accountId, ids, token) {
  const wanted = new Set(ids.map(String));
  const found = [];
  const queue = [];
  for (let i = 0; i < ids.length; i += PIN.BATCH_SIZE) {
    queue.push(ids.slice(i, i + PIN.BATCH_SIZE));
  }

  while (queue.length) {
    const chunk = queue.shift();
    try {
      const page = pinList_(accountId, 'ads', token,
        'ad_ids=' + encodeURIComponent(chunk.join(',')));
      const inChunk = new Set(chunk.map(String));
      // Got ads we didn't ask for? Then the filter was ignored and this is
      // already the whole account, so there's no need to ask again.
      if (page.some(x => !inChunk.has(String(x.id)))) {
        return page.filter(x => wanted.has(String(x.id)));
      }
      found.push(...page);
    } catch (error) {
      const badRequest = /^HTTP (400|404)\b/.test(error.message);
      if (!pinIsWrongAccount_(error) && !badRequest) throw error; // real problem
      if (chunk.length > 1) {
        const mid = Math.ceil(chunk.length / 2);
        queue.push(chunk.slice(0, mid), chunk.slice(mid));
      } else if (badRequest) {
        console.warn('Ad ' + chunk[0] + ' skipped in account ' + accountId +
          ': ' + error.message.slice(0, 200));
      }
      // A single ID that belongs to another account: not here, move on.
    }
  }
  return found;
}


// ==========================================
// FIND ADS ACROSS ACCOUNTS
// ==========================================

/**
 * Looks for the given ad IDs in every configured account.
 * Returns {
 *   matches: { adId: [ {account, ad} ] },   // >1 entry = ambiguous
 *   accounts: [ {name, accountId, groups: Map, campaigns: Map} ],
 *   failures: [ 'Account: message' ]
 * }
 */
function pinFindAds_(config, adIds) {
  const accounts = [];
  const failures = [];
  const matches = {};
  adIds.forEach(id => { matches[id] = []; });

  const addAds = (account, ads) => ads.forEach(ad => {
    const id = String(ad.id);
    if (matches[id] && !matches[id].some(m => m.account === account)) {
      matches[id].push({ account, ad });
    }
  });

  // 1. Quick lookup. Ads on a tab usually all belong to one account, so:
  //    find which account owns ONE ad (one small request per account),
  //    then ask that account for all the remaining IDs at once.
  //    Repeat until every ID is found or has been checked everywhere.
  for (const [name, accountId] of Object.entries(config.accounts)) {
    accounts.push({ name, accountId: String(accountId), ads: [] });
  }
  const checkedEverywhere = {};
  const stillMissing = () => adIds.filter(id => !matches[id].length && !checkedEverywhere[id]);

  while (stillMissing().length && !failures.length) {
    const probe = stillMissing()[0];
    let owner = null;

    for (const account of accounts) {
      try {
        const ads = pinAdsInAccount_(account.accountId, [probe], config.token);
        if (ads.length) {
          account.ads.push(...ads);
          addAds(account, ads);
          owner = account;
          break;
        }
      } catch (error) {
        failures.push(account.name + ': ' + error.message);
        break;
      }
    }

    if (!owner) {
      checkedEverywhere[probe] = true; // not in any account
      continue;
    }

    const rest = stillMissing();
    if (!rest.length) break;
    try {
      const ads = pinAdsInAccount_(owner.accountId, rest, config.token);
      owner.ads.push(...ads);
      addAds(owner, ads);
    } catch (error) {
      failures.push(owner.name + ': ' + error.message);
    }
  }

  // 2. Anything still missing: look through every ad (thorough but slow)
  const missing = adIds.filter(id => !matches[id].length);
  if (missing.length && PIN.FULL_SCAN_IF_NOT_FOUND && !failures.length) {
    console.log('Not found by quick lookup, scanning all ads for: ' + missing.join(', '));
    const wanted = new Set(missing);
    for (const account of accounts) {
      try {
        const ads = pinList_(account.accountId, 'ads', config.token)
          .filter(ad => wanted.has(String(ad.id)));
        account.ads.push(...ads);
        addAds(account, ads);
      } catch (error) {
        failures.push(account.name + ': ' + error.message);
      }
    }
  }

  // 3. Only the ad groups and campaigns those ads belong to
  for (const account of accounts) {
    account.groups = new Map();
    account.campaigns = new Map();
    if (!account.ads.length) continue;
    try {
      const groupIds = [...new Set(account.ads
        .map(ad => String(ad.ad_group_id || '')).filter(Boolean))];
      const groups = pinListByIds_(account.accountId, 'ad_groups', 'ad_group_ids',
        groupIds, config.token, true);
      account.groups = new Map(groups.map(g => [String(g.id), g]));

      const campaignIds = [...new Set(account.ads.map(ad => String(ad.campaign_id ||
        (account.groups.get(String(ad.ad_group_id)) || {}).campaign_id || ''))
        .filter(Boolean))];
      const campaigns = pinListByIds_(account.accountId, 'campaigns', 'campaign_ids',
        campaignIds, config.token, true);
      account.campaigns = new Map(campaigns.map(c => [String(c.id), c]));

      console.log(account.name + ': found ' + account.ads.length + ' of the requested ads');
    } catch (error) {
      failures.push(account.name + ': ' + error.message);
    }
  }

  return { matches, accounts, failures };
}


// ==========================================
// PREVIEW API
// ==========================================

/**
 * Asks for previews of the given ad groups (BATCH_SIZE per request).
 * Returns { previews: Map(adId → {url, expires}), failures: [message] }.
 */
function pinPreviews_(account, groupIds, token) {
  const previews = new Map();
  const failures = [];

  for (let i = 0; i < groupIds.length; i += PIN.BATCH_SIZE) {
    const batch = groupIds.slice(i, i + PIN.BATCH_SIZE);

    try {
      const result = pinRequest_(
        PIN.API + '/ad_accounts/' + encodeURIComponent(account.accountId) +
        '/campaign_ad_preview',
        token, 'post',
        batch.map(id => ({ ad_group_id: id }))
      );

      const records = Array.isArray(result) ? result : [result];

      records.forEach(record => {
        const data = record.data || record;

        if (data.exceptions) {
          failures.push(String(data.exceptions.message || 'Preview exception'));
          return;
        }

        if (data.pin_promotion_id && data.url && data.is_active !== false) {
          const expires = Number(data.expires_at);
          if (Number.isFinite(expires) && expires > Date.now()) {
            previews.set(String(data.pin_promotion_id), { url: data.url, expires });
          }
        }
      });

    } catch (error) {
      failures.push(error.message);
    }
  }

  return { previews, failures };
}


// ==========================================
// MAIN GENERATOR
// ==========================================

/** Menu: new, failed and no-preview rows only. */
function generatePinterestPreviews() {
  pinRunPreviews_(false);
}

/** Menu: redo every row (e.g. after creative swaps or expired links). */
function refreshAllPinterestPreviews() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'Refresh All Pinterest Previews',
    'Re-fetch every row on this tab, including ones already marked ' +
    PIN.SUCCESS_STATUS + '?',
    ui.ButtonSet.YES_NO
  );
  if (answer === ui.Button.YES) pinRunPreviews_(true);
}

function pinRunPreviews_(force) {
  const ui = SpreadsheetApp.getUi();

  try {
    const { sheet, cols } = pinSheet_();
    const tabName = sheet.getName();
    const lastRow = sheet.getLastRow();

    if (lastRow <= PIN.HEADER_ROW) {
      ui.alert('No Pinterest Ad IDs found.');
      return;
    }

    const startRow = PIN.HEADER_ROW + 1;
    const rowCount = lastRow - PIN.HEADER_ROW;
    const col = c => sheet.getRange(startRow, c, rowCount, 1);
    const hasFormula = c => col(c).getFormulas().some(r => r[0]);

    // --- Read once ---
    const idRange = col(cols.id);
    const idRaw = idRange.getValues();
    const idText = idRaw.map(r => String(r[0] == null ? '' : r[0]).trim());
    const rounded = idRaw.map(r =>
      typeof r[0] === 'number' && Math.abs(r[0]) > Number.MAX_SAFE_INTEGER);
    const adIds = idRaw.map((r, i) => rounded[i] ? '' : pinCleanId_(r[0]));

    const accountVals = col(cols.account).getValues();
    const campaignVals = col(cols.campaign).getValues();
    const adSetVals = col(cols.adSet).getValues();
    const adNameVals = col(cols.adName).getValues();
    const statusVals = cols.status ? col(cols.status).getValues() : null;

    const previewRange = col(cols.preview);
    const previewDisplay = previewRange.getDisplayValues();
    const previewNotes = previewRange.getNotes();
    const previewRich = previewRange.getRichTextValues().map((r, i) =>
      r[0] || SpreadsheetApp.newRichTextValue().setText(previewDisplay[i][0]).build());

    const setError = (i, message) => {
      if (statusVals) {
        statusVals[i][0] = message;
      } else {
        previewRich[i] = SpreadsheetApp.newRichTextValue().setText(message).build();
        previewNotes[i][0] = '';
      }
    };
    const hasLink = i => !!previewRich[i].getLinkUrl();
    const isDone = i => statusVals
      ? String(statusVals[i][0]).trim() === PIN.SUCCESS_STATUS && hasLink(i)
      : hasLink(i);

    // --- Decide which rows to process ---
    const todo = [];
    let blank = 0, alreadyDone = 0, failed = 0;
    let lastIdRow = PIN.HEADER_ROW;

    idText.forEach((text, i) => {
      if (rounded[i]) {
        failed++;
        lastIdRow = startRow + i;
        setError(i, 'ERROR: ID was converted to a number and rounded — ' +
          're-paste it (column is now Plain text)');
      } else if (!text) {
        blank++;
      } else if (!adIds[i]) {
        failed++;
        lastIdRow = startRow + i;
        setError(i, 'ERROR: Not a valid Pinterest Ad ID');
      } else if (!force && isDone(i)) {
        alreadyDone++;
        lastIdRow = startRow + i;
      } else {
        todo.push(i);
        lastIdRow = startRow + i;
      }
    });

    let successful = 0, noPreview = 0, notFound = 0, ambiguous = 0;
    let previewProblem = '';

    if (todo.length) {
      const config = pinConfig_();
      const uniqueIds = [...new Set(todo.map(i => adIds[i]))];

      // --- Find the ads; stop without changes if any account failed ---
      const found = pinFindAds_(config, uniqueIds);
      if (found.failures.length) {
        ui.alert('Pinterest Preview Generator\n\n' +
          'Couldn\'t read every Pinterest account, so nothing on the sheet ' +
          'was changed.\n\n' + found.failures.join('\n'));
        return;
      }

      // --- Ask for previews, one request per 100 ad groups per account ---
      const previewsByAccount = new Map();
      for (const account of found.accounts) {
        const groupIds = [...new Set(uniqueIds
          .map(id => found.matches[id])
          .filter(m => m.length === 1 && m[0].account === account)
          .map(m => String(m[0].ad.ad_group_id)))];
        if (!groupIds.length) continue;

        const result = pinPreviews_(account, groupIds, config.token);
        previewsByAccount.set(account, result);
        result.failures.forEach(f => console.warn(account.name + ' preview: ' + f));
        if (!previewProblem && result.failures.length) {
          previewProblem = account.name + ': ' + result.failures[0].slice(0, 200);
        }
      }

      // --- Apply results ---
      todo.forEach(i => {
        const m = found.matches[adIds[i]];

        if (!m.length) {
          failed++; notFound++;
          setError(i, 'ERROR: Ad ID not found in the Pinterest accounts set up');
          return;
        }
        if (m.length > 1) {
          failed++; ambiguous++;
          setError(i, 'ERROR: Ad ID found in more than one account (' +
            m.map(x => x.account.name).join(', ') + ')');
          return;
        }

        const { account, ad } = m[0];
        const group = account.groups.get(String(ad.ad_group_id));
        const campaign = account.campaigns.get(
          String(ad.campaign_id || (group && group.campaign_id) || ''));

        accountVals[i][0] = account.name;
        campaignVals[i][0] = campaign ? campaign.name || '' : '';
        adSetVals[i][0] = group ? group.name || '' : '';
        adNameVals[i][0] = ad.name || '';

        const result = previewsByAccount.get(account);
        const preview = result && result.previews.get(String(ad.id));

        if (preview) {
          previewRich[i] = SpreadsheetApp.newRichTextValue()
            .setText('View Ad').setLinkUrl(preview.url).build();
          previewNotes[i][0] = 'Preview link expires: ' + Utilities.formatDate(
            new Date(preview.expires), Session.getScriptTimeZone(), 'd MMM yyyy');
          if (statusVals) statusVals[i][0] = PIN.SUCCESS_STATUS;
          successful++;
        } else {
          // Keep any old link, but say clearly that it wasn't refreshed.
          if (hasLink(i)) {
            previewNotes[i][0] = 'Old link kept — no new preview on ' +
              Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM yyyy') +
              '. It may have expired.';
          } else {
            previewRich[i] = SpreadsheetApp.newRichTextValue()
              .setText(PIN.NO_PREVIEW_STATUS).build();
          }
          if (statusVals) statusVals[i][0] = PIN.NO_PREVIEW_STATUS;
          noPreview++;
        }
      });
    }

    // --- Write once per column ---
    const writable = c => c && !hasFormula(c);
    if (writable(cols.id)) idRange.setNumberFormat('@'); // future pastes keep every digit
    if (writable(cols.account)) col(cols.account).setValues(accountVals);
    if (writable(cols.campaign)) col(cols.campaign).setValues(campaignVals);
    if (writable(cols.adSet)) col(cols.adSet).setValues(adSetVals);
    if (writable(cols.adName)) col(cols.adName).setValues(adNameVals);
    if (writable(cols.preview)) {
      previewRange.setRichTextValues(previewRich.map(v => [v]));
      previewRange.setNotes(previewNotes);
    }
    if (statusVals && writable(cols.status)) col(cols.status).setValues(statusVals);

    // --- Group: Campaign > Ad Set > Ad Name (whole rows move together) ---
    let sortNote = '';
    if (PIN.SORT_AFTER_GENERATE && lastIdRow > startRow) {
      const anyFormula = Object.values(cols).some(c => c && hasFormula(c));
      if (anyFormula) {
        sortNote = '\nNot sorted: this tab has formula columns, which sorting would scramble.\n';
      } else {
        SpreadsheetApp.flush();
        sheet.getRange(startRow, 1, lastIdRow - PIN.HEADER_ROW, sheet.getLastColumn())
          .sort([
            { column: cols.campaign, ascending: true },
            { column: cols.adSet, ascending: true },
            { column: cols.adName, ascending: true }
          ]);
      }
    }

    ui.alert('Pinterest Preview Generation Complete\n\n' +
      'Successful: ' + successful + '\n' +
      'No preview available: ' + noPreview + '\n' +
      'Failed: ' + failed +
        (notFound || ambiguous ? ' (' + notFound + ' not found, ' +
          ambiguous + ' in more than one account)' : '') + '\n' +
      'Already done (skipped): ' + alreadyDone + '\n' +
      'Blank rows: ' + blank + '\n' +
      (previewProblem ? '\nPinterest said: ' + previewProblem + '\n' : '') +
      sortNote +
      '\nTab: ' + tabName +
      (alreadyDone && !todo.length
        ? '\n\nUse "Refresh All Pinterest Previews" to re-fetch everything.' : ''));

  } catch (error) {
    console.error(error);
    ui.alert('Pinterest Preview Generator Error\n\n' + error.message);
  }
}


// ==========================================
// DIAGNOSTICS — READ ONLY, NOTHING ON THE SHEET CHANGES
// ==========================================

/** Shows results in a pop-up (from the menu) and in the execution log. */
function pinReport_(title, lines) {
  lines.forEach(line => console.log(line));
  try {
    SpreadsheetApp.getUi().alert(title + '\n\n' + lines.join('\n'));
  } catch (e) { /* run from the editor: the log is enough */ }
}

/** Checks the first 10 IDs on the tab: which account each one is in. */
function diagnosePinterestIds() {
  try {
    const { sheet, cols } = pinSheet_();
    const config = pinConfig_();
    const lastRow = sheet.getLastRow();
    if (lastRow <= PIN.HEADER_ROW) throw new Error('Enter some Ad IDs first.');

    const pasted = sheet
      .getRange(PIN.HEADER_ROW + 1, cols.id, lastRow - PIN.HEADER_ROW, 1)
      .getDisplayValues().map(r => r[0].trim()).filter(Boolean).slice(0, 10);

    const ids = [...new Set(pasted.map(pinCleanId_).filter(Boolean))];
    const found = pinFindAds_(config, ids);

    const lines = ['Accounts checked: ' + Object.keys(config.accounts).join(', ')];
    found.failures.forEach(f => lines.push('ACCOUNT PROBLEM: ' + f));

    pasted.forEach(text => {
      const id = pinCleanId_(text);
      if (!id) { lines.push(text + ' → not a valid Pinterest Ad ID'); return; }
      const m = found.matches[id] || [];
      if (!m.length) { lines.push(text + ' → not found'); return; }
      m.forEach(x => lines.push(text + ' → ' + x.account.name +
        ' | ad group ' + x.ad.ad_group_id + ' | ' + (x.ad.name || '(no name)')));
    });

    pinReport_('Pinterest ID check (first 10 IDs)', lines);
  } catch (error) {
    pinReport_('Pinterest ID check', ['ERROR: ' + error.message]);
  }
}

/** Asks for the preview of the first ID on the tab and shows the raw result. */
function diagnosePinterestPreviewAPI() {
  try {
    const { sheet, cols } = pinSheet_();
    const config = pinConfig_();
    const lastRow = sheet.getLastRow();
    const first = lastRow > PIN.HEADER_ROW
      ? sheet.getRange(PIN.HEADER_ROW + 1, cols.id, lastRow - PIN.HEADER_ROW, 1)
          .getDisplayValues().map(r => pinCleanId_(r[0])).find(Boolean)
      : '';
    if (!first) throw new Error('Enter a valid Ad ID on this tab first.');

    const m = pinFindAds_(config, [first]).matches[first];
    if (!m || !m.length) throw new Error('Ad ' + first + ' wasn\'t found in any account.');

    const { account, ad } = m[0];
    const lines = ['Ad ' + first + ' is in ' + account.name +
      ', ad group ' + ad.ad_group_id + '.'];

    const result = pinRequest_(
      PIN.API + '/ad_accounts/' + encodeURIComponent(account.accountId) +
      '/campaign_ad_preview',
      config.token, 'post', [{ ad_group_id: String(ad.ad_group_id) }]);

    const records = Array.isArray(result) ? result : [result];
    lines.push('Records returned: ' + records.length);

    records.forEach((record, n) => {
      const item = record.data || record;
      if (item.exceptions) {
        lines.push((n + 1) + '. PROBLEM: ' + JSON.stringify(item.exceptions).slice(0, 200));
        return;
      }
      lines.push((n + 1) + '. Ad ' + (item.pin_promotion_id || '?') +
        (String(item.pin_promotion_id) === first ? ' (this one)' : '') +
        ' | link: ' + (item.url ? 'yes' : 'no') +
        ' | active: ' + item.is_active +
        ' | expires: ' + (item.expires_at
          ? Utilities.formatDate(new Date(Number(item.expires_at)),
              Session.getScriptTimeZone(), 'd MMM yyyy')
          : '?'));
    });

    pinReport_('Pinterest preview check', lines);
  } catch (error) {
    pinReport_('Pinterest preview check', ['ERROR: ' + error.message]);
  }
}
