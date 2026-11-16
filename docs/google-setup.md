# Google Drive sync — one-time setup (about 10 minutes)

Liftbook signs in to Google from the browser and stores its data in a `Liftbook` folder in
your Google Drive. Google needs to know about the app first. You do this once, in the
Google Cloud Console, signed in with the Google account whose Drive you want to use.

You need the app's final web address first, for example `https://<something>/liftbook/`.
Below it is written as **APP ORIGIN**, meaning the scheme and host only, with no path:
`https://septimomend.github.io`.

## 1. Create a project

1. Open <https://console.cloud.google.com/>.
2. Use the project picker at the top and choose **New project**.
3. Name it `Liftbook` and click **Create**, then make sure it is the selected project.

## 2. Turn on the Google Drive API

1. Go to **APIs & Services → Library**.
2. Search for **Google Drive API**, open it, and click **Enable**.

## 3. Consent screen (what Google shows when you sign in)

1. Go to **APIs & Services → OAuth consent screen**. In the newer console this is
   **Google Auth Platform → Branding / Audience / Data access**.
2. **Branding page** (required before you can publish): **App name** `Liftbook`, **User
   support email** and **Developer contact email** = your email. Leave **App logo** empty
   (a logo triggers Google's verification review). App domain fields can stay empty; if
   publishing still refuses, set **Application home page** to the app URL and add the
   host (e.g. `septimomend.github.io`) under **Authorised domains**. Save.
3. **Audience / User type:** **External**.
4. **Data access / Scopes:** add `https://www.googleapis.com/auth/drive.file`. It's the one
   described as "See, edit, create, and delete only the specific Google Drive files you use
   with this app". It is a non-sensitive scope, so Google doesn't review the app.
5. **Publishing status:** click **Publish app** to move it to **In production**.
   This is important. In *Testing* status Google expires your sign-in every 7 days.
   - If Google shows a notice that the app is unverified, that's expected for a personal
     app. Sign-in still works: choose **Advanced → Go to Liftbook** the first time.

## 4. Create the OAuth client

1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**. In the
   newer console: **Google Auth Platform → Clients → Create client**.
2. **Application type:** **Web application**. **Name:** `Liftbook web`.
3. **Authorised JavaScript origins:** add
   - **APP ORIGIN** (e.g. `https://septimomend.github.io`)
   - `http://localhost:8080` (optional, for testing on a computer)
4. Leave **Authorised redirect URIs** empty, then click **Create**.
5. Copy the **Client ID**. It looks like `1234567890-abc123.apps.googleusercontent.com`.

## 5. Send the Client ID

Paste the Client ID into the chat, or put it in `app/js/config.js` as `GOOGLE_CLIENT_ID`.
It is **not a secret**. It only names the app, and it is safe in the repo. Never send the
*client secret*, which Liftbook doesn't need at all.

## 6. First use on the iPhone

1. Open the app from the Home Screen and go to **Settings → Google Drive → Sign in & sync**.
2. Pick your Google account and allow access. Liftbook can only see files it created.
3. To bring in your existing program, go to **Settings → Import file** and pick
   `liftbook-import.json` from Drive. The next sync uploads it to the `Liftbook` folder.

After this, the app syncs when you open it and when you finish a workout. When Google's
one-hour sign-in has run out, a **Tap to sync with Google Drive** bar appears. Tap it, then
**Continue**.
