// Mailbux CalDAV Auto - Full Calendar with FullCalendar library
(() => {
'use strict';


let calendar = null;
let calendarEvents = [];

if (window.rl && rl.route) {
	rl.route.on(/^calendar/, () => setTimeout(showCalendar, 100));
	// Hide calendar on any other route
	rl.route.on(/^(?!calendar)/, () => hideCalendar());
}

window.addEventListener('hashchange', () => {
	if (window.location.hash.includes('calendar')) {
		setTimeout(showCalendar, 100);
	} else {
		hideCalendar();
	}
});

setTimeout(() => { if (window.location.hash.includes('calendar')) showCalendar(); }, 1000);

function showCalendar() {
	
	// Hide all main content areas
	document.querySelectorAll('#rl-left, #rl-right, #rl-content').forEach(el => {
		if (el) el.style.display = 'none';
	});
	
	// Find or create calendar in body
	let cal = document.getElementById('mailbux-calendar');
	if (!cal) {
		cal = document.createElement('div');
		cal.id = 'mailbux-calendar';
		cal.style.cssText = 'display: block; position: fixed; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; background: var(--cal-bg-secondary, #f8f9fa); z-index: 10000;';
cal.innerHTML = `
<style>
:root {
	--cal-bg-primary: #ffffff;
	--cal-bg-secondary: #f8f9fa;
	--cal-bg-tertiary: #f5f5f5;
	--cal-text-primary: #1a1a1a;
	--cal-text-secondary: #666666;
	--cal-text-tertiary: #999999;
	--cal-border: #e0e0e0;
	--cal-accent: #00639a;
	--cal-accent-hover: #0082c9;
	--cal-accent-light: rgba(0, 99, 154, 0.1);
	--cal-header-bg: linear-gradient(135deg, #00639a 0%, #0082c9 100%);
	--cal-event-bg: #00639a;
	--cal-event-border: #0082c9;
	--cal-event-text: #ffffff;
	--cal-shadow: rgba(0, 0, 0, 0.08);
	--cal-shadow-hover: rgba(0, 0, 0, 0.12);
	--cal-modal-overlay: rgba(0, 0, 0, 0.5);
	--cal-danger: #e9322d;
	--cal-danger-hover: #ed5a56;
}

@media (prefers-color-scheme: dark) {
	:root {
		--cal-bg-primary: #171717;
		--cal-bg-secondary: #212121;
		--cal-bg-tertiary: #292929;
		--cal-text-primary: #D8D8D8;
		--cal-text-secondary: #a5a5a5;
		--cal-text-tertiary: #8c8c8c;
		--cal-border: #3b3b3b;
		--cal-accent: #0082c9;
		--cal-accent-hover: #3282ae;
		--cal-accent-light: rgba(0, 130, 201, 0.2);
		--cal-header-bg: linear-gradient(135deg, #00639a 0%, #0082c9 100%);
		--cal-event-bg: #0082c9;
		--cal-event-border: #3282ae;
		--cal-event-text: #ffffff;
		--cal-shadow: rgba(0, 0, 0, 0.3);
		--cal-shadow-hover: rgba(0, 0, 0, 0.4);
		--cal-modal-overlay: rgba(0, 0, 0, 0.7);
		--cal-danger: #e9322d;
		--cal-danger-hover: #ed5a56;
	}
}

#mailbux-calendar * { box-sizing: border-box; }
.cal-wrapper { display: flex; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--cal-bg-secondary); }
.cal-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.cal-header { background: var(--cal-header-bg); color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px var(--cal-shadow); }
.cal-header-left { display: flex; align-items: center; gap: 15px; }
.cal-back-btn { background: rgba(255, 255, 255, 0.2); color: white; border: 1px solid rgba(255, 255, 255, 0.3); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 18px; text-decoration: none; transition: all 0.2s; display: flex; align-items: center; }
.cal-back-btn:hover { background: rgba(255, 255, 255, 0.3); transform: translateY(-1px); }
.cal-title { display: flex; align-items: center; gap: 12px; margin: 0; font-size: 24px; font-weight: 300; color: white; }
.cal-add-btn { background: rgba(255, 255, 255, 0.2); color: white; border: 1px solid rgba(255, 255, 255, 0.3); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: 500; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
.cal-add-btn:hover { background: rgba(255, 255, 255, 0.3); transform: translateY(-1px); }
.cal-header-right { display: flex; align-items: center; gap: 10px; }
.cal-content { flex: 1; padding: 20px; overflow: auto; background: var(--cal-bg-secondary); }
#fc-calendar { background: var(--cal-bg-primary); border-radius: 12px; box-shadow: 0 2px 8px var(--cal-shadow); height: calc(100% - 20px); }

/* FullCalendar overrides */
.fc { height: 100% !important; color: var(--cal-text-primary) !important; }
.fc-header-toolbar { padding: 15px 20px; background: var(--cal-bg-tertiary) !important; border-bottom: 1px solid var(--cal-border) !important; border-radius: 12px 12px 0 0; }
.fc-button { border-radius: 6px !important; font-weight: 500 !important; text-transform: capitalize !important; background: var(--cal-bg-tertiary) !important; border-color: var(--cal-border) !important; color: var(--cal-text-primary) !important; }
.fc-button:hover { background: var(--cal-accent-light) !important; border-color: var(--cal-accent) !important; }
.fc-button-primary { background: var(--cal-accent) !important; border-color: var(--cal-accent) !important; color: white !important; }
.fc-button-primary:hover { background: var(--cal-accent-hover) !important; border-color: var(--cal-accent-hover) !important; }
.fc-button-active { background: var(--cal-accent) !important; border-color: var(--cal-accent) !important; color: white !important; }
.fc-event { border-radius: 6px; font-size: 13px; border: none !important; }
.fc-event.modern-event { background-color: var(--cal-event-bg) !important; border-color: var(--cal-event-border) !important; color: var(--cal-event-text) !important; }
.fc-daygrid-day-number { padding: 6px; color: var(--cal-text-primary) !important; }
.fc-daygrid-day-top { color: var(--cal-text-primary) !important; }
.fc-timegrid-slot { border-color: var(--cal-border) !important; }
.fc-timegrid-slot-label { color: var(--cal-text-secondary) !important; }
.fc-list-day-cushion { background: var(--cal-bg-tertiary) !important; color: var(--cal-text-primary) !important; }
.fc-list-event { color: var(--cal-text-primary) !important; }
.fc-list-event:hover td { background: var(--cal-bg-tertiary) !important; }
.fc-col-header-cell { background: var(--cal-bg-tertiary) !important; border-color: var(--cal-border) !important; }
.fc-col-header-cell-cushion { color: var(--cal-text-primary) !important; }
.fc-daygrid-day { background: var(--cal-bg-primary) !important; border-color: var(--cal-border) !important; }
.fc-daygrid-day.fc-day-today { background: var(--cal-accent-light) !important; }
.fc-scrollgrid { border-color: var(--cal-border) !important; }
.sidebar-section { margin-bottom: 25px; }
.sidebar-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--cal-text-tertiary); margin-bottom: 12px; letter-spacing: 0.5px; display: flex; justify-content: space-between; align-items: center; }
.sidebar-calendars { list-style: none; padding: 0; margin: 0; }
.sidebar-calendars li { padding: 10px 12px; margin-bottom: 6px; background: var(--cal-bg-primary); border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; border: 1px solid var(--cal-border); transition: all 0.2s; color: var(--cal-text-primary); }
.sidebar-calendars li:hover { background: var(--cal-bg-tertiary); border-color: var(--cal-accent); }
.cal-color { width: 12px; height: 12px; border-radius: 3px; }
.sidebar-btn { width: 100%; padding: 12px; background: var(--cal-header-bg); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s; }
.sidebar-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px var(--cal-shadow-hover); }
.sidebar-icon-btn { background: var(--cal-accent); color: white; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.sidebar-icon-btn:hover { background: var(--cal-accent-hover); transform: rotate(180deg); }

/* Responsive */
@media (max-width: 768px) {
	.cal-sidebar { position: fixed; left: 0; top: 0; bottom: 0; z-index: 999; transform: translateX(-100%); box-shadow: 2px 0 8px var(--cal-shadow); }
	.cal-sidebar.open { transform: translateX(0); }
	.cal-sidebar-toggle { display: block; }
	.cal-title span:last-child { display: none; }
}

/* Event Modal */
.event-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--cal-modal-overlay); z-index: 10001; display: none; align-items: center; justify-content: center; }
.event-modal-overlay.show { display: flex; }
.event-modal { background: var(--cal-bg-primary); border-radius: 12px; box-shadow: 0 8px 32px var(--cal-shadow-hover); width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto; color: var(--cal-text-primary); }
.event-modal-header { background: var(--cal-header-bg); color: white; padding: 20px; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; align-items: center; }
.event-modal-title { margin: 0; font-size: 20px; font-weight: 600; color: white; }
.event-modal-close { background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background 0.2s; }
.event-modal-close:hover { background: rgba(255,255,255,0.2); }
.event-modal-body { padding: 20px; background: var(--cal-bg-primary); }
.event-form-group { margin-bottom: 16px; }
.event-form-label { display: block; font-size: 12px; font-weight: 600; color: var(--cal-text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.event-form-input, .event-form-textarea, .event-form-select { width: 100%; padding: 10px 12px; border: 1px solid var(--cal-border); border-radius: 6px; font-size: 14px; transition: border-color 0.2s; background: var(--cal-bg-primary); color: var(--cal-text-primary); }
.event-form-input:focus, .event-form-textarea:focus, .event-form-select:focus { outline: none; border-color: var(--cal-accent); }
.event-form-textarea { min-height: 80px; resize: vertical; font-family: inherit; }
.event-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.event-form-checkbox { display: flex; align-items: center; gap: 8px; color: var(--cal-text-primary); }
.event-form-checkbox input { width: auto; }
.event-modal-footer { padding: 16px 20px; border-top: 1px solid var(--cal-border); display: flex; gap: 10px; justify-content: flex-end; background: var(--cal-bg-primary); }
.event-modal-btn { padding: 10px 20px; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.event-modal-btn-primary { background: var(--cal-header-bg); color: white; }
.event-modal-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 12px var(--cal-shadow-hover); }
.event-modal-btn-secondary { background: var(--cal-bg-tertiary); color: var(--cal-text-primary); }
.event-modal-btn-secondary:hover { background: var(--cal-bg-secondary); }
.event-modal-btn-danger { background: var(--cal-danger); color: white; margin-right: auto; }
.event-modal-btn-danger:hover { background: var(--cal-danger-hover); }
.event-organizer-value { padding: 8px 0; opacity: .85; }
.event-modal-btn-warning { background: #c77700; color: white; }
.event-modal-btn-warning:hover { background: #a66300; }

/* A field with an action hanging off it: location + map, video call + new room */
.event-field-row { display: flex; gap: 8px; align-items: stretch; }
.event-field-row .event-form-input { flex: 1 1 auto; min-width: 0; }
.event-icon-btn { flex: 0 0 auto; width: 42px; border: 1px solid var(--cal-border); border-radius: 6px; background: var(--cal-bg-tertiary); color: var(--cal-text-primary); font-size: 18px; line-height: 1; cursor: pointer; transition: all 0.2s; }
.event-icon-btn:hover { background: var(--cal-accent); border-color: var(--cal-accent); transform: translateY(-1px); }
.event-icon-btn:disabled { opacity: .5; cursor: default; transform: none; }
.event-field-hint { display: block; margin-top: 6px; font-size: 12px; opacity: .75; }
.event-field-hint a { color: var(--cal-accent); }

/* Recurrence */
.event-repeat-detail { border-left: 2px solid var(--cal-border); padding-left: 12px; }
.event-repeat-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; font-size: 13px; }
.event-repeat-row:last-of-type { margin-bottom: 0; }
.event-repeat-num { width: 5em; flex: 0 0 auto; }
.event-repeat-unit { width: auto; flex: 0 0 auto; }
.event-form-select:disabled, .event-form-input:disabled { opacity: .5; cursor: not-allowed; }
.event-repeat-days label:has(input:disabled) { opacity: .5; cursor: not-allowed; }
.event-modal-narrow { max-width: 460px; }
.event-repeat-end { width: auto; flex: 0 0 auto; }
.event-repeat-until { width: auto; flex: 0 0 auto; }
.event-repeat-days { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.event-repeat-days label { display: inline-flex; align-items: center; gap: 4px; padding: 5px 9px; border: 1px solid var(--cal-border); border-radius: 999px; font-size: 12px; cursor: pointer; user-select: none; }
.event-repeat-days label:hover { border-color: var(--cal-accent); }
.event-repeat-days input { margin: 0; }
.event-repeat-days label:has(input:checked) { background: var(--cal-accent); border-color: var(--cal-accent); color: #fff; }

/* Place picker */
.place-search-row { display: flex; gap: 8px; }
.place-results { margin-top: 12px; max-height: 320px; overflow-y: auto; border: 1px solid var(--cal-border); border-radius: 6px; }
.place-results:empty { display: none; }
.place-result { padding: 10px 12px; cursor: pointer; font-size: 13px; border-bottom: 1px solid var(--cal-border); }
.place-result:last-child { border-bottom: none; }
.place-result:hover, .place-result.is-active { background: var(--cal-bg-tertiary); }
.place-status { margin-top: 12px; font-size: 13px; opacity: .75; }
</style>
<div class="cal-wrapper">
<div class="cal-main">
<div class="cal-header">
<div class="cal-header-left">
<a href="#/mailbox/INBOX" class="cal-back-btn" title="Back to Inbox">← Back</a>
<h1 class="cal-title"><span style="font-size:32px">📅</span><span>Calendar</span></h1>
<button class="cal-add-btn" id="new-event-btn"><span style="font-size:20px">+</span> Add</button>
</div>
<div class="cal-header-right" id="cal-account-switcher"></div>
</div>
<div class="cal-content">
			<div id="fc-calendar"></div>
		</div>
	</div>
</div>

<!-- Event Modal -->
<div class="event-modal-overlay" id="event-modal">
	<div class="event-modal">
		<div class="event-modal-header">
			<h2 class="event-modal-title" id="event-modal-title">New Event</h2>
			<button class="event-modal-close">×</button>
		</div>
		<div class="event-modal-body">
			<form id="event-form">
				<div class="event-form-group">
					<label class="event-form-label">Event Title *</label>
					<input type="text" class="event-form-input" id="event-title" placeholder="Enter event title" required>
				</div>
				<div class="event-form-row">
					<div class="event-form-group">
						<label class="event-form-label">Start Date *</label>
						<input type="datetime-local" class="event-form-input" id="event-start" required>
					</div>
					<div class="event-form-group">
						<label class="event-form-label">End Date *</label>
						<input type="datetime-local" class="event-form-input" id="event-end" required>
					</div>
				</div>
				<div class="event-form-group">
					<label class="event-form-checkbox">
						<input type="checkbox" id="event-allday">
						<span>All-day event</span>
					</label>
				</div>
				<div class="event-form-group">
					<label class="event-form-label" for="event-repeat">🔁 Repeats</label>
					<select class="event-form-select" id="event-repeat">
						<option value="">Does not repeat</option>
						<option value="DAILY">Daily</option>
						<option value="WEEKLY">Weekly</option>
						<option value="WEEKDAYS">Every weekday</option>
						<option value="BIWEEKLY">Bi-weekly</option>
						<option value="MONTHLY">Monthly</option>
						<option value="YEARLY">Yearly</option>
						<option value="CUSTOM">Custom…</option>
					</select>
				</div>
				<div class="event-form-group" id="event-scope-row" style="display:none;">
					<label class="event-form-label" for="event-scope">Save changes to</label>
					<select class="event-form-select" id="event-scope">
						<option value="occurrence">This occurrence only</option>
						<option value="series">The whole series</option>
					</select>
					<small class="event-field-hint" id="event-scope-hint"></small>
				</div>
				<div class="event-form-group event-repeat-detail" id="event-repeat-detail" style="display:none;">
					<div class="event-repeat-row" id="event-repeat-every" style="display:none;">
						<span>Every</span>
						<input type="number" class="event-form-input event-repeat-num" id="event-repeat-interval"
							min="1" max="365" value="1" aria-label="Repeat every">
						<select class="event-form-select event-repeat-unit" id="event-repeat-unit" aria-label="Repeat unit">
							<option value="DAILY">days</option>
							<option value="WEEKLY" selected>weeks</option>
							<option value="MONTHLY">months</option>
							<option value="YEARLY">years</option>
						</select>
					</div>
					<div class="event-repeat-days" id="event-repeat-days" style="display:none;">
						<label><input type="checkbox" value="MO"><span>Mon</span></label>
						<label><input type="checkbox" value="TU"><span>Tue</span></label>
						<label><input type="checkbox" value="WE"><span>Wed</span></label>
						<label><input type="checkbox" value="TH"><span>Thu</span></label>
						<label><input type="checkbox" value="FR"><span>Fri</span></label>
						<label><input type="checkbox" value="SA"><span>Sat</span></label>
						<label><input type="checkbox" value="SU"><span>Sun</span></label>
					</div>
					<div class="event-repeat-row">
						<span>Ends</span>
						<select class="event-form-select event-repeat-end" id="event-repeat-end">
							<option value="">Never</option>
							<option value="count">After</option>
							<option value="until">On date</option>
						</select>
						<input type="number" class="event-form-input event-repeat-num" id="event-repeat-count"
							min="1" max="1000" value="10" style="display:none;" aria-label="Number of occurrences">
						<span id="event-repeat-count-unit" style="display:none;">times</span>
						<input type="date" class="event-form-input event-repeat-until" id="event-repeat-until"
							style="display:none;" aria-label="Repeat until">
					</div>
					<small class="event-field-hint" id="event-repeat-hint"></small>
				</div>
				<div class="event-form-group">
					<label class="event-form-label" for="event-location">📍 Location</label>
					<div class="event-field-row">
						<input type="text" class="event-form-input" id="event-location" placeholder="Where to go - leave empty if it is online only">
						<button type="button" class="event-icon-btn" id="event-location-pick-btn"
							title="Find this place on the map" aria-label="Find this place on the map"
							style="display:none;">🌐</button>
					</div>
					<small class="event-field-hint" id="event-location-hint" style="display:none;"></small>
				</div>
				<div class="event-form-group">
					<label class="event-form-label" for="event-conference">📹 Video call</label>
					<div class="event-field-row">
						<input type="url" class="event-form-input" id="event-conference" placeholder="https://... - or click the camera for a new room">
						<button type="button" class="event-icon-btn" id="event-conference-btn"
							title="Create a video meeting room" aria-label="Create a video meeting room"
							style="display:none;">📹</button>
					</div>
					<small class="event-field-hint" id="event-conference-hint" style="display:none;"></small>
				</div>
				<div class="event-form-group" id="event-organizer-row" style="display:none;">
					<label class="event-form-label">Organizer</label>
					<div class="event-organizer-value" id="event-organizer"></div>
				</div>
				<div class="event-form-group">
					<label class="event-form-label">Invite</label>
					<input type="text" class="event-form-input" id="event-attendees" placeholder="email@example.com, another@example.com">
					<small style="opacity:.7">Invitations are sent by the calendar server once the event is saved.</small>
				</div>
				<div class="event-form-group">
					<label class="event-form-label">Description</label>
					<textarea class="event-form-textarea" id="event-description" placeholder="Add description"></textarea>
				</div>
				<div class="event-form-group">
					<label class="event-form-label">Email Reminder</label>
					<select class="event-form-select" id="event-reminder">
						<option value="">No reminder</option>
						<option value="0">At time of event</option>
						<option value="5">5 minutes before</option>
						<option value="15">15 minutes before</option>
						<option value="30">30 minutes before</option>
						<option value="60">1 hour before</option>
						<option value="120">2 hours before</option>
						<option value="1440">1 day before</option>
					</select>
				</div>
			</form>
		</div>
		<div class="event-modal-footer">
			<button class="event-modal-btn event-modal-btn-danger" id="event-delete-btn" style="display:none;">Delete</button>
			<button class="event-modal-btn event-modal-btn-warning" id="event-cancel-meeting-btn" style="display:none;" title="Tell the guests it is off, then remove it">Cancel meeting</button>
			<button class="event-modal-btn event-modal-btn-secondary">Cancel</button>
			<button class="event-modal-btn event-modal-btn-primary" id="event-save-btn">Save Event</button>
		</div>
	</div>
</div>

<div class="event-modal-overlay" id="scope-modal">
	<div class="event-modal event-modal-narrow">
		<div class="event-modal-header">
			<h3 class="event-modal-title" id="scope-modal-title">Repeating event</h3>
		</div>
		<div class="event-modal-body">
			<p id="scope-modal-intro"></p>
		</div>
		<div class="event-modal-footer">
			<button class="event-modal-btn event-modal-btn-secondary" id="scope-modal-cancel">Cancel</button>
			<button class="event-modal-btn event-modal-btn-primary" id="scope-modal-occurrence">This occurrence</button>
			<button class="event-modal-btn event-modal-btn-primary" id="scope-modal-series">The whole series</button>
		</div>
	</div>
</div>

<div class="event-modal-overlay" id="place-picker-modal">
	<div class="event-modal">
		<div class="event-modal-header">
			<h3 class="event-modal-title">🌐 Find a place</h3>
			<button class="event-modal-close" id="place-picker-close">×</button>
		</div>
		<div class="event-modal-body">
			<div class="place-search-row">
				<input type="text" class="event-form-input" id="place-query"
					placeholder="Street, place or town" autocomplete="off">
				<button type="button" class="event-modal-btn event-modal-btn-primary" id="place-search-btn">Search</button>
			</div>
			<div class="place-status" id="place-status"></div>
			<div class="place-results" id="place-results"></div>
		</div>
		<div class="event-modal-footer">
			<button class="event-modal-btn event-modal-btn-secondary" id="place-picker-cancel">Cancel</button>
		</div>
	</div>
</div>

<div class="event-modal-overlay" id="cancel-reason-modal">
	<div class="event-modal">
		<div class="event-modal-header">
			<h3 class="event-modal-title">Cancel meeting</h3>
		</div>
		<div class="event-modal-body">
			<p id="cancel-reason-intro"></p>
			<div class="event-form-group">
				<label class="event-form-label" for="cancel-reason-text">Reason (optional)</label>
				<textarea class="event-form-textarea" id="cancel-reason-text" rows="3"
					placeholder="Why is it off? The guests will see this."></textarea>
			</div>
		</div>
		<div class="event-modal-footer">
			<button class="event-modal-btn event-modal-btn-secondary" id="cancel-reason-back">Back</button>
			<button class="event-modal-btn event-modal-btn-warning" id="cancel-reason-confirm">Cancel meeting</button>
		</div>
	</div>
</div>
`;
		document.body.appendChild(cal);

	// Move account switcher to calendar (will restore on hide)
	setTimeout(() => {
		const originalDropdown = document.querySelector('#V-SystemDropDown');
		const calHeader = document.querySelector('#mailbux-calendar .cal-header-right');
		
		if (originalDropdown && calHeader) {
			// Store original parent to restore later
			if (!originalDropdown.dataset.originalParent) {
				originalDropdown.dataset.originalParent = 'true';
				originalDropdown.originalParentElement = originalDropdown.parentElement;
			}
			originalDropdown.style.cssText = 'display: inline-block; margin-left: 15px;';
			calHeader.appendChild(originalDropdown);
		}
	}, 100);

	// Add event listeners
	setTimeout(() => {
		const newEventBtn = document.getElementById('new-event-btn');
		if (newEventBtn) newEventBtn.addEventListener('click', () => openEventModal());
		
		// Modal save button
		const saveBtn = document.getElementById('event-save-btn');
		if (saveBtn) saveBtn.addEventListener('click', saveEventFromModal);
		
		// Modal delete button
		const deleteBtn = document.getElementById('event-delete-btn');
		if (deleteBtn) deleteBtn.addEventListener('click', deleteEventFromModal);

		// Mint a room, and find a place. Both buttons stay hidden until the
		// server says the deployment has somewhere to point them at.
		const confBtn = document.getElementById('event-conference-btn');
		if (confBtn) confBtn.addEventListener('click', mintConferenceUrl);

		const placeBtn = document.getElementById('event-location-pick-btn');
		if (placeBtn) placeBtn.addEventListener('click', openPlacePicker);

		const locInput = document.getElementById('event-location');
		if (locInput) locInput.addEventListener('input', () => {
			// Typed by hand, so the coordinates the picker left behind no longer
			// describe it. Better no pin than a pin on the wrong building.
			currentEventGeo = '';
			refreshFieldHints();
		});
		const confInput = document.getElementById('event-conference');
		if (confInput) confInput.addEventListener('input', refreshFieldHints);

		const placeSearchBtn = document.getElementById('place-search-btn');
		if (placeSearchBtn) placeSearchBtn.addEventListener('click', runPlaceSearch);
		const placeQuery = document.getElementById('place-query');
		if (placeQuery) placeQuery.addEventListener('keydown', (e) => {
			if ('Enter' === e.key) { e.preventDefault(); runPlaceSearch(); }
		});
		['place-picker-close', 'place-picker-cancel'].forEach(id => {
			const el = document.getElementById(id);
			if (el) el.addEventListener('click', closePlacePicker);
		});
		const placeOverlay = document.getElementById('place-picker-modal');
		if (placeOverlay) placeOverlay.addEventListener('click', (e) => {
			if (e.target === placeOverlay) closePlacePicker();
		});

		// Cancelling a meeting is not deleting it: the guests have to be told.
		const cancelMeetingBtn = document.getElementById('event-cancel-meeting-btn');
		if (cancelMeetingBtn) cancelMeetingBtn.addEventListener('click', cancelMeetingFromModal);

		const reasonBack = document.getElementById('cancel-reason-back');
		if (reasonBack) reasonBack.addEventListener('click', () => {
			document.getElementById('cancel-reason-modal').classList.remove('show');
		});
		const reasonConfirm = document.getElementById('cancel-reason-confirm');
		if (reasonConfirm) reasonConfirm.addEventListener('click', sendCancellation);
		
		// All-day checkbox
		const allDayCheck = document.getElementById('event-allday');
		if (allDayCheck) allDayCheck.addEventListener('change', (e) => {
			toggleTimeInputs(e.target.checked);
		});

		// Repeat controls: every one of them changes what the rule will say,
		// so every one of them redraws the rest of the row and the summary.
		['', 'unit', 'interval', 'end', 'count', 'until'].forEach(id => {
			const el = repeatEl(id);
			if (el) {
				el.addEventListener('change', refreshRepeatUi);
				el.addEventListener('input', refreshRepeatUi);
			}
		});
		repeatDayBoxes().forEach(box => box.addEventListener('change', refreshRepeatUi));

		// One occurrence or the series: in the dialog as a choice, and in the
		// grid as a question asked when something is dragged or deleted.
		const scopeSel = document.getElementById('event-scope');
		if (scopeSel) scopeSel.addEventListener('change', refreshScopeUi);
		const scopeButtons = {
			'scope-modal-occurrence': 'occurrence',
			'scope-modal-series': 'series',
			'scope-modal-cancel': null
		};
		Object.keys(scopeButtons).forEach(id => {
			const el = document.getElementById(id);
			if (el) el.addEventListener('click', () => resolveScope(scopeButtons[id]));
		});

		// Modal close buttons (override inline onclick)
		const closeBtn = document.querySelector('.event-modal-close');
		if (closeBtn) {
			closeBtn.addEventListener('click', () => {
				document.getElementById('event-modal').classList.remove('show');
			});
		}

		const cancelBtn = document.querySelector('.event-modal-btn-secondary');
		if (cancelBtn) {
			cancelBtn.addEventListener('click', () => {
				document.getElementById('event-modal').classList.remove('show');
			});
		}

		// Also close modal when clicking overlay
		const modalOverlay = document.getElementById('event-modal');
		if (modalOverlay) {
			modalOverlay.addEventListener('click', (e) => {
				if (e.target === modalOverlay) {
					modalOverlay.classList.remove('show');
				}
			});
		}
	}, 100);

	loadFullCalendar();
} else {
	cal.style.display = 'block';
	if (calendar) calendar.refetchEvents();
	
	// Move account switcher again when showing existing calendar
	setTimeout(() => {
		const originalDropdown = document.querySelector('#V-SystemDropDown');
		const calHeader = document.querySelector('#mailbux-calendar .cal-header-right');
		
		if (originalDropdown && calHeader && !calHeader.contains(originalDropdown)) {
			originalDropdown.style.cssText = 'display: inline-block; margin-left: 15px;';
			calHeader.appendChild(originalDropdown);
		}
	}, 100);
}
}

let currentEditingEvent = null;

function openEventModal(eventData = null, fcEvent = null) {
	const modal = document.getElementById('event-modal');
	const modalTitle = document.getElementById('event-modal-title');
	const deleteBtn = document.getElementById('event-delete-btn');
	
	currentEditingEvent = fcEvent;
	
	if (eventData) {
		// Edit mode
		modalTitle.textContent = 'Edit Event';
		deleteBtn.style.display = 'block';
		// Only the organiser can call a meeting off, and only if anyone was
		// invited to it in the first place.
		const cancelMeetingBtn = document.getElementById('event-cancel-meeting-btn');
		if (cancelMeetingBtn) {
			const hasGuests = !!(eventData.attendees || '').trim();
			cancelMeetingBtn.style.display = (hasGuests && false !== eventData.isOrganizer) ? 'block' : 'none';
		}
		const isAllDay = eventData.allDay || false;
		document.getElementById('event-title').value = eventData.title || '';
		document.getElementById('event-allday').checked = isAllDay;
		document.getElementById('event-location').value = eventData.location || '';
		document.getElementById('event-conference').value = eventData.conference || '';
		currentEventGeo = eventData.geo || '';
		document.getElementById('event-description').value = eventData.description || '';
		document.getElementById('event-reminder').value = eventData.reminder || '';
		const att = document.getElementById('event-attendees');
		if (att) att.value = eventData.attendees || '';

		// Who called the meeting. Shown only for someone else's: on your own it
		// would just be your own address staring back.
		const orgRow = document.getElementById('event-organizer-row');
		const orgVal = document.getElementById('event-organizer');
		if (orgRow && orgVal) {
			const organizer = (eventData.organizer || '').trim();
			const showIt = organizer && false === eventData.isOrganizer;
			orgVal.textContent = organizer;
			orgRow.style.display = showIt ? 'block' : 'none';
		}
		
		// Set date/time values based on allDay status
		if (isAllDay) {
			// For all-day events, use date-only format
			const startDate = new Date(eventData.start);
			const endDate = new Date(eventData.end || eventData.start);
			document.getElementById('event-start').value = formatDateOnly(startDate);
			document.getElementById('event-end').value = formatDateOnly(endDate);
		} else {
			// For timed events, use datetime-local format
			document.getElementById('event-start').value = formatDateTimeLocal(eventData.start);
			document.getElementById('event-end').value = formatDateTimeLocal(eventData.end || eventData.start);
		}
		
		// Toggle time inputs based on allDay (this will set the input type correctly)
		toggleTimeInputs(isAllDay);

		// How it repeats, read back from the master's rule. Weekly rules need
		// the occurrence's own start to work out which weekdays those were.
		loadRepeatFields(eventData.rrule || '', new Date(eventData.start), isAllDay);

		// One occurrence of a series, or all of them. Defaults to the one that
		// was opened: that is what was clicked, and it is the smaller change.
		const scopeRow = document.getElementById('event-scope-row');
		const scopeSel = document.getElementById('event-scope');
		if (scopeRow) scopeRow.style.display = isRecurring(eventData) ? 'block' : 'none';
		if (scopeSel) scopeSel.value = 'occurrence';
		refreshScopeUi();
	} else {
		// New event mode - default to timed event (not all-day) so time picker is visible
		modalTitle.textContent = 'New Event';
		deleteBtn.style.display = 'none';
		const cancelMeetingBtnNew = document.getElementById('event-cancel-meeting-btn');
		if (cancelMeetingBtnNew) cancelMeetingBtnNew.style.display = 'none';
		const orgRowNew = document.getElementById('event-organizer-row');
		if (orgRowNew) orgRowNew.style.display = 'none';
		document.getElementById('event-form').reset();
		resetRepeatFields();
		const scopeRowNew = document.getElementById('event-scope-row');
		if (scopeRowNew) scopeRowNew.style.display = 'none';
		refreshScopeUi();
		currentEventGeo = '';
		const now = new Date();
		const end = new Date(now.getTime() + 3600000); // 1 hour later
		// Set input type to datetime-local first to ensure time picker is visible
		document.getElementById('event-start').type = 'datetime-local';
		document.getElementById('event-end').type = 'datetime-local';
		document.getElementById('event-start').value = formatDateTimeLocal(now);
		document.getElementById('event-end').value = formatDateTimeLocal(end);
		document.getElementById('event-allday').checked = false;
		// Ensure time inputs are visible (not all-day)
		toggleTimeInputs(false);
	}
	
	applyFeatureToggles();
	refreshFieldHints();
	modal.classList.add('show');
}

function toggleTimeInputs(isAllDay) {
	const startInput = document.getElementById('event-start');
	const endInput = document.getElementById('event-end');
	
	if (!startInput || !endInput) return;
	
	// Store current values
	const startValue = startInput.value;
	const endValue = endInput.value;
	
	if (isAllDay) {
		// Switch to date-only input (hides time picker)
		startInput.type = 'date';
		endInput.type = 'date';
		// Extract date part if it has time
		if (startValue && startValue.includes('T')) {
			startInput.value = startValue.split('T')[0];
		} else if (startValue) {
			startInput.value = startValue;
		}
		if (endValue && endValue.includes('T')) {
			endInput.value = endValue.split('T')[0];
		} else if (endValue) {
			endInput.value = endValue;
		}
	} else {
		// Switch to datetime-local input (shows time picker)
		startInput.type = 'datetime-local';
		endInput.type = 'datetime-local';
		// Ensure time picker is visible by setting a default time if missing
		if (startValue && !startValue.includes('T')) {
			// If it's just a date, add a default time (9:00 AM)
			startInput.value = startValue + 'T09:00';
		} else if (!startValue) {
			// If no value, set current time
			const now = new Date();
			startInput.value = formatDateTimeLocal(now);
		}
		if (endValue && !endValue.includes('T')) {
			// If it's just a date, add a default time (10:00 AM, 1 hour after start)
			endInput.value = endValue + 'T10:00';
		} else if (!endValue) {
			// If no value, set 1 hour after start
			const startVal = startInput.value || formatDateTimeLocal(new Date());
			const startDate = new Date(startVal);
			const endDate = new Date(startDate.getTime() + 3600000); // 1 hour later
			endInput.value = formatDateTimeLocal(endDate);
		}
	}
}

function formatDateTimeLocal(date) {
	if (!date) return '';
	const d = new Date(date);
	const pad = (n) => n.toString().padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function saveEventFromModal() {
	const title = document.getElementById('event-title').value.trim();
	const start = document.getElementById('event-start').value;
	const end = document.getElementById('event-end').value;
	const allDay = document.getElementById('event-allday').checked;
	const location = document.getElementById('event-location').value.trim();
	const conference = (document.getElementById('event-conference') || {}).value || '';
	let description = document.getElementById('event-description').value.trim();
	const reminder = document.getElementById('event-reminder').value;
	const attendees = (document.getElementById('event-attendees') || {}).value || '';
	
	if (!title || !start || !end) {
		alert('Please fill in all required fields');
		return;
	}
	
	// Parse dates correctly based on allDay
	let startDate, endDate;
	if (allDay) {
		// For all-day events, parse date-only string (YYYY-MM-DD) as local date
		// Don't add time, just use the date string directly
		// This prevents timezone shifts that cause "day before" issue
		const startParts = start.split('-');
		const endParts = end.split('-');
		// Create date in local timezone at midnight
		startDate = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]));
		endDate = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]));
	} else {
		// For timed events, parse the datetime-local value (already in local timezone)
		startDate = new Date(start);
		endDate = new Date(end);
	}
	
	const eventData = {
		title,
		start: startDate,
		end: endDate,
		allDay,
		location,
		conference: conference.trim(),
		geo: currentEventGeo,
		description,
		reminder: parseInt(reminder) || 0,
		attendees: attendees,
		// null when the stored rule is beyond what these controls can show, so
		// the server leaves it exactly as another client wrote it.
		repeat: repeatPayload(startDate, allDay)
	};

	if (currentEditingEvent) {
		// Update existing event
		currentEditingEvent.setProp('title', title);
		currentEditingEvent.setStart(eventData.start);
		currentEditingEvent.setEnd(eventData.end);
		currentEditingEvent.setAllDay(allDay);
		currentEditingEvent.setExtendedProp('attendees', eventData.attendees || '');
		currentEditingEvent.setExtendedProp('location', eventData.location || '');
		currentEditingEvent.setExtendedProp('conference', eventData.conference || '');
		currentEditingEvent.setExtendedProp('geo', eventData.geo || '');
		currentEditingEvent.setExtendedProp('description', eventData.description || '');
		updateEvent(currentEditingEvent, eventData.repeat, currentScope());
	} else {
		// Create new event
		createEvent(eventData);
	}
	
	document.getElementById('event-modal').classList.remove('show');
	currentEditingEvent = null;
}

