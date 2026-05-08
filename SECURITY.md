# Security Requirements — Read Before Writing Any Code

Follow these rules for every file you write, every endpoint you create, and every dependency you add. If a request conflicts with these rules, flag it and propose a secure alternative instead of silently complying. If you're uncertain whether something is safe, say so and ask rather than guessing.

## Prototype Mode

If I say "this is a prototype, not production," relax these rules: skip rate limiting, skip strict CSP beyond defaults, skip dependency audits, skip MFA. Keep these four non-negotiable even for prototypes:

1. No hardcoded secrets.
2. Parameterized queries / ORM only.
3. Server-side auth and authorization checks.
4. No secret keys in client-side code.

Anything beyond a prototype follows the full rules below.

## Secrets & API Keys

- Never hardcode API keys, tokens, passwords, database URLs, or any secrets in source code.
- All secrets load from environment variables via `process.env` (or framework equivalent).
- Maintain a `.env.example` with all required keys (no values) committed to git.
- Add `.env`, `.env.local`, `.env.*.local` to `.gitignore` before the first commit.
- Secret keys (anything not explicitly designed to be public) must only be referenced in server-side code: API routes, server actions, backend services, edge functions. Never in client components, browser bundles, or anything prefixed with `NEXT_PUBLIC_` / `VITE_` / `PUBLIC_`.
- When I add a new API key, ask whether it's a secret or publishable key, and place it accordingly.
- Use scoped/restricted keys where the provider supports them (Stripe restricted keys, AWS IAM least privilege, Google API key referrer restrictions).
- Separate development and production keys. Never use production secrets locally.
- Use a secrets manager (Vercel/Netlify env vars, AWS Secrets Manager, Doppler, Infisical) for production. Never deploy `.env` files to servers.

## Authentication

- Prefer a managed auth solution. Hosted services (Clerk, Auth0, Supabase Auth, Firebase Auth) handle infrastructure and updates but require trusting a third party. Libraries (Auth.js, Lucia, better-auth) keep auth in your codebase but make you responsible for session storage, token rotation, and updates. Recommend one based on the stack and ask before proceeding.
- If the project requires custom auth, tell me why before building it, and follow OWASP ASVS Level 2.
- Hash passwords with argon2id (memory ≥19 MiB, iterations ≥2, parallelism ≥1, per current OWASP guidance). Use bcrypt (cost ≥12) only if argon2 isn't available in your stack — and if you do, either pre-hash with SHA-256 before bcrypt or reject passwords longer than 72 bytes to avoid bcrypt's truncation issue. Never MD5, SHA-1, or plain SHA-256.
- Check new passwords against the HaveIBeenPwned breached passwords API or equivalent.
- Support TOTP-based MFA or WebAuthn/passkeys for sensitive accounts.
- Session cookies must be `HttpOnly`, `Secure`, and `SameSite=Lax`. Do not use `SameSite=Strict` for session cookies — it breaks OAuth redirects and email confirmation links. Only use `Strict` for separate cookies that gate write actions and should never travel cross-site.
- Use the `__Host-` prefix for session cookies (e.g., `__Host-session`). This forces `Secure`, `Path=/`, and no `Domain` attribute, preventing subdomain-based cookie injection.
- Implement session expiration, idle timeout, and rotation on privilege change or password reset.
- Use constant-time comparison for tokens, session IDs, and password hash checks (`crypto.timingSafeEqual` in Node, `hmac.compare_digest` in Python). Never compare secrets with `===` or `==`.

## JWT (if used)

- Prefer opaque session tokens over JWTs unless you specifically need stateless auth across services.
- If using JWTs: short expiration (15 min for access tokens), refresh token rotation, refresh tokens stored server-side with revocation capability, no sensitive data in the payload, asymmetric signing (RS256/EdDSA) for distributed systems, and explicit rejection of `alg: none` and algorithm confusion attacks.

## Authorization

- Enforce access control on the server for every protected request. Hiding UI elements is not authorization.
- Every API endpoint and server action must verify: (1) the user is authenticated, (2) the user is allowed to access this specific resource.
- Authorization must happen before any database read, file access, or external API call — never after.
- Apply principle of least privilege: database users, API keys, and service accounts get only the permissions they need.
- When generating any endpoint that touches user data, explicitly include the ownership/permission check before any read or write.
- Admin/internal routes require additional protection beyond user auth: separate auth path, IP allowlist where feasible, mandatory MFA, audit logging of every action, and not discoverable from public routing.

## Input Handling & Injection

- Use parameterized queries or an ORM/query builder for all database access. Never concatenate or template-string user input into SQL, NoSQL queries, shell commands, or LDAP queries.
- Validate all input server-side using a schema library (Zod, Valibot, Yup, Pydantic). Define explicit schemas for every endpoint and reject unknown fields.
- Treat client-side validation as UX only, never security.
- Escape output by context: HTML, attributes, JavaScript, CSS, URLs. Use auto-escaping templating.
- Avoid `dangerouslySetInnerHTML`, `v-html`, `innerHTML`, `eval`, `new Function`, and dynamic `require`/`import` of user-controlled paths. If unavoidable, sanitize with DOMPurify and flag it for review.
- Never pass user input to shell commands, `child_process.exec`, or similar. Use array-form `spawn` with fixed arguments.
- Never set HTTP response headers from unvalidated user input. Strip or reject CR/LF (`\r`, `\n`) characters. Use the framework's redirect helper rather than setting `Location` manually.

