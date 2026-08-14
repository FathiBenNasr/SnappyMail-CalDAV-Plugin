// Calendar entry in the folder-list toolbar.
//
// SnappyMail has no extension point for navigation, so a plugin that adds a
// screen has to reach the UI itself. The previous approach hijacked the
// existing Contacts button - waiting for it to appear, replacing its icon with
// a grid and hanging a popover off it - which is fragile and puts the calendar
// somewhere no other mail client puts it.
//
// This instead appends a proper entry to the toolbar that already holds
// Compose and Contacts, using the theme's own classes so it matches whatever
// theme is active. If SnappyMail ever gains a real nav API this file is the
// only thing that needs to change.
(rl => {

const templateId = 'MailFolderList';

addEventListener('rl-view-model.create', e => {
	if (templateId !== e.detail.viewModelTemplateID) return;
	try {
		const
			template = document.getElementById(templateId),
			view = e.detail,
			toolbar = template && template.content.querySelector('.b-toolbar');

		if (!toolbar || toolbar.querySelector('.buttonCalendar')) return;

		view.calendarClick = () => {
			window.location.hash = '#/calendar';
		};

		const contacts = toolbar.querySelector('.buttonContacts');
		const link = Element.fromHTML(
			'<a class="btn buttonCalendar fontastic" title="Calendar"'
			+ ' data-bind="click: calendarClick">📅</a>');

		// Sit next to Contacts when it is there, otherwise at the end.
		contacts ? contacts.after(link) : toolbar.append(link);
	} catch (err) {
		console.error('[caldav sidebar]', err);
	}
});

})(window.rl);