function cancelMeetingFromModal() {
	if (!currentEditingEvent) return;

	// A textarea will not fit in confirm(), and the reason is the point of
	// this step, so it gets a dialog of its own.
	const guests = (currentEditingEvent.extendedProps?.attendees || '').trim();
	const intro = document.getElementById('cancel-reason-intro');
	const text = document.getElementById('cancel-reason-text');
	const modal = document.getElementById('cancel-reason-modal');
	if (!modal || !text) return;

	if (intro) {
		intro.textContent = `"${currentEditingEvent.title}" will be called off and these guests told: ${guests}`;
	}
	text.value = '';
	modal.classList.add('show');
	text.focus();
}

function sendCancellation() {
	if (!currentEditingEvent) return;

	const eventId = currentEditingEvent.id || currentEditingEvent.extendedProps?.uid;
	if (!eventId || !rl.pluginRemoteRequest) return;

	const text = document.getElementById('cancel-reason-text');
	const reason = text ? text.value.trim() : '';
	const btn = document.getElementById('cancel-reason-confirm');
	// The guests are mailed once. A double click must not tell them twice.
	if (btn) { btn.disabled = true; btn.textContent = 'Cancelling...'; }

	rl.pluginRemoteRequest((iError, oData) => {
		if (btn) { btn.disabled = false; btn.textContent = 'Cancel meeting'; }
		const res = oData && oData.Result;
		if (iError || !res || !res.success) {
			// Deliberately left in the view: if the server refused, the meeting
			// is still on and the guests have not been told.
			calError('cancel failed: ' + ((res && res.error) || 'error ' + iError));
			alert((res && res.error) || 'The meeting could not be cancelled.');
			return;
		}
		document.getElementById('cancel-reason-modal').classList.remove('show');
		currentEditingEvent.remove();
		document.getElementById('event-modal').classList.remove('show');
		currentEditingEvent = null;
		alert(res.notified
			? 'Meeting cancelled. The guests have been notified.'
			: 'Meeting cancelled.');
	}, 'CancelCalendarEvent', { EventId: eventId, Reason: reason });
}

