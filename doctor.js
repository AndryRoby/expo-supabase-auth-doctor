// doctor.js — Redirect Doctor core logic.
//
// Pure, deterministic, 100% client-side: given an Expo + Supabase OAuth
// redirect configuration, works out the exact redirect URL each Expo
// runtime will produce, checks it against the Supabase redirect allow-list
// and the OAuth provider console, and reports concrete mismatches + fixes.
//
// Nothing in this file makes a network request. It only reads the object
// you pass to diagnose().
//
// Rules implemented here are sourced from:
//  - https://supabase.com/docs/guides/auth/redirect-urls
//      (Site URL fallback behaviour, glob syntax for the redirect allow-list)
//  - https://supabase.com/docs/guides/auth/native-mobile-deep-linking
//      (custom scheme redirect format, provider callback = <project>/auth/v1/callback)
//  - https://docs.expo.dev/guides/linking/
//      (scheme://host/path structure of a deep link)
//  - https://docs.expo.dev/versions/latest/sdk/auth-session/
//      (makeRedirectUri output per environment: Expo Go vs dev-build/standalone vs web)
//
// Works as an ES module (import { diagnose, expectedRedirects } from './doctor.js')
// and, when loaded with <script type="module">, also publishes
// window.RedirectDoctor = { diagnose, expectedRedirects } for console/debug use.

// ───────────────────────── small string/path helpers ─────────────────────────

function safeStr(v) {
  return typeof v === 'string' ? v : '';
}

function normalizePath(rawPath) {
  const input = safeStr(rawPath);
  if (!input.trim()) return { normalized: '', changed: false };
  const collapsed = input.trim().replace(/\/{2,}/g, '/');
  const normalized = collapsed.replace(/^\/+/, '').replace(/\/+$/, '');
  return { normalized, changed: normalized !== input };
}

function trimTrailingSlash(s) {
  return safeStr(s).trim().replace(/\/+$/, '');
}

// ───────────────────────── expected-redirect builders ─────────────────────────
// Per https://docs.expo.dev/versions/latest/sdk/auth-session/ (makeRedirectUri):
//  - Expo Go            → exp://<host>:<port>/--/<path>
//  - dev build/standalone → <scheme>://<path>   (no leading slash, no double slash)
//  - web                 → <siteUrl or window.location>/<path>

function buildSchemeUrl(scheme, normalizedPath) {
  const s = safeStr(scheme).trim();
  if (!s) return null;
  return normalizedPath ? `${s}://${normalizedPath}` : `${s}://`;
}

function buildExpoGoUrl(normalizedPath, host, port) {
  const h = safeStr(host).trim() || '127.0.0.1';
  const p = port || 8081;
  return normalizedPath ? `exp://${h}:${p}/--/${normalizedPath}` : `exp://${h}:${p}/--`;
}

function buildWebUrl(siteUrl, normalizedPath) {
  const base = trimTrailingSlash(siteUrl) || 'http://localhost:8081';
  return normalizedPath ? `${base}/${normalizedPath}` : base;
}

function buildSupabaseCallback(projectUrl) {
  const base = trimTrailingSlash(projectUrl);
  return base ? `${base}/auth/v1/callback` : null;
}

function computeExpectedRedirects(cfg) {
  const expo = cfg.expo && typeof cfg.expo === 'object' ? cfg.expo : {};
  const supabase = cfg.supabase && typeof cfg.supabase === 'object' ? cfg.supabase : {};
  const scheme = safeStr(expo.scheme).trim();
  const { normalized: normPath } = normalizePath(expo.path);
  const lanIp = safeStr(expo.lanIp).trim();
  const port = Number(expo.port) > 0 ? Number(expo.port) : 8081;

  const devBuildUrl = buildSchemeUrl(scheme, normPath);
  return {
    expoGo: buildExpoGoUrl(normPath, '127.0.0.1', port),
    expoGoLan: lanIp ? buildExpoGoUrl(normPath, lanIp, port) : null,
    devBuild: devBuildUrl,
    standalone: devBuildUrl, // same formula per Expo docs — both use the native scheme
    web: buildWebUrl(supabase.siteUrl, normPath),
    supabaseCallback: buildSupabaseCallback(supabase.projectUrl),
  };
}

