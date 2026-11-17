# Pinterest — one-off login setup

Pinterest needs two script files:

| File | What it's for | How often |
|---|---|---|
| `PinterestAuth.gs` | **Logging in.** Connects the spreadsheet to Pinterest and saves the login in Script Properties | Once (then it renews itself) |
| `PinterestPreviews.gs` | **The generator.** Fills in ad details and preview links | Every campaign |

They're separate because logging in to Pinterest is a fiddly, one-off process, while the generator is used all the time.

Unlike TikTok, the Pinterest login is shared by **everyone** who uses the spreadsheet, so only one person needs to do this.

## What you need

- Access to your company's **Pinterest developer app** (developers.pinterest.com → *My apps*). It needs **Ads API** access, approved for production use. You'll need its **App ID** and **App secret**.
- Editor access to the spreadsheet's Apps Script project.
- Both Pinterest files and `Menu.gs` added to the project (see [`SETUP_GUIDE.md`](../../SETUP_GUIDE.md)).

## Steps

### 1. Publish the project as a Web App

After you approve access, Pinterest needs a web page to send you back to. The `doGet` function in `PinterestAuth.gs` is that page, and it only exists once the project is published as a Web App.

1. In Apps Script, click **Deploy → New deployment**.
2. Click the cog next to *Select type* and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**. Pinterest has to be able to reach the page. The page only accepts a one-time code that matches the login you started, so strangers can't use it.
4. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).

### 2. Tell Pinterest about that URL

In your Pinterest developer app's settings, add the Web app URL as a **Redirect URI**. It must match exactly.

### 3. Add the Script Properties

In Apps Script go to **Project Settings → Script Properties** and add:

| Property | Value |
|---|---|
| `PINTEREST_APP_ID` | The app's App ID |
| `PINTEREST_APP_SECRET` | The app's App secret. **Keep this private:** never put it in code, chat, screenshots or GitHub |
| `PINTEREST_REDIRECT_URI` | The Web app URL from step 1 |

### 4. Log in

1. Reload the spreadsheet, then choose **Creative Previews → Pinterest setup → 1. Start login**.
2. Click the link in the pop-up, log in to Pinterest and approve access. The script asks for `ads:read` and `ads:write`; preview links have needed more than read-only access before.
3. When the page says *"Pinterest authorisation received"*, go back to the spreadsheet.
4. Choose **Pinterest setup → 2. Finish login**. The script saves `PINTEREST_ACCESS_TOKEN`, `PINTEREST_REFRESH_TOKEN` and `PINTEREST_ACCESS_EXPIRES_AT` for you.

### 5. Choose which ad accounts to search

1. Choose **Pinterest setup → 3. Test connection**. It lists every ad account the login can see, then gives a ready-made line like `{"Client A":"1234567890","Client B":"2345678901"}`.
2. Copy that line and delete any accounts the script shouldn't search. Fewer accounts makes it faster. You can also rename an account: the name you use is what appears in the `Account` column.
3. Add it as a Script Property called `PINTEREST_AD_ACCOUNTS`.

That's it. Each time you generate previews, the script renews the login if it's within 2 days of expiring.

## Script Properties at a glance

| Property | Added by | Notes |
|---|---|---|
| `PINTEREST_APP_ID` | You | |
| `PINTEREST_APP_SECRET` | You | Secret |
| `PINTEREST_REDIRECT_URI` | You | The Web app URL |
| `PINTEREST_AD_ACCOUNTS` | You | `{"Name": "account ID", ...}`, one or more accounts |
| `PINTEREST_ACCESS_TOKEN` | Script | Secret. Renewed automatically |
| `PINTEREST_REFRESH_TOKEN` | Script | Secret. Used to renew the login |
| `PINTEREST_ACCESS_EXPIRES_AT` | Script | When the login expires (a timestamp) |
| `PINTEREST_OAUTH_STATE` | Script | Temporary, during login only |
| `PINTEREST_AUTH_CODE` | Script | Temporary, during login only |

## If something goes wrong

| Problem | Fix |
|---|---|
| "Add PINTEREST_APP_ID and PINTEREST_REDIRECT_URI…" | Do step 3 |
| Pinterest says the redirect URI doesn't match | The URL in Pinterest's app settings must exactly match `PINTEREST_REDIRECT_URI` |
| Page says "OAuth state validation failed" | The login link was old or used twice. Start again from **1. Start login** |
| "No approval received yet" | You chose Finish before approving on Pinterest. Do **1. Start login** first |
| "Login failed … codes only work once" | Start again from **1. Start login** |
| "The Pinterest login has expired and couldn't be refreshed" | The refresh failed (e.g. access was removed). Log in again from step 4 |
| Test connection doesn't list an account | The Pinterest user who logged in doesn't have access to it. Get access, then log in again |

## Copies of the spreadsheet

Each copy of the template has its **own** Apps Script project. If a copy says Pinterest isn't connected, repeat this setup in that copy, including publishing a new Web App and adding its URL to Pinterest.