function deleteEventFromModal() {
	if (!currentEditingEvent) return;

	const event = currentEditingEvent;
	const remove = (scope) => {
		const eventId = event.id || event.extendedProps?.uid;
		event.remove();
		deleteEvent(eventId, scope, event.extendedProps?.recurrenceId);
		document.getElementById('event-modal').classList.remove('show');
		currentEditingEvent = null;
	};

	// Deleting one occurrence of a series is not deleting the event; the two
	// are far enough apart to be worth asking about rather than confirming.
	if (isRecurring(event)) {
		askRecurrenceScope('Delete repeating event',
			'"' + event.title + '" repeats. Delete only this occurrence, or every occurrence?',
			choice => { if (choice) remove(choice); });
		return;
	}

	if (confirm(`Delete "${event.title}"?`)) remove('series');
}

/* ------------------------------------------------------------------ *
 * Where the meeting is: a room, a call, or both
 *
 * Two fields rather than one overloaded "Location", because a hybrid
 * meeting has both a place to walk to and a link to click, and squashing
 * them into one line loses whichever the writer cared about less.
 *
 * The camera mints a room on the server (a CSPRNG the browser does not
 * have, and the meeting server URL stays a deployment setting). The globe
 * searches a geocoder, also on the server: this page runs under a CSP that
 * blocks an embedded map, and a popup on openstreetmap.org could not hand
 * a selection back across origins anyway.
 * ------------------------------------------------------------------ */