## Prototype Pollution & Deserialization (Node)

- Avoid `Object.assign({}, userInput)` and recursive merge libraries (`lodash.merge` <4.17.20, older `deepmerge`) on user input.
- Use `Object.create(null)` for maps storing user-controlled keys.
- Never `JSON.parse` then pass to a recursive merge.

## SSRF Protection

- When the server fetches user-provided URLs, validate them: block private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, ::1, fc00::/7, fe80::/10), block `file://`, `gopher://`, `dict://`, and other non-HTTP(S) schemes.
- Critically: also block cloud metadata endpoints — 169.254.169.254 (AWS, GCP, Azure IMDSv1), fd00:ec2::254 (AWS IPv6), and metadata.google.internal. These return cloud credentials when fetched from inside the VPC. This is how Capital One was breached. On AWS, require IMDSv2 on all instances as defense in depth.
- Resolve DNS before fetching and re-check the resolved IP to prevent DNS rebinding, or use a library like `ssrf-req-filter`.
- Disable HTTP redirects on server-side fetches of user URLs, or revalidate the redirect target.

## Open Redirects

- For any redirect that takes a URL from user input (login `?next=`, OAuth callbacks, post-action redirects), validate against an allowlist of internal paths or known origins.
- Never redirect to arbitrary external URLs based on query parameters.

## File Uploads

- Validate file type by content (magic bytes), not just extension or `Content-Type` header.
- Enforce a size limit at the server and proxy layer.
- Generate random filenames; never use the user-supplied name for storage.
- Store uploads outside the web root, or in object storage (S3, R2) with private ACLs and presigned URLs for access.
- Scan for malware where applicable.
- Strip EXIF/metadata from images that will be served back.

## Webhooks

- Verify webhook signatures using the provider's documented method and signing secret, with constant-time comparison.
- If the provider includes a timestamp in the signed payload (Stripe, Svix), reject events older than the provider's recommended tolerance (Stripe: 5 minutes).
- If no timestamp is provided, track processed event IDs in a deduplication store with TTL ≥ provider retry window.
- Reject requests where the signature doesn't match.

## Transport & HTTP Headers

- HTTPS only. Redirect HTTP to HTTPS.
- Start with `Strict-Transport-Security: max-age=31536000; includeSubDomains`. Only add `preload` and submit to hstspreload.org once you're certain every subdomain serves HTTPS — removal from the preload list takes months.
- Content Security Policy. Start from this baseline:

```
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data:;
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none'
```

  CSS-in-JS frameworks (styled-components, emotion, MUI) and Tailwind's JIT inject inline styles — `style-src 'self'` will break them. Either use `style-src 'self' 'unsafe-inline'` (acceptable; inline-style XSS is far less dangerous than inline-script XSS), or generate per-request style nonces. Inline scripts should never use `'unsafe-inline'`; use nonces or hashes. Never use `unsafe-eval`. Add specific origins only as needed and explain why each addition is necessary.

- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin` or stricter.
- Permissions-Policy baseline: `accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()`. Add allowlist entries (e.g., `camera=(self)`) only for features the site actually uses.
- `frame-ancestors 'none'` in CSP (or `X-Frame-Options: DENY`) unless embedding is required. This is especially critical on auth/login pages.
- `Cross-Origin-Opener-Policy: same-origin` is a safe addition that mitigates cross-window attacks. Only add `Cross-Origin-Embedder-Policy: require-corp` if the site uses `SharedArrayBuffer` or needs cross-origin isolation — it will break most cross-origin embeds otherwise.
- Set `Content-Type` explicitly on all responses. For JSON APIs, return `application/json` and reject POST/PUT/PATCH requests that don't send it.

## Subresource Integrity

- Any `<script>` or `<link rel=stylesheet>` loaded from a third-party CDN must have `integrity=` (SRI hash) and `crossorigin=anonymous`.
- Better: self-host third-party scripts so a CDN compromise can't inject code into your site.

## CSRF & Cross-Origin

- Use CSRF tokens for state-changing requests, or rely on `SameSite=Lax` cookies with strict origin verification.
- For APIs, verify `Origin` and `Referer` headers on sensitive operations.
- Configure CORS restrictively. Never use `Access-Control-Allow-Origin: *` on authenticated endpoints. Allowlist specific origins.

## API & Endpoint Hardening

- Authenticate every non-public endpoint.
- Validate request bodies against a schema; reject unknown fields.
- Set request body size limits.
- Return generic error messages to clients. Log details server-side only.
- For endpoints that proxy paid third-party APIs (OpenAI, Anthropic, Stripe, etc.), require auth, rate limit per user, and consider per-user spend caps.
- Disable verbose error pages, stack traces, and framework banners in production.

## Rate Limiting

- Set rate limits per-endpoint based on cost and abuse risk, not a global default.
- Starting points to tune from: 5 per 15 min for login, signup, password reset, MFA, email verification; 10/min for password-protected resource access; 60/min for write endpoints; 300/min for read endpoints; 20/min per IP for unauthenticated endpoints. Adjust based on legitimate usage patterns.
- Use a sliding window or token bucket algorithm, backed by Redis or the platform's KV store (Upstash, Cloudflare KV, Vercel KV).
- In-memory rate limiting doesn't work across serverless instances. Don't use it in production on serverless.
- Track rate-limit hits as a signal to retune and detect abuse.
- Lock accounts or apply progressive delays after repeated failed auth attempts.

## Data Protection

- Encrypt sensitive data at rest (PII, payment data, health data, tokens).
- Never log secrets, passwords, full payment numbers, session tokens, or full PII. Redact before logging.
- Minimize data collection. Don't store what you don't need.
- Set sensible retention policies and a way to delete user data on request.

## Dependencies

- Pin dependency versions; use a lockfile.
- Before adding any dependency, check: (1) last publish ≤12 months ago, (2) name doesn't resemble a popular package by 1–2 characters (typosquat check — e.g., `lodahs` vs `lodash`), (3) no known critical CVEs in `npm audit` / `pip-audit`, (4) reasonable weekly downloads relative to its purpose. Single-maintainer packages are common and not automatically a red flag — judge based on the maintainer's reputation and the package's role. Flag anything that fails these checks for review before installing.
- Run `npm audit` / `pip-audit` / equivalent and address high/critical issues.
- Enable Dependabot or equivalent.
- Avoid obscure packages that duplicate well-maintained ones.

## Logging & Monitoring

- Log authentication events, authorization failures, and admin actions.
- Don't log sensitive payloads.
- Set up error tracking (Sentry, etc.) with PII scrubbing enabled.
- Set up alerts for unusual activity: spike in 401/403, signup floods, payment failures, rate limit hits.

## Error Handling

- Production responses never include stack traces, SQL errors, internal paths, or framework versions.
- Use a generic error page/JSON for unexpected failures.
- Map known errors to specific status codes; default to 500 for unknown.

## Deployment & Operations

- Use the host's secret/env variable UI for production (Vercel, Netlify, Railway, Render, Fly, AWS).
- Enable platform-level protections: WAF, DDoS protection, bot detection where available.
- Set spending caps and billing alerts on every paid API.
- Test backups by restoring them.
- Document required env vars in the README.

## What I Want You To Do Proactively

1. When you write a new endpoint, include in this exact order without me asking: auth check → authorization check → input validation → rate limiting → business logic → error handling. Authorization must happen before any database read, file access, or external API call — never after.
2. When you add a new third-party service, ask whether the key is secret or publishable and wire it up accordingly.
3. When you write a database query, use parameterized queries or the ORM. Never string-concatenate.
4. When you finish a feature, do a quick self-review against the OWASP Top 10 and tell me anything that's missing.
5. If I ask for something insecure ("just disable CORS," "hardcode the key for now," "skip the auth check"), push back and offer a secure alternative.
6. If you're uncertain whether something is safe, ask rather than guessing.

## Self-Audit Command

When I say "security audit," do all of the following and report findings as a checklist with ✅/❌ and a prioritized list of fixes:

1. Search for hardcoded secrets, API keys, tokens, passwords across the codebase.
2. Confirm `.env` is gitignored. Recommend running `gitleaks detect --source . --log-opts='--all'` or `trufflehog git file://. --only-verified` to scan history — these tools have curated regex packs for hundreds of secret formats (Stripe `sk_live_`, OpenAI `sk-proj-`, GitHub `ghp_`, AWS `AKIA`, etc.). Don't rely on home-rolled grep patterns.
3. List every API endpoint and confirm each has: authentication, authorization, input validation, rate limiting.
4. List every database query and flag any using string interpolation instead of parameters.
5. List every use of `dangerouslySetInnerHTML`, `eval`, `new Function`, `innerHTML`, or shell exec with variable input.
6. Check security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP) are configured.
7. List every secret env var and confirm it's only referenced in server-side code.
8. List every server-side fetch of a user-provided URL and confirm SSRF protections, including cloud metadata endpoint blocks.
9. List every redirect that takes a URL from user input and confirm allowlist validation.
10. List every webhook handler and confirm signature verification with constant-time comparison and replay protection.
11. List every cookie and confirm correct `HttpOnly`, `Secure`, `SameSite`, and `__Host-` prefix where applicable.
12. List every third-party `<script>` and `<link rel=stylesheet>` from a CDN and confirm SRI hashes are present.
13. Check for prototype pollution risk: recursive merges or `Object.assign` on user input.
14. Run through OWASP Top 10 (2021): Broken Access Control, Cryptographic Failures, Injection, Insecure Design, Security Misconfiguration, Vulnerable Components, Identification and Authentication Failures, Software and Data Integrity Failures, Security Logging and Monitoring Failures, Server-Side Request Forgery. Report any gaps.
