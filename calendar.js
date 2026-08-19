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
		// #/calendar/tasks is the same screen with the task list open. The
		// panel has to be opened on every arrival, not only the first, or the
		// toolbar's ✓ does nothing once the calendar is already showing.
		setTimeout(() => {
			if ('function' === typeof toggleTasks) {
				toggleTasks(window.location.hash.includes('task'));
			}
		}, 200);
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
.event-rsvp-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.event-rsvp-btn { padding: 7px 14px; border: 1px solid var(--cal-border); border-radius: 6px; background: var(--cal-bg-tertiary); color: var(--cal-text-primary); cursor: pointer; font-size: 13px; }
.event-rsvp-btn:hover { border-color: var(--cal-accent); }
.event-rsvp-btn[aria-pressed="true"] { background: var(--cal-accent); border-color: var(--cal-accent); color: #fff; }
.event-guests { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; font-size: 12px; }
.event-guest { display: flex; gap: 8px; align-items: baseline; }
.event-guest-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.event-guest-said { opacity: .75; white-space: nowrap; }
.modern-event.event-unanswered { border-style: dashed; }
.modern-event.event-declined { opacity: .55; text-decoration: line-through; }
.event-skip-list { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.event-skip-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--cal-border); border-radius: 999px; font-size: 12px; }
.event-skip-chip button { border: 0; background: none; color: inherit; cursor: pointer; font-size: 14px; line-height: 1; padding: 0; opacity: .65; }
.event-skip-chip button:hover { opacity: 1; }
.event-skip-chip button:disabled { cursor: not-allowed; opacity: .3; }
.event-skip-none { font-size: 12px; opacity: .7; }
.event-modal-footer-stacked { flex-direction: column; align-items: stretch; }
.event-modal-footer-stacked .event-modal-btn { width: 100%; }
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

/* Free/busy */
.fb-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: 13px; }
.fb-head button { padding: 5px 10px; border: 1px solid var(--cal-border); border-radius: 6px; background: var(--cal-bg-tertiary); color: var(--cal-text-primary); cursor: pointer; }
.fb-day { flex: 1; font-weight: 600; }
.fb-grid { border: 1px solid var(--cal-border); border-radius: 8px; overflow: hidden; }
.fb-hours { display: flex; padding-left: 130px; font-size: 10px; color: var(--cal-text-tertiary); border-bottom: 1px solid var(--cal-border); }
.fb-hours span { flex: 1; padding: 3px 0 3px 3px; border-left: 1px solid var(--cal-border); }
.fb-row { display: flex; align-items: center; border-top: 1px solid var(--cal-border); }
.fb-row:first-child { border-top: none; }
.fb-who { width: 130px; flex: none; padding: 7px 10px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-track { flex: 1; position: relative; height: 30px; background: repeating-linear-gradient(to right, transparent, transparent calc(100%/13 - 1px), var(--cal-border) calc(100%/13 - 1px), var(--cal-border) calc(100%/13)); }
.fb-busy { position: absolute; top: 6px; bottom: 6px; background: var(--cal-accent); border-radius: 3px; opacity: .85; }
.fb-busy.is-tentative { opacity: .45; }
.fb-unknown { position: absolute; inset: 6px 0; background: repeating-linear-gradient(45deg, var(--cal-border), var(--cal-border) 4px, transparent 4px, transparent 8px); border-radius: 3px; }
.fb-now { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--cal-danger); }
.fb-slots { margin-top: 14px; }
.fb-slots h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--cal-text-tertiary); }
.fb-slot { display: inline-block; margin: 0 6px 6px 0; padding: 6px 11px; border: 1px solid var(--cal-border); border-radius: 999px; background: var(--cal-bg-primary); color: var(--cal-text-primary); font-size: 13px; cursor: pointer; }
.fb-slot:hover { border-color: var(--cal-accent); background: var(--cal-accent-light); }
.fb-note { font-size: 12px; color: var(--cal-text-secondary); margin-top: 10px; }

