/**
 * PINTEREST LOGIN SETUP (OAuth)
 * Separate from the preview generator. Run once per spreadsheet, then
 * the generator keeps the login fresh automatically.
 *
 * Script Properties you add by hand:
 *   PINTEREST_APP_ID         from your Pinterest developer app
 *   PINTEREST_APP_SECRET     from your Pinterest developer app (keep private)
 *   PINTEREST_REDIRECT_URI   this project's Web App URL (see the setup guide)
 *
 * Script Properties this file saves for you:
 *   PINTEREST_ACCESS_TOKEN, PINTEREST_REFRESH_TOKEN,
 *   PINTEREST_ACCESS_EXPIRES_AT, and temporarily
 *   PINTEREST_OAUTH_STATE / PINTEREST_AUTH_CODE during login.
 *
 * Steps (Creative Previews → Pinterest setup):
 *   1. Start login   → click the link, approve on Pinterest
 *   2. Finish login  → swaps the approval for tokens
 *   3. Test connection → lists your ad accounts and their IDs
 *
 * doGet() is what Pinterest sends you back to after approving. It only
 * works if this project is deployed as a Web App. Only ONE doGet() may
 * exist in the project.
 */

/** Shows a message in a pop-up (from the menu) and in the execution log. */
function pinAuthReport_(title, lines) {
  lines.forEach(line => console.log(line));
  try {
    SpreadsheetApp.getUi().alert(title + '\n\n' + lines.join('\n'));
  } catch (e) { /* run from the editor: the log is enough */ }
}

/** Reads a token response safely. */
function pinAuthParse_(response) {
  try {
    return JSON.parse(response.getContentText());
  } catch (e) {
    return { message: 'Unexpected reply (HTTP ' + response.getResponseCode() + ')' };
  }
}

function pinterestOAuthStart() {
  const props = PropertiesService.getScriptProperties();
  const appId = props.getProperty('PINTEREST_APP_ID');
  const redirect = props.getProperty('PINTEREST_REDIRECT_URI');

  if (!appId || !redirect) {
    pinAuthReport_('Pinterest login', ['Add PINTEREST_APP_ID and ' +
      'PINTEREST_REDIRECT_URI to Script Properties first (see the setup guide).']);
    return;
  }

  const state = Utilities.getUuid();
  props.setProperty('PINTEREST_OAUTH_STATE', state);

  const params = {
    client_id: appId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'ads:read,ads:write',
    state: state
  };

  const query = Object.keys(params)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
    .join('&');

  const url = 'https://www.pinterest.com/oauth/?' + query;

  console.log('Open this URL to authorise Pinterest:');
  console.log(url);

  // From the menu: show a clickable link instead of making people dig in the log
  try {
    const html = HtmlService.createHtmlOutput(
      '<p style="font-family:sans-serif">1. <a href="' + url + '" target="_blank">' +
      'Click here to log in to Pinterest</a> and approve access.</p>' +
      '<p style="font-family:sans-serif">2. When the page says the authorisation ' +
      'was received, come back and choose <b>Creative Previews → Pinterest setup ' +
      '→ 2. Finish login</b>.</p>'
    ).setWidth(420).setHeight(160);
    SpreadsheetApp.getUi().showModalDialog(html, 'Pinterest login');
  } catch (e) { /* run from the editor: use the link in the log */ }
}

function doGet(e) {
  const props = PropertiesService.getScriptProperties();

  const receivedState = e.parameter.state || '';
  const expectedState = props.getProperty('PINTEREST_OAUTH_STATE');

  if (!expectedState || receivedState !== expectedState) {
    return HtmlService.createHtmlOutput(
      'OAuth state validation failed. Start the login again from the spreadsheet.'
    );
  }

  if (e.parameter.error) {
    return HtmlService.createHtmlOutput(
      'Pinterest authorisation was declined or failed.'
    );
  }

  const code = e.parameter.code;

  if (!code) {
    return HtmlService.createHtmlOutput('No authorisation code received.');
  }

  // Save the code; "Finish login" swaps it for tokens.
  props.setProperty('PINTEREST_AUTH_CODE', code);
  props.deleteProperty('PINTEREST_OAUTH_STATE');

  return HtmlService.createHtmlOutput(
    'Pinterest authorisation received. Go back to the spreadsheet and choose ' +
    'Creative Previews → Pinterest setup → 2. Finish login.'
  );
}

