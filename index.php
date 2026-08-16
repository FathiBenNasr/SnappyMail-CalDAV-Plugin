<?php

class CaldavPlugin extends \RainLoop\Plugins\AbstractPlugin
{
	const
		NAME     = 'Mailbux CalDAV Auto',
		VERSION  = '2.1',
		RELEASE  = '2026-08-16',
		CATEGORY = 'Calendar',
		DESCRIPTION = 'Auto-configures CalDAV calendar sync with JMAP support - switches per account',
		REQUIRED = '2.0.0';

	public function Init() : void
	{
		// Add custom JSON actions
		$this->addJsonHook('GetCalendarEvents', 'DoGetCalendarEvents');
		$this->addJsonHook('CreateCalendarEvent', 'DoCreateCalendarEvent');
		$this->addJsonHook('UpdateCalendarEvent', 'DoUpdateCalendarEvent');
		$this->addJsonHook('DeleteCalendarEvent', 'DoDeleteCalendarEvent');
		$this->addJsonHook('SuggestAttendees', 'DoSuggestAttendees');
		
		// Serve this plugin's static assets. There is no built-in route for
		// them: ServiceActions::ServicePlugins() ignores everything after
		// /?/Plugins/ and always returns the compiled plugin JS bundle, so the
		// old "?/Plugins/caldav/fullcalendar.min.js" URL returned this very
		// file instead of the library and window.FullCalendar stayed undefined.
		$this->addPartHook('CalDavAsset', 'ServiceCalDavAsset');

		// Add JavaScript
		$this->addJs('calendar.js');
		// Replaces contacts-popover.js, which reached the calendar by hijacking
		// the Contacts button. contacts-popover.js is kept in the tree for
		// reference but is no longer loaded.
		$this->addJs('sidebar.js');

		// Add CSS
		$this->addCss('calendar.css');
	}
	
	/**
	 * The invited addresses of an event, as a display string. The organiser is
	 * left out: they are not an invitee of their own meeting.
	 */
	private function listAttendees($oEvent) : string
	{
		if (!isset($oEvent->ATTENDEE)) {
			return '';
		}
		$sOrganizer = \strtolower(\preg_replace('#^mailto:#i', '',
			\trim((string) ($oEvent->ORGANIZER ?? ''))));
		$aResult = array();
		foreach ($oEvent->ATTENDEE as $oAttendee) {
			$sAddr = \preg_replace('#^mailto:#i', '', \trim((string) $oAttendee));
			if (\strlen($sAddr) && \strtolower($sAddr) !== $sOrganizer) {
				$aResult[\strtolower($sAddr)] = $sAddr;
			}
		}
		return \implode(', ', $aResult);
	}

	/**
	 * Apply the dialog's changes to the stored event, preserving everything the
	 * dialog does not know about.
	 *
	 * Returns the serialised VCALENDAR, or null when the payload cannot be
	 * parsed so the caller can fall back to building a fresh object.
	 */
	private function applyEventEdit(string $sExisting, \RainLoop\Model\Account $oAccount,
		string $sTitle, string $sStart, string $sEnd, bool $bAllDay) : ?string
	{
		try {
			$oVCal = \Sabre\VObject\Reader::read($sExisting, \Sabre\VObject\Reader::OPTION_FORGIVING);
			if (!($oVCal instanceof \Sabre\VObject\Component\VCalendar) || !isset($oVCal->VEVENT)) {
				return null;
			}

			// With a recurring event, edit the master - the occurrence overrides
			// carry RECURRENCE-ID and must keep their own times.
			$oEvent = null;
			foreach ($oVCal->VEVENT as $oCandidate) {
				if (!isset($oCandidate->RECURRENCE_ID)) {
					$oEvent = $oCandidate;
					break;
				}
			}
			$oEvent = $oEvent ?: $oVCal->VEVENT;

			$sOldStart = (string) ($oEvent->DTSTART ?? '');
			$sOldEnd   = (string) ($oEvent->DTEND ?? '');

			$oEvent->SUMMARY = $sTitle;
			$aDateParams = $bAllDay ? array('VALUE' => 'DATE') : array();
			$oEvent->remove('DTSTART');
			$oEvent->remove('DTEND');
			$oEvent->add('DTSTART', $sStart, $aDateParams);
			$oEvent->add('DTEND', $sEnd, $aDateParams);

			// Only touch the guest list when the dialog actually sent one, so an
			// edit that leaves the field alone does not silently uninvite people.
			$mAttendees = $this->jsonParam('Attendees', null);
			$bGuestsChanged = false;
			if (null !== $mAttendees) {
				$aWanted = $this->parseAttendees((string) $mAttendees);
				$sSelf   = $oAccount->Email();
				$aBefore = \array_map('strtolower', $this->parseAttendees($this->listAttendees($oEvent)));
				$aAfter  = \array_map('strtolower', $aWanted);
				\sort($aBefore);
				\sort($aAfter);
				$bGuestsChanged = ($aBefore !== $aAfter);

				$oEvent->remove('ATTENDEE');
				if ($aWanted) {
					if (!isset($oEvent->ORGANIZER)) {
						$oEvent->add('ORGANIZER', 'mailto:' . $sSelf,
							array('CN' => $oAccount->Name() ?: $sSelf));
					}
					$oEvent->add('ATTENDEE', 'mailto:' . $sSelf, array(
						'CN' => $oAccount->Name() ?: $sSelf,
						'PARTSTAT' => 'ACCEPTED',
						'ROLE' => 'CHAIR'
					));
					foreach ($aWanted as $sAttendee) {
						if (\strcasecmp($sAttendee, $sSelf)) {
							$oEvent->add('ATTENDEE', 'mailto:' . $sAttendee, array(
								'PARTSTAT' => 'NEEDS-ACTION',
								'RSVP' => 'TRUE',
								'ROLE' => 'REQ-PARTICIPANT'
							));
						}
					}
				}
			}

			// SEQUENCE must advance on a change attendees need to hear about
			// (RFC 5545 3.8.7.4), otherwise their clients ignore the update.
			if ($bGuestsChanged || $sOldStart !== (string) $oEvent->DTSTART
			 || $sOldEnd !== (string) $oEvent->DTEND) {
				$oEvent->SEQUENCE = ((int) ((string) ($oEvent->SEQUENCE ?? '0'))) + 1;
			}
			$oEvent->DTSTAMP = new \DateTime('now', new \DateTimeZone('UTC'));

			return $oVCal->serialize();
		} catch (\Throwable $oException) {
			\SnappyMail\Log::notice('CalDAV', 'update parse failed: ' . $oException->getMessage());
			return null;
		}
	}