let calFeatures = { conference: false, places: false };
// Coordinates for whatever is in the location field, when the picker put it
// there. Kept out of the DOM so hand-typing the field can drop it.
let currentEventGeo = '';

/* ------------------------------------------------------------------ *
 * Recurrence
 *
 * The dialog collects an RRULE in pieces - how often, how far apart, which
 * weekdays, when it stops - and the server assembles the rule from them.
 * Nothing here ever sends a rule string: an RRULE goes straight into the
 * ICS body, so building it out of named fields keeps that line ours.
 * ------------------------------------------------------------------ */
const DAY_TOKENS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const REPEAT_UNITS = { DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months', YEARLY: 'years' };
const REPEAT_ADVERBS = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' };
const DAY_LABELS = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };

// The named choices in the dropdown, each a fixed rule. They are the same list
// Thunderbird offers, so an event made in one reads back the same in the other.
// Anything outside this list is Custom, which exposes the pieces directly.
const REPEAT_PRESETS = {
	DAILY:    { freq: 'DAILY',   interval: 1, days: [] },
	WEEKLY:   { freq: 'WEEKLY',  interval: 1, days: [] },
	WEEKDAYS: { freq: 'WEEKLY',  interval: 1, days: ['MO', 'TU', 'WE', 'TH', 'FR'] },
	BIWEEKLY: { freq: 'WEEKLY',  interval: 2, days: [] },
	MONTHLY:  { freq: 'MONTHLY', interval: 1, days: [] },
	YEARLY:   { freq: 'YEARLY',  interval: 1, days: [] }
};

