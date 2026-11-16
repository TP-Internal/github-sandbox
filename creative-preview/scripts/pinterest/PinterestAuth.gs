/**
 * PINTEREST OAUTH SETUP
 * Separate from Meta and Pinterest preview code.
 *
 * Script Properties required:
 * PINTEREST_APP_ID
 * PINTEREST_APP_SECRET
 * PINTEREST_REDIRECT_URI
 */

function pinterestOAuthStart() {
  const props = PropertiesService.getScriptProperties();
  const appId = props.getProperty('PINTEREST_APP_ID');
  const redirect = props.getProperty('PINTEREST_REDIRECT_URI');

  if (!appId || !redirect) {
    throw new Error('Missing App ID or Redirect URI.');
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
    .map(key =>
      encodeURIComponent(key) + '=' +
      encodeURIComponent(params[key])
    ).join('&');

  const url = 'https://www.pinterest.com/oauth/?' + query;

  console.log('Open this URL to authorise Pinterest:');
  console.log(url);
}

function doGet(e) {
  const props = PropertiesService.getScriptProperties();

  const receivedState = e.parameter.state || '';
  const expectedState =
    props.getProperty('PINTEREST_OAUTH_STATE');

  if (!expectedState ||
      receivedState !== expectedState) {
    return HtmlService.createHtmlOutput(
      'OAuth state validation failed.'
    );
  }

  if (e.parameter.error) {
    return HtmlService.createHtmlOutput(
      'Pinterest authorisation was declined or failed.'
    );
  }

  const code = e.parameter.code;

  if (!code) {
    return HtmlService.createHtmlOutput(
      'No authorisation code received.'
    );
  }

  // Save the code for exchange inside the editor.
  props.setProperty('PINTEREST_AUTH_CODE', code);
  props.deleteProperty('PINTEREST_OAUTH_STATE');

  return HtmlService.createHtmlOutput(
    'Pinterest authorisation received. ' +
    'Return to Apps Script and run pinterestOAuthExchange.'
  );
}

function pinterestOAuthExchange() {
  const props = PropertiesService.getScriptProperties();

  const appId = props.getProperty('PINTEREST_APP_ID');
  const secret = props.getProperty('PINTEREST_APP_SECRET');
  const redirect = props.getProperty('PINTEREST_REDIRECT_URI');
  const code = props.getProperty('PINTEREST_AUTH_CODE');

  if (!appId || !secret || !redirect || !code) {
    throw new Error('Missing OAuth configuration or code.');
  }

  const basicAuth = Utilities.base64Encode(
    appId + ':' + secret
  );

  const response = UrlFetchApp.fetch(
    'https://api.pinterest.com/v5/oauth/token',
    {
      method: 'post',
      headers: {
        Authorization: 'Basic ' + basicAuth,
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
    }
  );

  const status = response.getResponseCode();
  const data = JSON.parse(response.getContentText());

  if (status !== 200) {
    throw new Error(
      'Pinterest OAuth HTTP ' + status +
      ': ' + JSON.stringify(data)
    );
  }

  if (!data.access_token || !data.refresh_token) {
    throw new Error('Expected OAuth tokens were not returned.');
  }

  props.setProperties({
    PINTEREST_ACCESS_TOKEN: data.access_token,
    PINTEREST_REFRESH_TOKEN: data.refresh_token,
    PINTEREST_ACCESS_EXPIRES_AT: String(
      Date.now() + data.expires_in * 1000
    )
  });

  props.deleteProperty('PINTEREST_AUTH_CODE');

  console.log('Pinterest OAuth completed successfully.');
  console.log('Access token and refresh token saved.');
  console.log('Expires in: ' + data.expires_in + ' seconds');
}

function pinterestRefreshAccessToken() {
  const props = PropertiesService.getScriptProperties();

  const appId = props.getProperty('PINTEREST_APP_ID');
  const secret = props.getProperty('PINTEREST_APP_SECRET');
  const refreshToken =
    props.getProperty('PINTEREST_REFRESH_TOKEN');

  if (!appId || !secret || !refreshToken) {
    throw new Error('Missing Pinterest refresh credentials.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const response = UrlFetchApp.fetch(
      'https://api.pinterest.com/v5/oauth/token',
      {
        method: 'post',
        headers: {
          Authorization: 'Basic ' +
            Utilities.base64Encode(appId + ':' + secret),
          Accept: 'application/json'
        },
        contentType: 'application/x-www-form-urlencoded',
        payload: {
          grant_type: 'refresh_token',
          refresh_token: props.getProperty(
            'PINTEREST_REFRESH_TOKEN'
          )
        },
        muteHttpExceptions: true
      }
    );

    const status = response.getResponseCode();
    const data = JSON.parse(response.getContentText());

    if (status !== 200 ||
        !data.access_token ||
        !data.refresh_token) {
      throw new Error(
        'Token refresh failed: HTTP ' + status +
        ' ' + JSON.stringify(data)
      );
    }

    props.setProperties({
      PINTEREST_ACCESS_TOKEN: data.access_token,
      PINTEREST_REFRESH_TOKEN: data.refresh_token,
      PINTEREST_ACCESS_EXPIRES_AT: String(
        Date.now() + Number(data.expires_in) * 1000
      )
    });

    console.log('Pinterest tokens refreshed successfully.');

  } finally {
    lock.releaseLock();
  }
}


function testPinterestAuthentication() {
  const props = PropertiesService.getScriptProperties();

  const token = props.getProperty('PINTEREST_ACCESS_TOKEN');

  if (!token) {
    throw new Error('Pinterest access token missing.');
  }

  const response = UrlFetchApp.fetch(
    'https://api.pinterest.com/v5/ad_accounts?page_size=25',
    {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + token.trim(),
        Accept: 'application/json'
      },
      muteHttpExceptions: true
    }
  );

  const status = response.getResponseCode();

  console.log('Pinterest Ads Authentication Test');
  console.log('HTTP Status: ' + status);

  if (status === 200) {
    const data = JSON.parse(response.getContentText());

    console.log('SUCCESS: Pinterest Ads API accessible.');

    (data.items || []).forEach(account => {
      console.log(
        'Account ID: ' + account.id +
        ' | Account Name: ' + account.name
      );
    });

  } else {
    console.log(
      'FAILED: ' +
      response.getContentText().substring(0, 500)
    );
  }
}
