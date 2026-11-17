/**
 * META CREATIVE PREVIEW GENERATOR (v4 — Ad ID workflow)
 *
 * Run on the active campaign tab.
 * Tab names must begin with "Meta -" (TEMPLATE tabs are refused).
 *
 * Required headers in row 1:
 * Meta Ad ID | Account | Campaign Name | Ad Set Name |
 * Ad Name | Creative Preview
 *
 * Optional header:
 * Status
 *
 * The client approval column is never modified.
 *
 * Needs Script Property: META_ACCESS_TOKEN
 * The menu lives in Menu.gs. Do NOT add an onOpen() to this file.
 *
 * ---------------------------------------------------------------
 * WORKFLOW
 *  1. Paste Ad IDs into the "Meta Ad ID" column (prefixes like "a:" are fine).
 *  2. Creative Previews > Generate Meta Previews.
 *     → cleans IDs, fetches Account / Campaign / Ad Set / Ad Name / preview
 *       in batches of 50, skips rows already done, then groups the tab by
 *       Campaign > Ad Set > Ad Name.
 *  Creative Previews > Refresh All Meta Previews → re-fetches every row.
 * ---------------------------------------------------------------
 */

const META_CONFIG = {
  API_VERSION: 'v26.0',
  TOKEN_PROPERTY: 'META_ACCESS_TOKEN',
  HEADER_ROW: 1,
  TAB_PREFIX: 'Meta -',

  // Ads requested per Graph API call (Meta max for ?ids= is 50).
  BATCH_SIZE: 50,

  // Status value that marks a row as done (skipped on normal runs).
  SUCCESS_STATUS: 'Success',

  // Status / cell text when Meta returns the ad but no preview link.
  // These rows are NOT treated as done, so the next run retries them.
  NO_PREVIEW_STATUS: 'Preview Unavailable',

  // After generating, group the tab by Campaign > Ad Set > Ad Name.
  // Full-width row sort: client approval values and formatting move
  // WITH their ad — they are never edited. Set false to keep paste order.
  SORT_AFTER_GENERATE: true
};

/* =================================================================
 * SETUP
 * ================================================================= */

/**
 * Optional one-time token setup (run from the Apps Script editor).
 * Saves the token to Script Properties so it never sits in the code.
 */
function setMetaToken() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    'Meta Access Token',
    'Paste your Meta access token:',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const token = response.getResponseText().trim();

  if (!token) {
    ui.alert('No token entered.');
    return;
  }

  PropertiesService.getScriptProperties()
    .setProperty(META_CONFIG.TOKEN_PROPERTY, token);

  ui.alert('Meta token saved to Script Properties.');
}

/* =================================================================
 * META API
 * ================================================================= */

/**
 * Send an authenticated request to Meta Graph API.
 */
function metaApiGet_(path, params = {}) {
  const token = PropertiesService
    .getScriptProperties()
    .getProperty(META_CONFIG.TOKEN_PROPERTY);

  if (!token) {
    throw new Error(
      META_CONFIG.TOKEN_PROPERTY + ' is missing from Script Properties.'
    );
  }

  const query = Object.entries(params)
    .map(([key, value]) =>
      encodeURIComponent(key) + '=' +
      encodeURIComponent(value)
    )
    .join('&');

  const url =
    'https://graph.facebook.com/' +
    META_CONFIG.API_VERSION +
    '/' + path +
    (query ? '?' + query : '');

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + token
    },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  let data;

  try {
    data = JSON.parse(body);
  } catch (error) {
    // Only the start of the body: enough to diagnose, never a full dump.
    throw new Error('Invalid Meta API response (HTTP ' + status + '): ' +
      body.slice(0, 200));
  }

  if (status < 200 || status >= 300 || data.error) {
    const message =
      data.error?.message ||
      'HTTP ' + status;

    throw new Error(message);
  }

  return data;
}

/**
 * Fetch many Graph objects with one call per chunk (?ids=a,b,c).
 * If a chunk fails (e.g. one bad/inaccessible ID fails the whole
 * request), falls back to one call per ID so only the bad ID errors.
 *
 * Returns { results: {id: object}, errors: {id: message}, calls: n }.
 */
function metaApiGetMany_(ids, fields) {
  const results = {};
  const errors = {};
  const size = META_CONFIG.BATCH_SIZE;
  let calls = 0;

  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);

    try {
      calls++;
      const data = metaApiGet_('', { ids: chunk.join(','), fields });

      chunk.forEach(id => {
        if (data[id]) {
          results[id] = data[id];
        } else {
          errors[id] = 'Not returned by Meta API';
        }
      });

    } catch (batchError) {
      console.warn(
        'Batch failed, retrying individually: ' + batchError.message
      );

      chunk.forEach(id => {
        try {
          calls++;
          results[id] = metaApiGet_(encodeURIComponent(id), { fields });
        } catch (error) {
          errors[id] = error.message;
        }
      });
    }
  }

  return { results, errors, calls };
}