	/**
	 * Split a free-text recipient list into deliverable addresses.
	 * Accepts commas or semicolons, and "Name <a@b>" as well as a bare address.
	 */
	private function parseAttendees(string $sList) : array
	{
		$aResult = array();
		foreach (\preg_split('/[,;]+/', $sList) as $sPart) {
			$sPart = \trim($sPart);
			if (!\strlen($sPart)) {
				continue;
			}
			if (\preg_match('/<([^>]+)>/', $sPart, $aMatch)) {
				$sPart = \trim($aMatch[1]);
			}
			if (\filter_var($sPart, \FILTER_VALIDATE_EMAIL)) {
				$aResult[\strtolower($sPart)] = $sPart;
			}
		}
		return \array_values($aResult);
	}

	/**
	 * Complete attendee addresses while the user types.
	 *
	 * Sources are the ones SnappyMail already has, so a contact that completes
	 * when writing a message completes here too and no separate lookup against
	 * the CalDAV server is needed. How far it reaches depends on
	 * attendee_directory_lookup:
	 *
	 *   on (default) - the full suggestions chain, address book plus any
	 *                  suggestion plugin such as LDAP. This is the corporate
	 *                  case, and assumes the configured directory belongs to
	 *                  one organisation - a provider is expected to give each
	 *                  tenant its own root rather than sharing one.
	 *   off          - the user's own address book only, which on a deployment
	 *                  running the companion CardDAV plugin is their CardDAV
	 *                  contacts. For the case where one directory really is
	 *                  shared by unrelated tenants.
	 *
	 * The chain is global, so off does not filter its results - it does not
	 * consult it at all.
	 */
	public function DoSuggestAttendees() : array
	{
		try {
			$oActions = $this->Manager()->Actions();
			$oAccount = $oActions->getAccountFromToken();
			if (!$oAccount) {
				return $this->jsonResponse(__FUNCTION__, array('suggestions' => array()));
			}

			// A single character matches most of an address book, so wait for
			// the user to commit to two before touching the provider chain.
			$sQuery = \trim((string) $this->jsonParam('Query', ''));
			if (2 > \mb_strlen($sQuery)) {
				return $this->jsonResponse(__FUNCTION__, array('suggestions' => array()));
			}

			// Default is the corporate case: the directory exists so colleagues
			// can find each other, and a provider is expected to give each
			// tenant its own root. Where one directory really is shared between
			// unrelated tenants, this is what turns completion back to the
			// user's own contacts.
			$bDirectory = (bool) $this->Config()->Get('plugin', 'attendee_directory_lookup', true);

			// contacts.suggestions_limit is tuned for the compose screen and is
			// commonly as low as 5. The event dialog has room for more, so take
			// that as a floor rather than editing a setting shared with compose.
			$iLimit = \max(10, (int) $oActions->Config()->Get('contacts', 'suggestions_limit', 20));

			if ($bDirectory) {
				// Every source SnappyMail knows: the address book first, then
				// suggestion plugins such as LDAP.
				$oProvider = $oActions->SuggestionsProvider();
				$aItems = $oProvider ? $oProvider->Process($oAccount, $sQuery, $iLimit) : array();
			} else {
				// The user's own address book alone. Deliberately not the
				// suggestions chain, which would pull in the global sources
				// this setting exists to keep out.
				$oBook = $oActions->AddressBookProvider($oAccount);
				$aItems = ($oBook && $oBook->IsActive()) ? $oBook->GetSuggestions($sQuery, $iLimit) : array();
			}

			$aSuggestions = array();
			foreach ($aItems as $aItem) {
				$sEmail = \trim((string) ($aItem[0] ?? ''));
				if (\strlen($sEmail)) {
					$aSuggestions[] = array(
						'email' => $sEmail,
						'name'  => \trim((string) ($aItem[1] ?? ''))
					);
				}
			}

			return $this->jsonResponse(__FUNCTION__, array('suggestions' => $aSuggestions));
		} catch (\Throwable $e) {
			// Completion is a convenience: a failure here must never stop the
			// user typing an address by hand.
			return $this->jsonResponse(__FUNCTION__, array('suggestions' => array()));
		}
	}

	/**
	 * Serve a whitelisted static file from this plugin directory.
	 * URL: /?CalDavAsset/<name>
	 */
	public function ServiceCalDavAsset(...$aParts)
	{
		static $aAllowed = array(
			'fullcalendar.min.js' => 'application/javascript; charset=utf-8'
		);
		$sName = isset($aParts[1]) ? \basename((string) $aParts[1]) : '';
		if (!isset($aAllowed[$sName])) {
			\MailSo\Base\Http::StatusHeader(404);
			return true;
		}
		$sFile = __DIR__ . '/' . $sName;
		if (!\is_readable($sFile)) {
			\MailSo\Base\Http::StatusHeader(404);
			return true;
		}
		$iMaxAge = 86400;
		\header('Content-Type: ' . $aAllowed[$sName]);
		\header("Cache-Control: max-age={$iMaxAge}, private");
		\header('Content-Length: ' . \filesize($sFile));
		echo \file_get_contents($sFile);
		return true;
	}