// True when the event carries a rule the dialog cannot show, so saving must
// not touch it. See loadRepeatFields().
let unsupportedRepeat = false;

function repeatEl(id) {
	return document.getElementById('event-repeat' + (id ? '-' + id : ''));
}

function repeatDayBoxes() {
	const days = repeatEl('days');
	return days ? Array.from(days.querySelectorAll('input[type=checkbox]')) : [];
}

// Timed events are stored in UTC, where a late-evening or small-hours meeting
// can sit on a different weekday than the one the organiser ticked. Each tick
// is therefore translated to the UTC weekday its first occurrence lands on -
// otherwise a "every Monday" series repeats a day out, or picks up a stray
// occurrence on the start date because that date is not in its own rule.
function shiftDayTokens(tokens, startDate, allDay, toUtc) {
	if (allDay || !startDate) return tokens;
	return tokens.map(token => {
		const want = DAY_TOKENS.indexOf(token);
		if (0 > want) return token;
		const d = new Date(startDate.getTime());
		if (toUtc) {
			d.setDate(d.getDate() + ((want - d.getDay() + 7) % 7));
			return DAY_TOKENS[d.getUTCDay()];
		}
		d.setUTCDate(d.getUTCDate() + ((want - d.getUTCDay() + 7) % 7));
		return DAY_TOKENS[d.getDay()];
	});
}

// "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20260901T235959Z" -> the fields.
function parseRRule(rule) {
	const out = { freq: '', interval: 1, days: [], end: '', count: 10, until: '' };
	(rule || '').split(';').forEach(part => {
		const eq = part.indexOf('=');
		if (0 > eq) return;
		const key = part.slice(0, eq).trim().toUpperCase();
		const value = part.slice(eq + 1).trim();
		if ('FREQ' === key) out.freq = value.toUpperCase();
		else if ('INTERVAL' === key) out.interval = Math.max(1, parseInt(value, 10) || 1);
		else if ('BYDAY' === key) {
			// Positional forms such as "2MO" mean the second Monday of the
			// month, which this dialog cannot express; leaving them unticked
			// would silently rewrite the series, so they are read as unknown.
			out.days = value.toUpperCase().split(',')
				.map(d => d.trim()).filter(d => -1 !== DAY_TOKENS.indexOf(d));
			if (out.days.length !== value.split(',').length) out.freq = '';
		}
		else if ('COUNT' === key) { out.end = 'count'; out.count = Math.max(1, parseInt(value, 10) || 1); }
		else if ('UNTIL' === key) {
			const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
			if (m) { out.end = 'until'; out.until = m[1] + '-' + m[2] + '-' + m[3]; }
		}
		else if ('BYSETPOS' === key || 'BYMONTHDAY' === key || 'BYMONTH' === key
			|| 'BYWEEKNO' === key || 'BYYEARDAY' === key) out.freq = '';
	});
	if (-1 === ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].indexOf(out.freq)) out.freq = '';
	return out;
}

// What the controls currently describe, whichever way they were set: the
// dropdown alone for a preset, the pieces below it for Custom.
function repeatShape() {
	const chosen = repeatEl('');
	if (!chosen || !chosen.value) return null;
	if ('CUSTOM' !== chosen.value) return REPEAT_PRESETS[chosen.value] || null;

	const freq = repeatEl('unit').value;
	return {
		freq: freq,
		interval: Math.max(1, parseInt(repeatEl('interval').value, 10) || 1),
		days: 'WEEKLY' === freq ? repeatDayBoxes().filter(b => b.checked).map(b => b.value) : []
	};
}

// Which entry in the dropdown says what a stored rule says. Custom is the
// answer for anything the named ones do not cover exactly.
function presetForRule(parsed, startDate, allDay) {
	if (!parsed.freq) return '';

	let days = shiftDayTokens(parsed.days, startDate, allDay, false);
	// BYDAY naming only the day the event already starts on adds nothing - a
	// weekly event repeats on its own weekday regardless - so it reads as a
	// plain Weekly rather than pushing an otherwise ordinary rule into Custom.
	if (1 === days.length && startDate && days[0] === DAY_TOKENS[startDate.getDay()]) {
		days = [];
	}

	const same = (a, b) => a.length === b.length && a.every(x => -1 !== b.indexOf(x));
	const found = Object.keys(REPEAT_PRESETS).find(key => {
		const p = REPEAT_PRESETS[key];
		return p.freq === parsed.freq && p.interval === parsed.interval && same(p.days, days);
	});
	return found || 'CUSTOM';
}

// Fill the repeat controls from a stored rule. `startDate` is the occurrence
// the dialog was opened on, needed to read BYDAY back into local weekdays.
function loadRepeatFields(rule, startDate, allDay) {
	const parsed = parseRRule(rule);
	const chosen = repeatEl('');
	if (!chosen) return;

	// A rule this dialog cannot express is left alone rather than mangled: the
	// select stays on "Does not repeat" and, because the Repeat field is then
	// suppressed on save, the stored rule survives untouched.
	unsupportedRepeat = !!(rule || '').trim() && !parsed.freq;

	chosen.value = presetForRule(parsed, startDate, allDay);
	repeatEl('unit').value = parsed.freq || 'WEEKLY';
	repeatEl('interval').value = parsed.interval;
	repeatEl('end').value = parsed.end;
	repeatEl('count').value = parsed.count;
	repeatEl('until').value = parsed.until;
	const wanted = shiftDayTokens(parsed.days, startDate, allDay, false);
	repeatDayBoxes().forEach(box => { box.checked = -1 !== wanted.indexOf(box.value); });
	refreshRepeatUi();
}