/* =================================================================
 * SHEET HELPERS
 * ================================================================= */

/**
 * Find spreadsheet columns by header name.
 */
function metaGetColumns_(sheet) {
  const lastColumn = sheet.getLastColumn();

  const headers = sheet
    .getRange(META_CONFIG.HEADER_ROW, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(value => value.trim().toLowerCase());

  const find = name =>
    headers.indexOf(name.toLowerCase()) + 1;

  const columns = {
    id: find('Meta Ad ID'),
    account: find('Account'),
    campaign: find('Campaign Name'),
    adSet: find('Ad Set Name'),
    adName: find('Ad Name'),
    preview: find('Creative Preview'),
    status: find('Status')
  };

  const required = [
    'id', 'account', 'campaign',
    'adSet', 'adName', 'preview'
  ];

  const missing = required.filter(key => !columns[key]);

  if (missing.length) {
    throw new Error(
      'Missing required columns: ' + missing.join(', ')
    );
  }

  return columns;
}

/**
 * True if the tab is a valid "Meta -" campaign tab.
 */
function metaIsCampaignTab_(tabName) {
  return (
    !tabName.toUpperCase().startsWith('TEMPLATE') &&
    tabName.toLowerCase().startsWith(META_CONFIG.TAB_PREFIX.toLowerCase())
  );
}

/**
 * Strip Meta export prefixes (a:, c:, cg:), apostrophes and
 * whitespace from an ID.
 */
function metaCleanIdString_(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/^'+/, '')
    .replace(/^[a-z]{1,3}:/i, '')
    .replace(/\s+/g, '');
}

/* =================================================================
 * PREVIEW GENERATION
 * ================================================================= */

/**
 * Menu: generate previews for new, failed and no-preview rows only.
 */
function generateMetaPreviews() {
  metaRunPreviews_(false);
}

/**
 * Menu: re-fetch every row (e.g. after creative swaps).
 */
function refreshAllMetaPreviews() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'Refresh All Meta Previews',
    'Re-fetch every row on this tab, including ones already marked ' +
    META_CONFIG.SUCCESS_STATUS + '?',
    ui.ButtonSet.YES_NO
  );

  if (answer === ui.Button.YES) {
    metaRunPreviews_(true);
  }
}

/**
 * Batched generator.
 * - Cleans pasted IDs (strips "a:" etc.) and stores them as plain text.
 * - Flags IDs Sheets has converted to numbers (digits already lost).
 * - Reads each column once, calls Meta in chunks of BATCH_SIZE,
 *   writes each column back once.
 * - force=false skips rows already done (Status = Success and a preview
 *   link present; without a Status column, a preview link present).
 * - Groups the tab by Campaign > Ad Set > Ad Name (SORT_AFTER_GENERATE).
 * - Only Meta Ad ID, Account, Campaign Name, Ad Set Name, Ad Name,
 *   Creative Preview and Status are written. The client approval column
 *   is never touched (rows only move as a whole when grouping).
 */
