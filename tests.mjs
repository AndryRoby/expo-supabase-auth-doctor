// tests.mjs — plain Node test runner for doctor.js (no external dependencies).
// Run with: node tests.mjs

import { diagnose, expectedRedirects } from './doctor.js';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
  }
}

function eq(name, actual, expected) {
  const condition = actual === expected;
  ok(name, condition, condition ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function has(name, arr, code) {
  const condition = Array.isArray(arr) && arr.some((p) => p.code === code);
  ok(name, condition, condition ? '' : `expected a problem with code "${code}", got codes [${(arr || []).map((p) => p.code).join(', ')}]`);
}

function lacks(name, arr, code) {
  const condition = Array.isArray(arr) && !arr.some((p) => p.code === code);
  ok(name, condition, condition ? '' : `did not expect a problem with code "${code}"`);
}

// Access the internal glob matcher the same way diagnose() uses it, via the
// allow-list check inside diagnose(): build a minimal config whose only
// pass/fail signal is whether the expected redirect matches the single
// allow-list pattern under test.
function globMatches(pattern, value) {
  const result = diagnose({
    expo: { scheme: 'x', path: '', runtime: 'dev-build' },
    code: { redirectTo: value },
    supabase: { allowedRedirectUrls: [pattern] },
  });
  return !result.problems.some((p) => p.code === 'redirect_not_allowlisted');
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Glob matcher — Supabase redirect-URL allow-list syntax
//    (https://supabase.com/docs/guides/auth/redirect-urls)
// ─────────────────────────────────────────────────────────────────────────

ok('glob: ** matches a nested path', globMatches('myapp://**', 'myapp://auth/callback'));
ok('glob: ** matches empty remainder', globMatches('myapp://**', 'myapp://'));
ok('glob: * matches a single path segment', globMatches('https://myapp.com/*', 'https://myapp.com/callback'));
ok(
  'glob: * does NOT cross a "/" separator',
  !globMatches('https://myapp.com/*', 'https://myapp.com/callback/sub')
);
ok(
  'glob: ** DOES cross a "/" separator',
  globMatches('https://myapp.com/**', 'https://myapp.com/callback/sub')
);
ok(
  'glob: doc example — localhost/** matches nested path',
  globMatches('http://localhost:3000/**', 'http://localhost:3000/foo/bar')
);
ok(
  'glob: doc example — localhost/* matches one segment',
  globMatches('http://localhost:3000/*', 'http://localhost:3000/foo')
);
ok(
  'glob: doc example — localhost/* rejects two segments',
  !globMatches('http://localhost:3000/*', 'http://localhost:3000/foo/bar')
);
ok(
  'glob: Netlify preview pattern from docs',
  globMatches('https://**--my_org.netlify.app/**', 'https://deploy-preview-1--my_org.netlify.app/foo')
);
ok(
  'glob: Vercel preview pattern from docs',
  globMatches('https://*-team.vercel.app/**', 'https://abc-team.vercel.app/x')
);
ok(
  'glob: * does NOT cross a "." separator',
  !globMatches('https://*-team.vercel.app/**', 'https://abc.def-team.vercel.app/x')
);
ok('glob: ? matches exactly one non-separator char', globMatches('myapp://x?', 'myapp://xy'));
ok('glob: ? does not match two chars', !globMatches('myapp://x?', 'myapp://xyz'));
ok('glob: ? does not cross a "." separator', !globMatches('myapp://x?', 'myapp://x.y'));
ok('glob: [abc] character class matches a member', globMatches('myapp://[abc]', 'myapp://a'));
ok('glob: [abc] character class rejects a non-member', !globMatches('myapp://[abc]', 'myapp://d'));
ok('glob: [!abc] negated class matches a non-member', globMatches('myapp://[!abc]', 'myapp://d'));
ok('glob: [!abc] negated class rejects a member', !globMatches('myapp://[!abc]', 'myapp://a'));
ok('glob: exact string matches itself', globMatches('https://myapp.com/auth', 'https://myapp.com/auth'));
ok('glob: exact string rejects a superstring', !globMatches('https://myapp.com/auth', 'https://myapp.com/auth2'));

// ─────────────────────────────────────────────────────────────────────────
// 2. Expected redirect URLs per runtime
//    (https://docs.expo.dev/versions/latest/sdk/auth-session/, native-mobile-deep-linking)
// ─────────────────────────────────────────────────────────────────────────

const base = {
  expo: { scheme: 'myapp', path: 'auth/callback' },
  supabase: { projectUrl: 'https://abcd1234.supabase.co', siteUrl: 'https://myapp.com' },
};

const er = expectedRedirects(base);
eq('expected: dev build = scheme://path', er.devBuild, 'myapp://auth/callback');
eq('expected: standalone = same formula as dev build', er.standalone, 'myapp://auth/callback');
eq('expected: Expo Go = exp://127.0.0.1:8081/--/path', er.expoGo, 'exp://127.0.0.1:8081/--/auth/callback');
eq('expected: web = siteUrl + /path', er.web, 'https://myapp.com/auth/callback');
eq('expected: Supabase provider callback', er.supabaseCallback, 'https://abcd1234.supabase.co/auth/v1/callback');

const erEmptyPath = expectedRedirects({ expo: { scheme: 'myapp', path: '' } });
eq('expected: empty path → scheme:// with no double slash', erEmptyPath.devBuild, 'myapp://');

const erLan = expectedRedirects({ expo: { scheme: 'myapp', path: 'auth/callback', lanIp: '192.168.1.5' } });
eq('expected: Expo Go LAN variant uses the given IP', erLan.expoGoLan, 'exp://192.168.1.5:8081/--/auth/callback');

const erPort = expectedRedirects({ expo: { scheme: 'myapp', path: 'auth/callback', port: 19000 } });
eq('expected: Expo Go honors a custom port', erPort.expoGo, 'exp://127.0.0.1:19000/--/auth/callback');

const erNoSiteUrl = expectedRedirects({ expo: { scheme: 'myapp', path: 'x' } });
eq('expected: web falls back to localhost:8081 with no siteUrl', erNoSiteUrl.web, 'http://localhost:8081/x');

// ─────────────────────────────────────────────────────────────────────────
// 3. End-to-end scenarios
// ─────────────────────────────────────────────────────────────────────────

// A fully consistent config — should come back clean.
const passConfig = {
  expo: { scheme: 'myapp', path: 'auth/callback', runtime: 'dev-build' },
  supabase: {
    projectUrl: 'https://abcd1234.supabase.co',
    siteUrl: 'https://myapp.com',
    allowedRedirectUrls: ['myapp://**'],
  },
  provider: {
    name: 'google',
    authorizedRedirectUris: ['https://abcd1234.supabase.co/auth/v1/callback'],
  },
  code: {
    redirectTo: 'myapp://auth/callback',
    flowType: 'pkce',
    skipBrowserRedirect: true,
    detectSessionInUrl: false,
    usesExchangeCodeForSession: true,
  },
};

// Scenario 1: pass
{
  const r = diagnose(passConfig);
  eq('scenario pass: status is "pass"', r.status, 'pass');
  ok('scenario pass: no problems reported', r.problems.length === 0, `got ${JSON.stringify(r.problems.map((p) => p.code))}`);
}

// Scenario 2: Site URL is localhost
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.supabase.siteUrl = 'http://localhost:3000';
  const r = diagnose(cfg);
  eq('scenario localhost siteUrl: status is "fail"', r.status, 'fail');
  has('scenario localhost siteUrl: reports site_url_is_localhost', r.problems, 'site_url_is_localhost');
  const p = r.problems.find((x) => x.code === 'site_url_is_localhost');
  ok('scenario localhost siteUrl: severity is high', p && p.severity === 'high');
}

// Scenario 3: missing / empty allow-list
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.supabase.allowedRedirectUrls = [];
  const r = diagnose(cfg);
  eq('scenario missing allow-list: status is "fail"', r.status, 'fail');
  has('scenario missing allow-list: reports redirect_not_allowlisted', r.problems, 'redirect_not_allowlisted');
}

// Scenario 4: wrong provider redirect URI
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.provider.authorizedRedirectUris = ['https://abcd1234.supabase.co/auth/v1/callback/typo'];
  const r = diagnose(cfg);
  eq('scenario bad provider URI: status is "fail"', r.status, 'fail');
  has('scenario bad provider URI: reports provider_redirect_uri_missing', r.problems, 'provider_redirect_uri_missing');
}