function resetRepeatFields() {
	unsupportedRepeat = false;
	const chosen = repeatEl('');
	if (!chosen) return;
	chosen.value = '';
	repeatEl('unit').value = 'WEEKLY';
	repeatEl('interval').value = 1;
	repeatEl('end').value = '';
	repeatEl('count').value = 10;
	repeatEl('until').value = '';
	repeatDayBoxes().forEach(box => { box.checked = false; });
	refreshRepeatUi();
}

function refreshRepeatUi() {
	const chosen = repeatEl('');
	if (!chosen) return;
	const on = !!chosen.value;
	const custom = 'CUSTOM' === chosen.value;

	const detail = repeatEl('detail');
	if (detail) detail.style.display = on ? 'block' : 'none';
	// The pieces are only worth showing when a preset is not already saying it.
	const every = repeatEl('every');
	if (every) every.style.display = custom ? 'flex' : 'none';
	const days = repeatEl('days');
	if (days) days.style.display = (custom && 'WEEKLY' === repeatEl('unit').value) ? 'flex' : 'none';

	const end = repeatEl('end').value;
	repeatEl('count').style.display = 'count' === end ? 'inline-block' : 'none';
	repeatEl('count-unit').style.display = 'count' === end ? 'inline' : 'none';
	repeatEl('until').style.display = 'until' === end ? 'inline-block' : 'none';

	const hint = repeatEl('hint');
	if (hint) {
		hint.textContent = on ? describeRepeat() : '';
		hint.style.display = on ? 'block' : 'none';
	}
}

// What the rule will actually do, in words, so nobody has to save it to find
// out. Says nothing the fields do not already say - it just says it plainly.
function describeRepeat() {
	const shape = repeatShape();
	if (!shape) return '';
	let text = 1 === shape.interval
		? 'Repeats ' + (REPEAT_ADVERBS[shape.freq] || '')
		: 'Repeats every ' + shape.interval + ' ' + (REPEAT_UNITS[shape.freq] || '');

	if (shape.days.length) {
		text += ' on ' + shape.days.map(d => DAY_LABELS[d]).join(', ');
	}

	const end = repeatEl('end').value;
	if ('count' === end) {
		const n = Math.max(1, parseInt(repeatEl('count').value, 10) || 1);
		text += ', ' + n + (1 === n ? ' time' : ' times');
	} else if ('until' === end && repeatEl('until').value) {
		text += ', until ' + repeatEl('until').value;
	}
	return text + '.';
}

// The repeat fields as the server wants them, or null when nothing about the
// recurrence should be written - which is not the same as "does not repeat".
function repeatPayload(startDate, allDay) {
	if (unsupportedRepeat || !repeatEl('')) return null;
	const shape = repeatShape();
	return {
		Repeat: shape ? shape.freq : '',
		RepeatInterval: shape ? shape.interval : 1,
		RepeatDays: shape ? shiftDayTokens(shape.days, startDate, allDay, true).join(',') : '',
		RepeatEnd: repeatEl('end').value,
		RepeatCount: Math.max(1, parseInt(repeatEl('count').value, 10) || 1),
		RepeatUntil: repeatEl('until').value
	};
}

/* ------------------------------------------------------------------ *
 * This occurrence, or the whole series
 *
 * A repeating event is one object on the server: a master carrying the rule,
 * plus an override per occurrence that differs from it. So "change this one"
 * and "change them all" are genuinely different writes, and which one was
 * meant has to be asked rather than guessed - editing the title of next
 * Tuesday's stand-up should not rename every stand-up there will ever be.
 * ------------------------------------------------------------------ */
let pendingScopeChoice = null;

function isRecurring(event) {
	return !!((event && (event.rrule || (event.extendedProps || {}).rrule)) || '').trim();
}

// Asks, and calls back with 'occurrence', 'series', or null for cancelled.
function askRecurrenceScope(title, intro, onChoice) {
	const modal = document.getElementById('scope-modal');
	if (!modal) {
		// No dialog to ask with: the safe answer is the smaller change.
		onChoice('occurrence');
		return;
	}
	document.getElementById('scope-modal-title').textContent = title;
	document.getElementById('scope-modal-intro').textContent = intro;
	pendingScopeChoice = onChoice;
	modal.classList.add('show');
}

function resolveScope(choice) {
	const modal = document.getElementById('scope-modal');
	if (modal) modal.classList.remove('show');
	const onChoice = pendingScopeChoice;
	pendingScopeChoice = null;
	if (onChoice) onChoice(choice);
}

// The scope the dialog is currently set to, and what that scope allows. How an
// event repeats belongs to the series, so it cannot be edited from one
// occurrence - the controls say so rather than being silently ignored.
function scopeRowShowing() {
	const row = document.getElementById('event-scope-row');
	return !!row && 'none' !== row.style.display;
}

function currentScope() {
	const sel = document.getElementById('event-scope');
	return (scopeRowShowing() && sel) ? sel.value : 'series';
}

function refreshScopeUi() {
	const sel = document.getElementById('event-scope');
	if (!sel) return;
	const showing = scopeRowShowing();
	const one = 'occurrence' === currentScope();

	['', 'unit', 'interval', 'end', 'count', 'until'].forEach(id => {
		const el = repeatEl(id);
		if (el) el.disabled = one;
	});
	repeatDayBoxes().forEach(box => { box.disabled = one; });

	const hint = document.getElementById('event-scope-hint');
	if (hint) {
		hint.textContent = one
			? 'Only this date changes. How the event repeats belongs to the series - switch above to change it.'
			: 'Every occurrence changes, including any that were moved individually.';
		hint.style.display = showing ? 'block' : 'none';
	}
}

function applyFeatureToggles() {
	const confBtn = document.getElementById('event-conference-btn');
	if (confBtn) confBtn.style.display = calFeatures.conference ? 'block' : 'none';
	const placeBtn = document.getElementById('event-location-pick-btn');
	if (placeBtn) placeBtn.style.display = calFeatures.places ? 'block' : 'none';
}

// A link is only worth showing once it is one.
function asHttpUrl(value) {
	const v = (value || '').trim();
	return /^https?:\/\/\S+$/i.test(v) ? v : '';
}

function refreshFieldHints() {
	const confHint = document.getElementById('event-conference-hint');
	if (confHint) {
		const url = asHttpUrl((document.getElementById('event-conference') || {}).value);
		confHint.innerHTML = '';
		if (url) {
			const a = document.createElement('a');
			a.href = url;
			a.target = '_blank';
			a.rel = 'noopener noreferrer';
			a.textContent = 'Join the call';
			confHint.appendChild(a);
			confHint.append(' - guests get this link with the invitation.');
			confHint.style.display = 'block';
		} else {
			confHint.style.display = 'none';
		}
	}

	const locHint = document.getElementById('event-location-hint');
	if (locHint) {
		const loc = ((document.getElementById('event-location') || {}).value || '').trim();
		locHint.innerHTML = '';
		if (loc) {
			const a = document.createElement('a');
			// Coordinates when the picker found them, otherwise let the map
			// search for the text - a pin beats a guess, a guess beats nothing.
			a.href = currentEventGeo
				? 'https://www.openstreetmap.org/?mlat=' + encodeURIComponent(currentEventGeo.split(';')[0])
					+ '&mlon=' + encodeURIComponent(currentEventGeo.split(';')[1]) + '#map=17/'
					+ encodeURIComponent(currentEventGeo.split(';')[0]) + '/'
					+ encodeURIComponent(currentEventGeo.split(';')[1])
				: 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(loc);
			a.target = '_blank';
			a.rel = 'noopener noreferrer';
			a.textContent = currentEventGeo ? 'Show on the map' : 'Look up on the map';
			locHint.appendChild(a);
			locHint.style.display = 'block';
		} else {
			locHint.style.display = 'none';
		}
	}
}

function mintConferenceUrl() {
	const input = document.getElementById('event-conference');
	const btn = document.getElementById('event-conference-btn');
	if (!input || !rl.pluginRemoteRequest) return;

	// Replacing a link the guests may already hold sends them somewhere the
	// meeting is not, so that is asked about rather than assumed.
	if (input.value.trim() && !confirm('Replace the current video link with a new room?\n\n'
		+ 'Anyone already holding the old link will not reach this meeting.')) {
		return;
	}

	if (btn) btn.disabled = true;
	rl.pluginRemoteRequest((iError, oData) => {
		if (btn) btn.disabled = false;
		const res = oData && oData.Result;
		if (iError || !res || !res.success || !res.url) {
			alert((res && res.error) || 'Could not create a meeting room.');
			return;
		}
		input.value = res.url;
		refreshFieldHints();
	}, 'NewConferenceUrl', {});
}

function openPlacePicker() {
	const modal = document.getElementById('place-picker-modal');
	const query = document.getElementById('place-query');
	if (!modal || !query) return;

	const current = ((document.getElementById('event-location') || {}).value || '').trim();
	query.value = current;
	setPlaceStatus('');
	renderPlaceResults([]);
	modal.classList.add('show');
	query.focus();
	query.select();
	if (current) runPlaceSearch();
}

