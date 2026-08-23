# maintainerr-telemetry

The receiving end of Maintainerr's telemetry. This repo is public so anyone
can check what happens to a ping.

## Why this exists

Maintainerr is free and built by volunteers in their spare time. That time is
the scarce thing, and without numbers it gets spent on guesses.

Nobody knows how many people run Maintainerr today. Docker pulls count build
robots and repeat downloads, not installs. Nobody knows whether anyone is
still on the old versions, or whether the Tautulli integration is used by half
the userbase or by four people.

The guesses get made anyway, and they cost you:

- A bug on your setup waits, because your setup looks rare.
- A feature you rely on gets dropped, because it looked unused.
- Old code is kept forever just in case, and everything gets slower and more
  fragile.
- Your language stays half-translated, because nobody knew it was spoken.

One line a week saying "an install, version 2.19.0, on Linux, with Jellyfin"
fixes all four. It says nothing about you, and the rest of this page is the
proof.

Nothing is sold. No advertising, no third parties, no profile of you. The
numbers are public at
[telemetry.maintainerr.info](https://telemetry.maintainerr.info).

It is on unless you turn it off. Maintainerr asks once in the web interface
and never asks again. Question 8 below has the two ways to stop it.

## What we never collect

**No names or personal data of any kind.** Not yours, not your users'.

This matters most for rules. A rule can compare against a username, for
example "seen by alice". Maintainerr sends only the **name of the property**
you used, like `plex.seenBy`. The value you compared against is never sent,
and there is no field it could arrive in.

Also never collected: your IP address, hostname, account, install ID, library
names, media titles, file paths, URLs, API keys, your media server's user
list, or an exact count of anything.

## The rules, which apply to every field below

- **No identifier.** Nothing ties a ping to you, or two of your pings to each
  other. Maintainerr has a local `clientId` and never sends it.
- **Your IP is never saved.** The worker never asks for it and there is
  nowhere in the database to put one.
- **Nothing about fewer than 10 installs is published.** A value goes public
  only once 10 installs report it, so anything unique to you never appears.
- **No free text.** Every value must match `^[\w.\-+]+$` and fit a length cap.
  A path, URL or key cannot travel in a field even by accident.
- **Numbers are bucketed** into `0`, `1`, `2-4`, `5-9`, `10-24`, `25+` before
  sending.
- **Bodies over 4096 bytes are rejected** with `413`.

Below, the caps and the pattern are enforced by `src/index.ts` and you can
verify them there. The vocabularies are what the client is specified to send;
the collector does not check them and stores any token that fits.

## What is collected

### Census, every install every week

Counted exactly, which gives real install and version-adoption numbers. Only
per-dimension totals are published, never these stored combinations. Missing
or malformed `version`, `versionTag`, `arch` or `platform` rejects the ping
with `400`; other fields fall back.

| Field sent | Stored as | Type / limit | If absent | Example |
| ---------- | --------- | ------------ | --------- | ------- |
| `version` | `version` | token, max 32 chars | ping rejected | `2.19.0` |
| `versionTag` | `version_tag` | token, max 32 chars | ping rejected | `stable` |
| `arch` | `arch` | token, max 16 chars | ping rejected | `x64` |
| `platform` | `platform` | token, max 16 chars | ping rejected | `linux` |
| `isDocker` | `is_docker` | `1` only if literally `true` | `0` | `1` |
| `nodeMajor` | `node_major` | integer | `0` | `22` |
| `mediaServer` | `media_server` | token, max 16 chars | `none` | `plex` |

`mediaServer` is one of `plex`, `jellyfin`, `emby`, `none`. That is the whole
row, and the ISO week is the only timestamp.

### Rich sample, 1 week in 32

About once every 7 months per install, a ping also carries config detail.
Each entry becomes a separate `(week, metric, value)` counter and the payload
is thrown away, so no combination of these fields exists at rest. Unknown
fields are dropped before any write. Lists are de-duplicated, then cut to the
cardinality cap; values failing the pattern or length cap are dropped one by
one.

| Field sent | Metric | Max values | Value limit | Example value |
| ---------- | ------ | ---------- | ----------- | ------------- |
| *(implicit)* | `sample` | 1 | `all` | sampled-ping denominator |
| `locale` | `locale` | 1 | 8 chars | `en` |
| `usage.ruleGroups` | `usage_ruleGroups` | 1 | 8 chars | `10-24` |
| `usage.activeRuleGroups` | `usage_activeRuleGroups` | 1 | 8 chars | `5-9` |
| `usage.collections` | `usage_collections` | 1 | 8 chars | `2-4` |
| `usage.manualCollections` | `usage_manualCollections` | 1 | 8 chars | `0` |
| `usage.exclusions` | `usage_exclusions` | 1 | 8 chars | `25+` |
| `usage.notifications` | `usage_notifications` | 1 | 8 chars | `1` |
| `rulesApps[]` | `rules_app` | 10 | 16 chars | `radarr` |
| `ruleProperties[]` | `rule_prop` | 25 | 48 chars | `plex.addDate` |
| `integrations[]` | `integration` | 16 | 24 chars | `seerr` |
| `features[]` | `feature` | 10 | 32 chars | `overlays` |
| `notificationAgents[]` | `notif_agent` | 16 | 24 chars | `discord` |
| `mediaTypes[]` | `media_type` | 4 | 8 chars | `movie` |
| `arrActions[]` | `arr_action` | 6 | 32 chars | `UNMONITOR` |

`arr_action` values arrive as Maintainerr's action names in upper case and are
stored verbatim; the dashboard shows them in lower case so every metric reads
the same way.
`rule_prop` values come from Maintainerr's own fixed property list.
`integrations` is drawn from `radarr`, `sonarr`, `sportarr`, `seerr`,
`tautulli`, `streamystats`, `tracearr`, `downloadClient`; `features` from
`arrTagExclusionsRadarr`, `arrTagExclusionsSonarr`, `overlays` and
`metadata_<preference>`.

Cardinality caps bound how many rows one ping can write. They are not a list
of known services: any token that fits is stored, so a service added to
Maintainerr appears here with no change to this repo and no migration.

Sample shares scale to real counts using the census total. At 500K installs
the weekly sample of ~3.9K pings is accurate to about +/-1.6% (95% CI).

## The awkward questions

A privacy page that lists only its strengths is not worth much. Every point
below is stated with its consequence, because a caveat that leaves you with a
new question is not a disclosure, it is a worry.

| Question | Answer |
| --- | --- |
| 1. Does this open a way into my server? | No, and it cannot. |
| 2. Do we have your IP address? | No. |
| 2a. Does Cloudflare see it? | Yes, like every server you connect to. |
| 2b. Does this worker read it? | No. |
| 2c. Is it stored anywhere? | No. There is no column for it. |
| 2d. Can we look it up later? | No. Nothing was kept. |
| 3. Could my setup be unusual enough to identify me? | No. |
| 4. Can someone watching my network see the pings? | Yes, and nothing more. |
| 5. How long do you keep it? | Indefinitely, and it makes no difference. |
| 6. Can I have my data deleted? | There is nothing to delete. |
| 7. Anyone can post to the endpoint. Is that a risk to me? | No. |
| 8. How do I turn it off? | In the web interface, or with `TELEMETRY=off`. |

Here is each of those, with the reasoning.

### 1. Does this open a way into my server?

**No, and it cannot.** Traffic only ever goes one way. Maintainerr makes an
outbound HTTPS request, the same as your browser loading a page, and that is
the whole interaction. No port is opened, nothing is exposed to the internet,
nothing is installed, and nothing reaches your media server, your *arr apps,
or anything else on your network. The collector is
`telemetry.maintainerr.info` and it never contacts you.

It could not reach back if it tried, for three separate reasons. It never
learns your address, so it has nowhere to send anything. It contains no
outbound network calls at all, so it has no means to send anything. And every
possible reply to a ping is an empty status code with no body: `204` when
accepted, `400` or `413` when rejected. If this server were taken over
completely tomorrow, the worst it could do to your install is answer with a
status code that Maintainerr ignores.

### 2. Do we have your IP address?

**No.** You can check that instead of trusting us. Reading an address takes a
deliberate line of code and this worker has none: `src/index.ts` reads the
body, method and path, nothing else. Request logging is off in
`wrangler.toml`, so the platform keeps no record either.

**Your address arrives in a header we cannot remove.** Cloudflare puts it in
`x-real-ip`, and no Cloudflare setting takes it off; we checked against the
running worker. We do remove `cf-connecting-ip`, the header any code would
normally read, which stops a careless change here from picking one up by
accident. Neither is read, and nothing writes one down, so the guarantee is the
code rather than the platform.

One thing is worth naming rather than leaving for you to find. Cloudflare's
dashboard shows how many requests came from each country, the ordinary traffic
analytics that every site owner has. That is a count, not an address; we do
not collect it, store it, or have any way to tie it to a ping.

### 3. Could my setup be unusual enough to identify me?

**No.** A rare combination is stored as a row saying one install runs it, with
no identifier, no address, and no time more precise than the week. There is
nothing in that row that points to a person, and no key that joins it to any
other row. It also stays off the public page until ten installs report it.

### 4. Can someone watching my network see the pings?

**Yes, and nothing more.** Your ISP already sees every connection you make. A
ping is one more HTTPS request, once a week, to a public address. Maintainerr
picks a fixed weekly moment for it on your own machine, so the timing repeats,
which tells an observer nothing they did not already know from watching the
connection itself.

### 5. How long do you keep it?

**Indefinitely, and it makes no difference.** The rows are counters: this many
installs, that week. They hold no identifier, so a year-old row is exactly as
anonymous as today's and never becomes more revealing. The public page shows
the last 8 weeks.

### 6. Can I have my data deleted?

**There is nothing to delete.** No ping carries an identifier, so no row is
yours to find. That is the same property that makes it anonymous in the first
place. If you would rather not send it at all, turn telemetry off in
Maintainerr and nothing further is sent.

### 7. Anyone can post to the endpoint. Is that a risk to me?

**No.** `POST /v1/ingest` takes no credential, and cannot: issuing one would
mean issuing an identifier, the one thing this design refuses to do. Here is
exactly what that is worth to an attacker.

What they **cannot** do:

- **Reach your machine.** Nothing they do to this endpoint travels back down
  the one-way connection described above.
- **Read anything private.** The database holds only aggregate counters. No
  credentials, no identifiers, no personal data. All of it is already public
  at `/v1/stats` on purpose.
- **Inject anything.** Values are written through bound parameters, and must
  match the pattern first. Two independent defences against SQL injection.
- **Attack dashboard visitors.** The pattern rejects `<`, `>` and quotes, and
  the page HTML-escapes every value before rendering. Either alone suffices.
- **Run code.** No `eval`, no filesystem, no shell. It parses JSON and
  increments counters.
- **Learn who sent an earlier ping.** Nothing stored can correlate them.

What they **can** do:

- **Post fake numbers.** A value needs 10+ reports to appear, which is easy to
  fake. Read the figures as a good measure of reality, not a tamper-proof one.
  Nobody's data is exposed by this; the stats just get less accurate.
- **Waste the request quota.** Cloudflare's free tier is account-wide, so a
  flood could exhaust the daily budget and take this worker offline until the
  next day. Rate limiting at the edge is the mitigation. The worst outcome is
  that stats stop updating; your install is unaffected, because a failed ping
  is ignored and never retried.

That rate-limiting rule has one consequence worth stating here rather than in
the privacy answers above, because it only ever concerns an attacker.
Cloudflare's abuse log records the addresses of requests a rule acts on. A
normal weekly ping never trips a rate limit, so an ordinary install never
appears in it. Someone flooding the endpoint would.

### 8. How do I turn it off?

**Two ways, and the environment variable wins.** Maintainerr asks once, the
first time you open the web interface after setup, and never asks again. It
reports until you say otherwise.

- **In the web interface:** **Settings > About > Help us improve it**. The same
  page shows the exact report your server would send.
- **In the environment:** set `TELEMETRY=off`. It overrides the stored setting,
  so it holds whatever the toggle says.

Turning it off stops the next ping. There is nothing to delete afterwards, for
the reason in question 6.

## Endpoints

| Method | Path         | Purpose                                          |
| ------ | ------------ | ------------------------------------------------ |
| GET    | `/`          | Public dashboard, renders `/v1/stats`, no third-party requests |
| POST   | `/v1/ingest` | Weekly census ping, plus rich sample 1/32 weeks   |
| GET    | `/v1/stats`  | Public dataset: census marginals and sample facts |

The dashboard is a thin view over the public JSON. There is no private view of
the data beyond ad-hoc `wrangler d1 execute` queries against the same
counters. New metrics appear on the dashboard automatically.

## Capacity (free tier)

Cloudflare free-tier limits are **account-wide**. This worker shares the 100K
requests/day budget with every other worker on the account, and hitting the
cap blocks them all until the next UTC day. Set a Workers usage notification
well below the limit; it protects the whole account.

| Instances | Requests/day (telemetry) | D1 writes/day | Verdict |
| --------- | ------------------------ | ------------- | ------- |
| 71K       | ~10K                     | ~21K          | fits, wide headroom |
| 200K      | ~29K                     | ~60K          | fits, ~40% write headroom |
| ~330K     | ~47K                     | ~100K         | at the line, turn a knob |

Only one knob is collector-side: trim the `ruleProperties` cap, which takes
effect the moment it deploys.

Raising `SAMPLE_DIVISOR` and moving the census to biweekly are both
client-side, and neither is casually turnable. Installs upgrade over months,
so either one leaves the fleet split across two behaviours while the collector
describes a single one. The divisor skews every estimate built on
`meta.sampleDivisor`. A biweekly census is worse: an install reporting every
other week is missing from half of them, so the instance count stops being
exact, which is the one thing `/v1/stats` says it is. Both are safe only
before a release, or in a release that moves the client with them.

The census is no longer the binding term: at 35 facts per sampled ping the
1/32 rich sample costs slightly more again, ~31K writes/day at 200K
instances.

## Deploy

```sh
wrangler d1 create maintainerr-telemetry        # paste id into wrangler.toml
wrangler d1 execute maintainerr-telemetry --remote --file=schema.sql
wrangler deploy
```

Recommended: a Cloudflare WAF rate-limiting rule on `/v1/ingest`, for example
10 req/min per IP, so abuse handling stays at the edge and no IP handling is
ever added to application code.
