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

Replies update the attendee list as the participants answer.

Editing a saved event re-sends the guest list, so adding or removing someone
invites or uninvites them. `SEQUENCE` is advanced whenever the time or the guest
list changes, which is what tells the attendees' clients to accept the update.

## Configuration

Admin → Plugins → caldav:

| Setting | Example |
| --- | --- |
| CalDAV URL template | `https://dav.example.com/dav/calendars/user/{user}/Default/` |
| DAV default domain | `example.com` — addresses in this domain use the local part only, matching Cyrus `virtdomains: userid`; leave empty to always use the full address |
| Complete attendees from the whole directory | Off by default |

Leave the template empty to derive the calendar URL from the CardDAV plugin
settings instead.

### Attendee completion and who can be found

**Complete attendees from the whole directory** decides what the Invite field
will offer:

* **Off (default)** — the organiser's own address book only. They are offered
  nobody they did not already have a contact for.
* **On** — every source SnappyMail has, including an LDAP corporate directory if
  a suggestions plugin provides one. An organiser can invite any colleague by
  typing part of their name.

Which is right depends on who shares the server:

* A **single organisation** normally wants this **on**. The directory exists so
  staff can find each other.
* A **hosting provider or ISP** must leave it **off**. The suggestions chain is
  global, so with a directory source installed, any customer could type two
  letters and enumerate the addresses of unrelated customers on the same server.

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
