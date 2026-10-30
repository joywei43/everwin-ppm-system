# Everest Telegram cloud bot

Status: implementation and local tests ready; production setup must be verified in the dashboard.
This standalone Worker only reads the PPM public /state endpoint. It never writes PPM data.
Reservations and queue calling have been removed. Players contact @midoripokerroom.

## Deploy in Cloudflare dashboard

1. Workers & Pages → Create application → create a Worker named `everest-telegram-bot`.
   If a starter/template is required, create a basic Worker. Deploy the starter, then Edit Code.
2. Replace the editor's entire entry script with `dashboard-worker.mjs`; Deploy.
   This is the complete single-file build. Do not paste only `rules.mjs` or `worker.mjs`.
3. Storage & databases → D1 → Create database `everest-telegram`.
4. Open the Worker → Bindings → Add binding → D1 database. Variable name **DB**, database `everest-telegram`.
   Do not bind the existing PPM/waiting database. Schema initializes during authenticated setup.
   Also add a **Service binding**: variable name `PPM_API`, service `everest-waiting-api` (Production).
   This connects the bot directly to the existing PPM Worker without a compatibility flag.
5. Worker → Settings → Variables and Secrets. Add:

| Name | Type | Value |
| --- | --- | --- |
| BOT_TOKEN | Secret | Current BotFather token; enter directly in Cloudflare |
| SETUP_PASSWORD | Secret | Choose a unique random password of at least 16 characters |
| OWNER_ID | Text | 8136216181 |

6. Settings → Triggers → Cron Triggers → Add `* * * * *` (check every minute).
   Channel 30-minute and group/private 60-minute timers are implemented in persistent state, not fixed wall-clock slots.
7. Make @EverestPokerRoomBot an administrator of @MidoriPoker with posting permission.
8. Stop Mac `bot.py` with Control+C before connecting the webhook. Existing local files/database remain untouched.
9. Visit the Worker's HTTPS `workers.dev` address followed by `/setup`.
   Enter SETUP_PASSWORD on that page, then click Connect. This verifies the bot identity,
   PPM source and channel permissions, initializes D1, and sets the authenticated Telegram webhook.
   Automatic broadcasting remains OFF until explicitly enabled.
10. Privately send `/subscribe` to the bot and select All, NLH, or PLO. Old SQLite subscriptions
    are not automatically imported; the sole existing subscriber can opt in again.
11. In the existing player group, the owner (also a group admin) sends
    `/connectgroup@EverestPokerRoomBot`. Bot sends the owner a private confirmation.
12. Privately send `/status` to verify the group AND channel, then `/updateson`.
    Existing open tables with at least five players are announced on the next cron tick.
13. Verify a real post in group and channel. Only then may the Mac be shut down.

No Cloudflare API token or paid-plan upgrade is required for these dashboard steps.
Do not place BOT_TOKEN or SETUP_PASSWORD in source code, GitHub, URLs, or chat.
If using Wrangler/Git deployment later, add the D1 binding to the Wrangler configuration first (the PPM_API service binding is already configured);
otherwise a deployment can remove dashboard-managed bindings.

## Commands

Player: `/tables`, `/subscribe`, `/unsubscribe`, `/start`.
Owner in private: `/status`, `/updateson`, `/updatesoff`.
Owner in a group they administer: `/connectgroup@EverestPokerRoomBot`.
No booking, arrival, seat-hold or calling commands.

## Notification rules

- Public source tables T1/T2/T3/T5; nine seats each.
- Groups and private subscribers: new table reaches >=5 → one interruption; otherwise 60 minutes from the last accepted notification.
- Channel: new table reaches >=5 → one interruption; later increases at >=5 → immediate interruption (including recovery after a decrease).
  Decreases do not interrupt. Otherwise 30 minutes from last accepted notification.
- Full at 9/9 → a single full-table channel notification; add second-table reservation copy only
  if no other open table has the same game and stakes.
- No periodic broadcasts while all tables are closed.
- Last table closes at/after 04:00 GMT+8: the user's exact thank-you copy goes to all configured
  destinations and opted-in subscribers, once per local calendar date. No delayed 04:00 broadcast
  for a room that closed earlier. Initial empty snapshots never trigger thanks.
- One timestamp in Philippine time; no TEST labels, held counts, or seating disclaimer.
- Source is checked every minute, so changes can take approximately one minute to appear. Changes
  that happen and reverse between polls may not be observed.

## Reliability and limits

D1 stores subscriptions, destinations, table transitions, processed updates and an outgoing queue.
Webhook requests require Telegram's secret header. A database lease serializes cron and webhook work.
Enqueue + transition persistence is atomic. Accepted messages update interval clocks; temporary failures
retry with backoff; 403 stops private subscriptions. Failed destinations are shown by `/status`.
Telegram has no idempotency key: a crash after Telegram accepts a send but before D1 records it can
rarely cause a duplicate on retry. State changes and normal webhook replays are deduplicated.
Pending table posts expire after 30 minutes to avoid old desk information being sent later.
Six messages are sent per invocation; large subscriber lists need pagination/throughput tuning.

## Validate and build

Node 24 (node:sqlite) is used for tests, not needed on the production Worker.

```sh
node --test cloudflare-telegram/*.test.mjs
node cloudflare-telegram/build.mjs
node --check cloudflare-telegram/dashboard-worker.mjs
```

## Rollback

Privately send `/updatesoff` first. To return to the old Mac bot, remove the cloud webhook using
Telegram's deleteWebhook API securely in your own terminal, then start the original Python bot.
Do not run local polling and the cloud webhook at the same time.
