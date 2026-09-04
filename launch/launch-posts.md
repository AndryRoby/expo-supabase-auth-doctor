# Launch posts — Redirect Doctor

Tool: https://andryroby.github.io/expo-supabase-auth-doctor/
All copy below is ready to paste. Read each platform's current rules
immediately before posting (noted per-section) — rules and mod
sentiment change over time and this file won't stay current with them.

---

## 1. GitHub thread replies

Post these as regular replies on the existing threads. Keep them
factual and specific to what the thread reported — do not reuse the
same paragraph across threads verbatim, each is tailored below.

### 1a. `supabase/supabase` issue #14769
Google OAuth: sign-in click gets a provider response URL back from
Supabase but the browser never opens Google's account picker.

> This pattern — you get a response URL back from Supabase but the
> browser never actually opens the provider's picker — is usually a
> redirect URI mismatch rather than a Google config problem. Expo Go,
> a dev client, and a standalone/TestFlight build each generate a
> *different* redirect URI unless you pin it explicitly with
> `makeRedirectUri({ scheme, path })`. If `skipBrowserRedirect` is
> `true` anywhere in your flow, double check you're then calling
> `WebBrowser.openAuthSessionAsync(url, redirectUri)` with the exact
> same URI that's allow-listed in Supabase's Redirect URLs — a
> mismatch there fails silently, exactly like this.
>
> I put together a free, client-side checker for this class of bug —
> paste your `app.json` scheme and Supabase redirect config and it
> flags the mismatch directly: https://andryroby.github.io/expo-supabase-auth-doctor/
> Hope it saves someone else the afternoon it cost me.

### 1b. `orgs/supabase` discussion #10754
Email verification deep link reopens the app but stays on the "check
your email" screen; root cause found in-thread was Supabase returning
tokens as a URL *fragment* (`#access_token=...`) while React
Navigation's linking config expected *query* params. Marked answered.

> Leaving this for anyone who lands here from search, since the root
> cause here (Supabase returning tokens as a URL **fragment**,
> `#access_token=...`, while your linking config expects **query**
> params) is one of the most common Expo + Supabase redirect
> breakages — right alongside Site URL vs. Redirect URLs mismatches
> (`exp://` dev URLs vs. your production `scheme://` deep link) and
> forgetting a wildcard entry for Expo Go's per-session IP.
>
> I built a free client-side diagnostic for exactly this: paste your
> `app.json` scheme + Supabase redirect config and it flags
> fragment-vs-query issues, scheme mismatches, and allow-list gaps
> before they cost you an afternoon like this thread:
> https://andryroby.github.io/expo-supabase-auth-doctor/ — everything
> runs in the browser, nothing you paste is uploaded.