function closePlacePicker() {
	const modal = document.getElementById('place-picker-modal');
	if (modal) modal.classList.remove('show');
}

function setPlaceStatus(text) {
	const el = document.getElementById('place-status');
	if (el) el.textContent = text || '';
}

function renderPlaceResults(places) {
	const box = document.getElementById('place-results');
	if (!box) return;
	box.innerHTML = '';
	places.forEach(place => {
		const row = document.createElement('div');
		row.className = 'place-result';
		row.textContent = place.label;
		row.addEventListener('click', () => choosePlace(place));
		box.appendChild(row);
	});
}

function choosePlace(place) {
	const input = document.getElementById('event-location');
	if (input) input.value = place.label || '';
	currentEventGeo = (null !== place.lat && null !== place.lon && undefined !== place.lat)
		? place.lat + ';' + place.lon
		: '';
	closePlacePicker();
	refreshFieldHints();
}

function runPlaceSearch() {
	const query = document.getElementById('place-query');
	const btn = document.getElementById('place-search-btn');
	if (!query || !rl.pluginRemoteRequest) return;

	const q = query.value.trim();
	if (2 > q.length) {
		setPlaceStatus('Type at least two characters.');
		return;
	}

	if (btn) btn.disabled = true;
	setPlaceStatus('Searching...');
	renderPlaceResults([]);

	rl.pluginRemoteRequest((iError, oData) => {
		if (btn) btn.disabled = false;
		const res = oData && oData.Result;
		if (iError || !res) {
			setPlaceStatus('The search failed.');
			return;
		}
		if (res.error) {
			setPlaceStatus(res.error);
			return;
		}
		const places = res.places || [];
		setPlaceStatus(places.length
			// Worth saying: it explains both the pause and why these results
			// look different from the usual local ones.
			? (res.fallback ? 'Not in the local map data - found further afield.' : '')
			: 'Nothing found. Try a wider search, or type the address by hand.');
		renderPlaceResults(places);
	}, 'SearchPlaces', { Query: q });
}

function hideCalendar() {
	const cal = document.getElementById('mailbux-calendar');
	if (cal) {
		cal.style.display = 'none';
	}
	
	// Restore account switcher to its original location
	const dropdown = document.querySelector('#V-SystemDropDown');
	if (dropdown && dropdown.originalParentElement) {
		dropdown.style.cssText = '';
		dropdown.originalParentElement.appendChild(dropdown);
	}
	
	// Restore main UI
	document.querySelectorAll('#rl-left, #rl-right, #rl-content').forEach(el => {
		if (el) el.style.display = '';
	});
}

function loadFullCalendar() {
	if (window.FullCalendar) { initializeCalendar(); return; }

	// Must go through the plugin's own part hook. "?/Plugins/caldav/<file>"
	// looks right but ServicePlugins() ignores the path and returns the
	// concatenated plugin bundle, so that URL silently loaded this script
	// again and never defined window.FullCalendar.
	const localScript = document.createElement('script');
	localScript.src = '?CalDavAsset/fullcalendar.min.js';
	localScript.onload = () => {
		if (!window.FullCalendar) {
			calError('fullcalendar.min.js loaded but did not define FullCalendar');
			return;
		}
		initializeCalendar();
	};
	localScript.onerror = () => {
		// No CDN fallback: a typical script-src is 'self' only, so an external
		// CDN is blocked by CSP and only hides the real error.
		calError('could not load ?CalDavAsset/fullcalendar.min.js');
	};
	document.head.appendChild(localScript);
}

function initializeCalendar() {
const container = document.getElementById('fc-calendar');
if (!container) { calError('calendar container #fc-calendar missing'); return; }
if (!window.FullCalendar) { calError('FullCalendar library did not load'); return; }
try {

calendar = new FullCalendar.Calendar(container, {
initialView: 'dayGridMonth',
headerToolbar: {
left: 'prev,next today',
center: 'title',
right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
},
buttonText: {
today: 'Today',
month: 'Month',
week: 'Week',
day: 'Day',
list: 'List'
},
height: '100%',
editable: true,
selectable: true,
selectMirror: true,
dayMaxEvents: true,
weekends: true,
nowIndicator: true,

events: function(info, successCallback, failureCallback) {
loadEventsFromCalDAV(successCallback, failureCallback);
},

eventClick: function(info) {
	const event = info.event;
	openEventModal({
		title: event.title,
		start: event.start,
		end: event.end || event.start,
		allDay: event.allDay,
		location: event.extendedProps?.location || '',
		conference: event.extendedProps?.conference || '',
		geo: event.extendedProps?.geo || '',
		description: event.extendedProps?.description || '',
		reminder: event.extendedProps?.reminder || '',
		rrule: event.extendedProps?.rrule || '',
		recurrenceId: event.extendedProps?.recurrenceId || '',
		attendees: event.extendedProps?.attendees || '',
		organizer: event.extendedProps?.organizer || '',
		isOrganizer: false !== event.extendedProps?.isOrganizer
	}, event);
},

select: function(info) {
	openEventModal({
		start: info.start,
		end: info.end,
		allDay: info.allDay
	});
	calendar.unselect();
},

eventDrop: function(info) {
	updateDraggedEvent(info);
},

eventResize: function(info) {
	updateDraggedEvent(info);
}
});

calendar.render();
} catch (e) {
	calError('init failed: ' + (e && e.message ? e.message : e));
}

}

function loadEventsFromCalDAV(successCallback, failureCallback) {

if (!rl.pluginRemoteRequest) {
calError('rl.pluginRemoteRequest unavailable - cannot reach the server');
failureCallback({ message: 'Not available' });
return;
}

rl.pluginRemoteRequest((iError, oData) => {
if (iError || !oData || !oData.Result) {
calError('server returned no events (error ' + iError + '): '
	+ (oData && oData.ErrorMessage ? oData.ErrorMessage : JSON.stringify(oData)));
successCallback([]);
return;
}

	const result = oData.Result;

		const events = (result.events || []).map(event => {
		return {
			id: event.uid || Math.random().toString(36),
			title: event.summary || 'Untitled Event',
			start: new Date(event.dtstart || event.start),
			end: new Date(event.dtend || event.end),
			allDay: event.allDay || false,
			backgroundColor: 'var(--cal-event-bg)',
			borderColor: 'var(--cal-event-border)',
			textColor: 'var(--cal-event-text)',
			classNames: ['modern-event'],
			extendedProps: {
				// The series rule, and which occurrence of it this is. Both
				// belong to the stored object rather than to the copy the grid
				// draws, and both are needed to edit either one date or all.
				rrule: event.rrule || '',
				recurrenceId: event.recurrenceId || '',
				location: event.location || '',
				conference: event.conference || '',
				geo: event.geo || '',
				description: event.description || '',
				attendees: event.attendees || '',
				organizer: event.organizer || '',
				isOrganizer: false !== event.isOrganizer
			}
		};
	});

	// Whether this deployment has a meeting server and a geocoder at all.
	calFeatures = {
		conference: !!result.conferenceEnabled,
		places: !!result.placesEnabled
	};
	applyFeatureToggles();

	calendarEvents = events;
	scheduleReminders(result.events || []);

	successCallback(events);
}, 'GetCalendarEvents', {});
}

/* ------------------------------------------------------------------ *
 * Reminders (VALARM -> Notification API)
 *
 * The stored events already carry VALARMs written by other clients; the
 * server now returns each one resolved to an absolute time. Alarms already
 * due for an event that has not started yet fire on connect (that is the
 * "you just logged in and something is coming up" case); the rest are armed
 * with setTimeout for as long as the tab stays open.
 * ------------------------------------------------------------------ */
const REMINDER_SEEN_KEY = 'caldav-reminders-fired';
const REMINDER_ARM_WINDOW_MS = 24 * 3600 * 1000;
let reminderTimers = [];

function reminderSeen() {
	try { return new Set(JSON.parse(localStorage.getItem(REMINDER_SEEN_KEY) || '[]')); }
	catch (e) { return new Set(); }
}

function markReminderSeen(key) {
	try {
		const seen = reminderSeen();
		seen.add(key);
		// keep it from growing without bound
		const arr = Array.from(seen).slice(-500);
		localStorage.setItem(REMINDER_SEEN_KEY, JSON.stringify(arr));
	} catch (e) { /* private mode: just re-notify next time */ }
}

function showReminder(ev, when) {
	const key = (ev.uid || ev.summary) + '@' + when;
	if (reminderSeen().has(key)) return;
	markReminderSeen(key);

	const start = new Date(ev.dtstart || ev.start);
	const body = (ev.allDay ? start.toLocaleDateString() : start.toLocaleString())
		+ (ev.location ? '\n' + ev.location : '');
	if (window.Notification && Notification.permission === 'granted') {
		try {
			new Notification(ev.summary || 'Event', { body: body, tag: key });
			return;
		} catch (e) { /* fall through to the in-page banner */ }
	}
	showReminderBanner(ev.summary || 'Event', body);
}

function showReminderBanner(title, body) {
	let host = document.getElementById('cal-reminder-host');
	if (!host) {
		host = document.createElement('div');
		host.id = 'cal-reminder-host';
		host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:20000;display:flex;'
			+ 'flex-direction:column;gap:8px;max-width:320px;';
		document.body.appendChild(host);
	}
	const el = document.createElement('div');
	el.style.cssText = 'background:var(--cal-bg-primary,#fff);color:var(--cal-text-primary,#1a1a1a);'
		+ 'border-left:4px solid var(--cal-accent,#00639a);border-radius:8px;padding:12px 14px;'
		+ 'box-shadow:0 4px 16px rgba(0,0,0,.2);font-size:13px;cursor:pointer;white-space:pre-line;';
	el.textContent = '\u23F0 ' + title + '\n' + body;
	el.addEventListener('click', () => el.remove());
	host.appendChild(el);
	setTimeout(() => el.remove(), 30000);
}