// ───────────────────────── Supabase redirect-URL glob matcher ─────────────────────────
// Per https://supabase.com/docs/guides/auth/redirect-urls — "." and "/" are
// separator characters:
//   *   any run of non-separator characters
//   **  any run of characters, including separators
//   ?   exactly one non-separator character
//   [abc] / [!abc]   one character in / not in the class
//   \c  escapes the next character literally

function escapeRegexChar(c) {
  return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(pattern) {
  const src = safeStr(pattern);
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length) {
      out += escapeRegexChar(src[++i]);
    } else if (c === '*') {
      if (src[i + 1] === '*') {
        out += '[\\s\\S]*';
        i++;
      } else {
        out += '[^./]*';
      }
    } else if (c === '?') {
      out += '[^./]';
    } else if (c === '[') {
      let j = i + 1;
      let neg = false;
      if (src[j] === '!') {
        neg = true;
        j++;
      }
      let cls = '';
      while (j < src.length && src[j] !== ']') {
        cls += src[j];
        j++;
      }
      out += '[' + (neg ? '^' : '') + cls.replace(/\\/g, '\\\\') + ']';
      i = j;
    } else {
      out += escapeRegexChar(c);
    }
  }
  return new RegExp('^' + out + '$');
}

function globMatch(pattern, value) {
  if (!pattern || !value) return false;
  try {
    return globToRegExp(pattern).test(value);
  } catch (e) {
    return false;
  }
}

function matchesAnyAllowlist(value, patterns) {
  if (!value) return false;
  const list = Array.isArray(patterns) ? patterns : [];
  return list.some((p) => typeof p === 'string' && p.trim() && globMatch(p.trim(), value));
}

// ───────────────────────── diagnose() ─────────────────────────

const RUNTIMES = ['expo-go', 'dev-build', 'standalone', 'web'];

const RUNTIME_LABELS = {
  'expo-go': 'Expo Go',
  'dev-build': 'a development build',
  standalone: 'a standalone build',
  web: 'web',
};

const PROVIDER_FIELD_LABEL = {
  google: '"Authorized redirect URIs" in Google Cloud Console → APIs & Services → Credentials',
  apple: '"Return URLs" on the Services ID in Apple Developer → Certificates, Identifiers & Profiles',
  github: '"Authorization callback URL" in the GitHub OAuth App settings',
  other: "the redirect/callback URL field in your provider's console",
};