### 1c. `orgs/supabase` discussion #33633
Password-reset deep link: `Linking.useURL()` returns `null` on the
first click (works on the second, but by then the token's expired).
Unresolved; @omerkaz suggested the root layout consumes the initial
URL before the handler sees it.

> The intermittent `null` on the first click and success-but-expired
> on the second matches the classic "root layout / router consumes
> the initial URL before your handler subscribes" race that
> @omerkaz flagged — it's an Expo Router timing issue, not a Supabase
> bug, which is why it only bites on cold start. Pairing that fix
> with `verifyOtp()` instead of relying on an implicit session grab
> (per @OrDavidA) is the right direction — the flakiness is about
> *when* you read the URL, not how you parse it.
>
> I built a free client-side checker for the config half of this
> problem (deep link scheme setup, fragment-vs-query mismatches, Site
> URL / Redirect URL allow-list gaps): it won't fix the cold-start
> race for you, but it rules out config in under a minute so you know
> where to keep digging: https://andryroby.github.io/expo-supabase-auth-doctor/

### 1d. `orgs/community` discussion #158409
Apple sign-in → `invalid_request - Invalid web redirect url`. Google
sign-in → Safari "can't open the page", `WebAuthenticationSession
error 1`. Unresolved.

> Both symptoms point at redirect URI registration rather than app
> code. Apple's `Invalid web redirect url` almost always means the
> redirect URI Supabase used for the *web* OAuth step isn't in the
> Service ID's Return URLs list — it needs to be your Supabase
> project's `https://<ref>.supabase.co/auth/v1/callback` exactly, not
> your app's custom scheme. The Google "can't connect to server" +
> `WebAuthenticationSession error 1` combo usually means the sheet got
> a redirect URI back that didn't match anything Google/Supabase
> expected, so iOS just closes it.
>
> I built a free client-side tool for this exact triage — paste your
> bundle ID/scheme and your Supabase + provider redirect URLs and it
> flags which one doesn't match before you burn more time in ngrok:
> https://andryroby.github.io/expo-supabase-auth-doctor/ Worth
> double-checking the Apple Service ID's Return URLs list specifically
> — that's the most common miss behind `invalid_request`.

---

## 2. Show HN

**Read HN's guidelines immediately before posting**
(https://news.ycombinator.com/newsguidelines.html and the Show HN
specific notes at https://news.ycombinator.com/showhn.html) — in
particular, post from the account that will actually respond in
comments, and be ready to answer questions for a few hours after
posting.

**Title:**
```
Show HN: Redirect Doctor – find why your Expo + Supabase OAuth redirect breaks
```

**Text:**
```
I kept losing afternoons to the same handful of Expo + Supabase OAuth
redirect failures — Google/Apple/GitHub login that works in Expo Go
but not in a standalone build, or redirects that silently dump you
back on localhost. The cause is almost always one of: a Site URL
fallback, a redirect URI that doesn't match across Expo Go / dev
client / production, or a provider console (Google Cloud Console,
Apple Service ID) that disagrees with what Supabase is sending. None
of it is hard once you know where to look, but "where to look" isn't
obvious from the error messages.

Redirect Doctor is a free, static, client-side page: you paste your
app scheme and Supabase/provider redirect config, it lints it against
these known-bad patterns and tells you exactly which value doesn't
match which. It's not a live tester — it doesn't call your app,
Supabase, or the OAuth providers, so it can't catch bugs in your
runtime code (a race condition parsing the deep link, for instance)
or anything provider-side that changed after this was written. It's a
config linter, not a monitoring tool. No account, no server, nothing
you paste leaves your browser except anonymous "a check ran" analytics
events. Feedback and missing cases very welcome.
```

---

## 3. Expo Discord (#showcase) and Reddit (r/expo, r/Supabase)

**Before posting to any of these, read the current rules first:**
- Expo Discord: check the #showcase channel topic/pinned rules for
  format requirements (some showcase channels require a specific
  template or a linked repo).
- r/expo and r/Supabase: check each subreddit's rules (sidebar / About
  / "Rules" tab) for self-promotion policy — many require a "Show and
  Tell" / "Self Promo" flair, restrict promo to a specific day, or cap
  how often the same link can be posted. If a subreddit disallows
  self-promo outright, skip it rather than risk a ban.

**Short post (works for Discord #showcase and Reddit, adjust flair/tags to fit):**
```
Built a small free tool: Redirect Doctor — paste your Expo + Supabase
OAuth redirect config (scheme, Site URL, Redirect URLs, provider
console settings) and it flags the exact mismatch causing your login
redirect to fail. Static, client-side, no signup, no backend —
everything runs in your browser.

https://andryroby.github.io/expo-supabase-auth-doctor/

It's a config linter, not a live tester — it won't catch runtime bugs
in your deep-link handling, just the config mismatches (Site URL
fallback, scheme differing across Expo Go/dev client/standalone,
provider console vs. Supabase disagreement, fragment-vs-query
handling) that cause most of the "redirect just doesn't work" reports
I kept seeing. Would love feedback, especially on cases it misses.
```

---

## 4. dev.to article

**Working title:** The 5 places an Expo + Supabase OAuth redirect breaks

**Outline:**
1. **Intro** — why this keeps happening (see draft below).
2. **1. The Site URL fallback** — what happens when `redirectTo` is
   missing, unset, or not on the Redirect URLs allow-list; Supabase
   silently falls back to Site URL (often still `localhost:3000`).
3. **2. One scheme, three environments** — Expo Go, a dev client, and
   a standalone/TestFlight build each produce a different redirect
   URI; a config that covers one silently fails the others.
4. **3. Provider console vs. Supabase disagreement** — Google Cloud
   Console authorized redirect URIs, Apple Service ID Return URLs, and
   Supabase's own callback URL (`https://<ref>.supabase.co/auth/v1/callback`)
   all need to agree, and each is edited in a different dashboard.
5. **4. Fragment vs. query parameters** — Supabase returns tokens as a
   URL fragment (`#access_token=...`); many deep-link/navigation
   configs expect query params (`?...`) and silently drop the fragment.
6. **5. Reading the URL before your app is ready for it** — cold-start
   deep links racing against router/provider initialization
   (`Linking.getInitialURL()` returning `null` on the first launch).
7. **Closing** — a checklist, and a link to Redirect Doctor for anyone
   who wants the check automated rather than manual.

**Draft intro (150 words):**
```
If you've wired up Google, Apple, or GitHub sign-in through Supabase
Auth in an Expo app, there's a good chance you've hit a redirect that
just doesn't work — the browser opens, the provider accepts your
login, and then... nothing. A blank tab, a bounce back to localhost,
or a cryptic invalid_request error. It happens often enough, across
enough different setups, that it's clearly not one bug — it's a small
number of configuration mismatches that all produce the same symptom:
the app never gets the tokens it needs.

After watching the same five root causes show up across GitHub issues,
Supabase discussions, and my own projects, I started keeping a mental
checklist. This post is that checklist, in order of how often each one
turns out to be the actual problem — starting with the one that trips
up almost everyone at least once: Supabase quietly falling back to a
Site URL you forgot you set months ago.
```