function metaRunPreviews_(force) {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getActiveSheet();

  const tabName = sheet.getName();

  if (!metaIsCampaignTab_(tabName)) {
    ui.alert(
      'Please select a campaign tab starting with "' +
      META_CONFIG.TAB_PREFIX + '".'
    );
    return;
  }

  try {
    const columns = metaGetColumns_(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow <= META_CONFIG.HEADER_ROW) {
      ui.alert('No Meta Ad IDs found.');
      return;
    }

    const startRow = META_CONFIG.HEADER_ROW + 1;
    const rowCount = lastRow - META_CONFIG.HEADER_ROW;
    const col = c => sheet.getRange(startRow, c, rowCount, 1);

    // --- Read once ---
    const idRange = col(columns.id);
    const idRaw = idRange.getValues();

    // Numbers = Sheets already rounded the 18-digit ID; can't be recovered
    const rounded = idRaw.map(row => typeof row[0] === 'number');
    const adIds = idRaw.map((row, i) =>
      rounded[i] ? '' : metaCleanIdString_(row[0])
    );

    const accountVals = col(columns.account).getValues();
    const campaignVals = col(columns.campaign).getValues();
    const adSetVals = col(columns.adSet).getValues();
    const adNameVals = col(columns.adName).getValues();
    const statusVals = columns.status ? col(columns.status).getValues() : null;

    const previewRange = col(columns.preview);
    const previewDisplay = previewRange.getDisplayValues();
    const previewRich = previewRange.getRichTextValues().map((row, i) =>
      row[0] ||
      SpreadsheetApp.newRichTextValue().setText(previewDisplay[i][0]).build()
    );

    const setError = (i, message) => {
      if (statusVals) {
        statusVals[i][0] = message;
      } else {
        previewRich[i] = SpreadsheetApp
          .newRichTextValue().setText(message).build();
      }
    };

    const hasLink = i => !!previewRich[i].getLinkUrl();

    const isDone = i => statusVals
      ? String(statusVals[i][0]).trim() === META_CONFIG.SUCCESS_STATUS && hasLink(i)
      : hasLink(i);

    // --- Decide which rows to process ---
    const todo = [];
    let skipped = 0;
    let alreadyDone = 0;
    let failed = 0;
    let lastIdRow = META_CONFIG.HEADER_ROW;

    adIds.forEach((id, i) => {
      if (rounded[i]) {
        failed++;
        lastIdRow = startRow + i;
        setError(i,
          'ERROR: ID was converted to a number and rounded — ' +
          're-paste it (column is now Plain text)'
        );
      } else if (!id) {
        skipped++;
      } else if (!/^\d{6,25}$/.test(id)) {
        failed++;
        lastIdRow = startRow + i;
        setError(i, 'ERROR: Not a valid Meta Ad ID');
      } else if (!force && isDone(i)) {
        alreadyDone++;
        lastIdRow = startRow + i;
      } else {
        todo.push(i);
        lastIdRow = startRow + i;
      }
    });

    let successful = 0;
    let noPreview = 0;
    let apiCalls = 0;

    if (todo.length) {
      // --- Fetch ads in batches ---
      const uniqueIds = [...new Set(todo.map(i => adIds[i]))];

      const ads = metaApiGetMany_(uniqueIds, [
        'id',
        'name',
        'account_id',
        'campaign{id,name}',
        'adset{id,name}',
        'preview_shareable_link'
      ].join(','));

      // --- Fetch account names in one batch ---
      const accountIds = [...new Set(
        Object.values(ads.results)
          .map(ad => String(ad.account_id || ''))
          .filter(Boolean)
      )];

      const accounts = metaApiGetMany_(
        accountIds.map(id => 'act_' + id),
        'name'
      );

      apiCalls = ads.calls + accounts.calls;

      const accountName = id => {
        if (!id) return '';
        const acc = accounts.results['act_' + id];
        return (acc && acc.name) || id;
      };

      // --- Apply results ---
      todo.forEach(i => {
        const adId = adIds[i];
        const ad = ads.results[adId];

        if (!ad) {
          failed++;
          const message = 'ERROR: ' + (ads.errors[adId] || 'Unknown error');
          console.error('Meta Ad ID ' + adId + ': ' + message);
          setError(i, message);
          return;
        }

        accountVals[i][0] = accountName(String(ad.account_id || ''));
        campaignVals[i][0] = ad.campaign?.name || '';
        adSetVals[i][0] = ad.adset?.name || '';
        adNameVals[i][0] = ad.name || '';

        if (ad.preview_shareable_link) {
          previewRich[i] = SpreadsheetApp.newRichTextValue()
            .setText('View Ad')
            .setLinkUrl(ad.preview_shareable_link)
            .build();
          if (statusVals) statusVals[i][0] = META_CONFIG.SUCCESS_STATUS;
          successful++;
        } else {
          previewRich[i] = SpreadsheetApp.newRichTextValue()
            .setText(META_CONFIG.NO_PREVIEW_STATUS)
            .build();
          if (statusVals) statusVals[i][0] = META_CONFIG.NO_PREVIEW_STATUS;
          noPreview++;
        }
      });
    }

    // --- Write once per column ---
    // IDs: plain text + cleaned, so future pastes aren't rounded
    idRange.setNumberFormat('@');
    idRange.setValues(idRaw.map((row, i) =>
      [rounded[i] ? row[0] : metaCleanIdString_(row[0])]
    ));

    col(columns.account).setValues(accountVals);
    col(columns.campaign).setValues(campaignVals);
    col(columns.adSet).setValues(adSetVals);
    col(columns.adName).setValues(adNameVals);
    previewRange.setRichTextValues(previewRich.map(v => [v]));

    if (statusVals) {
      col(columns.status).setValues(statusVals);
    }

    // --- Group: Campaign > Ad Set > Ad Name (whole rows move together) ---
    if (META_CONFIG.SORT_AFTER_GENERATE && lastIdRow > startRow) {
      SpreadsheetApp.flush();
      sheet
        .getRange(startRow, 1, lastIdRow - META_CONFIG.HEADER_ROW, sheet.getLastColumn())
        .sort([
          { column: columns.campaign, ascending: true },
          { column: columns.adSet, ascending: true },
          { column: columns.adName, ascending: true }
        ]);
    }

    ui.alert(
      'Meta Preview Generation Complete\n\n' +
      'Successful: ' + successful + '\n' +
      'No preview available: ' + noPreview + '\n' +
      'Failed: ' + failed + '\n' +
      'Already done (skipped): ' + alreadyDone + '\n' +
      'Blank rows: ' + skipped + '\n' +
      'API calls: ' + apiCalls + '\n\n' +
      'Tab: ' + tabName +
      (alreadyDone && !todo.length
        ? '\n\nUse "Refresh All Meta Previews" to re-fetch everything.'
        : '')
    );

  } catch (error) {
    console.error(error);

    ui.alert(
      'Meta Preview Generator Error\n\n' +
      error.message
    );
  }
}