function pinterestOAuthExchange() {
  const props = PropertiesService.getScriptProperties();

  const appId = props.getProperty('PINTEREST_APP_ID');
  const secret = props.getProperty('PINTEREST_APP_SECRET');
  const redirect = props.getProperty('PINTEREST_REDIRECT_URI');
  const code = props.getProperty('PINTEREST_AUTH_CODE');

  if (!appId || !secret || !redirect) {
    pinAuthReport_('Pinterest login', ['Missing PINTEREST_APP_ID, ' +
      'PINTEREST_APP_SECRET or PINTEREST_REDIRECT_URI in Script Properties.']);
    return;
  }
  if (!code) {
    pinAuthReport_('Pinterest login', ['No approval received yet. Do ' +
      '"1. Start login" and approve on Pinterest first.']);
    return;
  }

  const response = UrlFetchApp.fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'post',
    headers: {
      Authorization: 'Basic ' + Utilities.base64Encode(appId + ':' + secret),
      Accept: 'application/json'
    },
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirect,
      continuous_refresh: 'true'
    },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const data = pinAuthParse_(response);

  // The code only works once, so clear it whatever happens
  props.deleteProperty('PINTEREST_AUTH_CODE');

  if (status !== 200 || !data.access_token || !data.refresh_token) {
    pinAuthReport_('Pinterest login failed', [
      'HTTP ' + status + ': ' + String(data.message || data.error || '').slice(0, 200),
      'Approval codes only work once. Do "1. Start login" again.'
    ]);
    return;
  }

  props.setProperties({
    PINTEREST_ACCESS_TOKEN: data.access_token,
    PINTEREST_REFRESH_TOKEN: data.refresh_token,
    PINTEREST_ACCESS_EXPIRES_AT: String(Date.now() + Number(data.expires_in) * 1000)
  });

  pinAuthReport_('Pinterest login complete', [
    'Pinterest is connected. The login lasts about ' +
      Math.round(Number(data.expires_in) / 86400) + ' days and is refreshed ' +
      'automatically when you generate previews.',
    'Next: "3. Test connection" to see your ad account IDs.'
  ]);
}

/**
 * Gets a new access token using the refresh token.
 * Called automatically by the generator shortly before the login expires;
 * can also be run by hand from the menu.
 */
function pinterestRefreshAccessToken() {
  const props = PropertiesService.getScriptProperties();

  const appId = props.getProperty('PINTEREST_APP_ID');
  const secret = props.getProperty('PINTEREST_APP_SECRET');

  if (!appId || !secret || !props.getProperty('PINTEREST_REFRESH_TOKEN')) {
    throw new Error('Missing Pinterest refresh credentials.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    // Read inside the lock in case someone else just refreshed it
    const refreshToken = props.getProperty('PINTEREST_REFRESH_TOKEN');

    const response = UrlFetchApp.fetch('https://api.pinterest.com/v5/oauth/token', {
      method: 'post',
      headers: {
        Authorization: 'Basic ' + Utilities.base64Encode(appId + ':' + secret),
        Accept: 'application/json'
      },
      contentType: 'application/x-www-form-urlencoded',
      payload: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      },
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    const data = pinAuthParse_(response);

    if (status !== 200 || !data.access_token) {
      throw new Error('Token refresh failed: HTTP ' + status + ' ' +
        String(data.message || data.error || '').slice(0, 200));
    }

    const update = {
      PINTEREST_ACCESS_TOKEN: data.access_token,
      PINTEREST_ACCESS_EXPIRES_AT: String(Date.now() + Number(data.expires_in) * 1000)
    };
    // Pinterest may or may not send a new refresh token; keep the old one if not
    if (data.refresh_token) update.PINTEREST_REFRESH_TOKEN = data.refresh_token;
    props.setProperties(update);

    console.log('Pinterest tokens refreshed successfully.');

  } finally {
    lock.releaseLock();
  }
}

/** Menu version of the refresh, with a pop-up result. */
function pinterestRefreshNow() {
  try {
    pinterestRefreshAccessToken();
    pinAuthReport_('Pinterest login', ['Login refreshed.']);
  } catch (error) {
    pinAuthReport_('Pinterest login', ['ERROR: ' + error.message,
      'If this keeps failing, do "1. Start login" again.']);
  }
}

/**
 * Checks the login works and lists every ad account it can see, with a
 * ready-to-paste value for the PINTEREST_AD_ACCOUNTS Script Property.
 */
function testPinterestAuthentication() {
  const token = (PropertiesService.getScriptProperties()
    .getProperty('PINTEREST_ACCESS_TOKEN') || '').trim();

  if (!token) {
    pinAuthReport_('Pinterest connection test', ['Not connected yet. ' +
      'Do "1. Start login" and "2. Finish login" first.']);
    return;
  }

  const accounts = [];
  let bookmark = null;
  let pages = 0;

  do {
    const response = UrlFetchApp.fetch(
      'https://api.pinterest.com/v5/ad_accounts?page_size=100' +
      (bookmark ? '&bookmark=' + encodeURIComponent(bookmark) : ''),
      {
        method: 'get',
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        muteHttpExceptions: true
      }
    );

    const status = response.getResponseCode();
    if (status !== 200) {
      pinAuthReport_('Pinterest connection test', [
        'FAILED (HTTP ' + status + '): ' + response.getContentText().substring(0, 300)
      ]);
      return;
    }

    const data = pinAuthParse_(response);
    accounts.push(...(data.items || []));
    bookmark = data.bookmark || null;
    pages++;
  } while (bookmark && pages < 20);

  const example = {};
  accounts.forEach(a => { example[a.name || a.id] = String(a.id); });

  pinAuthReport_('Pinterest connection test', [
    'SUCCESS: connected. Ad accounts you can see:',
    ...accounts.map(a => '• ' + a.name + ' — ' + a.id),
    '',
    'For PINTEREST_AD_ACCOUNTS, keep only the accounts you want searched:',
    JSON.stringify(example)
  ]);
}