/* Tasks */
.cal-tasks { position: absolute; top: 0; right: 0; bottom: 0; width: 380px; max-width: 100%; background: var(--cal-bg-primary); border-left: 1px solid var(--cal-border); box-shadow: -2px 0 12px var(--cal-shadow); display: flex; flex-direction: column; z-index: 5; }
.cal-tasks-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--cal-border); }
.cal-tasks-head h2 { margin: 0; font-size: 16px; flex: 1; }
.cal-tasks-body { flex: 1; overflow-y: auto; padding: 8px 0 20px; }
.cal-tasks-new { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--cal-border); }
.cal-tasks-new input { flex: 1; padding: 8px 10px; border: 1px solid var(--cal-border); border-radius: 6px; background: var(--cal-bg-primary); color: var(--cal-text-primary); }
.task-group { padding: 12px 16px 2px; font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--cal-text-tertiary); }
.task-row { display: flex; gap: 10px; align-items: flex-start; padding: 7px 16px; cursor: pointer; }
.task-row:hover { background: var(--cal-bg-tertiary); }
.task-row input[type="checkbox"] { margin-top: 3px; flex: none; }
.task-main { flex: 1; min-width: 0; }
.task-title { font-size: 14px; overflow: hidden; text-overflow: ellipsis; }
.task-row.is-done .task-title { text-decoration: line-through; opacity: .55; }
.task-meta { font-size: 11px; color: var(--cal-text-secondary); margin-top: 2px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.task-late { color: var(--cal-danger); font-weight: 600; }
.task-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.task-bang { color: var(--cal-danger); font-weight: 700; }
.task-empty { padding: 24px 16px; color: var(--cal-text-secondary); font-size: 13px; text-align: center; }
.task-bar { height: 3px; border-radius: 2px; background: var(--cal-border); margin-top: 4px; overflow: hidden; }
.task-bar span { display: block; height: 100%; background: var(--cal-accent); }
.task-row.is-child { padding-left: 38px; }
.task-row.is-child .task-title::before { content: '↳ '; opacity: .5; }
.task-kids { font-size: 11px; opacity: .7; }
.modern-event.event-task { border-style: dotted; font-style: italic; }
.modern-event.event-task-done { opacity: .55; text-decoration: line-through; }

/* Calendars */
.cal-calendars { background: var(--cal-bg-primary); border-bottom: 1px solid var(--cal-border); padding: 12px 20px; display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
.calendar-list { display: flex; flex-direction: column; gap: 6px; min-width: 220px; }
.calendar-row { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.calendar-swatch { width: 20px; height: 20px; border-radius: 4px; flex: none; padding: 0; border: 1px solid var(--cal-border); background: none; cursor: pointer; }
.calendar-swatch:disabled { cursor: default; opacity: .6; }
.calendar-swatch::-webkit-color-swatch-wrapper { padding: 2px; }
.calendar-swatch::-webkit-color-swatch { border: none; border-radius: 2px; }
.calendar-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.calendar-drop { border: 0; background: none; color: inherit; cursor: pointer; opacity: .5; font-size: 15px; line-height: 1; padding: 0 4px; }
.calendar-drop:hover { opacity: 1; color: var(--cal-danger); }
.calendar-new { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; }
.calendar-new input[type="text"] { padding: 6px 10px; border: 1px solid var(--cal-border); border-radius: 6px; background: var(--cal-bg-primary); color: var(--cal-text-primary); }
.calendar-new input[type="color"] { width: 34px; height: 30px; padding: 0; border: 1px solid var(--cal-border); border-radius: 6px; background: none; cursor: pointer; }
.calendar-new label { display: inline-flex; align-items: center; gap: 4px; }
.calendar-new button { padding: 6px 12px; border: 1px solid var(--cal-border); border-radius: 6px; background: var(--cal-bg-tertiary); color: var(--cal-text-primary); cursor: pointer; }
.calendar-new button:hover { border-color: var(--cal-accent); }
</style>
<div class="cal-wrapper">
<div class="cal-main">
<div class="cal-header">
<div class="cal-header-left">
<a href="#/mailbox/INBOX" class="cal-back-btn" title="Back to Inbox">← Back</a>
<h1 class="cal-title"><span style="font-size:32px">📅</span><span>Calendar</span></h1>
<button class="cal-add-btn" id="new-event-btn"><span style="font-size:20px">+</span> Add</button>
<button class="cal-add-btn" id="calendar-panel-btn" title="Show, hide and make calendars"
	aria-expanded="false">📚 Calendars</button>
<button class="cal-add-btn" id="tasks-panel-btn" title="Tasks" aria-expanded="false">✓ Tasks</button>
</div>
<div class="cal-header-right" id="cal-account-switcher"></div>
</div>
<div class="cal-calendars" id="calendar-panel" style="display:none;">
	<div class="calendar-list" id="calendar-list"></div>
	<div class="calendar-new">
		<label style="width:100%;"><input type="checkbox" id="calendar-show-tasks">
			<span>Show tasks that are due on the grid</span></label>
		<div style="width:100%;border-top:1px solid var(--cal-border);padding-top:10px;margin-top:4px;">
			<div style="margin-bottom:6px;">Office hours <small style="opacity:.7"
				id="hours-note">— when others may suggest meeting you</small></div>
			<div class="event-repeat-days" id="hours-days">
				<label><input type="checkbox" value="MO"><span>Mon</span></label>
				<label><input type="checkbox" value="TU"><span>Tue</span></label>
				<label><input type="checkbox" value="WE"><span>Wed</span></label>
				<label><input type="checkbox" value="TH"><span>Thu</span></label>
				<label><input type="checkbox" value="FR"><span>Fri</span></label>
				<label><input type="checkbox" value="SA"><span>Sat</span></label>
				<label><input type="checkbox" value="SU"><span>Sun</span></label>
			</div>
			<div class="event-repeat-row">
				<span>From</span>
				<input type="time" class="event-form-input event-repeat-num" id="hours-start"
					style="width:110px;" value="09:00" aria-label="Office hours start">
				<span>to</span>
				<input type="time" class="event-form-input event-repeat-num" id="hours-end"
					style="width:110px;" value="17:00" aria-label="Office hours end">
				<button type="button" id="hours-save">Save</button>
				<button type="button" id="hours-clear">Clear</button>
			</div>
		</div>
		<input type="text" id="calendar-new-name" placeholder="New calendar" aria-label="New calendar name">
		<input type="color" id="calendar-new-color" value="#00639a" aria-label="Colour">
		<label><input type="checkbox" class="calendar-new-comp" value="VEVENT" checked><span>Events</span></label>
		<label><input type="checkbox" class="calendar-new-comp" value="VTODO"><span>Tasks</span></label>
		<label><input type="checkbox" class="calendar-new-comp" value="VJOURNAL"><span>Notes</span></label>
		<button type="button" id="calendar-new-add">Create</button>
	</div>
</div>
<div class="cal-content">
			<div id="fc-calendar"></div>
			<div class="cal-tasks" id="tasks-panel" style="display:none;">
				<div class="cal-tasks-head">
					<h2>Tasks</h2>
					<label style="font-size:12px;display:flex;gap:5px;align-items:center;">
						<input type="checkbox" id="tasks-show-done"><span>Show done</span>
					</label>
					<button type="button" class="event-modal-btn event-modal-btn-secondary"
						id="tasks-close" aria-label="Close tasks">×</button>
				</div>
				<div class="cal-tasks-body" id="tasks-list"></div>
				<div class="cal-tasks-new">
					<input type="text" id="task-quick" placeholder="Add a task and press Enter"
						aria-label="New task">
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Event Modal -->
<div class="event-modal-overlay" id="event-modal">
	<div class="event-modal">
		<div class="event-modal-header">
			<h2 class="event-modal-title" id="event-modal-title">New Event</h2>
			<button class="event-modal-close" id="event-modal-close">×</button>
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
						<option value="following">This and all following</option>
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
				<div class="event-form-group" id="event-skip-row" style="display:none;">
					<label class="event-form-label" for="event-skip-date">Dates it skips</label>
					<div class="event-skip-list" id="event-skip-list"></div>
					<div class="event-repeat-row">
						<input type="date" class="event-form-input event-repeat-until" id="event-skip-date"
							aria-label="Date to skip">
						<button type="button" class="event-modal-btn event-modal-btn-secondary"
							id="event-skip-add">Skip this date</button>
					</div>
					<small class="event-field-hint" id="event-skip-hint"></small>
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
				<div class="event-form-group" id="event-rsvp-row" style="display:none;">
					<label class="event-form-label">Are you going?</label>
					<div class="event-rsvp-row">
						<button type="button" class="event-rsvp-btn" id="event-rsvp-accepted"
							data-partstat="ACCEPTED" aria-pressed="false">Yes</button>
						<button type="button" class="event-rsvp-btn" id="event-rsvp-tentative"
							data-partstat="TENTATIVE" aria-pressed="false">Maybe</button>
						<button type="button" class="event-rsvp-btn" id="event-rsvp-declined"
							data-partstat="DECLINED" aria-pressed="false">No</button>
					</div>
					<small class="event-field-hint" id="event-rsvp-hint"></small>
				</div>
				<div class="event-form-group">
					<label class="event-form-label">Invite</label>
					<input type="text" class="event-form-input" id="event-attendees" placeholder="email@example.com, another@example.com">
					<small style="opacity:.7">Invitations are sent by the calendar server once the event is saved.</small>
					<div class="event-guests" id="event-guests"></div>
					<button type="button" class="event-modal-btn event-modal-btn-secondary"
						id="event-freebusy-btn" style="margin-top:8px;">Check availability</button>
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
			<button class="event-modal-btn event-modal-btn-secondary" id="event-cancel-btn">Cancel</button>
			<button class="event-modal-btn event-modal-btn-primary" id="event-save-btn">Save Event</button>
		</div>
	</div>
</div>

<div class="event-modal-overlay" id="freebusy-modal">
	<div class="event-modal">
		<div class="event-modal-header">
			<h2 class="event-modal-title">When is everyone free?</h2>
			<button class="event-modal-close" id="freebusy-close">×</button>
		</div>
		<div class="event-modal-body">
			<div class="fb-head">
				<button type="button" id="freebusy-prev" aria-label="Previous day">‹</button>
				<span class="fb-day" id="freebusy-day"></span>
				<button type="button" id="freebusy-next" aria-label="Next day">›</button>
			</div>
			<div id="freebusy-body"></div>
		</div>
		<div class="event-modal-footer">
			<button class="event-modal-btn event-modal-btn-secondary" id="freebusy-cancel">Close</button>
		</div>
	</div>
</div>

<div class="event-modal-overlay" id="task-modal">
	<div class="event-modal event-modal-narrow">
		<div class="event-modal-header">
			<h2 class="event-modal-title" id="task-modal-title">Task</h2>
			<button class="event-modal-close" id="task-modal-close">×</button>
		</div>
		<div class="event-modal-body">
			<form id="task-form">
				<div class="event-form-group">
					<label class="event-form-label" for="task-title">Task *</label>
					<input type="text" class="event-form-input" id="task-title" required
						placeholder="What has to be done">
				</div>
				<div class="event-form-group">
					<label class="event-form-label" for="task-due">Due</label>
					<div class="event-repeat-row">
						<input type="date" class="event-form-input event-repeat-until" id="task-due"
							aria-label="Due date">
						<input type="time" class="event-form-input event-repeat-num" id="task-due-time"
							aria-label="Due time" style="width:110px;">
						<button type="button" class="event-modal-btn event-modal-btn-secondary"
							id="task-due-clear">Clear</button>
					</div>
					<small class="event-field-hint">Leave the time empty for a task due any time that day.</small>
				</div>
				<div class="event-form-group">
					<label class="event-form-label" for="task-list">List</label>
					<select class="event-form-select" id="task-list"></select>
				</div>
				<div class="event-form-group">
					<div class="event-repeat-row">
						<label class="event-form-label" for="task-status" style="margin:0;">State</label>
						<select class="event-form-select" id="task-status" style="width:auto;">
							<option value="NEEDS-ACTION">Not started</option>
							<option value="IN-PROCESS">In progress</option>
							<option value="COMPLETED">Done</option>
							<option value="CANCELLED">Dropped</option>
						</select>
						<label for="task-percent">Done</label>
						<input type="number" class="event-form-input event-repeat-num" id="task-percent"
							min="0" max="100" step="5" value="0" aria-label="Per cent done">
						<span>%</span>
					</div>
				</div>
				<div class="event-form-group">
					<div class="event-repeat-row">
						<label class="event-form-label" for="task-priority" style="margin:0;">Priority</label>
						<select class="event-form-select" id="task-priority" style="width:auto;">
							<option value="0">None</option>
							<option value="1">High</option>
							<option value="5">Normal</option>
							<option value="9">Low</option>
						</select>
					</div>
				</div>
				<div class="event-form-group">
					<label class="event-form-label" for="task-repeat">Repeats</label>
					<select class="event-form-select" id="task-repeat">
						<option value="">Does not repeat</option>
						<option value="DAILY">Daily</option>
						<option value="WEEKLY">Weekly</option>
						<option value="WEEKDAYS">Every weekday</option>
						<option value="BIWEEKLY">Bi-weekly</option>
						<option value="MONTHLY">Monthly</option>
						<option value="YEARLY">Yearly</option>
					</select>
					<small class="event-field-hint" id="task-repeat-hint"></small>
				</div>
				<div class="event-form-group">
					<label class="event-form-label" for="task-parent">Part of</label>
					<select class="event-form-select" id="task-parent"></select>
					<small class="event-field-hint">A task this one is a step towards.</small>
				</div>
				<div class="event-form-group">
					<label class="event-form-label" for="task-categories">Tags</label>
					<input type="text" class="event-form-input" id="task-categories"
						placeholder="comma separated">
				</div>
				<div class="event-form-group">
					<label class="event-form-label" for="task-description">Notes</label>
					<textarea class="event-form-textarea" id="task-description"></textarea>
				</div>
			</form>
		</div>
		<div class="event-modal-footer">
			<button class="event-modal-btn event-modal-btn-danger" id="task-delete-btn" style="display:none;">Delete</button>
			<button class="event-modal-btn event-modal-btn-secondary" id="task-cancel-btn">Cancel</button>
			<button class="event-modal-btn event-modal-btn-primary" id="task-save-btn">Save</button>
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
		<div class="event-modal-footer event-modal-footer-stacked">
			<button class="event-modal-btn event-modal-btn-primary" id="scope-modal-occurrence">This occurrence</button>
			<button class="event-modal-btn event-modal-btn-primary" id="scope-modal-following">This and all following</button>
			<button class="event-modal-btn event-modal-btn-primary" id="scope-modal-series">The whole series</button>
			<button class="event-modal-btn event-modal-btn-secondary" id="scope-modal-cancel">Cancel</button>
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
		const skipAdd = document.getElementById('event-skip-add');
		if (skipAdd) skipAdd.addEventListener('click', addSkippedDate);

		const panelBtn = document.getElementById('calendar-panel-btn');
		const panel = document.getElementById('calendar-panel');
		if (panelBtn && panel) {
			panelBtn.addEventListener('click', () => {
				const open = 'none' === panel.style.display;
				panel.style.display = open ? 'flex' : 'none';
				panelBtn.setAttribute('aria-expanded', String(open));
				if (open && !officeHours) loadOfficeHours();
			});
		}
		const calAdd = document.getElementById('calendar-new-add');
		if (calAdd) calAdd.addEventListener('click', addCalendar);
		const fbBtn = document.getElementById('event-freebusy-btn');
		if (fbBtn) fbBtn.addEventListener('click', openFreeBusy);
		['freebusy-close', 'freebusy-cancel'].forEach(id => {
			const el = document.getElementById(id);
			if (el) el.addEventListener('click', () =>
				document.getElementById('freebusy-modal').classList.remove('show'));
		});
		const fbPrev = document.getElementById('freebusy-prev');
		if (fbPrev) fbPrev.addEventListener('click', () => {
			freeBusyDay = new Date(freeBusyDay.getTime() - 86400000);
			loadFreeBusy();
		});
		const fbNext = document.getElementById('freebusy-next');
		if (fbNext) fbNext.addEventListener('click', () => {
			freeBusyDay = new Date(freeBusyDay.getTime() + 86400000);
			loadFreeBusy();
		});

		const hoursSave = document.getElementById('hours-save');
		if (hoursSave) hoursSave.addEventListener('click', () => saveOfficeHours(false));
		const hoursClear = document.getElementById('hours-clear');
		if (hoursClear) hoursClear.addEventListener('click', () => saveOfficeHours(true));

		const gridTasks = document.getElementById('calendar-show-tasks');
		if (gridTasks) {
			gridTasks.checked = tasksOnGrid();
			gridTasks.addEventListener('change', () => {
				setTasksOnGrid(gridTasks.checked);
				if (calendar) calendar.refetchEvents();
			});
		}

		// Tasks: the panel, the quick-add line, and the dialog behind a row.
		const tasksBtn = document.getElementById('tasks-panel-btn');
		if (tasksBtn) tasksBtn.addEventListener('click', () => toggleTasks());
		const tasksClose = document.getElementById('tasks-close');
		if (tasksClose) tasksClose.addEventListener('click', () => toggleTasks(false));
		const showDone = document.getElementById('tasks-show-done');
		if (showDone) {
			showDone.addEventListener('change', () => {
				showDoneTasks = showDone.checked;
				renderTasks();
			});
		}
		const quick = document.getElementById('task-quick');
		if (quick) {
			quick.addEventListener('keydown', (e) => {
				if ('Enter' !== e.key) return;
				e.preventDefault();
				quickAddTask(quick.value);
				quick.value = '';
			});
		}
		const taskSave = document.getElementById('task-save-btn');
		if (taskSave) taskSave.addEventListener('click', saveTaskFromModal);
		const taskDelete = document.getElementById('task-delete-btn');
		if (taskDelete) {
			taskDelete.addEventListener('click', () => {
				if (!editingTask) return;
				const doomed = editingTask;
				document.getElementById('task-modal').classList.remove('show');
				editingTask = null;
				removeTask(doomed);
			});
		}
		const dueClear = document.getElementById('task-due-clear');
		if (dueClear) {
			dueClear.addEventListener('click', () => {
				document.getElementById('task-due').value = '';
				document.getElementById('task-due-time').value = '';
			});
		}
		['task-modal-close', 'task-cancel-btn'].forEach(id => {
			const el = document.getElementById(id);
			if (el) {
				el.addEventListener('click', () => {
					document.getElementById('task-modal').classList.remove('show');
					editingTask = null;
				});
			}
		});

		// A route straight to the tasks, so the toolbar button lands on them
		// rather than on the grid with a panel to find.
		if (window.location.hash.includes('task')) toggleTasks(true);
		document.querySelectorAll('.event-rsvp-btn').forEach(btn => {
			btn.addEventListener('click', () => answerInvitation(btn.dataset.partstat));
		});
		const scopeButtons = {
			'scope-modal-occurrence': 'occurrence',
			'scope-modal-following': 'following',
			'scope-modal-series': 'series',
			'scope-modal-cancel': null
		};
		Object.keys(scopeButtons).forEach(id => {
			const el = document.getElementById(id);
			if (el) el.addEventListener('click', () => resolveScope(scopeButtons[id]));
		});

		// The dialog's own close and cancel buttons, by name. These used to be
		// found by class with querySelector, which returns whichever match
		// comes first in the document - so the day any button carrying those
		// classes was added to the form above them, the footer's Cancel
		// silently stopped closing anything and the new button quietly gained
		// a second job.
		['event-modal-close', 'event-cancel-btn'].forEach(id => {
			const el = document.getElementById(id);
			if (el) {
				el.addEventListener('click', () => {
					document.getElementById('event-modal').classList.remove('show');
				});
			}
		});

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
		const repeats = isRecurring(eventData);
		if (scopeRow) scopeRow.style.display = repeats ? 'block' : 'none';
		if (scopeSel) scopeSel.value = 'occurrence';

		// The dates it leaves out. Shown for any series, including one whose
		// rule these controls cannot express: skipping a date says nothing
		// about the rule, so there is no reason to withhold it.
		const skipRow = document.getElementById('event-skip-row');
		if (skipRow) skipRow.style.display = repeats ? 'block' : 'none';
		loadSkippedDates(eventData.skipped);
		refreshScopeUi();

		// Somebody else's meeting: an invitation to answer, and the answers
		// everyone else has given.
		showInvitation(eventData);
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
		const skipRowNew = document.getElementById('event-skip-row');
		if (skipRowNew) skipRowNew.style.display = 'none';
		loadSkippedDates([]);
		refreshScopeUi();
		showInvitation({});
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
		updateEvent(currentEditingEvent, eventData.repeat, currentScope(), skippedPayload());
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
	}, 'CancelCalendarEvent', { EventId: eventId, Reason: reason,
		Collection: currentEditingEvent?.extendedProps?.calendar || '' });
}

