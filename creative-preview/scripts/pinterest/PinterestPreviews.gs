/**
 * PINTEREST CREATIVE PREVIEW GENERATOR
 * Version 4.0 — Multi-account
 *
 * Four-account automatic lookup.
 * Supports PP-prefixed export IDs.
 * Uses active sheet and Meta-style headers.
 *
 * Script Properties:
 * PINTEREST_ACCESS_TOKEN
 * PINTEREST_AD_ACCOUNTS
 *
 * No onOpen() here — use Meta's shared menu.
 */

const PIN_V4 = {
  API: 'https://api.pinterest.com/v5',
  HEADERS: [
    'Pinterest Ad ID',
    'Account',
    'Campaign Name',
    'Ad Set Name',
    'Ad Name',
    'Creative Preview',
    'Status'
  ]
};


// ==========================================
// CONFIGURATION
// ==========================================

function pinV4Config() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('PINTEREST_ACCESS_TOKEN');
  const raw = props.getProperty('PINTEREST_AD_ACCOUNTS');

  if (!token || !raw) {
    throw new Error(
      'Set PINTEREST_ACCESS_TOKEN and ' +
      'PINTEREST_AD_ACCOUNTS in Script Properties.'
    );
  }

  let accounts;
  try {
    accounts = JSON.parse(raw);
  } catch (e) {
    throw new Error('PINTEREST_AD_ACCOUNTS must be valid JSON.');
  }

  if (!accounts || Array.isArray(accounts) ||
      typeof accounts !== 'object' ||
      Object.keys(accounts).length !== 4) {
    throw new Error('Configure exactly four Pinterest accounts.');
  }

  for (const [name, id] of Object.entries(accounts)) {
    if (!/^\d+$/.test(String(id))) {
      throw new Error('Invalid account ID for ' + name);
    }
  }

  return { token, accounts };
}


// ==========================================
// ACTIVE SHEET AND HEADERS
// ==========================================

function pinV4Sheet() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getActiveSheet();

  if (sheet.getName().toUpperCase().startsWith('TEMPLATE')) {
    throw new Error('Duplicate the template tab first.');
  }

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(x => x.trim());

  const columns = {};

  PIN_V4.HEADERS.forEach((name, i) => {
    const index = headers.indexOf(name);
    if (index === -1) {
      throw new Error('Missing header: ' + name);
    }
    columns[i] = index + 1;
  });

  return { sheet, columns };
}


// ==========================================
// PINTEREST API HELPER
// ==========================================

function pinV4Request(url, token, method, payload) {
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

  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(
      'HTTP ' + status + ': ' + body.substring(0, 400)
    );
  }

  return body ? JSON.parse(body) : {};
}


// ==========================================
// PAGINATED ACCOUNT DATA
// ==========================================

function pinV4List(accountId, resource, token) {
  const items = [];
  let bookmark = null;
  let pages = 0;

  do {
    let url = PIN_V4.API +
      '/ad_accounts/' + encodeURIComponent(accountId) +
      '/' + resource + '?page_size=100';

    if (bookmark) {
      url += '&bookmark=' + encodeURIComponent(bookmark);
    }

    const result = pinV4Request(url, token);
    items.push(...(result.items || []));

    bookmark = result.bookmark || null;
    pages++;

    if (pages > 200) {
      throw new Error('Pagination safety limit reached.');
    }

  } while (bookmark);

  return items.map(item => item.data || item);
}


// ==========================================
// SAFE ID MATCHING
// ==========================================

function pinV4Candidates(id) {
  const original = String(id).trim();
  const candidates = [original];

  if (/^PP\d+$/i.test(original)) {
    candidates.push(original.slice(2));
  }

  return candidates;
}

function pinV4FindMatches(exportId, records) {
  const candidates = pinV4Candidates(exportId);

  return records.filter(ad =>
    candidates.includes(String(ad.id))
  );
}


// ==========================================
// FETCH ALL FOUR ACCOUNTS
// ==========================================