function providerLabel(name) {
  return PROVIDER_FIELD_LABEL[name] || PROVIDER_FIELD_LABEL.other;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function sortProblems(problems) {
  return problems
    .map((p, idx) => ({ p, idx }))
    .sort((a, b) => (SEVERITY_ORDER[a.p.severity] - SEVERITY_ORDER[b.p.severity]) || (a.idx - b.idx))
    .map((x) => x.p);
}

/**
 * @param {object} config
 * @param {{scheme?:string, path?:string, runtime?:'expo-go'|'dev-build'|'standalone'|'web', lanIp?:string, port?:number}} [config.expo]
 * @param {{projectUrl?:string, siteUrl?:string, allowedRedirectUrls?:string[]}} [config.supabase]
 * @param {{name?:'google'|'apple'|'github'|'other', authorizedRedirectUris?:string[]}} [config.provider]
 * @param {{redirectTo?:string, flowType?:'pkce'|'implicit'|'', skipBrowserRedirect?:boolean|null, detectSessionInUrl?:boolean|null, usesExchangeCodeForSession?:boolean|null}} [config.code]
 * @returns {{status:'pass'|'warn'|'fail', summary:string, expectedRedirects:object, problems:Array, fixes:Array, checklist:string[], disclaimer:string}}
 */
export function diagnose(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  const expo = cfg.expo && typeof cfg.expo === 'object' ? cfg.expo : {};
  const supabase = cfg.supabase && typeof cfg.supabase === 'object' ? cfg.supabase : {};
  const provider = cfg.provider && typeof cfg.provider === 'object' ? cfg.provider : {};
  const code = cfg.code && typeof cfg.code === 'object' ? cfg.code : {};

  const problems = [];
  const fixes = [];
  const checklist = [];

  const scheme = safeStr(expo.scheme).trim();
  const rawPath = safeStr(expo.path);
  const runtime = RUNTIMES.includes(expo.runtime) ? expo.runtime : 'dev-build';
  const { normalized: normPath, changed: pathChanged } = normalizePath(rawPath);

  const expected = computeExpectedRedirects(cfg);
  const { expoGo: expoGoUrl, expoGoLan: expoGoLanUrl, devBuild: devBuildUrl, web: webUrl, supabaseCallback } = expected;

  const expectedForRuntime =
    runtime === 'expo-go' ? expoGoUrl : runtime === 'web' ? webUrl : devBuildUrl; // dev-build & standalone share one formula

  // ── 1. scheme validity (native runtimes only) ──────────────────────
  if (runtime !== 'web') {
    if (!scheme) {
      problems.push({
        severity: 'high',
        code: 'missing_scheme',
        message: 'expo.scheme is empty. A native OAuth redirect needs a custom URL scheme to bring the user back into the app.',
        where: 'expo.scheme',
      });
    } else if (/^https?$/i.test(scheme)) {
      problems.push({
        severity: 'high',
        code: 'invalid_scheme',
        message: `"${scheme}" can't be used as expo.scheme — http/https are reserved and can't be registered as your app's deep-link handler.`,
        where: 'expo.scheme',
      });
    } else if (/\s/.test(scheme) || !/^[a-z][a-z0-9+.-]*$/i.test(scheme) || /[A-Z]/.test(scheme)) {
      const suggestion = scheme.toLowerCase().replace(/[^a-z0-9+.-]/g, '').replace(/^[^a-z]+/, '') || 'myapp';
      problems.push({
        severity: 'high',
        code: 'invalid_scheme',
        message: `"${scheme}" is not a valid URL scheme. Use lowercase letters, digits, "+", "-", "." only, and start with a letter (e.g. "myapp").`,
        where: 'expo.scheme',
      });
      fixes.push({ title: 'Use a valid scheme in app.json', value: suggestion, where: 'app.json → expo.scheme' });
    }
  }

  // ── 2. path normalization ───────────────────────────────────────────
  if (pathChanged) {
    problems.push({
      severity: 'medium',
      code: 'path_not_normalized',
      message: `The redirect path "${rawPath}" has a leading slash or repeated slashes, which produces a double slash in the final URL (e.g. "${scheme || 'myapp'}:///${rawPath}").`,
      where: 'expo.path',
    });
    fixes.push({ title: 'Normalize the redirect path', value: normPath, where: 'expo.path' });
  }

  // ── 3. Supabase Site URL ────────────────────────────────────────────
  const siteUrl = safeStr(supabase.siteUrl).trim();
  const siteUrlIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(siteUrl);
  if (siteUrl && siteUrlIsLocal) {
    problems.push({
      severity: 'high',
      code: 'site_url_is_localhost',
      message: 'Supabase Site URL still points to localhost. Supabase falls back to Site URL whenever redirectTo is missing or not on the allow-list, so a rejected redirect silently sends users to localhost — including in production.',
      where: 'supabase.siteUrl',
    });
    fixes.push({
      title: 'Set Site URL to your production URL',
      value: webUrl && !siteUrlIsLocal && webUrl !== 'http://localhost:8081' ? webUrl : 'https://your-production-domain.com',
      where: 'Supabase → Authentication → URL Configuration → Site URL',
    });
  } else if (runtime === 'web' && siteUrl && !/^https:\/\//i.test(siteUrl)) {
    problems.push({
      severity: 'low',
      code: 'web_site_url_not_https',
      message: 'Site URL does not use https. Use https in production — OAuth providers and browsers increasingly reject plain-http redirect targets.',
      where: 'supabase.siteUrl',
    });
  }

  // ── 4. Supabase project URL shape ───────────────────────────────────
  const projectUrl = safeStr(supabase.projectUrl).trim();
  if (projectUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(projectUrl)) {
    problems.push({
      severity: 'medium',
      code: 'project_url_unusual',
      message: `"${projectUrl}" doesn't look like a standard https://<ref>.supabase.co project URL. If this is a custom domain, confirm it's mapped correctly — otherwise check for a typo.`,
      where: 'supabase.projectUrl',
    });
  } else if (!projectUrl) {
    problems.push({
      severity: 'low',
      code: 'missing_project_url',
      message: "supabase.projectUrl is empty, so the exact OAuth provider callback URL can't be computed or verified.",
      where: 'supabase.projectUrl',
    });
  }

  // ── 5. redirectTo vs. the value the runtime will actually produce ──
  const redirectTo = safeStr(code.redirectTo).trim();
  if (redirectTo && expectedForRuntime && redirectTo !== expectedForRuntime) {
    const matchesLan = runtime === 'expo-go' && expoGoLanUrl && redirectTo === expoGoLanUrl;
    if (!matchesLan) {
      problems.push({
        severity: 'high',
        code: 'redirect_to_mismatch',
        message: `code.redirectTo is "${redirectTo}", but ${RUNTIME_LABELS[runtime]} actually produces "${expectedForRuntime}". Supabase will reject the mismatch and fall back to Site URL.`,
        where: 'code.redirectTo',
      });
      fixes.push({
        title: runtime === 'expo-go' ? 'Build redirectTo with makeRedirectUri (Expo Go resolves it to this)'
          : runtime === 'web' ? 'Use this exact web redirect URL'
          : 'Build redirectTo with makeRedirectUri',
        value: runtime === 'web'
          ? expectedForRuntime
          : `makeRedirectUri({ scheme: '${scheme || 'myapp'}', path: '${normPath}' }) // → ${expectedForRuntime}`,
        where: 'code.redirectTo',
      });
    }
  }

  // ── 6. redirect allow-listed in Supabase? ───────────────────────────
  const allowList = Array.isArray(supabase.allowedRedirectUrls)
    ? supabase.allowedRedirectUrls.filter((x) => typeof x === 'string' && x.trim())
    : [];
  const valueToCheck = redirectTo || expectedForRuntime;
  if (valueToCheck) {
    const allowed = matchesAnyAllowlist(valueToCheck, allowList);
    if (!allowed) {
      problems.push({
        severity: 'high',
        code: 'redirect_not_allowlisted',
        message: `"${valueToCheck}" is not covered by any pattern in supabase.allowedRedirectUrls. Supabase will refuse the redirect and fall back to Site URL.`,
        where: 'supabase.allowedRedirectUrls',
      });
      fixes.push({
        title: 'Add to Supabase → Auth → URL Configuration → Redirect URLs',
        value: runtime !== 'web' && scheme ? `${scheme}://**` : valueToCheck,
        where: 'supabase.allowedRedirectUrls',
      });
    }
  }
  checklist.push(
    scheme
      ? `Add "${scheme}://**" (covers every path under your scheme) to the Supabase redirect allow-list.`
      : 'Add your app scheme, e.g. "myapp://**", to the Supabase redirect allow-list.'
  );
  checklist.push(`If you also test in Expo Go, allow-list its dev URL too: "${expoGoUrl}" — Expo Go uses exp://, not your custom scheme.`);

  // ── 7. provider console has the exact Supabase callback? ───────────
  const providerName = ['google', 'apple', 'github', 'other'].includes(provider.name) ? provider.name : 'other';
  const providerUris = Array.isArray(provider.authorizedRedirectUris)
    ? provider.authorizedRedirectUris.filter((x) => typeof x === 'string' && x.trim())
    : [];
  if (supabaseCallback) {
    const providerHasCallback = providerUris.some((u) => u.trim() === supabaseCallback);
    if (!providerHasCallback) {
      problems.push({
        severity: 'high',
        code: 'provider_redirect_uri_missing',
        message: `${providerLabel(providerName)} doesn't contain the exact URL "${supabaseCallback}". OAuth providers require an exact match here — wildcards aren't accepted.`,
        where: 'provider.authorizedRedirectUris',
      });
      fixes.push({
        title: `Add the exact callback in the ${providerName === 'other' ? 'provider' : providerName} console`,
        value: supabaseCallback,
        where: providerLabel(providerName),
      });
    }
  }

  // ── 8. flowType ──────────────────────────────────────────────────────
  const flowType = safeStr(code.flowType).trim().toLowerCase();
  if (flowType && flowType !== 'pkce') {
    problems.push({
      severity: 'medium',
      code: 'flow_type_not_pkce',
      message: `flowType is "${flowType}". PKCE is the recommended flow for native apps — implicit flow returns tokens in the URL fragment, which in-app browsers and deep links don't always preserve.`,
      where: 'code.flowType',
    });
    fixes.push({
      title: 'Switch to PKCE',
      value: "createClient(url, key, { auth: { flowType: 'pkce' } })",
      where: 'supabase-js client options',
    });
  }

  const isNative = runtime !== 'web';

  // ── 9. skipBrowserRedirect (native) ─────────────────────────────────
  if (isNative && code.skipBrowserRedirect !== true) {
    problems.push({
      severity: 'medium',
      code: 'skip_browser_redirect_not_set',
      message: 'code.skipBrowserRedirect is not explicitly true. On native, signInWithOAuth() needs skipBrowserRedirect: true so you can open the URL yourself (e.g. with expo-web-browser) instead of Supabase issuing a browser redirect.',
      where: 'code.skipBrowserRedirect',
    });
    fixes.push({
      title: 'Set skipBrowserRedirect on native',
      value: 'supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } })',
      where: 'code.skipBrowserRedirect',
    });
  }

  // ── 10. detectSessionInUrl (native) ─────────────────────────────────
  if (isNative && code.detectSessionInUrl !== false) {
    problems.push({
      severity: 'low',
      code: 'detect_session_in_url_not_disabled',
      message: 'code.detectSessionInUrl is not explicitly false. On native there is no browser URL for the client to parse on load, so leaving this enabled just costs a redundant check (harmless, but the client docs recommend disabling it).',
      where: 'code.detectSessionInUrl',
    });
    fixes.push({
      title: 'Disable detectSessionInUrl on native',
      value: 'createClient(url, key, { auth: { detectSessionInUrl: false } })',
      where: 'code.detectSessionInUrl',
    });
  }

  // ── 11. exchangeCodeForSession when using pkce ──────────────────────
  if (flowType === 'pkce' && code.usesExchangeCodeForSession === false) {
    problems.push({
      severity: 'medium',
      code: 'missing_exchange_code_for_session',
      message: "flowType is pkce but the redirect handler isn't calling exchangeCodeForSession(url) yet. With PKCE, the callback URL carries a code param that must be exchanged for a session — it isn't a session by itself.",
      where: 'code.usesExchangeCodeForSession',
    });
    fixes.push({
      title: 'Exchange the code for a session on redirect',
      value: 'const { data, error } = await supabase.auth.exchangeCodeForSession(url);',
      where: 'redirect handler (e.g. Linking listener / createSessionFromUrl)',
    });
  }

  checklist.push('Use flowType: "pkce" and call exchangeCodeForSession(url) in your deep-link handler.');
  checklist.push('Re-run this check after every change — provider consoles and Supabase settings drift independently.');

  const sorted = sortProblems(problems);
  const highCount = sorted.filter((p) => p.severity === 'high').length;
  const medCount = sorted.filter((p) => p.severity === 'medium').length;
  const lowCount = sorted.filter((p) => p.severity === 'low').length;

  let status = 'pass';
  if (highCount > 0) status = 'fail';
  else if (medCount > 0 || lowCount > 0) status = 'warn';

  let summary;
  if (status === 'pass') {
    summary = 'No mismatches found. The redirect your app will produce is on the Supabase allow-list, and the provider console has the exact callback.';
  } else if (status === 'fail') {
    const top = sorted.find((p) => p.severity === 'high');
    summary = `${highCount} blocking mismatch${highCount > 1 ? 'es' : ''} found. Most urgent: ${top.message}`;
  } else {
    const top = sorted[0];
    summary = `Nothing blocking, but ${medCount + lowCount} thing${medCount + lowCount > 1 ? 's' : ''} worth fixing. Top of the list: ${top.message}`;
  }

  return {
    status,
    summary,
    expectedRedirects: expected,
    problems: sorted,
    fixes,
    checklist,
    disclaimer:
      'Read-only, client-side analysis of the values you entered. Nothing is verified against your live Supabase project, app.json, or provider console — always confirm in your own environment before shipping.',
  };
}

/**
 * Standalone helper: just the expected-redirect URLs for a config, without
 * running the full diagnostic. Handy for live-updating a preview as the
 * user types.
 */
export function expectedRedirects(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  return computeExpectedRedirects(cfg);
}

// Also expose as a plain browser global when loaded via <script type="module">.
if (typeof window !== 'undefined') {
  window.RedirectDoctor = { diagnose, expectedRedirects };
}
