# SnappyMail CalDAV plugin — Cyrus IMAP / standards-compliant fork

A fork of the **Mailbux CalDAV Auto** plugin for [SnappyMail](https://snappymail.eu),
adapted so that it follows the CalDAV standards ([RFC 4791](https://www.rfc-editor.org/rfc/rfc4791))
closely enough to work against **[Cyrus IMAP](https://www.cyrusimap.org/)**'s CalDAV
implementation — and, by the same token, against any other standards-compliant
CalDAV server.

The upstream plugin targets one specific hosting provider. It hardcodes that
provider's hostnames and assumes its URL layout, so on any other server the
calendar loads but stays permanently empty. This fork removes those assumptions.

## What was changed and why

**The server URL is configuration, not code.** Upstream hardcodes the vendor's
host. Here the addressbook and calendar URLs come from the plugin's own settings
page, via a template with `{user}`, `{email}`, `{login}` and `{domain}`
placeholders. Nothing is hardcoded, and there is no built-in default: an
unconfigured plugin says so in the log rather than inventing a URL.

**Cyrus URL layout.** Upstream derives the calendar URL by rewriting
`/dav/card/` into `/dav/cal/`, which is that vendor's scheme. Cyrus (like most
servers) serves `/dav/addressbooks/user/<user>/<collection>` and
`/dav/calendars/user/<user>/<collection>`, discoverable through the standard
`addressbook-home-set` and `calendar-home-set` properties. Collection names are
case-sensitive in the URL and are no longer lowercased.

**Static assets are served through a part hook.** Upstream loads its bundled
FullCalendar from `?/Plugins/<plugin>/<file>`. That path is not a route for
plugin files: `ServiceActions::ServicePlugins()` ignores everything after
`/?/Plugins/` and returns the compiled plugin JS bundle, so the browser
re-executed the plugin instead of loading the library and `window.FullCalendar`
was never defined — the calendar then failed silently. The file is now served
from a dedicated part hook with a filename whitelist.

**No CDN fallback.** The upstream fallback fetches FullCalendar from a public
CDN, which a `script-src 'self'` Content-Security-Policy blocks. It could never
succeed and only masked the real error, so it is gone. Inline `onclick`
attributes, which violate `script-src-attr` under a nonce-based CSP, were
replaced by the event listeners the code already attached.

**Recurring events expand.** `RRULE` was never expanded and folded lines were
never unfolded, so a recurring series only ever appeared on its original start
date. Parsing now uses the Sabre VObject library that ships with SnappyMail, and
recurrences are expanded over a window around the current date. Non-recurring
events bypass expansion so historic events are not truncated.

**Recurring events can be created.** Expanding a series was only half of it:
the dialog had no way to make one, so anything repeating had to be created in
another client. It now has a **Repeats** row offering the same presets
Thunderbird does — daily, weekly, every weekday, bi-weekly, monthly, yearly —
plus **Custom**, which opens interval, weekday and ending fields. The server
assembles the `RRULE` from those. A single occurrence — or an occurrence and
everything after it — can also be changed without disturbing the rest, and the
dialog lists the dates a series skips so one can be added or put back. See
**Repeating events** below.

**Reminders work.** `VALARM` was ignored entirely, and the reminder control in
the event dialog only appended a marker string to the description — it alerted
nothing, anywhere, and the value was never even sent to the server. Alarms are
now resolved to absolute times (`DATE-TIME` triggers, and durations relative to
`START` or `END`) and surfaced through the Notification API, with an in-page
banner as fallback. Reminders set here are written as real `VALARM` components,
so other CalDAV clients honour them too.

**Failures are reported.** Every error path returned silently, which is why a
broken calendar was indistinguishable from an empty one. They now report.

## Inviting people

The event dialog has an **Invite** field taking one or more addresses, separated
by commas or semicolons, in either `name@example.com` or `Name <name@example.com>`
form. Saving the event adds an `ORGANIZER` and one `ATTENDEE` per address.

The invitations are **not** built or sent by this plugin. Under
[RFC 6638](https://www.rfc-editor.org/rfc/rfc6638) the CalDAV server owns
scheduling: it sees the attendees on the stored event, mails each of them, and
marks them with `SCHEDULE-STATUS`. Verified against Cyrus IMAP, which returns
`SCHEDULE-STATUS=1.1` for a dispatched invitation. This requires scheduling to
be enabled on the server - on Cyrus that is `caldav_allowscheduling`, with
`imipnotifier` for delivery by mail.

The field completes as you type, from the same sources SnappyMail uses when you
address a message. How far it reaches is a deployment decision - see
**Complete attendees from the whole directory** below.

Replies update the attendee list as the participants answer, and the dialog
lists each guest beside what they said.

### Answering an invitation

A meeting somebody else organised shows **Are you going?** — Yes, Maybe, No —
with the current answer marked. The plugin could previously only ask the
question; this is the half the user does most often.

Answering writes one thing: this account's own `PARTSTAT` on the stored event.
Nothing else is touched, and `SEQUENCE` deliberately is not raised — under
[RFC 5546](https://www.rfc-editor.org/rfc/rfc5546) §3.2.3 a reply carries back
the sequence it was sent, and raising it would tell the organiser's client that
the meeting had been rescheduled, by someone with no standing to reschedule it.
The `REPLY` itself is not built here either: the server sees the changed
`PARTSTAT` and mails it, exactly as it mails the invitations.

A repeating invitation asks whether the answer is for that date or for the
standing arrangement. Answering one date writes a `RECURRENCE-ID` override, so
declining a single stand-up leaves the rest accepted; answering the series
answers the overrides with it, or a date somebody had moved would go on asking
after the question was settled. "This and all following" is not offered — a
reply is not a rescheduling, and splitting a series to answer half of it would
be one guest rewriting everyone's meeting.

In the grid, an invitation nobody has answered is drawn with a dashed border,
and one that was declined is struck through. Delegation is not implemented:
`DELEGATED` needs a `DELEGATED-TO` and an invitation to the delegate, which is
sending a new invitation rather than answering this one.

Editing a saved event re-sends the guest list, so adding or removing someone
invites or uninvites them. `SEQUENCE` is advanced whenever the time or the guest
list changes, which is what tells the attendees' clients to accept the update.

### Cancelling versus deleting

A meeting you organised shows a **Cancel meeting** button beside Delete:

* **Cancel meeting** publishes the event with `STATUS:CANCELLED` and a raised
  `SEQUENCE`, which is what the server turns into the
  [RFC 5546](https://www.rfc-editor.org/rfc/rfc5546) `METHOD:CANCEL` it mails to
  the guests, and only then removes it. The raised `SEQUENCE` is what lets a
  guest's client match the cancellation to the invitation it already holds and
  supersede it, rather than deciding for itself what a vanished event means.
* **Delete** is unchanged: it removes the event resource and nothing more.

Cancelling asks for an optional **reason**, which travels to the guests in
`COMMENT` - the property RFC 5546 reserves for it - and is also prepended to
`DESCRIPTION`, because a good many clients render only the latter and a reason
nobody sees is no reason at all.

Only the organiser sees Cancel, and only on an event that actually has guests. A
guest who wants out is declining, not cancelling, and saying otherwise would
misinform everyone else invited.

One caveat worth knowing: on a server doing implicit scheduling, deleting an
event you organise *already* makes the server send a `CANCEL` of its own. So
Delete is not a way to call a meeting off quietly — the difference is that
Cancel states what was cancelled, and Delete leaves the guest's client to infer
it.

## More than one calendar

A CalDAV home has always held several collections — a default calendar, the
scheduling Inbox and Outbox, and whatever else the user or another client made.
This plugin read only the one its URL template named. The **📚 Calendars** panel
now lists them, remembers which are showing, colours the grid by the calendar
each event came out of, and makes new ones.

* **Showing and hiding** is kept in the browser, not on the server: it is a view
  preference rather than a property of the calendar, and the same account read
  from a phone may reasonably want a different answer.
* **Renaming and recolouring** an existing one is a `PROPPATCH`: the swatch on
  each row is the colour control, and double-clicking the name renames it. A
  `PROPPATCH` answers `207` whether or not it changed anything, so the
  per-property status is read rather than the response code assumed. What a
  calendar may *hold* is not offered — most servers fix that at creation, and a
  control that silently did nothing would be worse than no control.
* **Making one** issues `MKCALENDAR` with a display name, a colour, and the
  components it may hold — events, tasks or notes (`VEVENT`, `VTODO`,
  `VJOURNAL`). Most servers fix that set at creation, which is why it is asked
  for up front rather than assumed. The URL segment is derived from the name
  but is not the name: it has to survive being a path, and two calendars may
  well be called the same thing.
* **Deleting one** removes it and everything in it, and refuses on the calendar
  this account is configured to write to — deleting that would leave the plugin
  pointing at a collection that is not there.
* **Read-only calendars**, shared by somebody else, are drawn but not draggable.
  Offering to edit them would only produce a 403 later.
* Every write says which calendar it means, so an event edited from a grid
  showing four of them goes back to the one it came from.

A collection name reaching the server from the browser is held to a plain
filename — letters, digits, dot, dash, underscore, and not starting with a dot
or a dash. It is pasted into a URL, and a name with a slash or a dot pair in it
could address something outside the calendar home entirely. A name that fails
falls back to the configured calendar rather than being repaired into a
different one.

The scheduling Inbox and Outbox carry the `calendar` resourcetype too, and are
deliberately left out: drawing them would show every invitation twice.

## Tasks

A `VTODO` lives in the same collections, under the same account, as an event —
which is why this is not a plugin of its own. It is not the same shape though:
a task is a due date, a state and a proportion done, not a span in a grid. So
it gets a list rather than a place on the calendar, reached by the **✓** button
in the folder toolbar or the **✓ Tasks** button on the calendar screen.

Tasks are read from every collection whose `supported-calendar-component-set`
says it holds them — asking one that does not is a round trip for an empty
answer. If no calendar holds tasks yet, the list says so and points at the
Calendars panel, where one can be made.

* **Grouped by when they are due** — overdue, today, this week, later, no date,
  then dropped and done. Within a group they sort by due date and then by
  priority. A task with no priority sorts *after* one with any, because 0 in
  [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) means undefined, not
  lowest.
* **A task due on a date is due at the end of that day.** "Friday" is not
  overdue on Friday morning, which is what comparing against the start of the
  day would have said.
* **State and proportion are kept agreeing.** Ticking one off writes
  `STATUS:COMPLETED`, `PERCENT-COMPLETE:100` and a `COMPLETED` timestamp;
  setting it back to not-started clears all three; typing 100% marks it done,
  and any progress at all moves it out of not-started. A task that is finished
  but 40% done is a reading no two clients agree on.
* **Editing keeps what the dialog never asked about**, the same rule the event
  path follows and for the same reason.
* Moving a task between lists is not offered: that is a DAV `MOVE` rather than
  a property, and a control that appeared to do it while doing nothing would be
  worse than none.

## Repeating events

The **Repeats** row builds the rule out of named fields — frequency, interval,
weekdays, and an ending — and the server assembles the `RRULE` from those. It
never accepts a rule as a string: an `RRULE` is written straight into the
iCalendar body, so taking one from the browser would hand it a line to write
whatever it liked on. Every value is a fixed keyword or a bounded integer.

### This occurrence, or the whole series

Opening one occurrence of a repeating event shows a **Save changes to** row —
this occurrence, this and all following, or the whole series — and dragging,
resizing or deleting one asks the same question outright before anything is
written. They are not close enough to guess between: one cancelled stand-up and
a cancelled stand-up are different sentences. The row starts on this
occurrence, because that is the one that was clicked and the smallest of the
three.

* **This occurrence** writes a `RECURRENCE-ID` override — a second `VEVENT` in
  the same resource carrying the changed time or title and no `RRULE` — which
  is exactly what every other CalDAV client reads as "this one is different".
  Deleting one adds an `EXDATE` for that date instead of removing the resource,
  and drops any override that was standing on it.
* **This and all following** cuts the series in two. iCalendar has no way to
  say "different from here on" inside one rule — a series is one rule from one
  start — so the stored event is ended just before that occurrence with an
  `UNTIL`, and everything from it onwards becomes a second event with a new
  `UID` carrying the rest of the rule. Every calendar client does this the same
  way. A series counted in occurrences is re-counted across the cut, so the two
  halves together run exactly as long as the one did. Deleting under this scope
  writes only the `UNTIL`; cutting at the very first occurrence is the whole
  event, so that deletes the resource and edits the series in place.
* **The whole series** edits the master event, so the change reaches every
  occurrence. Dragging or resizing under this scope **shifts the series** by the
  delta rather than dropping it on the date you dragged to; without that,
  dragging next week's stand-up would have moved the entire series onto next
  week. Exclusions travel with it, so dates somebody deleted stay deleted rather
  than reappearing a day out. Overrides another client wrote are left where
  they are.

An event another client wrote in its own timezone keeps its `TZID` through any
of these, and an all-day series gets `DATE`-valued `RECURRENCE-ID`, `EXDATE` and
`UNTIL` to match its `DTSTART`. Retyping either as UTC would freeze it against
the next daylight-saving change — except `UNTIL` on a timed series, which RFC
5545 §3.3.10 requires to be UTC whatever zone the start is written in.

Splitting writes two resources, so it writes the new half first: if that fails
the stored series is still whole, and if truncating the original then fails the
new half is taken away again rather than left standing alongside the dates it
was meant to replace. Overrides after the cut are not carried across — they are
tied by `RECURRENCE-ID` to instants of the old rule, and being free of them is
the point of splitting.

### Dates it skips

A rule has no way to say "every Tuesday, except that one week in March".
iCalendar states those dates separately, as `EXDATE` on the master, and the
dialog shows them under **Dates it skips**: each one can be put back, and a
date picker adds another. Deleting a single occurrence writes the same thing,
so a date removed from the grid appears in this list.

The list is shown for every series, including one whose rule these controls
cannot express — skipping a date says nothing about the rule, so there is no
reason to withhold it — and it is disabled under **This occurrence only**,
where the exceptions being edited would belong to something else.

Which occurrence a date names is worked out on the server, from the rule, and
the nearest occurrence within a day of it is the one written. Two things need
that latitude. The dialog shows a date in the reader's zone while the series
may be kept in another, where a late-evening occurrence falls on the evening
before — this plugin stores events in UTC, so in Tunis that is any occurrence
after 23:00. And the time a date is picked *at* is only the time this
occurrence starts, which an override may have moved. A date the series does not
fall on at all is dropped rather than stored: an `EXDATE` that strikes out
nothing would come back as a skipped date that skips nothing.

Some rules are more than these controls can show — "the second Monday of the
month", "the last weekday", anything with `BYSETPOS` or `BYMONTHDAY`. Those are
read as *unknown*: the dropdown stays on "Does not repeat", and saving from the
dialog deliberately sends nothing about recurrence, so the stored rule survives
exactly as the other client wrote it. The alternative — showing a rule the
dialog can only half-represent — would rewrite the series the moment anything
else on it was edited.

New events are stored in UTC, so the weekdays picked for a weekly series are
translated to the weekday each one falls on *in UTC* before being written. A
00:30 Monday meeting in UTC+1 is Sunday 23:30 in UTC, and a rule saying `MO`
would repeat it a day late and add a stray occurrence on the start date.

## Configuration

Admin → Plugins → caldav:

| Setting | Example |
| --- | --- |
| CalDAV URL template | `https://dav.example.com/dav/calendars/user/{user}/Default/` |
| DAV default domain | `example.com` — addresses in this domain use the local part only, matching Cyrus `virtdomains: userid`; leave empty to always use the full address |
| Complete attendees from the whole directory | Off by default |
| Video meeting server URL | `https://meet.example.com` — empty hides the camera button |
| Geocoder URL (location picker) | `http://127.0.0.1:8091` — empty hides the globe button |
| Geocoder fallback URL | Empty (off) — set to e.g. `https://nominatim.openstreetmap.org` to consult when the first finds nothing |
| Tell the geocoder which language to answer in | Off by default |

Leave the template empty to derive the calendar URL from the CardDAV plugin
settings instead.

### Where a meeting is held

An event has two places, and they are separate fields because a hybrid meeting
genuinely has both:

* **📍 Location** — somewhere to walk to. Stored as `LOCATION`, plus `GEO` when
  the place was picked from the map rather than typed.
* **📹 Video call** — somewhere to click. Stored as `CONFERENCE` (RFC 7986), the
  property a conforming client reads to offer a Join button. When there is no
  physical location, the link is copied into `LOCATION` as well, because plenty
  of clients still render nothing else; the plugin folds that back out again
  when it reads the event, so the field does not fill up with its own URL.

**📹 mints a room.** The name is 80 bits from the server's CSPRNG, grouped into
fours so it can be read out loud. It is deliberately not derived from the event
title: on a public Jitsi deployment the room name *is* the access control, and a
title-derived room would let anyone who can guess what you call your meetings
walk into them. Replacing an existing link asks first, since guests may already
be holding the old one.

**🌐 finds a place.** It searches the configured geocoder and fills in the
address and coordinates. Note what it is not: an embedded map. SnappyMail serves
this page under a CSP of roughly `script-src 'self'`, which blocks an
OpenStreetMap or Google iframe and any CDN-loaded map library, and a real popup
window on `openstreetmap.org` cannot hand a selection back across origins. The
lookup is therefore proxied through PHP — which also keeps the user's IP out of
the geocoder's logs, and lets the plugin send the identifying `User-Agent`
Nominatim's usage policy asks for and a browser will not let it set. Read that
policy before pointing a busy installation at the public instance; run your own
Nominatim if in doubt. Either field can always be typed by hand.

Two further settings, **both off until an admin turns them on**, because each
sends something to a server the deployment may not own:

* **Geocoder fallback URL** — a self-hosted geocoder is normally a
  single-country extract, so a meeting abroad finds nothing at all: *Eiffel
  Tower* against a Tunisia import returns nothing, and *Paris* returns a street
  in Fouchana. A fallback is consulted only when the first found nothing, so the
  common case stays local and fast, and the picker says when an answer came from
  further afield. Leaving it empty means a search your own geocoder cannot
  answer simply finds nothing, and nothing leaves your server.
* **Tell the geocoder which language to answer in** — place names otherwise come
  back as the locals write them, `شارع الحبيب بورقيبة` rather than `Avenue Habib
  Bourguiba`. Turning this on passes the browser's `Accept-Language` through, so
  places are named in a language the user reads wherever OpenStreetMap has one.
  Only the shape RFC 9110 describes is forwarded, and only its first 200 bytes.
  Harmless pointed at your own geocoder; one more thing told about your users
  pointed at somebody else's.

### Attendee completion and who can be found

**Complete attendees from the whole directory** decides what the Invite field
will offer:

* **On (default)** — every source SnappyMail has, including an LDAP corporate
  directory if a suggestions plugin provides one. An organiser can invite any
  colleague by typing part of their name.
* **Off** — the organiser's own address book only. They are offered nobody they
  did not already have a contact for.

The default assumes what a correctly built deployment provides: **the configured
directory belongs to one organisation**. A hosting provider should give each
tenant its own directory root rather than pointing every tenant at a shared one,
in which case completion only ever reaches that tenant's own people.

Turn it **off** where that does not hold — where one directory genuinely is
shared by unrelated tenants — because the suggestions chain is global, and
completion would then let any user enumerate the others' addresses.

Note that SnappyMail's LDAP suggestions plugin is configured per instance, not
per domain: one `base_dn` serves every account on that instance. Giving tenants
separate roots therefore means separate SnappyMail instances, or a suggestions
plugin that scopes the search by the account's domain.

It changes only what is *offered*. An organiser can always type an address by
hand, and whether the invitation is delivered remains the CalDAV server's
decision.

## Authors

* Original plugin — **Mailbux** ([mailbux.com](https://mailbux.com)), see `LICENSE`
* Fork maintainer — **Fathi Ben Nasr** <fbennasr@convergent.tn>,
  [Convergent Cloud Computing](https://www.convergent.tn)

## Credits and licence

Original plugin © 2025 Mailbux — see `LICENSE`. This fork keeps that licence and
exists only to make the plugin work against standards-compliant CalDAV servers.

---

# Original plugin README

Everything below is the upstream **Mailbux CalDAV Auto** README, kept
verbatim. This fork does not change the plugin's origin or its authors'
presentation of their service.

## ⚠️ Note

> **Important:**  
> This plugin **must be installed together with the [SnappyMail CardDAV Plugin](https://github.com/mailwish/SnappyMail-CardDAV-Plugin)** for full synchronization support.  
> The CalDAV plugin provides shared logic used by both calendar and contact synchronization modules.



# 📅 SnappyMail CalDAV Plugin

A lightweight and modern **CalDAV integration** for [SnappyMail](https://snappymail.eu), proudly created by [**Mailbux.com**](https://mailbux.com) — the all-in-one **free business email hosting** solution.

![SnappyMail CalDAV Plugin](https://mailwish.com/wp-content/uploads/2025/04/logo240.png)
<img width="1713" height="1151" alt="Screenshot 2025-11-12 1613s53" src="https://github.com/user-attachments/assets/3ff28dd5-e07f-4b68-871e-039b93804d72" />
<img width="1712" height="1151" alt="Screenshot 2025-11-12 161339" src="https://github.com/user-attachments/assets/bb626f5d-e568-445c-bd90-b3664f9de5ab" />

---

## ✨ Description

The **SnappyMail CalDAV Plugin** adds full calendar synchronization to your SnappyMail webmail.  
Easily view, manage, and sync events directly from your Mailbux account or any CalDAV-compatible server.

Built for performance, privacy, and simplicity — your calendar stays perfectly synced across desktop, mobile, and web.

---

## 🚀 Features

- 📆 View and manage CalDAV calendars inside SnappyMail  
- 🔄 Two-way synchronization with any CalDAV server  
- 🔒 Secure encrypted connections  
- ⚙️ Simple configuration in SnappyMail settings  
- 📨 Fully compatible with [Mailbux.com](https://mailbux.com) accounts  

---

## 🛠️ Installation

1. Download or clone this repository.  
2. Copy the plugin folder into your SnappyMail `/plugins/` directory.  
3. Enable the plugin from the SnappyMail **Admin Panel**.  
4. Configure your CalDAV credentials (Mailbux or another CalDAV server).  

> ✅ Done! Your SnappyMail is now calendar-enabled.

---

## 💡 About Mailbux

[**Mailbux.com**](https://mailbux.com) provides **unlimited free business email hosting** — no hidden fees, no trials, just professional email at your own domain.

### 🌟 Why Choose Mailbux

| Feature | Mailbux.com | Google Workspace | Microsoft 365 |
|----------|--------------|------------------|----------------|
| Price | **Free** | $6/user/mo | $6/user/mo |
| Email Accounts | **Unlimited** | 1 per user | 1 per user |
| Domains | **Unlimited** | Limited | Limited |
| Custom Branding | ✅ | ❌ | ❌ |
| Calendar / Drive / Docs | ✅ | ✅ | ✅ |
| SMTP Relay for Apps | ✅ | ✅ | ✅ |

### Highlights
- 🌍 **Unlimited mailboxes & domains**  
- 💼 **Modern Webmail** with CalDAV, CardDAV, WebDAV support  
- 🔐 **Private & secure** (no ads, no data selling)  
- ⚙️ **Full admin control** with API & dashboard  
- 🧩 **White-label rebranding** — use your own brand name  
- 💌 **SMTP relay** for WordPress, Laravel, and apps  

Create addresses like:
you@yourdomain.com
info@yourdomain.com
support@yourdomain.com


> 💬 “Finally, a truly free and professional email solution.” — *Mailbux User*

---

## 📷 Screenshots

*(Optional: Add plugin or Mailbux calendar screenshots here)*

---

## 🌐 Learn More

👉 [**Mailbux.com**](https://mailbux.com) — Create your **free business email account** today.  
Unlimited mailboxes. Custom domains. Rebrandable. 100% free.

---

## 🧑‍💻 Author

**Developed by [Mailbux.com](https://mailbux.com)**  
📧 Support: [support@mailbux.com](mailto:support@mailbux.com)

---

© 2025 Mailbux.com — Powered by [Mailbux](https://mailbux.com)
