# Research memo: proven platforms and patterns for the Alcan App

**Date:** 2026-09-24. Web research run for the build plan; sources linked
inline. Backs the "proven over scratch" principle in `../README.md`.

## Headline conclusions

1. **Copy the employee-app IA, don't buy the app.** Staffbase, Blink,
   Workvivo, and Connecteam all converge on the same shape: a home feed,
   a chat/community space, a links hub ("launcher"), a directory, and a
   profile, with the feed as the landing screen. That tab pattern is the
   thing to copy. Buying is only honest to consider for Connecteam
   (~$29+/mo, built for sub-200-person frontline teams) or Blink
   (~$3.75/user/mo), but neither absorbs Pro Moves, so buying means two
   apps forever. Workvivo (~250-seat minimum) and Staffbase (enterprise)
   are out.
2. **Communication: feed-first, no forum, no chat** (John's call
   2026-09-24, and the follow-up research below backs it hard). Every
   frontline employee platform centers a targeted feed; Basecamp's own
   model is board-first and famously anti-chat; DMs in an employer-owned
   custom app are a liability surface with none of the controls the
   enterprise vendors ship. The shape: an in-PWA feed (posts with
   location/role audiences, comments, reactions, acknowledgement
   tracking on must-reads, push on post) built small from proven parts
   (TipTap editor, Supabase Realtime/Storage, existing auth/RLS), with
   Google Chat Spaces deep-linked from the hub as the informal-chat
   sidecar, outside the app. Forum platforms (Discourse et al.) solve
   problems Alcan doesn't have and all live as separate websites; feed
   SaaS (GetStream) starts at $6k/yr past its free tier. Full detail in
   the follow-up findings at the bottom of this memo.
3. **Drive uploads: service account + resumable uploads.** An edge
   function holding service-account credentials starts a resumable
   upload session into the Shared Drive folder; the browser sends the
   file in chunks that survive flaky mobile connections. Staff need no
   Google login for this path. Quirks that matter: the service account
   must be a member of the Shared Drive (it has no storage of its own),
   and uploads cap at 750 GB/day per account, far above social-content
   volume. Multi-GB phone videos are practical but slow on cellular, so
   the UI must show progress and not block.
4. **Deputy is more capable than expected.** Documented REST API,
   permanent-access-token auth for a single-org integration, read access
   to schedules/timesheets/employees, webhooks (including clock events),
   and, notably, clock in/out IS possible via API. So Deputy can start
   as a link and genuinely graduate to "see my shifts and clock in from
   the Alcan App."
5. **PWA reaffirmed.** Nothing on the feature list needs an app store
   app. iOS web push has worked for installed PWAs since 16.4 and
   improved through iOS 26. The real iOS caveats (manual add-to-home-
   screen, permission prompts, subscriptions dropped for unused apps)
   are manageable for a mandatory internal app where IT walks staff
   through one install. Native would only buy geofenced background
   clock-in and app-store presence, neither in scope.

## Full findings

# Research findings: Alcan App expansion

## 1. Employee "front door" / internal super-app precedents

**What proven platforms converge on.** Across Staffbase, Blink, Workvivo, and Connecteam, the feature set is remarkably consistent:

- **Home feed** (company news + social posts, targeted by location/role) is always the landing screen
- **People directory** with org structure and profiles
- **Chat / community spaces** (channels or "Spaces" per team/location/topic)
- **Links hub** ("app launcher" tiles to payroll, HR, scheduling systems — exactly the Done Desk/ADP/Deputy use case; this is a first-class feature in all of them)
- **Recognition** (shout-outs, kudos, often tied to values)
- **Content pages / knowledge base** (policies, onboarding docs)
- Secondary: surveys/polls, broadcast alerts with mandatory-read tracking, events

**IA pattern to copy:** bottom tab bar of roughly **Home (feed) / Chat or Community / Hub (launcher + tools) / Directory / Profile**, with the feed as default and the launcher as the "everything else" escape hatch. Frontline-focused apps (Blink, Connecteam) put the launcher one tap from home because deskless staff mostly come in to do one task and leave.