function scheduleReminders(events) {
	reminderTimers.forEach(clearTimeout);
	reminderTimers = [];

	const now = Date.now();
	events.forEach(ev => {
		const startMs = new Date(ev.dtstart || ev.start).getTime();
		if (!startMs || startMs < now) return;          // event already began
		(ev.alarms || []).forEach(al => {
			const at = new Date(al.at).getTime();
			if (!at) return;
			const delta = at - now;
			if (delta <= 0) {
				showReminder(ev, al.at);                 // due while we were away
			} else if (delta <= REMINDER_ARM_WINDOW_MS) {
				reminderTimers.push(setTimeout(() => showReminder(ev, al.at), delta));
			}
		});
	});
}

function createEvent(eventData) {
	
	if (!rl.pluginRemoteRequest) return;
	
	rl.pluginRemoteRequest((iError, oData) => {
		if (iError || !oData || !oData.Result) {
			alert('Failed to create event: ' + (oData?.Result?.message || 'Unknown error'));
			return;
		}
		if (calendar) calendar.refetchEvents();
	}, 'CreateCalendarEvent', {
		Title: eventData.title,
		// For all-day events, format date as YYYY-MM-DD using local timezone
		// For timed events, send ISO string in UTC
		Start: eventData.allDay 
			? formatDateOnly(eventData.start)
			: eventData.start.toISOString(),
		End: eventData.allDay 
			? formatDateOnly(eventData.end)
			: eventData.end.toISOString(),
		AllDay: eventData.allDay || false,
		Description: eventData.description || '',
		Location: eventData.location || '',
		// the video call, and the coordinates of the physical place if the
		// picker found them; the server writes CONFERENCE and GEO
		Conference: eventData.conference || '',
		Geo: eventData.geo || '',
		// minutes before start; the server turns this into a real VALARM
		Reminder: eventData.reminder || 0,
		// comma or semicolon separated; the calendar server mails the invitations
		Attendees: eventData.attendees || '',
		// how it repeats; the server assembles the RRULE from these
		...(eventData.repeat || {})
	});
}

// Helper to format date as YYYY-MM-DD in local timezone
function formatDateOnly(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

// Dragging or resizing in the grid. One occurrence of a series can be moved on
// its own or take the series with it, and only the person dragging it knows
// which - so ask, and put it back where it was if they would rather not say.
function updateDraggedEvent(info) {
	const event = info.event;
	if (!isRecurring(event)) {
		updateEvent(event);
		return;
	}
	askRecurrenceScope('Repeating event',
		'"' + event.title + '" repeats. Move only this occurrence, or shift every'
			+ ' occurrence by the same amount?',
		choice => {
			if (!choice) { info.revert(); return; }
			updateEvent(event, undefined, choice);
		});
}

// `repeat` comes from the dialog only. Dragging or resizing in the grid calls
// this without it, so the stored rule is left alone.
function updateEvent(event, repeat, scope) {

	if (!rl.pluginRemoteRequest) return;
	
	const eventId = event.id || event.extendedProps?.uid;
	if (!eventId) {
		return;
	}
	
	// Format dates correctly based on allDay
	let startFormatted, endFormatted;
	if (event.allDay) {
		// For all-day events, send date-only string (YYYY-MM-DD)
		startFormatted = formatDateOnly(event.start);
		endFormatted = formatDateOnly(event.end || event.start);
	} else {
		// For timed events, send ISO string in UTC
		startFormatted = event.start.toISOString();
		endFormatted = (event.end || event.start).toISOString();
	}
	
	rl.pluginRemoteRequest((iError, oData) => {
		if (iError || !oData || !oData.Result) {
			alert('Failed to update event: ' + (oData?.Result?.message || 'Unknown error'));
			return;
		}
		if (calendar) calendar.refetchEvents();
	}, 'UpdateCalendarEvent', {
		// omitted when unknown: the server only rewrites these when they are
		// present, so dragging an event cannot uninvite anyone or blank out
		// where it is being held
		Attendees: event.extendedProps?.attendees,
		Location: event.extendedProps?.location,
		Conference: event.extendedProps?.conference,
		Geo: event.extendedProps?.geo,
		Description: event.extendedProps?.description,
		// Which occurrence of the series this is - the date the rule gives it,
		// not the date it may have been moved to. On a series-wide edit the
		// server shifts everything by the difference; on a single occurrence it
		// is the override's identity.
		RecurrenceId: event.extendedProps?.recurrenceId,
		Scope: scope || 'series',
		EventId: eventId,
		Title: event.title,
		Start: startFormatted,
		End: endFormatted,
		AllDay: event.allDay || false,
		...(repeat || {})
	});
}

function deleteEvent(eventId, scope, recurrenceId) {

	if (!rl.pluginRemoteRequest || !eventId) return;

	rl.pluginRemoteRequest((iError, oData) => {
		const res = oData && oData.Result;
		if (iError || !res || !res.success) {
			// Say why, and put it back: the grid has already dropped it, and a
			// row missing from the view but present on the server is worse than
			// an error message.
			alert((res && res.error) || 'Failed to delete event.');
			if (calendar) calendar.refetchEvents();
			return;
		}
		if (calendar) calendar.refetchEvents();
	}, 'DeleteCalendarEvent', {
		EventId: eventId,
		// Removing one occurrence rewrites the series with that date excluded;
		// removing the series deletes the resource outright.
		Scope: scope || 'series',
		RecurrenceId: recurrenceId || ''
	});
}

// Calendar link removed - now handled by contacts popover

// ---------------------------------------------------------------------------
// Attendee autocomplete
//
// The field holds a comma-separated list, so only the token after the last
// separator is being typed - the ones before it are settled addresses and are
// left untouched. Suggestions come from the server hook, which asks the same
// provider the compose screen uses.
// ---------------------------------------------------------------------------
(() => {
	const MIN_CHARS = 2, DEBOUNCE_MS = 180;
	let box = null, items = [], active = -1, timer = null, seq = 0;

	const close = () => {
		box && box.remove();
		box = null; items = []; active = -1;
	};

	// Everything before the last separator is already chosen; the remainder is
	// the fragment to complete.
	const split = value => {
		const parts = value.split(/[,;]/);
		return { head: parts.slice(0, -1), tail: parts[parts.length - 1] || '' };
	};

	const choose = (input, item) => {
		const chosen = item.name ? item.name + ' <' + item.email + '>' : item.email;
		const kept = split(input.value).head.map(s => s.trim()).filter(Boolean);
		input.value = kept.concat(chosen).join(', ') + ', ';
		close();
		input.focus();
	};

	const highlight = () => {
		if (!box) return;
		[...box.children].forEach((el, i) => el.classList.toggle('is-active', i === active));
	};

	const render = (input, list) => {
		close();
		if (!list.length) return;
		items = list;
		box = document.createElement('div');
		box.className = 'caldav-suggest';
		const r = input.getBoundingClientRect();
		box.style.left = r.left + 'px';
		box.style.top = (r.bottom + 2) + 'px';
		box.style.width = r.width + 'px';
		list.forEach((item, i) => {
			const row = document.createElement('div');
			row.className = 'caldav-suggest-item';
			row.textContent = item.name ? item.name + ' \u2014 ' + item.email : item.email;
			row.title = item.email;
			// mousedown, not click: blur would tear the list down first.
			row.addEventListener('mousedown', e => { e.preventDefault(); choose(input, list[i]); });
			box.append(row);
		});
		document.body.append(box);
	};

	const query = input => {
		const tail = split(input.value).tail.trim();
		if (tail.length < MIN_CHARS || !rl.pluginRemoteRequest) {
			close();
			return;
		}
		const mine = ++seq;
		rl.pluginRemoteRequest((iError, oData) => {
			// A slower earlier request must not overwrite a newer one's results.
			if (mine !== seq || iError || !oData || !oData.Result) return;
			render(input, oData.Result.suggestions || []);
		}, 'SuggestAttendees', { Query: tail });
	};

	document.addEventListener('input', e => {
		if (e.target && 'event-attendees' === e.target.id) {
			clearTimeout(timer);
			timer = setTimeout(() => query(e.target), DEBOUNCE_MS);
		}
	});

	document.addEventListener('keydown', e => {
		if (!box || !e.target || 'event-attendees' !== e.target.id) return;
		if ('ArrowDown' === e.key || 'ArrowUp' === e.key) {
			e.preventDefault();
			active = ('ArrowDown' === e.key)
				? (active + 1) % items.length
				: (active <= 0 ? items.length - 1 : active - 1);
			highlight();
		} else if ('Enter' === e.key && active > -1) {
			// Only swallow Enter when a suggestion is selected, so the key still
			// reaches the form otherwise.
			e.preventDefault();
			choose(e.target, items[active]);
		} else if ('Escape' === e.key) {
			close();
		}
	});

	document.addEventListener('click', e => {
		if (!box) return;
		if (!box.contains(e.target) && e.target.id !== 'event-attendees') close();
	}, true);

	// The list is positioned against the viewport, so it would otherwise hang
	// in place once the page moves under it.
	window.addEventListener('scroll', close, true);
	window.addEventListener('resize', close);
})();

window.MailbuxCalendar = {
	refresh: () => { if (calendar) calendar.refetchEvents(); },
	show: showCalendar,
	getEvents: () => calendarEvents
};

})();