function pinV4LoadAccounts(config) {
  const loaded = [];
  const failures = [];

  for (const [name, accountId] of
       Object.entries(config.accounts)) {

    try {
      const ads = pinV4List(accountId, 'ads', config.token);
      const groups = pinV4List(
        accountId, 'ad_groups', config.token
      );
      const campaigns = pinV4List(
        accountId, 'campaigns', config.token
      );

      loaded.push({
        name,
        accountId,
        ads,
        groups: new Map(
          groups.map(g => [String(g.id), g])
        ),
        campaigns: new Map(
          campaigns.map(c => [String(c.id), c])
        )
      });

      console.log(name + ': loaded ' + ads.length + ' ads');

    } catch (error) {
      failures.push(name + ': ' + error.message);
      console.log('Account error: ' + name + ': ' +
                  error.message);
    }
  }

  return { loaded, failures };
}


// ==========================================
// MATCH ADS ACROSS ACCOUNTS
// ==========================================

function pinV4Match(id, loaded) {
  const matches = [];

  for (const account of loaded) {
    const ads = pinV4FindMatches(id, account.ads);

    ads.forEach(ad => {
      matches.push({ account, ad });
    });
  }

  return matches;
}


// ==========================================
// DIAGNOSTIC — READ ONLY
// ==========================================

function diagnosePinterestIds() {
  const { sheet, columns } = pinV4Sheet();
  const config = pinV4Config();

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    throw new Error('Enter an Ad ID in column A.');
  }

  const ids = sheet
    .getRange(2, columns[0], lastRow - 1, 1)
    .getDisplayValues()
    .map(r => r[0].trim())
    .filter(Boolean);

  const result = pinV4LoadAccounts(config);

  console.log('Accounts loaded: ' + result.loaded.length);

  result.failures.forEach(message => {
    console.log('ACCOUNT FAILURE: ' + message);
  });

  ids.slice(0, 10).forEach(id => {
    const matches = pinV4Match(id, result.loaded);

    console.log(
      'Export ID: ' + id +
      ' | Candidates: ' +
      pinV4Candidates(id).join(', ') +
      ' | Matches: ' + matches.length
    );

    matches.forEach(match => {
      console.log(
        'MATCH | Account: ' + match.account.name +
        ' | API Ad ID: ' + match.ad.id +
        ' | Ad Group ID: ' + match.ad.ad_group_id +
        ' | Name: ' + (match.ad.name || '')
      );
    });
  });

  console.log(
    'Diagnostic complete. No spreadsheet cells changed.'
  );
}


// ==========================================
// PREVIEW API
// ==========================================