**Buy-vs-build honesty for a 50–200 person dental org:**
- **Connecteam** is genuinely viable to buy: free forever up to 10 users, paid hubs from ~$29/mo for 30 users; designed for <200-person frontline businesses, and it *already includes* scheduling, time clock, chat, and updates feed — i.e. it overlaps Deputy too. ([Connecteam via Zelos comparison](https://getzelos.com/best-frontline-employee-apps), [Capterra compare](https://www.capterra.com/compare/153140-173179/Connecteam-vs-Blink))
- **Blink**: from ~$3.75/user/mo annual; strong frontline/healthcare UX; viable at this size. ([Blink](https://www.joinblink.com/intelligence/best-employee-communication-apps))
- **Workvivo**: effectively ruled out — minimum ~250 users and ~$20k/yr, sales-led. ([Workvivo pricing](https://www.workvivo.com/pricing/), [eLearning Industry](https://elearningindustry.com/workvivo-pricing-plans-costs-which-plan-is-right-for-you))
- **Staffbase**: enterprise, custom pricing (~$8–14.50/user/mo at scale), sales process; overkill here. ([Connecteam's Staffbase review](https://connecteam.com/reviews/staffbase/))

The honest tension: buying Connecteam/Blink gets the comms layer cheaply, but neither absorbs Pro Moves — you'd have two apps. Since Pro Moves already exists as the branded PWA, building the thin comms shell around it and copying the tab-bar IA above is defensible; but Connecteam at ~$29–100/mo deserves a real look before committing to a custom forum.

## 2. Forum/communication layer options

**(a) Hosted Discourse.** Official hosting: Free tier (500k pageviews, 5GB), **Pro $100/mo** (API + webhooks), **Business $500/mo**, Enterprise custom. Per the current pricing page, **SSO (DiscourseConnect/OAuth2/OIDC) is listed on Business and up** — third-party summaries claim Pro includes DiscourseConnect, so this needs a sales-call confirmation; if SSO truly requires $500/mo, that's a big number for ~100 staff. ([discourse.org/pricing](https://www.discourse.org/pricing), [costbench](https://costbench.com/software/community-platform/discourse/)) Self-hosting is free and includes everything, at the cost of running a Docker VM.
- **Embedding reality:** Discourse officially supports embedding *comments* and *topic lists* via JS-created iframes, not embedding the whole forum inside another app — full-forum iframing is explicitly discouraged/unsupported on Meta, and login-required + DiscourseConnect inside an iframe has known redirect problems. The realistic integration is **SSO-linked, not embedded**: staff tap "Community" in the Alcan App and land on a Discourse site that silently logs them in via DiscourseConnect, styled with a matching theme. That's a second surface, not the same PWA. ([iframe thread](https://meta.discourse.org/t/embedding-a-whole-discourse-forum-on-another-site-in-an-iframe/157631), [embed topics with DiscourseConnect](https://meta.discourse.org/t/embedding-topics-with-login-required-and-discourseconnect/221009), [JS comment embed](https://meta.discourse.org/t/embed-discourse-comments-on-another-website-via-javascript/31963))
- Discourse is mobile-responsive and has webhooks (usable to trigger your own push via the existing PWA push pipeline).

**(b) Other open source.** [Elestio's 2026 comparison](https://blog.elest.io/discourse-vs-flarum-vs-nodebb-which-self-hosted-forum-platform-in-2026/): **NodeBB** — Node stack, realtime chat/presence, OAuth2 SSO via first-party plugin ([nodebb-plugin-sso-oauth](https://github.com/julianlam/nodebb-plugin-sso-oauth)); **Flarum** — lightweight PHP, SSO is a community extension; both are still separate sites with the same embed problem as Discourse. **Talkyard** evidence is thin — small single-maintainer project; I wouldn't bet a company comms channel on it. No mature "Supabase-native forum kit" surfaced; only starter-template-grade examples exist.

**(c) Minimal custom build on Supabase.** For a private, ~50–200-user, single-org forum, the scope is genuinely small and fits the existing stack: `posts`/`replies`/`reactions` tables with RLS (org scoping already exists), @mentions via a lookup against `staff`, realtime via Supabase Realtime, push via the already-planned PWA push. What you *don't* get for free and mostly *don't need* at this scale: moderation queues, spam defense, trust levels, full-text search tuning, email digests. Rich text editing (adopt TipTap or similar rather than writing an editor) and image attachments (Supabase Storage) are the two real chunks of work.

**Verdict:** the "proven over scratch" principle collides with the "inside the branded PWA" requirement — every proven forum is a separate site. For an internal team feed (Basecamp replacement = announcements + threaded discussion, not a public community), a minimal custom build inside the PWA using proven *components* (TipTap editor, Supabase Realtime/Storage, existing auth/RLS/push) is the better fit than SSO-linking Discourse, whose moderation/SEO/scale machinery solves problems Alcan doesn't have. Discourse becomes the right answer only if leadership wants long-form knowledge-base-style discussion with search and categories at day one.

## 3. File submission to Google Drive

**Standard pattern** for staff uploads from a mobile browser into a Shared Drive:

1. **Service account + Drive API resumable upload** (the right fit here): a Supabase Edge Function holds the service-account credentials, initiates a resumable upload session against the target Shared Drive folder (`supportsAllDrives=true`), and the browser PUTs file chunks to the returned session URI (or proxies through the function). No Google login required from staff — matches the "any staff member submits content" flow.
2. **Google Picker / OAuth-as-user**: requires every staff member to have and sign into a Google account with drive access — wrong fit.
3. **Apps Script bridge**: works (well-documented pattern, e.g. [tanaikech's safe-uploading repo](https://github.com/tanaikech/safe-uploading-for-google-drive-by-html-in-external-server-using-google-apps-script)) but it's a workaround for people without a backend; with Edge Functions available, use the real API.

**Shared Drive / service-account quirks:**
- A bare service account has **no My Drive storage** (uploads to My Drive 403 since the 2025 storage change); it must upload **into a Shared Drive it's been added to as a member** (Contributor+), where storage counts against the Workspace org's pool. ([Google support thread](https://support.google.com/drive/thread/172142979), [Workspace limits](https://support.google.com/a/answer/172541?hl=en))
- **750 GB/day upload cap per user identity** — applies to the service account itself; not increasable. Fine for social content (that's ~150 five-GB videos/day). ([Workspace limits](https://support.google.com/a/answer/172541?hl=en))
- Max file size 5 TB; Shared Drives cap at 500k items — phone videos (typically 100 MB–4 GB) are **entirely practical** with resumable uploads, which also survive flaky mobile connections via chunk retry. ([Drive API limits](https://developers.google.com/workspace/drive/api/guides/limits), [Shared drive limits](https://support.google.com/a/users/answer/7338880))
- Practical caveat: chunked browser→Drive uploads of multi-GB videos on cellular are slow; keep the UI async (background-ish upload with progress, not a blocking form).

## 4. Deputy API

- **REST API, well-documented** at [developer.deputy.com](https://developer.deputy.com/docs/public-api-facts-and-overview); per-customer subdomain base URLs; Deputy's stated position is "everything the UI can do, the API can do." Third-party reviewers grade it highly ([API report card](https://supergood.ai/api-report-card/deputy)).
- **Auth:** OAuth 2.0 (authorization code + refresh tokens) for third-party apps, or **permanent access tokens** for a single-install integration — the permanent-token route is the pragmatic choice for one org reading its own data server-side. ([Getting started](https://www.deputy.com/api-doc/API/Getting_Started))
- **Read access:** rosters/schedules, timesheets (bulk or individual), employees, locations, leave are all readable. ([Retrieving timesheets](https://developer.deputy.com/docs/retrieving-timesheets-from-deputy))
- **Time clock via API: yes** — `POST /api/v1/supervise/timesheet/start` (clock in, takes employee + op unit) and `/timesheet/end` (clock out, takes timesheet ID); docs explicitly bless POS-style apps that only do clock in/out. So "show my upcoming shifts + clock in from the Alcan App" is technically possible, not just a link-out. ([Clock in/out docs](https://developer.deputy.com/docs/startingstopping-timesheets-clock-in-and-out))
- **Webhooks: yes**, on most resources with filtering; timesheet webhooks fire on clock-on, clock-off, and approvals — usable for push notifications. ([Webhook overview](https://developer.deputy.com/docs/webhook-overview))
- **SSO story:** thin. Deputy supports SSO *into Deputy* for enterprise, and "Embed partners" get seamless auth, but there's no simple consumer-grade "log staff into Deputy from our app" flow; expect deep-linking into the Deputy app for anything beyond API-rendered data.

## 5. PWA vs app store in 2026

**Nothing in this feature set requires a native app.**

- **Push:** iOS has supported web push for home-screen PWAs since 16.4; iOS 26 further improved things (every site added to Home Screen opens as a web app by default; Declarative Web Push in Safari 18.4). Real limitations: install is still manual Add-to-Home-Screen (no install prompt), permission must be user-granted, no silent/background push, and iOS may drop the subscription if pushes don't display notifications or the PWA goes unused for long periods. For a *mandatory internal staff app* (IT can walk everyone through one install), the 10–15x reach penalty that kills consumer PWA push doesn't apply. ([MagicBell 2026 guide](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide), [MobiLoud](https://www.mobiloud.com/blog/progressive-web-apps-ios/))
- **Camera/video upload:** `<input type="file" accept="video/*" capture>` and getUserMedia work fine in iOS Safari/PWAs; photo/video submission needs nothing native.
- **Timeclock/links hub:** plain links and API calls; no native requirement.
- **One caveat:** EU-specific DMA changes crippled iOS PWAs in the EU in 2024 (later reversed for Home Screen web apps, but worth remembering if UK/EU staff at Avenue Dental ever use this — UK was not affected by the DMA change). Evidence on current EU status is mixed in secondary sources.
- What native *would* buy: geofenced/background location clock-in, reliable badging, app-store presence. None are in scope.

**Cross-cutting takeaway:** the existing PWA + Supabase stack covers all four capabilities with proven components (custom lightweight forum on Supabase, service-account resumable Drive uploads via Edge Function, Deputy REST reads + optional clock-in, static links hub copying the Blink/Connecteam launcher pattern). The one genuine buy-vs-build fork is Connecteam (~$29+/mo) as a parallel comms app vs. keeping everything in one branded front door; Discourse only re-enters if SSO pricing at Pro tier is confirmed and a separate community site is acceptable.

---

## Follow-up findings: communication model, Google Chat sidecar, feed components, DMs

*(Second research pass, 2026-09-24, after John reframed away from "forum". His subsequent decision: chat is out of the app too. These findings support both calls.)*

### 1. The communication model question

**What the proven platforms center: feed-first, unambiguously.** Every frontline-focused platform (Blink, Staffbase, Workvivo, Beekeeper, Flip, MangoApps) makes a **targeted news feed the home screen** — announcements with comments/reactions, filtered by location/role/team — with chat as a secondary tab. Purpose-built frontline apps treat **read receipts / open-rate analytics on announcements** as a headline feature, which tells you what the actual job-to-be-done is: leadership needs to know staff saw the thing. ([Flip's frontline app guide](https://www.getflip.com/blog/frontline-app/), [MangoApps](https://www.mangoapps.com/articles/best-frontline-communication-software), [Yourco roundup](https://www.yourco.io/blog/best-employee-communication-tools-frontline-workers))

- Chat-first tools (Slack-style channels) are conspicuously absent from the frontline category winners; where chat exists it's shift/location group chats plus DMs, bolted to the side of the feed. ([Workstream on deskless comms](https://www.workstream.us/blog/employee-communication-app-deskless-workforce))
- **Adoption evidence:** industry-average adoption for frontline apps is quoted at **30–40%**; standout cases are feed-first apps rolled out with management push — JD Sports hit **87% adoption in 10 days on Blink**. SMS still beats everything (~98% read rates), which is why several vendors lead with text. The honest read: adoption comes from mandate + a reason to open daily (schedule, pay, Pro Moves), not from the comms feature itself. ([Yourco](https://www.yourco.io/blog/best-employee-communication-tools-frontline-workers), [changeengine](https://www.changeengine.com/articles/frontline-communication-tools))

**Basecamp's own model** is famously **board-first, anti-chat-as-default**. Their published position: "Group chat is like being in an all-day meeting with random participants and no agenda"; real-time chat "one line at a time, all the time" destroys focus and morale; the rule is **"real-time sometimes, asynchronous most of the time."** The Message Board (one topic per post, replies grouped under it) is the primary organ; Campfire is deliberately relegated to hallway chatter. ([Group Chat: The Best Way to Totally Stress Out Your Team](https://basecamp.com/guides/group-chat-problems), [The 37signals Guide to Internal Communication](https://37signals.com/how-we-communicate/))

**Synthesis for Alcan:** Basecamp's board model and the frontline vendors' feed model are nearly the same thing under different names — durable, titled posts with threaded comments, not a rolling chat stream. The convergent design is: **one feed of announcements/posts (org-wide, per-location, per-team audiences), comments + reactions underneath, read/acknowledge tracking on the ones that matter, push on post.** Chat is a separate, deliberately secondary surface. That's both what staff are used to from Basecamp and what the category leaders ship. For chairside staff who check phones between patients, async-first is also the operationally correct model — nobody is watching a live channel mid-procedure.

### 2. Google Chat + Spaces as the chat sidecar

**Viability: good, and effectively free** since every staff member already has (or can have) a Workspace identity.

- **Spaces fit the team/location structure**: a Space per location, per role group, etc. Spaces come in **collaboration** (everyone posts) and **announcement** (managers-only post) flavors — the announcement type could even carry one-way broadcasts, though the in-app feed is the better home for those. ([Chat API spaces reference](https://developers.google.com/workspace/chat/api/reference/rest/v1/spaces))
- **Discoverability/joining**: Spaces can be made discoverable to a target audience (e.g., the whole org or a group), and every Space has a **shareable link** ("Copy link to this space") that opens the Chat mobile app when tapped — so the Alcan App's links hub or a location page can deep-link straight into "Front Desk – Frisco" chat. Message-level links exist too. External users can't join org Spaces, which for an internal tool is a feature. ([space target audience](https://developers.google.com/workspace/chat/space-target-audience), [join a space](https://support.google.com/chat/answer/7653963), [link to a message](https://workspaceupdates.googleblog.com/2023/09/easily-link-to-specific-message-in-google-chat.html))
- **API/webhooks**: incoming webhooks let any backend post into a Space with a simple JSON POST (no OAuth dance) — trivially usable to mirror Alcan App announcements into Chat. The full Chat API supports apps that create spaces, manage membership, and post/read messages. ([webhook quickstart](https://developers.google.com/workspace/chat/quickstart/webhooks))
- **Admin controls**: Workspace admin console governs Chat org-wide — retention (Vault), external chat off, space management. This is a real advantage over any custom-built chat: compliance and retention are Google's problem.
- **Known weaknesses vs Slack**: threading is simpler and a one-way per-space choice; Spaces "designed for simplicity, not scale" with weak naming/discoverability conventions; no workflow automation or custom-bot culture; notification behavior reported as inconsistent. None of these matter much at 50–200 users in a handful of Spaces. The real risks are softer: the Chat mobile app is serviceable but unloved, and it's **a second app to install** — chat lives outside the branded PWA, full stop. ([G2 comparison](https://learn.g2.com/google-chat-vs-slack), [Rock comparison](https://www.rock.so/blog/slack-vs-google-chat))
- **Caveat to verify internally**: this only works if every chairside/front-desk staffer actually gets a Workspace license (even Frontline SKU). If half the staff have no Google identity, the sidecar plan collapses.

### 3. Feed-with-comments components

- **GetStream (Stream) Activity Feeds**: the dominant feed-as-a-service. React SDK with prebuilt feed/notification components. Pricing (official page): **free "Build" tier — 5k activities & 125k API calls/month**; Start **$499/mo**; Elevate $899/mo; plus a **Maker plan ($100/mo free credit) for teams <5 people and <$10k monthly revenue** — Alcan wouldn't qualify for Maker. Honest math: a 200-person org posting announcements would likely fit inside the free Build tier's volume for a long time, but you'd be building a company channel on a free tier of an enterprise-priced product; the first paid step is $6k/yr, which buys a lot of custom Supabase code. ([getstream.io pricing](https://getstream.io/activity-feeds/pricing/), [React SDK](https://getstream.io/activity-feeds/docs/react/))
- **Knock** is notification infrastructure (cross-channel orchestration + a prebuilt in-app **notification feed** React component), not a social feed with comments — useful if notification routing gets complex, wrong tool for the feed itself. Evidence gathered on current Knock pricing is thin; their free tier has historically covered ~10k MAU. Not verified this pass.
- **Open-source / pattern reality**: no credible drop-in "company feed with comments" React+Supabase package surfaced — this space is either SaaS (Stream) or roll-your-own. But the roll-your-own is small: the schema is `posts (audience: org|location|team) → comments → reactions` plus a **`post_acknowledgements` table**, which is also exactly how you get Basecamp-style "who's seen this" and Staffbase-style **mandatory-read tracking** — a `read/ack` row per (post, staff), an "Acknowledge" button on flagged posts, and a coach-facing "12 of 15 acknowledged" view. That acknowledgement pattern is the one feature category leaders charge enterprise money for, and it's a weekend of work on the existing RLS/staff model.
- **TipTap remains the right editor adoption**; add Supabase Storage for image attachments and the existing push pipeline for post notifications.

### 4. The DM question

**Recommendation the evidence supports: keep 1:1 DMs out of the custom app.**

- **Liability is real, not hypothetical**: employer-provided messaging channels create employer responsibility — harassment/discrimination over a company channel exposes the company; FLSA case law makes after-hours work messages to non-exempt staff (which is most of a dental practice) compensable-time risk even against written policy; and records-retention questions follow any channel the employer owns. Employee-comms vendors' own guidance says a program must define who may message whom, when messages may arrive, and how records are kept. ([Selerix on legal landscape](https://selerix.com/engage-communications/navigating-the-legal-landscape-texting-and-emailing-employees-the-right-way/), [Yourco compliance risks](https://www.yourco.io/blog/compliance-risks-employee-texting-business-communications), [Udext best practices](https://www.udext.com/blog/hr-texting-employees))
- What the platforms do about it: enterprise employee apps that include DMs pair them with **admin moderation tooling, retention/export, and reporting flows** — capability a custom two-person build won't realistically ship or staff. A custom DM feature with no moderation, no retention policy, and no export is the worst of all worlds: employer-owned liability with none of the controls.
- **Google Chat resolves this cleanly**: DMs and quick chat happen on a channel that already has admin controls, Vault retention, and offboarding (account suspension kills access and the archive stays with the org — unlike staff texting on personal phones, where every thread stays on the departed employee's device forever). ([Workology on personal messaging risk](https://workology.com/every-day-your-team-uses-personal-messaging-apps-for-work-the-risk-gets-bigger/))
- The one DM-ish thing that *does* belong in the custom app: **structured, work-object messaging** — comments on posts, coach↔staff notes on Pro Moves — where the conversation is attached to a work artifact and inherently non-private. That's the Basecamp pattern too (comments on things, pings elsewhere).

**Net shape this pass points to:** in-PWA feed/board (posts + comments + reactions + acknowledgements + push) as the Basecamp Message Board replacement; Google Chat Spaces, deep-linked from the app, as the Campfire/ping replacement; no custom chat or DMs at all.