function deleteEventFromModal() {
	if (!currentEditingEvent) return;

	const event = currentEditingEvent;
	const remove = (scope) => {
		const eventId = event.id || event.extendedProps?.uid;
		event.remove();
		deleteEvent(eventId, scope, event.extendedProps?.recurrenceId,
			event.extendedProps?.calendar);
		document.getElementById('event-modal').classList.remove('show');
		currentEditingEvent = null;
	};

	// Deleting one occurrence of a series is not deleting the event; the two
	// are far enough apart to be worth asking about rather than confirming.
	if (isRecurring(event)) {
		askRecurrenceScope('Delete repeating event',
			'"' + event.title + '" repeats. Delete only this occurrence, this one and'
				+ ' everything after it, or every occurrence?',
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
/* ------------------------------------------------------------------ *
 * Dates the series skips
 *
 * A recurring event is a rule, and a rule has no way to say "except that
 * week". iCalendar puts those dates on the master as EXDATE, and this is
 * where they are listed, added to and taken back off.
 *
 * They are held as the instants the server sent, not as the dates shown:
 * a series stored in another zone can have an occurrence that falls on the
 * evening before the date the reader sees, and the server snaps whatever
 * arrives to the occurrence nearest it. Echoing back what it sent is
 * therefore exact, and a date picked here only has to be close.
 * ------------------------------------------------------------------ */
let skippedDates = [];

// What a stored exception is called in the reader's own zone. All-day series
// state theirs as plain dates, which are already what they say they are.
function skipLabel(value) {
	const v = (value || '').trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
	const when = new Date(v);
	return isNaN(when) ? v : formatDateOnly(when);
}

function loadSkippedDates(list) {
	skippedDates = (list || []).slice(0, 366);
	const picker = document.getElementById('event-skip-date');
	if (picker) picker.value = '';
	renderSkippedDates();
}

function renderSkippedDates() {
	const list = document.getElementById('event-skip-list');
	if (!list) return;
	const frozen = 'occurrence' === currentScope();
	list.textContent = '';
	if (!skippedDates.length) {
		const none = document.createElement('span');
		none.className = 'event-skip-none';
		none.textContent = 'None - every occurrence is kept.';
		list.appendChild(none);
	}
	skippedDates.forEach((value, index) => {
		const chip = document.createElement('span');
		chip.className = 'event-skip-chip';
		const label = document.createElement('span');
		label.textContent = skipLabel(value);
		const drop = document.createElement('button');
		drop.type = 'button';
		drop.textContent = '×';
		drop.disabled = frozen;
		drop.title = 'Put this date back';
		drop.setAttribute('aria-label', 'Put ' + skipLabel(value) + ' back');
		drop.addEventListener('click', () => {
			skippedDates.splice(index, 1);
			renderSkippedDates();
		});
		chip.appendChild(label);
		chip.appendChild(drop);
		list.appendChild(chip);
	});

	const hint = document.getElementById('event-skip-hint');
	if (hint) {
		hint.textContent = frozen
			? 'The dates a series leaves out belong to the series - switch above to change them.'
			: 'A date the event does not fall on cannot be skipped, and is dropped on saving.';
	}
}

// The picker gives a date; the occurrence on it happens at the time this one
// does, which is close enough for the server to snap to the right instant.
function addSkippedDate() {
	const picker = document.getElementById('event-skip-date');
	const day = picker && picker.value;
	if (!day || 'occurrence' === currentScope()) return;

	const parts = day.split('-').map(n => parseInt(n, 10));
	const allDay = document.getElementById('event-allday').checked;
	let value = day;
	if (!allDay) {
		const from = new Date(document.getElementById('event-start').value);
		const when = new Date(parts[0], parts[1] - 1, parts[2],
			isNaN(from) ? 0 : from.getHours(), isNaN(from) ? 0 : from.getMinutes());
		value = when.toISOString();
	}
	if (!skippedDates.some(v => skipLabel(v) === day)) {
		skippedDates.push(value);
		skippedDates.sort((a, b) => skipLabel(a).localeCompare(skipLabel(b)));
	}
	picker.value = '';
	renderSkippedDates();
}

// Sent only when the dialog is showing the list and the scope allows it, on
// the same terms as the repeat fields: silence leaves the stored ones alone,
// which is what dragging in the grid has to do.
function skippedPayload() {
	const row = document.getElementById('event-skip-row');
	if (!row || 'none' === row.style.display || 'occurrence' === currentScope()) {
		return undefined;
	}
	return skippedDates.join(',');
}

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
 * Free/busy — when is everyone free?
 *
 * The server answers this, not us: an RFC 6638 scheduling request asks
 * every attendee's calendar, including ones this account cannot read, and
 * gets back busy times without any event details. Nothing here sees
 * anybody else's appointments, which is exactly why it is allowed to ask.
 *
 * The day is drawn from FB_DAY_START to FB_DAY_END rather than midnight to
 * midnight: a working day is what people are choosing between, and 24
 * hours of mostly-empty bar makes the hours that matter unreadable.
 * ------------------------------------------------------------------ */
const FB_DAY_START = 7;
const FB_DAY_END = 20;
const FB_SLOT_STEP_MIN = 15;
let freeBusyDay = null;
let freeBusyAnswer = null;
// The account's own office hours, as the server holds them (RFC 7953). Null
// until asked for; { known, set, days, start, end } once it has been.
let officeHours = null;

function hoursDayBoxes() {
	return Array.from(document.querySelectorAll('#hours-days input[type="checkbox"]'));
}

function loadOfficeHours(then) {
	if (!rl.pluginRemoteRequest) return;
	rl.pluginRemoteRequest((iError, oData) => {
		const res = oData && oData.Result;
		officeHours = (res && res.success) ? res : { known: false, set: false };
		showOfficeHours();
		if (then) then();
	}, 'GetAvailability', {});
}

function showOfficeHours() {
	const note = document.getElementById('hours-note');
	if (!officeHours || !note) return;

	// A pattern beyond one weekly shape is left exactly as it stands, and the
	// controls say so rather than showing a version of it that is not true.
	const beyond = officeHours.set && !officeHours.known;
	hoursDayBoxes().forEach(box => {
		box.checked = !beyond && -1 !== (officeHours.days || []).indexOf(box.value);
		box.disabled = beyond;
	});
	const startEl = document.getElementById('hours-start');
	const endEl = document.getElementById('hours-end');
	if (startEl) {
		startEl.value = (!beyond && officeHours.start) || '09:00';
		startEl.disabled = beyond;
	}
	if (endEl) {
		endEl.value = (!beyond && officeHours.end) || '17:00';
		endEl.disabled = beyond;
	}
	const save = document.getElementById('hours-save');
	if (save) save.disabled = beyond;

	note.textContent = beyond
		? '— set to a pattern this page cannot show, and left as it is'
		: (officeHours.known
			? '— used when suggesting times to meet you'
			: '— none set; suggestions use the whole working day');
}

function saveOfficeHours(clear) {
	if (!rl.pluginRemoteRequest) return;
	const days = clear ? [] : hoursDayBoxes().filter(b => b.checked).map(b => b.value);
	rl.pluginRemoteRequest((iError, oData) => {
		const res = oData && oData.Result;
		if (iError || !res || !res.success) {
			alert((res && res.error) || 'Could not save your office hours.');
			return;
		}
		loadOfficeHours();
	}, 'SaveAvailability', {
		Days: days.join(','),
		Start: (document.getElementById('hours-start') || {}).value || '',
		End: (document.getElementById('hours-end') || {}).value || '',
		// The browser knows the reader's zone; office hours are wall-clock and
		// have to be stored in one, or they move twice a year.
		Timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
	});
}

// The busy periods of everyone, merged into one list of intervals nobody is
// available in. Overlaps are joined, so the gaps between them are exactly the
// times every single person is free.
function mergeBusy(people, from, to) {
	const spans = [];
	(people || []).forEach(person => {
		(person.periods || []).forEach(period => {
			const start = new Date(period.start), end = new Date(period.end);
			if (isNaN(start) || isNaN(end) || end <= from || start >= to) return;
			spans.push([Math.max(start.getTime(), from.getTime()),
				Math.min(end.getTime(), to.getTime())]);
		});
	});
	spans.sort((a, b) => a[0] - b[0]);

	const merged = [];
	spans.forEach(span => {
		const last = merged[merged.length - 1];
		if (last && span[0] <= last[1]) {
			last[1] = Math.max(last[1], span[1]);
		} else {
			merged.push(span.slice());
		}
	});
	return merged;
}

// Every start time, on a quarter hour, where a meeting of this length fits
// with nobody busy. Returns times, not spans: the caller knows the duration.
function freeSlots(people, from, to, durationMs, limit) {
	const busy = mergeBusy(people, from, to);
	const step = FB_SLOT_STEP_MIN * 60000;
	const out = [];

	// Start on the next step boundary, so suggestions read as 09:00 and 09:15
	// rather than 09:07.
	let at = Math.ceil(from.getTime() / step) * step;
	const end = to.getTime();
	while (at + durationMs <= end && out.length < (limit || 8)) {
		const clash = busy.find(span => at < span[1] && (at + durationMs) > span[0]);
		if (clash) {
			// Jump to the end of whatever is in the way rather than crawling.
			at = Math.ceil(clash[1] / step) * step;
			continue;
		}
		out.push(new Date(at));
		at += step;
	}
	return out;
}

// The stretch of a day worth drawing, and worth suggesting inside. Office
// hours narrow it when they are set: proposing nine in the evening on a Sunday
// is the way a "find a time" feature earns being ignored.
function fbWindow(day) {
	const from = new Date(day);
	const to = new Date(day);
	let startHour = FB_DAY_START, endHour = FB_DAY_END;

	if (officeHours && officeHours.known && (officeHours.days || []).length) {
		const token = DAY_TOKENS[day.getDay()];
		if (-1 === officeHours.days.indexOf(token)) {
			// Not a working day at all. The day is still drawn, so somebody can
			// see it is empty and choose it anyway, but nothing is suggested.
			from.setHours(FB_DAY_START, 0, 0, 0);
			to.setHours(FB_DAY_END, 0, 0, 0);
			return { from: from, to: to, working: false };
		}
		const at = (hhmm, fallback) => {
			const parts = String(hhmm || '').split(':');
			const h = parseInt(parts[0], 10);
			return isNaN(h) ? fallback : h + ((parseInt(parts[1], 10) || 0) / 60);
		};
		startHour = Math.floor(at(officeHours.start, FB_DAY_START));
		endHour = Math.ceil(at(officeHours.end, FB_DAY_END));
		if (endHour <= startHour) { startHour = FB_DAY_START; endHour = FB_DAY_END; }
	}

	from.setHours(startHour, 0, 0, 0);
	to.setHours(endHour, 0, 0, 0);
	return { from: from, to: to, working: true };
}

function openFreeBusy() {
	const startEl = document.getElementById('event-start');
	const when = new Date(startEl && startEl.value ? startEl.value : Date.now());
	freeBusyDay = isNaN(when) ? new Date() : when;
	document.getElementById('freebusy-modal').classList.add('show');
	// Office hours decide the window, so they are asked for first - once per
	// dialog, not once per day paged through.
	if (officeHours) { loadFreeBusy(); } else { loadOfficeHours(loadFreeBusy); }
}

function loadFreeBusy() {
	const body = document.getElementById('freebusy-body');
	const label = document.getElementById('freebusy-day');
	if (!body || !rl.pluginRemoteRequest) return;

	const span = fbWindow(freeBusyDay);
	if (label) {
		label.textContent = freeBusyDay.toLocaleDateString(undefined,
			{ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
	}
	body.textContent = 'Asking the server…';

	rl.pluginRemoteRequest((iError, oData) => {
		const res = oData && oData.Result;
		if (iError || !res || !res.success) {
			body.textContent = (res && res.error) || 'The server would not answer.';
			return;
		}
		freeBusyAnswer = res.busy || [];
		renderFreeBusy(span.from, span.to);
	}, 'QueryFreeBusy', {
		Attendees: (document.getElementById('event-attendees') || {}).value || '',
		Start: span.from.toISOString(),
		End: span.to.toISOString()
	});
}

function renderFreeBusy(from, to) {
	const body = document.getElementById('freebusy-body');
	if (!body) return;
	body.textContent = '';

	const total = to.getTime() - from.getTime();
	const at = (when) => (100 * (when - from.getTime()) / total) + '%';

	const grid = document.createElement('div');
	grid.className = 'fb-grid';

	const hours = document.createElement('div');
	hours.className = 'fb-hours';
	for (let h = from.getHours(); h < to.getHours(); ++h) {
		const cell = document.createElement('span');
		cell.textContent = String(h).padStart(2, '0');
		hours.appendChild(cell);
	}
	grid.appendChild(hours);

	(freeBusyAnswer || []).forEach(person => {
		const row = document.createElement('div');
		row.className = 'fb-row';
		const who = document.createElement('div');
		who.className = 'fb-who';
		who.textContent = person.address;
		who.title = person.address;
		const track = document.createElement('div');
		track.className = 'fb-track';

		if (!person.known) {
			// Hatched, never blank: "we could not ask" and "they are free" are
			// answers nobody may confuse.
			const unknown = document.createElement('div');
			unknown.className = 'fb-unknown';
			unknown.title = 'No answer for this address' + (person.status ? ' (' + person.status + ')' : '');
			track.appendChild(unknown);
			who.style.opacity = '.6';
		} else {
			(person.periods || []).forEach(period => {
				const start = new Date(period.start), end = new Date(period.end);
				if (end <= from || start >= to) return;
				const block = document.createElement('div');
				block.className = 'fb-busy'
					+ (/TENTATIVE/.test(period.type || '') ? ' is-tentative' : '');
				const left = Math.max(start.getTime(), from.getTime());
				const right = Math.min(end.getTime(), to.getTime());
				block.style.left = at(left);
				block.style.width = (100 * (right - left) / total) + '%';
				block.title = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
					+ ' – ' + end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
					+ (/TENTATIVE/.test(period.type || '') ? ' (tentative)' : '');
				track.appendChild(block);
			});
		}

		const now = new Date();
		if (now >= from && now <= to) {
			const line = document.createElement('div');
			line.className = 'fb-now';
			line.style.left = at(now.getTime());
			track.appendChild(line);
		}

		row.appendChild(who);
		row.appendChild(track);
		grid.appendChild(row);
	});

	if (!(freeBusyAnswer || []).length) {
		const none = document.createElement('div');
		none.className = 'fb-note';
		none.textContent = 'Nobody to ask about yet — add some guests first.';
		grid.appendChild(none);
	}
	body.appendChild(grid);

	// How long the meeting is, taken from the dialog, so the suggestions are
	// slots this meeting fits in rather than arbitrary gaps.
	const startEl = document.getElementById('event-start');
	const endEl = document.getElementById('event-end');
	let duration = 3600000;
	if (startEl && endEl && startEl.value && endEl.value) {
		const guess = new Date(endEl.value) - new Date(startEl.value);
		if (guess > 0) duration = guess;
	}

	const known = (freeBusyAnswer || []).filter(p => p.known);
	const working = fbWindow(freeBusyDay).working;
	const slots = working ? freeSlots(known, from, to, duration, 8) : [];
	const box = document.createElement('div');
	box.className = 'fb-slots';
	const title = document.createElement('h4');
	title.textContent = 'Everyone is free at';
	box.appendChild(title);

	if (!slots.length) {
		const none = document.createElement('div');
		none.className = 'fb-note';
		none.textContent = !working
			? 'Outside your office hours. The day is drawn so you can choose it anyway.'
			: (known.length
				? 'No gap this long on this day. Try another.'
				: 'Nothing to suggest until somebody\'s calendar answers.');
		box.appendChild(none);
	}
	slots.forEach(slot => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'fb-slot';
		btn.textContent = slot.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
		btn.addEventListener('click', () => takeSlot(slot, duration));
		box.appendChild(btn);
	});
	body.appendChild(box);

	const unknown = (freeBusyAnswer || []).filter(p => !p.known);
	if (unknown.length) {
		const note = document.createElement('div');
		note.className = 'fb-note';
		note.textContent = unknown.length + ' address'
			+ (1 === unknown.length ? '' : 'es')
			+ ' could not be checked — hatched above. They are not counted as free.';
		body.appendChild(note);
	}
}

// Taking a suggestion writes it into the dialog and leaves the saving to the
// person: a click here has chosen a time, not booked a meeting.
function takeSlot(start, durationMs) {
	const startEl = document.getElementById('event-start');
	const endEl = document.getElementById('event-end');
	if (!startEl || !endEl) return;
	const end = new Date(start.getTime() + durationMs);
	if (document.getElementById('event-allday').checked) {
		document.getElementById('event-allday').checked = false;
		toggleTimeInputs(false);
	}
	startEl.value = formatDateTimeLocal(start);
	endEl.value = formatDateTimeLocal(end);
	document.getElementById('freebusy-modal').classList.remove('show');
}

/* ------------------------------------------------------------------ *
 * Tasks
 *
 * A VTODO lives in the same collections as an event, under the same
 * account - which is why this is not a plugin of its own. It is not the
 * same shape though: a task is a due date, a state and a proportion done,
 * not a span in a grid, so it gets a list rather than a place on the
 * calendar. Sorting is by when it is due and then by priority, because
 * that is the order the day actually has to be worked in.
 * ------------------------------------------------------------------ */
let knownTasks = [];
let taskLists = [];
let showDoneTasks = false;

function taskPanel() {
	return document.getElementById('tasks-panel');
}

function tasksShowing() {
	const panel = taskPanel();
	return !!panel && 'none' !== panel.style.display;
}

function toggleTasks(open) {
	const panel = taskPanel();
	const btn = document.getElementById('tasks-panel-btn');
	if (!panel) return;
	const wanted = (undefined === open) ? !tasksShowing() : !!open;
	panel.style.display = wanted ? 'flex' : 'none';
	if (btn) btn.setAttribute('aria-expanded', String(wanted));
	if (wanted) loadTasks();
}

const TASKS_ON_GRID_KEY = 'caldav-tasks-on-grid';

function tasksOnGrid() {
	try { return 'yes' === localStorage.getItem(TASKS_ON_GRID_KEY); }
	catch (e) { return false; }
}

function setTasksOnGrid(on) {
	try { localStorage.setItem(TASKS_ON_GRID_KEY, on ? 'yes' : 'no'); }
	catch (e) { /* private browsing; the list still has them */ }
}

// A task with a due date drawn where it falls. It is not an event and should
// not read as one - dotted, italic, and struck through once it is done - but
// "what is due on Thursday" is a calendar question, and answering it only in a
// list means looking in two places to plan one day.
function taskAsEvent(task) {
	const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(task.due || '');
	const due = taskDue(task);
	if (!due) return null;
	const done = taskIsDone(task);
	return {
		id: 'task:' + task.uid,
		title: (done ? '✓ ' : '☐ ') + (task.summary || 'Untitled task'),
		start: dateOnly ? task.due : due,
		allDay: dateOnly,
		backgroundColor: task.calendarColor || 'var(--cal-event-bg)',
		borderColor: task.calendarColor || 'var(--cal-event-border)',
		textColor: task.calendarColor ? '#fff' : 'var(--cal-event-text)',
		editable: !task.readOnly,
		classNames: ['modern-event', 'event-task'].concat(done ? ['event-task-done'] : []),
		extendedProps: { isTask: true, task: task }
	};
}

function loadTasks() {
	if (!rl.pluginRemoteRequest) return;
	rl.pluginRemoteRequest((iError, oData) => {
		const res = oData && oData.Result;
		if (iError || !res || !res.success) {
			renderTasks((res && res.error) || 'Could not read the tasks.');
			return;
		}
		knownTasks = res.tasks || [];
		taskLists = res.lists || [];
		renderTasks();
	}, 'GetTasks', {});
}

// Midnight tonight, and the end of the week, in the reader's own timezone -
// which is what "today" and "this week" mean to the person reading.
function endOfToday() {
	const end = new Date();
	end.setHours(23, 59, 59, 999);
	return end;
}

function taskDue(task) {
	if (!task || !task.due) return null;
	// A task due on a date is due at the end of that day, not at its start:
	// "Friday" is not overdue on Friday morning.
	if (/^\d{4}-\d{2}-\d{2}$/.test(task.due)) {
		const parts = task.due.split('-').map(n => parseInt(n, 10));
		return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
	}
	const when = new Date(task.due);
	return isNaN(when) ? null : when;
}

function taskIsDone(task) {
	return 'COMPLETED' === (task.status || '').toUpperCase();
}

function taskGroup(task) {
	if (taskIsDone(task)) return 'Done';
	if ('CANCELLED' === (task.status || '').toUpperCase()) return 'Dropped';
	const due = taskDue(task);
	if (!due) return 'No date';
	const today = endOfToday();
	if (due < new Date()) return 'Overdue';
	if (due <= today) return 'Today';
	const week = new Date(today.getTime() + 6 * 86400000);
	return (due <= week) ? 'This week' : 'Later';
}

const TASK_GROUPS = ['Overdue', 'Today', 'This week', 'Later', 'No date', 'Dropped', 'Done'];

function sayDue(task) {
	const due = taskDue(task);
	if (!due) return '';
	const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(task.due);
	const opts = dateOnly
		? { weekday: 'short', day: 'numeric', month: 'short' }
		: { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
	return due.toLocaleDateString(undefined, opts);
}

function renderTasks(message) {
	const box = document.getElementById('tasks-list');
	if (!box) return;
	box.textContent = '';

	if (message) {
		const err = document.createElement('div');
		err.className = 'task-empty';
		err.textContent = message;
		box.appendChild(err);
		return;
	}

	const wanted = knownTasks.filter(t => showDoneTasks || !taskIsDone(t));
	if (!wanted.length) {
		const none = document.createElement('div');
		none.className = 'task-empty';
		none.textContent = knownTasks.length
			? 'Nothing outstanding.'
			: (taskLists.length
				? 'No tasks yet. Add one below.'
				: 'No task list yet - make a calendar that holds tasks, under Calendars.');
		box.appendChild(none);
		return;
	}

	// Due first, then the more urgent of two things due the same day. A task
	// with no priority sorts after one with any, which is what 0 means in
	// RFC 5545: undefined, not lowest.
	const order = (task) => {
		const due = taskDue(task);
		return due ? due.getTime() : Number.MAX_SAFE_INTEGER;
	};
	wanted.sort((a, b) => (order(a) - order(b))
		|| ((a.priority || 10) - (b.priority || 10))
		|| (a.summary || '').localeCompare(b.summary || ''));

	// A sub-task is shown under the task it is a step towards, in whichever
	// group the parent lands in - a step is not overdue on its own account
	// when the thing it belongs to is not due yet.
	const byUid = {};
	knownTasks.forEach(t => { byUid[t.uid] = t; });
	const childrenOf = {};
	wanted.forEach(t => {
		if (t.parent && byUid[t.parent]) {
			(childrenOf[t.parent] = childrenOf[t.parent] || []).push(t);
		}
	});
	const orphaned = (t) => !t.parent || !byUid[t.parent]
		// A child whose parent is filtered out of the view has to stand on its
		// own, or it disappears with a parent the reader can still see is done.
		|| !wanted.some(w => w.uid === t.parent);

	TASK_GROUPS.forEach(group => {
		const inGroup = wanted.filter(t => orphaned(t) && taskGroup(t) === group);
		if (!inGroup.length) return;
		const kids = inGroup.reduce((n, t) => n + (childrenOf[t.uid] || []).length, 0);
		const head = document.createElement('div');
		head.className = 'task-group';
		head.textContent = group + ' (' + (inGroup.length + kids) + ')';
		box.appendChild(head);
		inGroup.forEach(task => {
			box.appendChild(taskRow(task, group, childrenOf[task.uid]));
			(childrenOf[task.uid] || []).forEach(kid =>
				box.appendChild(taskRow(kid, taskGroup(kid), null, true)));
		});
	});
}

function taskRow(task, group, children, isChild) {
	const row = document.createElement('div');
	row.className = 'task-row' + (taskIsDone(task) ? ' is-done' : '')
		+ (isChild ? ' is-child' : '');

	const tick = document.createElement('input');
	tick.type = 'checkbox';
	tick.checked = taskIsDone(task);
	tick.disabled = !!task.readOnly;
	tick.setAttribute('aria-label', (taskIsDone(task) ? 'Reopen ' : 'Finish ') + (task.summary || ''));
	tick.addEventListener('click', (e) => e.stopPropagation());
	tick.addEventListener('change', () => finishTask(task, tick.checked));

	const main = document.createElement('div');
	main.className = 'task-main';
	const title = document.createElement('div');
	title.className = 'task-title';
	title.textContent = task.summary || 'Untitled task';
	main.appendChild(title);

	const meta = document.createElement('div');
	meta.className = 'task-meta';
	if (task.calendarColor || task.calendarName) {
		const dot = document.createElement('span');
		dot.className = 'task-dot';
		dot.style.background = task.calendarColor || 'var(--cal-event-bg)';
		dot.title = task.calendarName || task.calendar || '';
		meta.appendChild(dot);
	}
	const when = sayDue(task);
	if (when) {
		const due = document.createElement('span');
		due.textContent = when;
		if ('Overdue' === group) due.className = 'task-late';
		meta.appendChild(due);
	}
	// 1 to 4 is high in RFC 5545, 5 is normal, 6 to 9 low. Only the ones
	// worth interrupting the reader for are shown.
	if (task.priority && 5 > task.priority) {
		const bang = document.createElement('span');
		bang.className = 'task-bang';
		bang.textContent = '!';
		bang.title = 'High priority';
		meta.appendChild(bang);
	}
	if (task.rrule) {
		const loop = document.createElement('span');
		loop.textContent = '↻';
		loop.title = 'Repeats';
		meta.appendChild(loop);
	}
	if (children && children.length) {
		const kids = document.createElement('span');
		kids.className = 'task-kids';
		const done = children.filter(taskIsDone).length;
		kids.textContent = done + '/' + children.length + ' steps';
		meta.appendChild(kids);
	}
	(task.categories || []).slice(0, 3).forEach(cat => {
		const tag = document.createElement('span');
		tag.textContent = cat;
		meta.appendChild(tag);
	});
	if (meta.childNodes.length) main.appendChild(meta);

	if (task.percent && !taskIsDone(task)) {
		const bar = document.createElement('div');
		bar.className = 'task-bar';
		const fill = document.createElement('span');
		fill.style.width = Math.max(0, Math.min(100, task.percent)) + '%';
		bar.appendChild(fill);
		main.appendChild(bar);
	}

	row.appendChild(tick);
	row.appendChild(main);
	if (!task.readOnly) row.addEventListener('click', () => openTaskModal(task));
	return row;
}

let editingTask = null;
// True when the stored rule is beyond what the dropdown can show, so saving
// deliberately says nothing about recurrence and leaves it alone.
let taskRepeatUnsupported = false;

function openTaskModal(task) {
	editingTask = task || null;
	const modal = document.getElementById('task-modal');
	if (!modal) return;

	document.getElementById('task-modal-title').textContent = task ? 'Task' : 'New task';
	document.getElementById('task-title').value = task ? (task.summary || '') : '';
	document.getElementById('task-description').value = task ? (task.description || '') : '';
	document.getElementById('task-categories').value = task ? (task.categories || []).join(', ') : '';
	document.getElementById('task-status').value = task ? (task.status || 'NEEDS-ACTION') : 'NEEDS-ACTION';
	document.getElementById('task-percent').value = task ? (task.percent || 0) : 0;
	document.getElementById('task-priority').value = task ? String(task.priority || 0) : '0';

	// How it repeats. Only the named shapes are offered: a rule beyond them was
	// written by another client and is left exactly as it stands, which the
	// hint says rather than the dropdown pretending it says nothing.
	const repeat = document.getElementById('task-repeat');
	const parsed = parseRRule(task ? (task.rrule || '') : '');
	const known = task && task.rrule
		? Object.keys(REPEAT_PRESETS).find(key => {
			const shape = REPEAT_PRESETS[key];
			return shape.freq === parsed.freq && shape.interval === parsed.interval
				&& shape.days.join(',') === parsed.days.join(',');
		}) : '';
	taskRepeatUnsupported = !!(task && task.rrule && !known);
	repeat.value = known || '';
	repeat.disabled = taskRepeatUnsupported;
	document.getElementById('task-repeat-hint').textContent = taskRepeatUnsupported
		? 'This repeats in a way this dialog cannot show, so it is left as it is.'
		: 'A repeating task needs a date to repeat from.';

	// What it is a step towards. Only tasks on the same list, and never itself
	// or one of its own steps, which would make a loop nothing can draw.
	const parent = document.getElementById('task-parent');
	parent.textContent = '';
	const none = document.createElement('option');
	none.value = '';
	none.textContent = 'Nothing - a task of its own';
	parent.appendChild(none);
	const onList = (task && task.calendar) || taskList();
	knownTasks
		.filter(t => t.calendar === onList && (!task || (t.uid !== task.uid && t.parent !== task.uid)))
		.forEach(t => {
			const option = document.createElement('option');
			option.value = t.uid;
			option.textContent = t.summary || 'Untitled task';
			parent.appendChild(option);
		});
	parent.value = (task && task.parent) || '';

	// A date due and a time due are the same field here; which one was stored
	// is the difference between "Friday" and "Friday at four".
	const due = task ? taskDue(task) : null;
	const dateOnly = !task || !task.due || /^\d{4}-\d{2}-\d{2}$/.test(task.due);
	document.getElementById('task-due').value = due ? formatDateOnly(due) : '';
	document.getElementById('task-due-time').value = (due && !dateOnly)
		? String(due.getHours()).padStart(2, '0') + ':' + String(due.getMinutes()).padStart(2, '0')
		: '';

	const list = document.getElementById('task-list');
	list.textContent = '';
	taskLists.filter(l => l.writable).forEach(l => {
		const option = document.createElement('option');
		option.value = l.name;
		option.textContent = l.displayName || l.name;
		list.appendChild(option);
	});
	list.value = (task && task.calendar) || taskList();
	// A task cannot be moved between lists here: that is a DAV MOVE, not a
	// property, and pretending otherwise would silently do nothing.
	list.disabled = !!task;

	document.getElementById('task-delete-btn').style.display = task ? 'block' : 'none';
	modal.classList.add('show');
	document.getElementById('task-title').focus();
}

function saveTaskFromModal() {
	const title = document.getElementById('task-title').value.trim();
	if (!title) {
		alert('A task needs a title.');
		return;
	}
	const day = document.getElementById('task-due').value;
	const time = document.getElementById('task-due-time').value;
	let dueValue = '';
	if (day) {
		if (time) {
			const parts = day.split('-').map(n => parseInt(n, 10));
			const clock = time.split(':').map(n => parseInt(n, 10));
			dueValue = new Date(parts[0], parts[1] - 1, parts[2], clock[0], clock[1]).toISOString();
		} else {
			dueValue = day;
		}
	}

	saveTask({
		Uid: editingTask ? editingTask.uid : '',
		Collection: editingTask ? (editingTask.calendar || '') : document.getElementById('task-list').value,
		Title: title,
		Due: dueValue,
		AllDay: !time,
		Description: document.getElementById('task-description').value,
		Categories: document.getElementById('task-categories').value,
		Status: document.getElementById('task-status').value,
		Percent: parseInt(document.getElementById('task-percent').value, 10) || 0,
		Priority: parseInt(document.getElementById('task-priority').value, 10) || 0,
		Parent: document.getElementById('task-parent').value,
		// Omitted when the stored rule is beyond this dialog, so the server
		// leaves it exactly as the client that wrote it left it.
		...(taskRepeatUnsupported ? {} : repeatFieldsFor(document.getElementById('task-repeat').value))
	});
	document.getElementById('task-modal').classList.remove('show');
	editingTask = null;
}

// The named repeat shapes, as the fields the server assembles a rule from.
function repeatFieldsFor(preset) {
	const shape = REPEAT_PRESETS[preset];
	return {
		Repeat: shape ? shape.freq : '',
		RepeatInterval: shape ? shape.interval : 1,
		RepeatDays: shape ? shape.days.join(',') : '',
		RepeatEnd: '',
		RepeatCount: 10,
		RepeatUntil: ''
	};
}

function finishTask(task, done) {
	saveTask({
		Uid: task.uid,
		Collection: task.calendar || '',
		Status: done ? 'COMPLETED' : 'NEEDS-ACTION',
		Percent: done ? 100 : 0
	});
}

// The list a new task goes on: the first one that can hold tasks, preferring
// the account's own.
function taskList() {
	const writable = taskLists.filter(l => l.writable);
	const preferred = writable.find(l => l.isDefault) || writable[0];
	return preferred ? preferred.name : '';
}

function quickAddTask(title) {
	if (!title.trim()) return;
	if (!taskList()) {
		alert('There is no calendar that holds tasks yet. Make one under Calendars.');
		return;
	}
	saveTask({ Title: title.trim(), Collection: taskList() });
}

function saveTask(fields) {
	if (!rl.pluginRemoteRequest) return;
	rl.pluginRemoteRequest((iError, oData) => {
		const res = oData && oData.Result;
		if (iError || !res || !res.success) {
			alert((res && res.error) || 'Could not save that task.');
		}
		refreshTaskViews();
	}, 'SaveTask', fields);
}

// Tasks show in two places now, so a change has to reach both.
function refreshTaskViews() {
	loadTasks();
	if (calendar && tasksOnGrid()) calendar.refetchEvents();
}

function removeTask(task) {
	if (!rl.pluginRemoteRequest) return;
	if (!confirm('Delete "' + (task.summary || 'this task') + '"?')) return;
	rl.pluginRemoteRequest((iError, oData) => {
		const res = oData && oData.Result;
		if (iError || !res || !res.success) {
			alert((res && res.error) || 'Could not delete that task.');
		}
		refreshTaskViews();
	}, 'DeleteTask', { Uid: task.uid, Collection: task.calendar || '' });
}

/* ------------------------------------------------------------------ *
 * More than one calendar
 *
 * A CalDAV home has always held several collections - a default one, the
 * scheduling Inbox and Outbox, and whatever else the user made - and this
 * plugin only ever read whichever one the URL template happened to name.
 * The picker lists them, remembers which are showing, and colours the grid
 * by the calendar an event came out of.
 *
 * Which are showing is kept in this browser rather than on the server:
 * it is a view preference, not a property of the calendar, and the same
 * account read from a phone may reasonably want a different answer.
 * ------------------------------------------------------------------ */
const CALENDARS_SHOWN_KEY = 'caldav-calendars-shown';
let knownCalendars = [];

function shownCalendars() {
	try {
		const saved = JSON.parse(localStorage.getItem(CALENDARS_SHOWN_KEY) || '[]');
		return Array.isArray(saved) ? saved.filter(n => 'string' === typeof n) : [];
	} catch (e) {
		return [];
	}
}

function setShownCalendars(names) {
	try { localStorage.setItem(CALENDARS_SHOWN_KEY, JSON.stringify(names)); }
	catch (e) { /* private browsing; the default calendar still shows */ }
}

// The calendar a new event is written to: whichever single one is showing, or
// the account's own when several are.
function writeCalendar() {
	const shown = shownCalendars().filter(name =>
		knownCalendars.some(c => c.name === name && c.writable));
	if (1 === shown.length) return shown[0];
	const fallback = knownCalendars.find(c => c.isDefault && c.writable);
	return fallback ? fallback.name : '';
}

function loadCalendars(list) {
	knownCalendars = (list || []).filter(c => c && c.name);
	// A calendar that has gone away should not go on being asked for.
	const alive = shownCalendars().filter(n => knownCalendars.some(c => c.name === n));
	if (alive.length !== shownCalendars().length) setShownCalendars(alive);
	renderCalendarList();
}

function renderCalendarList() {
	const box = document.getElementById('calendar-list');
	if (!box) return;
	const shown = shownCalendars();
	const showing = (name) => shown.length ? -1 !== shown.indexOf(name)
		: !!(knownCalendars.find(c => c.name === name) || {}).isDefault;

	box.textContent = '';
	knownCalendars.forEach(cal => {
		const row = document.createElement('label');
		row.className = 'calendar-row';

		const tick = document.createElement('input');
		tick.type = 'checkbox';
		tick.checked = showing(cal.name);
		tick.addEventListener('change', () => {
			const next = knownCalendars.filter(c =>
				c.name === cal.name ? tick.checked : showing(c.name)).map(c => c.name);
			setShownCalendars(next);
			if (calendar) calendar.refetchEvents();
		});

		// The swatch is the colour control: a calendar's colour is the thing
		// that tells four of them apart in a grid, so changing it should not
		// mean deleting and making it again.
		const swatch = document.createElement('input');
		swatch.type = 'color';
		swatch.className = 'calendar-swatch';
		swatch.value = cal.color || '#00639a';
		swatch.disabled = !cal.writable;
		swatch.title = cal.writable ? 'Colour' : 'Read only';
		swatch.setAttribute('aria-label', 'Colour of ' + (cal.displayName || cal.name));
		swatch.addEventListener('click', (e) => e.stopPropagation());
		swatch.addEventListener('change', () => recolourCalendar(cal, swatch.value));

		const name = document.createElement('span');
		name.className = 'calendar-name';
		name.textContent = cal.displayName || cal.name;
		name.title = (cal.components || []).join(', ')
			+ (cal.writable ? ' - double-click to rename' : ' - read only');
		if (cal.writable) {
			name.addEventListener('dblclick', (e) => {
				e.preventDefault();
				const wanted = prompt('Rename this calendar', cal.displayName || cal.name);
				if (wanted && wanted.trim() && wanted !== cal.displayName) {
					changeCalendar(cal, { DisplayName: wanted.trim() });
				}
			});
		}

		row.appendChild(tick);
		row.appendChild(swatch);
		row.appendChild(name);

		if (!cal.isDefault && cal.writable) {
			const drop = document.createElement('button');
			drop.type = 'button';
			drop.className = 'calendar-drop';
			drop.textContent = '×';
			drop.title = 'Delete this calendar and everything in it';
			drop.setAttribute('aria-label', 'Delete ' + (cal.displayName || cal.name));
			drop.addEventListener('click', (e) => {
				e.preventDefault();
				removeCalendar(cal);
			});
			row.appendChild(drop);
		}
		box.appendChild(row);
	});
}

function recolourCalendar(cal, colour) {
	if (/^#[0-9a-f]{6}$/i.test(colour || '')) changeCalendar(cal, { Color: colour });
}

// One PROPPATCH, whichever property is being changed. The server answers 207
// even when it refused, so the reply is checked rather than assumed.
function changeCalendar(cal, fields) {
	if (!rl.pluginRemoteRequest) return;
	rl.pluginRemoteRequest((iError, oData) => {
		const res = oData && oData.Result;
		if (iError || !res || !res.success) {
			alert((res && res.error) || 'Could not change that calendar.');
		}
		if (calendar) calendar.refetchEvents();
	}, 'UpdateCalendar', Object.assign({ Name: cal.name }, fields));
}

function addCalendar() {
	const title = (document.getElementById('calendar-new-name') || {}).value || '';
	if (!title.trim() || !rl.pluginRemoteRequest) return;
	const colour = (document.getElementById('calendar-new-color') || {}).value || '';
	const components = Array.from(document.querySelectorAll('.calendar-new-comp:checked'))
		.map(box => box.value);

	rl.pluginRemoteRequest((iError, oData) => {
		const res = oData && oData.Result;
		if (iError || !res || !res.success) {
			alert((res && res.error) || 'Could not make that calendar.');
			return;
		}
		// Made and showing: a calendar nobody can see is not obviously there.
		setShownCalendars(shownCalendars().concat([res.name]));
		document.getElementById('calendar-new-name').value = '';
		if (calendar) calendar.refetchEvents();
	}, 'CreateCalendar', {
		DisplayName: title.trim(),
		Color: colour,
		Components: (components.length ? components : ['VEVENT']).join(',')
	});
}

function removeCalendar(cal) {
	if (!rl.pluginRemoteRequest) return;
	if (!confirm('Delete "' + (cal.displayName || cal.name)
		+ '" and everything in it? This cannot be undone.')) {
		return;
	}
	rl.pluginRemoteRequest((iError, oData) => {
		const res = oData && oData.Result;
		if (iError || !res || !res.success) {
			alert((res && res.error) || 'Could not delete that calendar.');
			return;
		}
		setShownCalendars(shownCalendars().filter(n => n !== cal.name));
		if (calendar) calendar.refetchEvents();
	}, 'DeleteCalendar', { Name: cal.name });
}

/* ------------------------------------------------------------------ *
 * Answering an invitation
 *
 * An invitation is a question, and until now this plugin could only ask
 * it. The answer is one word - the guest's own PARTSTAT - and it travels
 * the way the invitation did: the server sees it change on the stored
 * event and mails the REPLY to the organiser (RFC 6638). So there is
 * nothing to compose here, only something to say.
 * ------------------------------------------------------------------ */
const PARTSTAT_SAID = {
	ACCEPTED: 'Going',
	DECLINED: 'Not going',
	TENTATIVE: 'Maybe',
	'NEEDS-ACTION': 'No answer yet',
	DELEGATED: 'Passed on to someone else'
};

function partstatSaid(value) {
	return PARTSTAT_SAID[(value || '').toUpperCase()] || (value || '');
}

// Only a guest has an invitation to answer. The organiser's own attendance is
// not in doubt, and an event nobody was invited to is not a meeting.
function invitationFor(event) {
	const props = (event && event.extendedProps) || event || {};
	const mine = (props.partstat || '').toUpperCase();
	return (mine && false === props.isOrganizer) ? mine : '';
}

function showInvitation(eventData) {
	const row = document.getElementById('event-rsvp-row');
	const mine = invitationFor(eventData);
	if (row) row.style.display = mine ? 'block' : 'none';

	document.querySelectorAll('.event-rsvp-btn').forEach(btn => {
		btn.setAttribute('aria-pressed', String(btn.dataset.partstat === mine));
	});
	const hint = document.getElementById('event-rsvp-hint');
	if (hint) {
		hint.textContent = 'NEEDS-ACTION' === mine
			? 'The organiser is waiting for an answer.'
			: 'You said: ' + partstatSaid(mine) + '. Answering again changes it.';
	}
	showGuests(eventData);
}

// Who else was asked, and what they said. The addresses alone were never the
// interesting part once invitations could be sent.
function showGuests(eventData) {
	const box = document.getElementById('event-guests');
	if (!box) return;
	const guests = ((eventData && eventData.guests) || []).filter(g => g && g.address);
	box.textContent = '';
	if (2 > guests.length) return;

	guests.forEach(guest => {
		const line = document.createElement('div');
		line.className = 'event-guest';
		const who = document.createElement('span');
		who.className = 'event-guest-name';
		who.textContent = (guest.name || guest.address)
			+ (guest.isOrganizer ? ' (organiser)' : '') + (guest.isSelf ? ' (you)' : '');
		who.title = guest.address;
		const said = document.createElement('span');
		said.className = 'event-guest-said';
		said.textContent = partstatSaid(guest.partstat);
		line.appendChild(who);
		line.appendChild(said);
		box.appendChild(line);
	});
}

// Answering a repeating invitation can mean this date or the standing
// arrangement, and the two are far enough apart to ask. "This and all
// following" is not offered: a reply is not a rescheduling, and splitting the
// series to answer one half of it would be one guest rewriting everyone's
// meeting.
function answerInvitation(partstat) {
	const event = currentEditingEvent;
	if (!event || !invitationFor(event)) return;

	const send = (scope) => {
		respondToEvent(event, partstat, scope);
		document.getElementById('event-modal').classList.remove('show');
		currentEditingEvent = null;
	};
	if (isRecurring(event)) {
		askRecurrenceScope('Repeating invitation',
			'"' + event.title + '" repeats. Answer for this date only, or for every occurrence?',
			choice => { if (choice) send(choice); }, true);
		return;
	}
	send('series');
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

// Asks, and calls back with 'occurrence', 'following', 'series', or null for
// cancelled.
function askRecurrenceScope(title, intro, onChoice, twoWay) {
	const modal = document.getElementById('scope-modal');
	if (!modal) {
		// No dialog to ask with: the safe answer is the smaller change.
		onChoice('occurrence');
		return;
	}
	document.getElementById('scope-modal-title').textContent = title;
	document.getElementById('scope-modal-intro').textContent = intro;
	// Some questions have only two answers - a reply is not a rescheduling,
	// so there is no half of a series to answer for.
	const following = document.getElementById('scope-modal-following');
	if (following) following.style.display = twoWay ? 'none' : 'block';
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
	const scope = currentScope();
	const one = 'occurrence' === scope;

	['', 'unit', 'interval', 'end', 'count', 'until'].forEach(id => {
		const el = repeatEl(id);
		if (el) el.disabled = one;
	});
	repeatDayBoxes().forEach(box => { box.disabled = one; });
	const skipDate = document.getElementById('event-skip-date');
	const skipAdd = document.getElementById('event-skip-add');
	if (skipDate) skipDate.disabled = one;
	if (skipAdd) skipAdd.disabled = one;
	renderSkippedDates();

	const hints = {
		occurrence: 'Only this date changes. How the event repeats belongs to the series -'
			+ ' switch above to change it.',
		following: 'This date and every one after it. The earlier occurrences are left as they'
			+ ' are, and the rest becomes a series of its own.',
		series: 'Every occurrence changes, including any that were moved individually.'
	};
	const hint = document.getElementById('event-scope-hint');
	if (hint) {
		hint.textContent = hints[scope] || hints.series;
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
	// A task drawn on the grid opens as a task, not as an event it is not.
	if (event.extendedProps?.isTask) {
		toggleTasks(true);
		openTaskModal(event.extendedProps.task);
		return;
	}
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
		skipped: event.extendedProps?.skipped || [],
		partstat: event.extendedProps?.partstat || '',
		guests: event.extendedProps?.guests || [],
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
			// A calendar given a colour is drawn in it, so several of them at
			// once can be told apart. One without keeps the theme's own.
			backgroundColor: event.calendarColor || 'var(--cal-event-bg)',
			borderColor: event.calendarColor || 'var(--cal-event-border)',
			textColor: event.calendarColor ? '#fff' : 'var(--cal-event-text)',
			// An invitation nobody has answered, and one that was turned down,
			// should not look like an appointment that is going ahead.
			// A calendar somebody shared read-only cannot be written back to,
			// so it is not dragged either - the 403 would come later.
			editable: !event.readOnly,
			classNames: ['modern-event'].concat(
				(false === event.isOrganizer && 'NEEDS-ACTION' === (event.partstat || '').toUpperCase())
					? ['event-unanswered'] : [],
				'DECLINED' === (event.partstat || '').toUpperCase() ? ['event-declined'] : []),
			extendedProps: {
				// The series rule, and which occurrence of it this is. Both
				// belong to the stored object rather than to the copy the grid
				// draws, and both are needed to edit either one date or all.
				rrule: event.rrule || '',
				recurrenceId: event.recurrenceId || '',
				skipped: event.skipped || [],
				// What this account said about being there, and what everyone
				// else said. Both belong to the stored event, not to the copy
				// the grid draws.
				partstat: event.partstat || '',
				guests: event.guests || [],
				location: event.location || '',
				conference: event.conference || '',
				geo: event.geo || '',
				description: event.description || '',
				attendees: event.attendees || '',
				organizer: event.organizer || '',
				isOrganizer: false !== event.isOrganizer,
				// Which calendar it came out of. An edit has to go back to the
				// same one; before there was more than one, this was implied.
				calendar: event.calendar || '',
				calendarName: event.calendarName || '',
				readOnly: !!event.readOnly
			}
		};
	});

	// The calendars this account has, and which of them are showing. The list
	// comes back with the events rather than in a request of its own: it
	// changes far too rarely to be worth asking twice.
	loadCalendars(result.calendars || []);

	// Tasks that are due, if the grid is showing them. They arrive in the same
	// answer, so there is nothing to wait for before drawing.
	if (tasksOnGrid()) {
		knownTasks = result.tasks || [];
		(result.tasks || []).forEach(task => {
			const drawn = taskAsEvent(task);
			if (drawn) events.push(drawn);
		});
	}

	// Whether this deployment has a meeting server and a geocoder at all.
	calFeatures = {
		conference: !!result.conferenceEnabled,
		places: !!result.placesEnabled
	};
	applyFeatureToggles();

	calendarEvents = events;
	scheduleReminders(result.events || []);

	successCallback(events);
}, 'GetCalendarEvents', { Collections: shownCalendars().join(','), IncludeTasks: tasksOnGrid() });
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
		// which calendar to write it to, when more than one is showing
		Collection: writeCalendar(),
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
	// Dragging a task moves when it is due, which is the only thing about it a
	// grid can express.
	if (event.extendedProps?.isTask) {
		const task = event.extendedProps.task;
		saveTask({
			Uid: task.uid,
			Collection: task.calendar || '',
			Due: event.allDay ? formatDateOnly(event.start) : event.start.toISOString(),
			AllDay: !!event.allDay
		});
		return;
	}
	if (!isRecurring(event)) {
		updateEvent(event);
		return;
	}
	askRecurrenceScope('Repeating event',
		'"' + event.title + '" repeats. Move only this occurrence, this one and everything'
			+ ' after it, or shift every occurrence by the same amount?',
		choice => {
			if (!choice) { info.revert(); return; }
			updateEvent(event, undefined, choice);
		});
}

// `repeat` comes from the dialog only. Dragging or resizing in the grid calls
// this without it, so the stored rule is left alone.
function updateEvent(event, repeat, scope, skipped) {

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
		// The calendar it was drawn from, so the edit goes back there.
		Collection: event.extendedProps?.calendar || '',
		EventId: eventId,
		Title: event.title,
		Start: startFormatted,
		End: endFormatted,
		AllDay: event.allDay || false,
		// The dates the series leaves out, when the dialog was showing them.
		// Undefined otherwise - dragging in the grid must not disturb them.
		Exdates: skipped,
		...(repeat || {})
	});
}

// Answering an invitation changes one word on the stored event, and the server
// mails the REPLY from there. Nothing else about the event is sent: a guest
// replying is not a guest editing, and the plugin has no business rewriting a
// meeting it was merely invited to.
function respondToEvent(event, partstat, scope) {
	if (!rl.pluginRemoteRequest) return;
	const eventId = event.id || event.extendedProps?.uid;
	if (!eventId) return;

	rl.pluginRemoteRequest((iError, oData) => {
		const res = oData && oData.Result;
		if (iError || !res || !res.success) {
			alert((res && res.error) || 'Failed to answer this invitation.');
		}
		if (calendar) calendar.refetchEvents();
	}, 'RespondCalendarEvent', {
		EventId: eventId,
		Partstat: partstat,
		Scope: scope || 'series',
		Collection: event.extendedProps?.calendar || '',
		RecurrenceId: event.extendedProps?.recurrenceId || ''
	});
}

function deleteEvent(eventId, scope, recurrenceId, collection) {

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
		Collection: collection || '',
		// Removing one occurrence rewrites the series with that date excluded,
		// and removing this and all following ends the series just before it;
		// only removing the series deletes the resource outright.
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