function pinV4Previews(account, groupIds, token) {
  const previews = new Map();
  const failures = [];

  for (let i = 0; i < groupIds.length; i += 100) {
    const batch = groupIds.slice(i, i + 100);

    try {
      const result = pinV4Request(
        PIN_V4.API +
        '/ad_accounts/' + account.accountId +
        '/campaign_ad_preview',
        token,
        'post',
        batch.map(id => ({ ad_group_id: id }))
      );

      const records = Array.isArray(result)
        ? result : [result];

      records.forEach(record => {
        const data = record.data || record;

        if (data.exceptions) {
          failures.push(
            String(data.exceptions.message ||
                   'Preview exception')
          );
          return;
        }

        if (data.pin_promotion_id && data.url &&
            data.is_active !== false) {

          const expires = Number(data.expires_at);

          if (Number.isFinite(expires) &&
              expires > Date.now()) {
            previews.set(
              String(data.pin_promotion_id), data.url
            );
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

function generatePinterestPreviews() {
  const { sheet, columns } = pinV4Sheet();
  const config = pinV4Config();

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    throw new Error('No Pinterest Ad IDs found.');
  }

  const ids = sheet
    .getRange(2, columns[0], lastRow - 1, 1)
    .getDisplayValues()
    .map(r => r[0].trim());

  const accountData = pinV4LoadAccounts(config);

  if (accountData.failures.length) {
    throw new Error(
      'Account lookup incomplete. No cells changed. ' +
      accountData.failures.join(' | ')
    );
  }

  // Resolve every nonempty ID before modifying cells.
  const resolved = ids.map(id => {
    if (!id) return { type: 'empty' };

    const matches = pinV4Match(id, accountData.loaded);

    if (!matches.length) {
      return { type: 'missing', id };
    }

    if (matches.length > 1) {
      return { type: 'ambiguous', id };
    }

    return {
      type: 'matched',
      account: matches[0].account,
      ad: matches[0].ad
    };
  });

  // Group requested ads by advertising account.
  const previewMaps = new Map();

  for (const account of accountData.loaded) {
    const groupIds = [...new Set(
      resolved
        .filter(r =>
          r.type === 'matched' &&
          r.account.accountId === account.accountId
        )
        .map(r => String(r.ad.ad_group_id))
    )];

    if (!groupIds.length) continue;

    const result = pinV4Previews(
      account, groupIds, config.token
    );

    previewMaps.set(account.accountId, result);
  }

  let success = 0;
  let errors = 0;

  resolved.forEach((item, index) => {
    const row = index + 2;

    const write = (key, value) =>
      sheet.getRange(row, columns[key]).setValue(value);

    const previewCell = sheet.getRange(row, columns[5]);

    if (item.type === 'empty') {
      return;
    }

    if (item.type === 'missing') {
      write(6, 'Ad ID not found — check diagnostic');
      errors++;
      return;
    }

    if (item.type === 'ambiguous') {
      write(6, 'Ambiguous Ad ID — check diagnostic');
      errors++;
      return;
    }

    const { account, ad } = item;

    const group = account.groups.get(
      String(ad.ad_group_id)
    );

    const campaignId = ad.campaign_id ||
      (group && group.campaign_id);

    const campaign = account.campaigns.get(
      String(campaignId || '')
    );

    const result = previewMaps.get(account.accountId);

    const url = result &&
      result.previews.get(String(ad.id));

    // Only overwrite B-E when matching succeeded.
    write(1, account.name);
    write(2, campaign ? campaign.name || '' : '');
    write(3, group ? group.name || '' : '');
    write(4, ad.name || '');

    if (url) {
      const link = SpreadsheetApp.newRichTextValue()
        .setText('View Ad')
        .setLinkUrl(url)
        .build();

      previewCell.setRichTextValue(link);
      write(6, 'Success');
      success++;

    } else {
      // Preserve existing link if new preview failed.
      write(6, 'Preview unavailable — check logs');
      errors++;
    }
  });

  SpreadsheetApp.getUi().alert(
    'Pinterest Preview Generation Complete\n\n' +
    'Successful: ' + success +
    '\nUnmatched / Unavailable: ' + errors +
    '\n\nTab: ' + sheet.getName()
  );
}

function diagnosePinterestPreviewAPI() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('PINTEREST_ACCESS_TOKEN');
  const accounts = JSON.parse(
    props.getProperty('PINTEREST_AD_ACCOUNTS')
  );

  if (!token || !accounts['Client Name']) {
    throw new Error('Missing token or Client Name account configuration.');
  }

  const accountId = String(accounts['Client Name']);
  const adGroupId = '1234567890123';

  const url =
    'https://api.pinterest.com/v5/ad_accounts/' +
    encodeURIComponent(accountId) +
    '/campaign_ad_preview';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + token.trim(),
      Accept: 'application/json'
    },
    contentType: 'application/json',
    payload: JSON.stringify([
      { ad_group_id: adGroupId }
    ]),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();

  console.log('Preview API HTTP status: ' + status);

  let data;
  try {
    data = JSON.parse(response.getContentText());
  } catch (error) {
    console.log('Response is not valid JSON.');
    return;
  }

  if (status < 200 || status >= 300) {
    console.log('API error: ' + JSON.stringify(data));
    return;
  }

  const records = Array.isArray(data) ? data : [data];

  console.log('Returned records: ' + records.length);

  records.forEach((record, index) => {
    const item = record.data || record;

    if (item.exceptions) {
      console.log(
        'Record ' + (index + 1) +
        ' EXCEPTION: ' + JSON.stringify(item.exceptions)
      );
      return;
    }

    console.log(
      'Record ' + (index + 1) +
      ' | Ad ID: ' + String(item.pin_promotion_id || 'missing') +
      ' | URL present: ' + Boolean(item.url) +
      ' | Active: ' + item.is_active +
      ' | Expires at: ' + item.expires_at
    );
  });

  console.log('Preview API diagnostic complete.');
}