// Scenario 5: redirectTo doesn't match what the runtime actually produces
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.code.redirectTo = 'myapp://wrong/path';
  const r = diagnose(cfg);
  eq('scenario bad redirectTo: status is "fail"', r.status, 'fail');
  has('scenario bad redirectTo: reports redirect_to_mismatch', r.problems, 'redirect_to_mismatch');
  lacks('scenario bad redirectTo: still allow-listed under myapp://**, no separate allow-list problem', r.problems, 'redirect_not_allowlisted');
}

// Scenario 6: Expo Go runtime, but its exp:// URL isn't on the allow-list
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.expo.runtime = 'expo-go';
  cfg.code.redirectTo = ''; // fall back to the computed Expo Go URL
  // allow-list only has the custom-scheme pattern, not an exp:// one
  const r = diagnose(cfg);
  eq('scenario expo-go unlisted: status is "fail"', r.status, 'fail');
  has('scenario expo-go unlisted: reports redirect_not_allowlisted', r.problems, 'redirect_not_allowlisted');
  const p = r.problems.find((x) => x.code === 'redirect_not_allowlisted');
  ok(
    'scenario expo-go unlisted: message references the exp:// URL',
    p && p.message.includes('exp://127.0.0.1:8081/--/auth/callback'),
    p && p.message
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 4. A few extra tolerance / edge-case checks
// ─────────────────────────────────────────────────────────────────────────

// Tolerant of a fully empty config — should not throw, should fail loudly
// (missing scheme) rather than silently passing.
{
  const r = diagnose({});
  ok('empty config: does not throw and returns a status', ['pass', 'warn', 'fail'].includes(r.status));
  eq('empty config: status is "fail" (missing scheme etc.)', r.status, 'fail');
  has('empty config: reports missing_scheme', r.problems, 'missing_scheme');
}

// Invalid scheme (uppercase / spaces) is flagged.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.expo.scheme = 'My App';
  const r = diagnose(cfg);
  has('invalid scheme: reports invalid_scheme', r.problems, 'invalid_scheme');
}

// Leading-slash path gets normalized and flagged as medium.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.expo.path = '/auth/callback';
  cfg.code.redirectTo = 'myapp://auth/callback'; // still matches the normalized form
  const r = diagnose(cfg);
  has('leading-slash path: reports path_not_normalized', r.problems, 'path_not_normalized');
  const p = r.problems.find((x) => x.code === 'path_not_normalized');
  ok('leading-slash path: severity is medium', p && p.severity === 'medium');
  eq('leading-slash path: status is "warn" (medium only)', r.status, 'warn');
}

// flowType implicit recommends pkce.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.code.flowType = 'implicit';
  const r = diagnose(cfg);
  has('implicit flow: reports flow_type_not_pkce', r.problems, 'flow_type_not_pkce');
}

// ─────────────────────────────────────────────────────────────────────────

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log('All tests passed.');
}
