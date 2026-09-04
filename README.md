# Expo + Supabase Auth Redirect Doctor

Checks an Expo + Supabase OAuth redirect setup and reports the exact mismatch causing the login to fail. Live: https://arling.sk/expo-supabase-auth-doctor/

## What it checks

You fill in your Expo config, Supabase settings, OAuth provider console, and the relevant code flags. The engine (`doctor.js`) cross-checks them and reports:

- **`missing_scheme` / `invalid_scheme`**: `expo.scheme` is empty, is `http`/`https` (reserved, can't be a deep-link handler), or is not a valid URL scheme (lowercase letters, digits, `+`, `-`, `.`, starting with a letter).
- **`path_not_normalized`**: a leading or repeated slash in `expo.path` that would produce a double slash in the final redirect URL.
- **`site_url_is_localhost`**: Supabase's Site URL still points at `localhost`. Supabase falls back to Site URL whenever `redirectTo` is missing or not allow-listed, so this silently sends users to localhost, including in production.
- **`web_site_url_not_https`**: Site URL not using `https` for a web runtime.
- **`project_url_unusual` / `missing_project_url`**: `supabase.projectUrl` doesn't look like `https://<ref>.supabase.co`, or is missing.
- **`redirect_to_mismatch`**: `code.redirectTo` doesn't match the URL the selected runtime (Expo Go, dev build, standalone, web) actually produces via `makeRedirectUri()`.
- **`redirect_not_allowlisted`**: the redirect value isn't matched by any pattern in `supabase.allowedRedirectUrls`, checked with the same glob rules Supabase uses (`*`, `**`, `?`, character classes).
- **`provider_redirect_uri_missing`**: the provider console (Google Cloud Console, Apple Services ID, GitHub OAuth App) doesn't contain the exact `https://<ref>.supabase.co/auth/v1/callback`, which providers require as an exact match.
- **`flow_type_not_pkce`**: recommends PKCE over implicit flow for native apps.
- **`skip_browser_redirect_not_set`**: `code.skipBrowserRedirect` should be `true` on native so the app opens the redirect URL itself instead of Supabase issuing a browser redirect.
- **`detect_session_in_url_not_disabled`**: `code.detectSessionInUrl` should be `false` on native; there is no browser URL to parse there.
- **`missing_exchange_code_for_session`**: with `flowType: 'pkce'`, the callback carries a code, not a session, so the redirect handler must call `exchangeCodeForSession(url)`.

Each problem carries a severity (`high`/`medium`/`low`), a plain-language message, and a copy-paste fix. The page also shows `expectedRedirects` for every runtime and a checklist, and can encode the whole diagnosis into a URL fragment ("Copy link to this diagnosis") so you can share or bookmark one.

## What it does not do

This is a config linter, not a live tester. It never calls your app, your Supabase project, or any OAuth provider: it only reasons about the values you type in, so it cannot catch a runtime bug (a race condition parsing the deep link, a provider setting changed after this was written) that a live run would surface. There is no account and nothing you enter is required to use the tool.

## How it works

Everything runs in one pure function, `diagnose(config)`, in `doctor.js`: no build step, no dependencies. Loaded as `<script type="module">`, the file also publishes `window.RedirectDoctor = { diagnose, expectedRedirects }` for console use. Example, run against the actual engine:

```js
window.RedirectDoctor.diagnose({
  expo: { scheme: "myapp", path: "auth/callback", runtime: "dev-build" },
  supabase: {
    projectUrl: "https://abcd1234.supabase.co",
    siteUrl: "http://localhost:3000",
    allowedRedirectUrls: ["https://myapp.com/**"]
  },
  provider: { name: "google", authorizedRedirectUris: ["https://abcd1234.supabase.co/auth/v1/callback"] },
  code: { redirectTo: "myapp://auth/callback", flowType: "pkce", skipBrowserRedirect: true, detectSessionInUrl: false, usesExchangeCodeForSession: true }
});
```

```json
{
  "status": "fail",
  "summary": "2 blocking mismatches found. Most urgent: Supabase Site URL still points to localhost. Supabase falls back to Site URL whenever redirectTo is missing or not on the allow-list, so a rejected redirect silently sends users to localhost: including in production.",
  "problems": [
    { "severity": "high", "code": "site_url_is_localhost", "message": "Supabase Site URL still points to localhost. Supabase falls back to Site URL whenever redirectTo is missing or not on the allow-list, so a rejected redirect silently sends users to localhost: including in production." },
    { "severity": "high", "code": "redirect_not_allowlisted", "message": "\"myapp://auth/callback\" is not covered by any pattern in supabase.allowedRedirectUrls. Supabase will refuse the redirect and fall back to Site URL." }
  ]
}
```

## Run locally

No build step, no dependencies.

```bash
python -m http.server
```

or just open `index.html` directly in a browser.

## Tests

```bash
node tests.mjs
```

52 assertions, all passing as of this writing.

## Privacy

Everything runs client-side; nothing you type is uploaded or sent to the tool's author. The only network calls are the page's own static assets and anonymous, cookie-free analytics (self-hosted Umami: event names and counts, never the content of what you entered). The "tell me about new tools" email list is entirely voluntary and separate from the check itself. Full policy: https://arling.sk/privacy/.

## Sources

The rules above are sourced from:

- https://supabase.com/docs/guides/auth/redirect-urls: Site URL fallback behavior, glob syntax for the redirect allow-list.
- https://supabase.com/docs/guides/auth/native-mobile-deep-linking: custom scheme redirect format, provider callback shape (`<project>/auth/v1/callback`).
- https://docs.expo.dev/guides/linking/: `scheme://host/path` structure of a deep link.
- https://docs.expo.dev/versions/latest/sdk/auth-session/: `makeRedirectUri()` output per environment (Expo Go vs. dev build/standalone vs. web).

## Report a problem

Found a redirect failure this tool doesn't catch, or a check that flags something that's actually fine? Open an issue: https://github.com/AndryRoby/expo-supabase-auth-doctor/issues, or write to andrej@arling.sk.

## License

All rights reserved: see [LICENSE-NOTICE.md](LICENSE-NOTICE.md). Reading the code and learning from it is fine; deploying your own copy of it as a hosted product is not.

---

ARLing s. r. o., Bratislava, Slovakia. Hub and more free tools: https://arling.sk/

Sister tools:
- https://arling.sk/google-oauth-redirect-doctor/
- https://arling.sk/expo-supabase-auth-doctor/
- https://arling.sk/supabase-redirect-doctor/
- https://arling.sk/flutter-supabase-doctor/
- https://arling.sk/expo-universal-links-doctor/
- https://arling.sk/sepa-pain001-doctor/
- https://arling.sk/bookapp/
