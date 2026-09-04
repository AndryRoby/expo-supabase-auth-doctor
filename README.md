# Redirect Doctor — Expo + Supabase OAuth

Live: https://andryroby.github.io/expo-supabase-auth-doctor/

A free, static, client-side tool that checks your Expo + Supabase OAuth
redirect configuration (Google / Apple / GitHub / etc. via Supabase Auth)
and points at the exact mismatch causing your redirect to fail — instead
of you re-reading the Supabase docs for the fifth time.

## What it's for

If you're building a React Native app with Expo and Supabase Auth, and
your OAuth flow gets stuck — redirects to `localhost`, opens a blank
browser tab, silently does nothing, or throws `invalid_request` /
`redirect_uri_mismatch` — this tool takes the config you'd normally have
scattered across `app.json`, your Supabase dashboard, and your Google /
Apple / GitHub OAuth app settings, and cross-checks it for the handful of
mismatches that cause almost all of these failures:

- Supabase **Site URL** silently overriding your `redirectTo` when it's
  missing, unset, or not on the Redirect URLs allow-list.
- Your app's redirect URI differing across **Expo Go, a dev client, and a
  standalone/TestFlight build** (one `scheme` doesn't cover all three).
- The redirect URI your app generates (via `makeRedirectUri()`) not
  matching what's registered in Supabase, Google Cloud Console, or the
  Apple Service ID's Return URLs.
- URL **fragment vs. query parameter** handling mismatches between what
  Supabase sends back and what your deep-link handler expects.

## How it works (client-side only)

Everything runs in your browser. There is no backend, no account, and no
payment wall for the core check. You paste your configuration (scheme,
Supabase project details, redirect URLs) into the page, JavaScript in
`index.html` parses and lints it against a set of known-bad patterns, and
you get a plain-language report of what's wrong and how to fix it.

Nothing about your configuration is sent anywhere. The only network
activity this site generates is:

- loading its own static assets (HTML/CSS/JS, fonts) from GitHub Pages,
- and anonymous product-analytics events (page view, "run check" clicked,
  etc.) sent to a self-hosted Umami instance — **event names and counts
  only, never the content of what you pasted.**

You can verify this yourself: open your browser's network tab while using
the tool, or just read `index.html` — it's a single static file with no
build step.

## Privacy

- No account, no login, no cookies for the tool itself.
- No server-side processing of your config — the "backend" is your own
  browser's JavaScript engine.
- Analytics (Umami) records that *a* check ran, not *what* you checked.
- If you're paranoid (fair, given the subject matter), download the repo
  and open `index.html` locally with your network disconnected — it
  still works.

## Running it locally

There's no build step. It's one static HTML file.

```bash
git clone https://github.com/andryroby/expo-supabase-auth-doctor.git
cd expo-supabase-auth-doctor
# any static file server works, e.g.:
npx serve .
# or just open index.html directly in a browser
```

## Reporting a missing case / false positive

Found an OAuth redirect failure mode this tool doesn't catch, or a check
that flags something that's actually fine? Please open an issue on the
GitHub repo with:

1. The relevant (redacted) config — scheme, redirect URLs, provider.
2. What actually went wrong at runtime (error text, screenshot, or
   behavior description).
3. What you expected the tool to say.

Redact anything sensitive (project refs, client secrets, real domains)
before posting — issues are public.

## Disclaimer

This tool is provided **as is**, with no warranty of any kind. It checks
for known, common misconfiguration patterns — it cannot guarantee your
OAuth flow will work, and a clean report is not a guarantee of a working
integration. Supabase, Expo, Google, Apple, and GitHub are not affiliated
with this tool, and their APIs, SDKs, and dashboards may change in ways
that make individual checks stale over time. Always verify against the
current official documentation for anything security-relevant (redirect
URI allow-lists, OAuth client secrets, etc.).

## About

Built by ARLing s. r. o. (Bratislava, Slovakia).
Contact: andrej@arling.sk