	/**
	 * Plugin configuration mapping
	 */
	protected function configMapping() : array
	{
		return array(
			\RainLoop\Plugins\Property::NewInstance('caldav_url_template')
				->SetLabel('CalDAV URL template')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::STRING)
				->SetDescription('Calendar collection URL for this server, e.g.'
					. ' https://dav.example.com/dav/calendars/user/{user}/Default'
					. ' - {user} = mailbox name as the DAV server knows it, {email} = full address,'
					. ' {login} = local part, {domain} = domain part. Leave empty to derive it from'
					. ' the CardDAV plugin settings instead.')
				->SetDefaultValue(''),
			\RainLoop\Plugins\Property::NewInstance('dav_default_domain')
				->SetLabel('DAV default domain')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::STRING)
				->SetDescription('Addresses in this domain are addressed by local part only,'
					. ' everything else by full address. Leave empty to always use the full address.')
				->SetDefaultValue(''),
			\RainLoop\Plugins\Property::NewInstance('caldav_server')
				->SetLabel('CalDAV Server URL (legacy)')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::STRING)
				->SetDescription('Unused when a CalDAV URL template is set. Kept so existing'
					. ' configurations keep loading.')
				->SetDefaultValue(''),
			\RainLoop\Plugins\Property::NewInstance('jmap_server')
				->SetLabel('JMAP Server URL')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::STRING)
				->SetDescription('JMAP server URL, e.g. https://dav.example.com/jmap')
				->SetDefaultValue(''),
			\RainLoop\Plugins\Property::NewInstance('default_protocol')
				->SetLabel('Default Protocol')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::SELECTION)
				->SetDescription('Default protocol to use for calendar sync')
				->SetDefaultValue(['caldav', 'jmap'])
				->SetDefaultValue('caldav'),
			\RainLoop\Plugins\Property::NewInstance('attendee_directory_lookup')
				->SetLabel('Complete attendees from the whole directory')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::BOOL)
				->SetDescription('On (default): the attendee field completes from'
					. ' every source SnappyMail has, including an LDAP corporate'
					. ' directory, so an organiser can invite any colleague by'
					. ' typing part of their name. This assumes the configured'
					. ' directory belongs to one organisation, which is how a'
					. ' hosting provider should set it up - each tenant its own'
					. ' root.'
					. ' Turn it OFF where that does not hold and one directory is'
					. ' shared by unrelated tenants, since completion would then'
					. ' let any user enumerate the others addresses. Off restricts'
					. ' completion to the user\'s own address book.')
				->SetDefaultValue(true),
			\RainLoop\Plugins\Property::NewInstance('auto_sync')
				->SetLabel('Auto Sync')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::BOOL)
				->SetDescription('Automatically sync calendar on login and account switch')
				->SetDefaultValue(true),
			\RainLoop\Plugins\Property::NewInstance('sync_interval')
				->SetLabel('Sync Interval (minutes)')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::INT)
				->SetDescription('Auto-sync interval in minutes (0 to disable)')
				->SetDefaultValue(5)
		);
	}
	
	/**
	 * Get calendar configuration from CardDAV contacts_sync
	 */
	private function getCalendarConfig(\RainLoop\Model\Account $oAccount)
	{
		try {
			$oStorageProvider = $this->Manager()->Actions()->StorageProvider();
			if (!$oStorageProvider) {
				return null;
			}
			
			// Get contacts_sync config from CardDAV plugin
			$mData = $oStorageProvider->Get($oAccount,
				\RainLoop\Providers\Storage\Enumerations\StorageType::CONFIG,
				'contacts_sync'
			);
			
			if ($mData && \is_string($mData)) {
				$aCardDAVData = \json_decode($mData, true);
				if (\is_array($aCardDAVData) && isset($aCardDAVData['User'], $aCardDAVData['Password'])) {
					// The plugin's own setting wins: the calendar URL belongs to the
					// deployment and should come from the settings page, not be
					// inferred. Deriving from CardDAV stays as the fallback so
					// existing installs keep working without reconfiguration.
					$sTemplate = \trim($this->Config()->Get('plugin', 'caldav_url_template', ''));
					if (\strlen($sTemplate)) {
						$sUrl = \rtrim($this->expandDavTemplate($sTemplate, $aCardDAVData['User']), '/');
						$sCollection = 'Default';
						if (\preg_match('#/([^/]+)$#', $sUrl, $aM)) {
							$sCollection = $aM[1];
							$sUrl = \substr($sUrl, 0, -\strlen($aM[0]));
						}
						return [
							'User' => $aCardDAVData['User'],
							'Password' => $aCardDAVData['Password'],
							'CalDAVUrl' => \rtrim($sUrl, '/'),
							'Collection' => $sCollection
						];
					}

					// Derive the CalDAV URL from the CardDAV one.
					// Cyrus serves /dav/addressbooks/user/<u>/<collection> and
					// /dav/calendars/user/<u>/<collection>; the old code only knew
					// the /dav/card/ -> /dav/cal/ layout of another vendor, so on
					// Cyrus it produced an addressbook URL and returned no events.
					$sUrl = \rtrim($aCardDAVData['Url'], '/');
					$sCollection = 'Default';
					if (\preg_match('#/([^/]+)$#', $sUrl, $aM)) {
						// Last path segment is the collection name; keep its case,
						// Cyrus collection names are case sensitive in URLs.
						$sCollection = $aM[1];
						$sUrl = \substr($sUrl, 0, -\strlen($aM[0]));
					}
					$sCalDAVUrl = \str_replace(
						array('/dav/addressbooks/', '/dav/card/'),
						array('/dav/calendars/',   '/dav/cal/'),
						$sUrl
					);

					return [
						'User' => $aCardDAVData['User'],
						'Password' => $aCardDAVData['Password'],
						'CalDAVUrl' => \rtrim($sCalDAVUrl, '/'),
						'Collection' => $sCollection
					];
				}
			}
		} catch (\Exception $e) {
			// Silent fail
		}
		
		return null;
	}
	
	/**
	 * Make CalDAV request
	 */
	private function makeCalDAVRequest($url, $method, $username, $password, $body = null, $headers = [])
	{
		$ch = curl_init($url);
		
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
		curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
		curl_setopt($ch, CURLOPT_USERPWD, "{$username}:{$password}");
		curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
		
		$defaultHeaders = [
			'Content-Type: application/xml; charset=utf-8',
			'Depth: 1'
		];
		
		$allHeaders = array_merge($defaultHeaders, $headers);
		curl_setopt($ch, CURLOPT_HTTPHEADER, $allHeaders);
		
		if ($body) {
			curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
		}
		
		$response = curl_exec($ch);
		$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$error = curl_error($ch);
		
		curl_close($ch);
		
		return [
			'code' => $httpCode,
			'body' => $response,
			'error' => $error
		];
	}
	
	/**
	 * Make JMAP request
	 */
	private function makeJMAPRequest($url, $username, $password, $data)
	{
		$ch = curl_init($url);
		
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_POST, true);
		curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
		curl_setopt($ch, CURLOPT_USERPWD, "{$username}:{$password}");
		curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
		curl_setopt($ch, CURLOPT_HTTPHEADER, [
			'Content-Type: application/json',
			'Accept: application/json'
		]);
		curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
		
		$response = curl_exec($ch);
		$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$error = curl_error($ch);
		
		curl_close($ch);
		
		return [
			'code' => $httpCode,
			'body' => $response ? json_decode($response, true) : null,
			'error' => $error
		];
	}
	
	/**
	 * Expand {user}/{email}/{login}/{domain} in a configured DAV URL.
	 */
	private function expandDavTemplate(string $sTemplate, string $sEmail) : string
	{
		$sDefaultDomain = \strtolower(\trim($this->Config()->Get('plugin', 'dav_default_domain', '')));
		$aParts = \explode('@', $sEmail, 2);
		$sLogin = $aParts[0];
		$sDomain = $aParts[1] ?? '';
		$sUser = ($sDefaultDomain && \strtolower($sDomain) === $sDefaultDomain) ? $sLogin : $sEmail;
		return \strtr($sTemplate, array(
			'{user}'   => $sUser,
			'{email}'  => $sEmail,
			'{login}'  => $sLogin,
			'{domain}' => $sDomain
		));
	}

	/**
	 * Collect VALARM trigger times for one event as absolute ISO-8601 stamps.
	 *
	 * TRIGGER is either a duration relative to the event start (or end, with
	 * RELATED=END) or an absolute DATE-TIME. 75 of the events already stored
	 * here carry a VALARM written by Thunderbird; they were previously parsed
	 * straight past, so the webmail never knew a reminder existed.
	 */
	private function extractAlarms($oEvent, \DateTimeInterface $oStart, \DateTimeInterface $oEnd) : array
	{
		$aAlarms = [];
		if (!isset($oEvent->VALARM)) {
			return $aAlarms;
		}
		foreach ($oEvent->VALARM as $oAlarm) {
			$oTrigger = $oAlarm->TRIGGER ?? null;
			if (!$oTrigger) {
				continue;
			}
			try {
				$sValue = \strtoupper((string) ($oTrigger['VALUE'] ?? 'DURATION'));
				if ('DATE-TIME' === $sValue) {
					$oWhen = $oTrigger->getDateTime();
				} else {
					$sRelated = \strtoupper((string) ($oTrigger['RELATED'] ?? 'START'));
					$oBase = ('END' === $sRelated) ? $oEnd : $oStart;
					$oWhen = (clone $oBase)->add(
						\Sabre\VObject\DateTimeParser::parseDuration((string) $oTrigger)
					);
				}
				$aAlarms[] = [
					'at'     => $oWhen->format('c'),
					'action' => \strtoupper((string) ($oAlarm->ACTION ?? 'DISPLAY'))
				];
			} catch (\Throwable $e) {
				// A malformed TRIGGER must not cost us the whole event.
			}
		}
		return $aAlarms;
	}

	/**
	 * Parse one iCalendar object with Sabre VObject, expanding recurrences.
	 * Returns null when VObject cannot handle the payload, so the caller falls
	 * back to the original line-based parser.
	 */
	private function parseICalendarVObject($icalData)
	{
		if (!\class_exists('\\Sabre\\VObject\\Reader')) {
			return null;
		}
		try {
			$oVCal = \Sabre\VObject\Reader::read($icalData, \Sabre\VObject\Reader::OPTION_FORGIVING);
			if (!($oVCal instanceof \Sabre\VObject\Component\VCalendar) || !isset($oVCal->VEVENT)) {
				return null;
			}

			// Only recurring objects need expanding. Expanding everything would
			// discard one-off events outside the window, and this calendar holds
			// events from 2022 through 2038.
			$bRecurring = false;
			foreach ($oVCal->VEVENT as $oEvent) {
				if (isset($oEvent->RRULE) || isset($oEvent->RDATE)) {
					$bRecurring = true;
					break;
				}
			}

			$oSource = $oVCal;
			if ($bRecurring) {
				try {
					$oSource = $oVCal->expand(new \DateTime('-1 year'), new \DateTime('+2 years'));
				} catch (\Throwable $e) {
					// No instances in the window, or a rule VObject refuses to
					// expand: fall back to the unexpanded object.
					$oSource = $oVCal;
				}
			}

			$aResult = [];
			// expand() drops the property entirely when a series has no
			// instance inside the window; iterating that would warn in PHP 8.
			if (!isset($oSource->VEVENT)) {
				return $aResult;
			}
			foreach ($oSource->VEVENT as $oEvent) {
				$oDtStart = $oEvent->DTSTART ?? null;
				if (!$oDtStart) {
					continue;
				}
				$bAllDay = !$oDtStart->hasTime();
				$oEnd = $oEvent->DTEND ?? null;
				if (!$oEnd && isset($oEvent->DURATION)) {
					$oEndDt = $oDtStart->getDateTime();
					$oEndDt = $oEndDt->add(\Sabre\VObject\DateTimeParser::parseDuration((string) $oEvent->DURATION));
				} else {
					$oEndDt = $oEnd ? $oEnd->getDateTime() : $oDtStart->getDateTime();
				}
				$sFmt = $bAllDay ? 'Y-m-d' : 'c';
				$aResult[] = [
					'uid'         => (string) ($oEvent->UID ?? ''),
					'summary'     => (string) ($oEvent->SUMMARY ?? 'Untitled'),
					'dtstart'     => $oDtStart->getDateTime()->format($sFmt),
					'dtend'       => $oEndDt->format($sFmt),
					'description' => (string) ($oEvent->DESCRIPTION ?? ''),
					'location'    => (string) ($oEvent->LOCATION ?? ''),
					'allDay'      => $bAllDay,
					'attendees'   => $this->listAttendees($oEvent),
					'alarms'      => $this->extractAlarms($oEvent, $oDtStart->getDateTime(), $oEndDt)
				];
			}
			return $aResult;
		} catch (\Throwable $e) {
			\SnappyMail\Log::notice('CalDAV', 'VObject parse failed: ' . $e->getMessage());
			return null;
		}
	}

	/**
	 * Parse iCalendar data
	 */
	private function parseICalendar($icalData)
	{
		// SnappyMail bundles Sabre VObject 4.5.2; use it in preference to the
		// hand-rolled reader below. It unfolds continuation lines (65 of the
		// 109 stored events use them), resolves VTIMEZONE, and expands RRULE.
		// Without expansion a yearly event created in 2022 is only ever
		// returned for 2022, which is why most of the calendar looked empty.
		$aEvents = $this->parseICalendarVObject($icalData);
		if (null !== $aEvents) {
			return $aEvents;
		}

		$events = [];
		
		// Simple iCalendar parser
		$lines = explode("\n", str_replace("\r\n", "\n", $icalData));
		$currentEvent = null;
		
		foreach ($lines as $line) {
			$line = trim($line);
			
			if ($line === 'BEGIN:VEVENT') {
				$currentEvent = [];
			} elseif ($line === 'END:VEVENT' && $currentEvent !== null) {
				// Map to expected format
				$event = [
					'uid' => $currentEvent['uid'] ?? '',
					'summary' => $currentEvent['summary'] ?? 'Untitled',
					'dtstart' => $this->parseICalDate($currentEvent['dtstart'] ?? ''),
					'dtend' => $this->parseICalDate($currentEvent['dtend'] ?? ''),
					'description' => $currentEvent['description'] ?? '',
					'location' => $currentEvent['location'] ?? '',
					'allDay' => !isset($currentEvent['dtstart']) || strpos($currentEvent['dtstart'], 'T') === false
				];
				$events[] = $event;
				$currentEvent = null;
			} elseif ($currentEvent !== null && strpos($line, ':') !== false) {
				list($key, $value) = explode(':', $line, 2);
				// Handle properties with parameters (e.g., DTSTART;VALUE=DATE:20251112)
				$key = preg_replace('/;.*$/', '', $key);
				$currentEvent[strtolower($key)] = $value;
			}
		}
		
		return $events;
	}
	
	/**
	 * Parse iCalendar date format to ISO string
	 */
	private function parseICalDate($dateStr)
	{
		if (empty($dateStr)) {
			return date('c');
		}
		
		// Handle YYYYMMDD format
		if (preg_match('/^(\d{4})(\d{2})(\d{2})$/', $dateStr, $matches)) {
			return $matches[1] . '-' . $matches[2] . '-' . $matches[3];
		}
		
		// Handle YYYYMMDDTHHmmssZ format
		if (preg_match('/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/', $dateStr, $matches)) {
			return $matches[1] . '-' . $matches[2] . '-' . $matches[3] . 'T' . 
			       $matches[4] . ':' . $matches[5] . ':' . $matches[6] . 'Z';
		}
		
		return $dateStr;
	}
	
	/**
	 * Get calendar events
	 */
	public function DoGetCalendarEvents() : array
	{
		try {
			$oAccount = $this->Manager()->Actions()->getAccountFromToken();
			if (!$oAccount) {
				return $this->jsonResponse(__FUNCTION__, ['events' => [], 'message' => 'Please log in first']);
			}
			
			// Get config from contacts_sync (maintained by CardDAV plugin)
			$aConfig = $this->getCalendarConfig($oAccount);
			if (!$aConfig) {
				return $this->jsonResponse(__FUNCTION__, ['events' => [], 'message' => 'Calendar not configured yet. Please check settings.']);
			}
			
			// Decrypt password using MAIN account's CryptKey (same as CardDAV does)
			$oMainAccount = $this->Manager()->Actions()->GetMainAccountFromToken();
			if (!$oMainAccount || !method_exists($oMainAccount, 'CryptKey')) {
				return $this->jsonResponse(__FUNCTION__, ['events' => [], 'error' => 'Cannot access encryption key']);
			}
			
			$sCryptKey = $oMainAccount->CryptKey();
			$sPassword = \SnappyMail\Crypt::DecryptFromJSON($aConfig['Password'], $sCryptKey);
			
			if (is_object($sPassword) && method_exists($sPassword, '__toString')) {
				$sPassword = (string)$sPassword;
			}
			
			// Build CalDAV URL
			$sCalDAVUrl = $aConfig['CalDAVUrl'] . '/' . ($aConfig['Collection'] ?? 'Default') . '/';
			
			
			// CalDAV REPORT query for events
			$sReportBody = '<?xml version="1.0" encoding="utf-8" ?>' . "\n";
			$sReportBody .= '<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' . "\n";
			$sReportBody .= '  <D:prop>' . "\n";
			$sReportBody .= '    <D:getetag />' . "\n";
			$sReportBody .= '    <C:calendar-data />' . "\n";
			$sReportBody .= '  </D:prop>' . "\n";
			$sReportBody .= '  <C:filter>' . "\n";
			$sReportBody .= '    <C:comp-filter name="VCALENDAR">' . "\n";
			$sReportBody .= '      <C:comp-filter name="VEVENT" />' . "\n";
			$sReportBody .= '    </C:comp-filter>' . "\n";
			$sReportBody .= '  </C:filter>' . "\n";
			$sReportBody .= '</C:calendar-query>';
			
			$result = $this->makeCalDAVRequest(
				$sCalDAVUrl,
				'REPORT',
				$aConfig['User'],
				$sPassword,
				$sReportBody,
				[
					'Content-Type: application/xml; charset=utf-8',
					'Depth: 1'
				]
			);
			
			
			$aEvents = [];
			if ($result['code'] === 207) {
				// Parse multistatus response
				$aEvents = $this->parseCalDAVResponse($result['body']);
			} else {
			}
			
			return $this->jsonResponse(__FUNCTION__, ['events' => $aEvents, 'message' => 'Loaded ' . count($aEvents) . ' events']);
			
		} catch (\Exception $e) {
			return $this->jsonResponse(__FUNCTION__, ['events' => [], 'error' => $e->getMessage()]);
		}
	}
	
	/**
	 * Create calendar event
	 */
	public function DoCreateCalendarEvent() : array
	{
		try {
			
			$oAccount = $this->Manager()->Actions()->getAccountFromToken();
			if (!$oAccount) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Not logged in']);
			}
			
			
			// Get config from contacts_sync
			$aConfig = $this->getCalendarConfig($oAccount);
			if (!$aConfig) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Calendar not configured']);
			}
			
			
			// Decrypt password using MAIN account's CryptKey
			$oMainAccount = $this->Manager()->Actions()->GetMainAccountFromToken();
			
			if (!$oMainAccount || !method_exists($oMainAccount, 'CryptKey')) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Cannot access encryption key']);
			}
			
			$sCryptKey = $oMainAccount->CryptKey();
			$sPassword = \SnappyMail\Crypt::DecryptFromJSON($aConfig['Password'], $sCryptKey);
			
			if (is_object($sPassword) && method_exists($sPassword, '__toString')) {
				$sPassword = (string)$sPassword;
			}
			
			
			// Get event data from request (JS sends Title, Start, End, etc.)
			$sTitle = $this->jsonParam('Title', '');
			$sStart = $this->jsonParam('Start', '');
			$sEnd = $this->jsonParam('End', '');
			$bAllDay = $this->jsonParam('AllDay', false);
			$sDescription = $this->jsonParam('Description', '');
			$sLocation = $this->jsonParam('Location', '');
			$sAttendees = (string) $this->jsonParam('Attendees', '');
			
			
			if (empty($sTitle)) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Event title required']);
			}
			
			// Generate UID for event
			$sUid = \uniqid('event-') . '@' . $aConfig['User'];
			
			// Format dates
			// For all-day events, JS sends date-only string like "2025-11-06"
			// For timed events, JS sends ISO string with time like "2025-11-06T14:30:00.000Z"
			if ($bAllDay) {
				// Date-only string, just remove dashes: 2025-11-06 -> 20251106
				// For all-day events, use the date as-is without timezone conversion
				// This prevents the "day before" issue when user is in timezone ahead of UTC
				$sStartFormatted = str_replace('-', '', $sStart);
				$sEndFormatted = str_replace('-', '', $sEnd);
			} else {
				// For timed events, parse the ISO string and convert to UTC
				// The ISO string from JS is already in UTC (ends with Z)
				$dtStart = new \DateTime($sStart, new \DateTimeZone('UTC'));
				$dtEnd = new \DateTime($sEnd, new \DateTimeZone('UTC'));
				$sStartFormatted = $dtStart->format('Ymd\THis\Z');
				$sEndFormatted = $dtEnd->format('Ymd\THis\Z');
			}
			
			// Create iCalendar format
			$sICS = "BEGIN:VCALENDAR\r\n";
			$sICS .= "VERSION:2.0\r\n";
			$sICS .= "PRODID:-//Mailbux//CalDAV Plugin//EN\r\n";
			$sICS .= "BEGIN:VEVENT\r\n";
			$sICS .= "UID:" . $sUid . "\r\n";
			$sICS .= "DTSTAMP:" . gmdate('Ymd\THis\Z') . "\r\n";
			$sICS .= "DTSTART" . ($bAllDay ? ';VALUE=DATE' : '') . ":" . $sStartFormatted . "\r\n";
			$sICS .= "DTEND" . ($bAllDay ? ';VALUE=DATE' : '') . ":" . $sEndFormatted . "\r\n";
			$sICS .= "SUMMARY:" . $this->escapeICS($sTitle) . "\r\n";
			
			if (!empty($sDescription)) {
				$sICS .= "DESCRIPTION:" . $this->escapeICS($sDescription) . "\r\n";
			}
			if (!empty($sLocation)) {
				$sICS .= "LOCATION:" . $this->escapeICS($sLocation) . "\r\n";
			}

			// Inviting someone turns this into a scheduling object: it needs an
			// ORGANIZER, and each ATTENDEE needs RSVP so clients know to ask.
			// The invitations themselves are not built or sent here - under
			// RFC 6638 the CalDAV server does that when it sees the ATTENDEEs,
			// and marks each one with SCHEDULE-STATUS. Verified against Cyrus.
			$aAttendees = $this->parseAttendees($sAttendees);
			if ($aAttendees) {
				$sSelf = $oAccount->Email();
				$sICS .= 'ORGANIZER;CN=' . $this->escapeICS($oAccount->Name() ?: $sSelf)
					. ':mailto:' . $sSelf . "\r\n";
				// The organiser attends their own meeting.
				$sICS .= 'ATTENDEE;CN=' . $this->escapeICS($oAccount->Name() ?: $sSelf)
					. ';PARTSTAT=ACCEPTED;ROLE=CHAIR:mailto:' . $sSelf . "\r\n";
				foreach ($aAttendees as $sAttendee) {
					if (\strcasecmp($sAttendee, $sSelf)) {
						$sICS .= 'ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;'
							. 'ROLE=REQ-PARTICIPANT:mailto:' . $sAttendee . "\r\n";
					}
				}
			}

			// A real VALARM, so the reminder also reaches Thunderbird and any
			// other CalDAV client. This used to be appended to DESCRIPTION as
			// the literal text "@email", which alerted nothing anywhere.
			$iReminder = (int) ($this->jsonParam('Reminder', 0));
			if (0 < $iReminder) {
				$sICS .= "BEGIN:VALARM\r\n";
				$sICS .= "ACTION:DISPLAY\r\n";
				$sICS .= "TRIGGER;RELATED=START:-PT{$iReminder}M\r\n";
				$sICS .= "DESCRIPTION:" . $this->escapeICS($sTitle) . "\r\n";
				$sICS .= "END:VALARM\r\n";
			}

			$sICS .= "END:VEVENT\r\n";
			$sICS .= "END:VCALENDAR\r\n";
			
			// PUT event to CalDAV server
			$sEventUrl = $aConfig['CalDAVUrl'] . '/' . ($aConfig['Collection'] ?? 'Default') . '/' . $sUid . '.ics';
			
			
			$result = $this->makeCalDAVRequest(
				$sEventUrl,
				'PUT',
				$aConfig['User'],
				$sPassword,
				$sICS,
				['Content-Type: text/calendar; charset=utf-8']
			);
			
			
			if ($result['code'] === 201 || $result['code'] === 204) {
				return $this->jsonResponse(__FUNCTION__, ['success' => true, 'uid' => $sUid]);
			} else {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'CalDAV error: ' . $result['code']]);
			}
			
		} catch (\Exception $e) {
			return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => $e->getMessage()]);
		}
	}
	
	/**
	 * Update calendar event
	 */
	public function DoUpdateCalendarEvent() : array
	{
		try {
			$oAccount = $this->Manager()->Actions()->getAccountFromToken();
			if (!$oAccount) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Not logged in']);
			}
			
			$aConfig = $this->getCalendarConfig($oAccount);
			if (!$aConfig) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Calendar not configured']);
			}
			
			$sEventId = $this->jsonParam('EventId', '');
			$sTitle = $this->jsonParam('Title', '');
			$sStart = $this->jsonParam('Start', '');
			$sEnd = $this->jsonParam('End', '');
			$bAllDay = $this->jsonParam('AllDay', false);
			
			if (!$sEventId || !$sTitle) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Event ID and title required']);
			}
			
			// Format dates
			if ($bAllDay) {
				// For all-day events, use date string directly without timezone conversion
				// JS sends date-only string like "2025-11-06" or ISO string
				// Extract date part if it's an ISO string
				$sStartDate = preg_match('/^(\d{4}-\d{2}-\d{2})/', $sStart, $mStart) ? $mStart[1] : $sStart;
				$sEndDate = preg_match('/^(\d{4}-\d{2}-\d{2})/', $sEnd, $mEnd) ? $mEnd[1] : $sEnd;
				$sStartFormatted = str_replace('-', '', $sStartDate);
				$sEndFormatted = str_replace('-', '', $sEndDate);
			} else {
				// For timed events, parse ISO string and convert to UTC
				$dtStart = new \DateTime($sStart, new \DateTimeZone('UTC'));
				$dtEnd = new \DateTime($sEnd, new \DateTimeZone('UTC'));
				$sStartFormatted = $dtStart->format('Ymd\THis\Z');
				$sEndFormatted = $dtEnd->format('Ymd\THis\Z');
			}
			
			// Decrypt password using MAIN account's CryptKey
			$oMainAccount = $this->Manager()->Actions()->GetMainAccountFromToken();
			if (!$oMainAccount || !method_exists($oMainAccount, 'CryptKey')) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Cannot access encryption key']);
			}
			
			$sCryptKey = $oMainAccount->CryptKey();
			$sPassword = \SnappyMail\Crypt::DecryptFromJSON($aConfig['Password'], $sCryptKey);
			
			if (is_object($sPassword) && method_exists($sPassword, '__toString')) {
				$sPassword = (string)$sPassword;
			}
			
			$sEventUrl = rtrim($aConfig['CalDAVUrl'], '/') . '/' . ($aConfig['Collection'] ?? 'Default') . '/' . $sEventId . '.ics';

			// Edit the stored event rather than replacing it. Rebuilding the
			// object from the handful of fields the dialog knows about silently
			// dropped everything else it carried - description, location,
			// VALARM, ORGANIZER and ATTENDEE, and any RRULE - so dragging a
			// recurring event in the grid flattened it to a single occurrence.
			$sICS = null;
			$aFetch = $this->makeCalDAVRequest($sEventUrl, 'GET', $aConfig['User'], $sPassword);
			if (200 === $aFetch['code'] && \strlen((string) $aFetch['body'])) {
				$sICS = $this->applyEventEdit(
					(string) $aFetch['body'], $oAccount, $sTitle, $sStartFormatted,
					$sEndFormatted, $bAllDay
				);
			}
			if (null === $sICS) {
				// Not on the server (or unreadable): fall back to a fresh object.
				$sICS = "BEGIN:VCALENDAR\r\n"
					. "VERSION:2.0\r\n"
					. "PRODID:-//Mailbux//CalDAV Plugin//EN\r\n"
					. "BEGIN:VEVENT\r\n"
					. "UID:" . $sEventId . "\r\n"
					. "DTSTAMP:" . gmdate('Ymd\THis\Z') . "\r\n"
					. "DTSTART" . ($bAllDay ? ';VALUE=DATE' : '') . ":" . $sStartFormatted . "\r\n"
					. "DTEND" . ($bAllDay ? ';VALUE=DATE' : '') . ":" . $sEndFormatted . "\r\n"
					. "SUMMARY:" . $this->escapeICS($sTitle) . "\r\n"
					. "END:VEVENT\r\n"
					. "END:VCALENDAR\r\n";
			}

			$result = $this->makeCalDAVRequest(
				$sEventUrl,
				'PUT',
				$aConfig['User'],
				$sPassword,
				$sICS,
				['Content-Type: text/calendar; charset=utf-8']
			);
			
			if ($result['code'] === 201 || $result['code'] === 204) {
				return $this->jsonResponse(__FUNCTION__, ['success' => true]);
			} else {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'CalDAV error: ' . $result['code']]);
			}
			
		} catch (\Exception $e) {
			return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => $e->getMessage()]);
		}
	}
	
	/**
	 * Delete calendar event
	 */
	public function DoDeleteCalendarEvent() : array
	{
		try {
			$oAccount = $this->Manager()->Actions()->getAccountFromToken();
			if (!$oAccount) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Not logged in']);
			}
			
			$aConfig = $this->getCalendarConfig($oAccount);
			if (!$aConfig) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Calendar not configured']);
			}
			
			$sEventId = $this->jsonParam('EventId', '');
			if (!$sEventId) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Event ID required']);
			}
			
			// Decrypt password using MAIN account's CryptKey
			$oMainAccount = $this->Manager()->Actions()->GetMainAccountFromToken();
			if (!$oMainAccount || !method_exists($oMainAccount, 'CryptKey')) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Cannot access encryption key']);
			}
			
			$sCryptKey = $oMainAccount->CryptKey();
			$sPassword = \SnappyMail\Crypt::DecryptFromJSON($aConfig['Password'], $sCryptKey);
			
			if (is_object($sPassword) && method_exists($sPassword, '__toString')) {
				$sPassword = (string)$sPassword;
			}
			
			// DELETE event from CalDAV server
			// URL-encode the event ID to handle @ symbols properly
			$sEventUrl = rtrim($aConfig['CalDAVUrl'], '/') . '/' . ($aConfig['Collection'] ?? 'Default') . '/' . rawurlencode($sEventId) . '.ics';
			
			
			$result = $this->makeCalDAVRequest(
				$sEventUrl,
				'DELETE',
				$aConfig['User'],
				$sPassword
			);
			
			
			if ($result['code'] === 204 || $result['code'] === 200) {
				return $this->jsonResponse(__FUNCTION__, ['success' => true]);
			} else {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'CalDAV error: ' . $result['code']]);
			}
			
		} catch (\Exception $e) {
			return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => $e->getMessage()]);
		}
	}
	
	/**
	 * Escape text for iCalendar format
	 */
	private function escapeICS($text)
	{
		return str_replace(["\r\n", "\n", "\r", ",", ";"], ["\\n", "\\n", "\\n", "\\,", "\\;"], $text);
	}
	
	/**
	 * Parse CalDAV XML response
	 */
	private function parseCalDAVResponse($xml)
	{
		$events = [];
		
		try {
			$doc = new \DOMDocument();
			$doc->loadXML($xml);
			
			$xpath = new \DOMXPath($doc);
			$xpath->registerNamespace('D', 'DAV:');
			$xpath->registerNamespace('C', 'urn:ietf:params:xml:ns:caldav');
			
			$responses = $xpath->query('//D:response');
			
			foreach ($responses as $response) {
				$calendarData = $xpath->query('.//C:calendar-data', $response);
				if ($calendarData->length > 0) {
					$icalData = $calendarData->item(0)->nodeValue;
					$parsedEvents = $this->parseICalendar($icalData);
					$events = array_merge($events, $parsedEvents);
				}
			}
		} catch (\Exception $e) {
			// Silent fail
		}
		
		return $events;
	}
	
	/**
	 * Create calendar event
	 */
}
