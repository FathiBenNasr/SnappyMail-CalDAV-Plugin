<?php

class CaldavPlugin extends \RainLoop\Plugins\AbstractPlugin
{
	const
		NAME     = 'Mailbux CalDAV Auto',
		VERSION  = '2.8',
		RELEASE  = '2026-08-18',
		CATEGORY = 'Calendar',
		DESCRIPTION = 'Auto-configures CalDAV calendar sync with JMAP support - switches per account',
		REQUIRED = '2.0.0';

	// RFC 5545 weekday abbreviations, indexed the way both PHP's `w` and
	// JavaScript's getDay() count: Sunday first.
	private const RRULE_DAYS = array('SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA');

	public function Init() : void
	{
		// Add custom JSON actions
		$this->addJsonHook('GetCalendarEvents', 'DoGetCalendarEvents');
		$this->addJsonHook('CreateCalendarEvent', 'DoCreateCalendarEvent');
		$this->addJsonHook('UpdateCalendarEvent', 'DoUpdateCalendarEvent');
		$this->addJsonHook('DeleteCalendarEvent', 'DoDeleteCalendarEvent');
		$this->addJsonHook('CancelCalendarEvent', 'DoCancelCalendarEvent');
		$this->addJsonHook('SuggestAttendees', 'DoSuggestAttendees');
		$this->addJsonHook('NewConferenceUrl', 'DoNewConferenceUrl');
		$this->addJsonHook('SearchPlaces', 'DoSearchPlaces');
		
		// Serve this plugin's static assets. There is no built-in route for
		// them: ServiceActions::ServicePlugins() ignores everything after
		// /?/Plugins/ and always returns the compiled plugin JS bundle, so the
		// old "?/Plugins/caldav/fullcalendar.min.js" URL returned this very
		// file instead of the library and window.FullCalendar stayed undefined.
		$this->addPartHook('CalDavAsset', 'ServiceCalDavAsset');

		// Add JavaScript.
		//
		// Order matters more than it looks: SnappyMail concatenates every
		// enabled plugin's JS into one script, so a throw at the top level of
		// one file stops every file after it from running at all. The toolbar
		// entry is the way into the calendar, so it registers first and cannot
		// be taken down by anything calendar.js does.
		//
		// sidebar.js replaces contacts-popover.js, which reached the calendar
		// by hijacking the Contacts button. contacts-popover.js is kept in the
		// tree for reference but is no longer loaded.
		$this->addJs('sidebar.js');
		$this->addJs('calendar.js');

		// Add CSS
		$this->addCss('calendar.css');
	}
	
	/**
	 * The invited addresses of an event, as a display string. The organiser is
	 * left out: they are not an invitee of their own meeting.
	 */
	/**
	 * The organiser as something worth showing: "Name <address>" when the
	 * invitation carried a CN, the bare address otherwise.
	 *
	 * The detail panel has always had a binding for this; nothing ever filled
	 * it, so the row silently never appeared.
	 */
	private function organizerLabel($oEvent) : string
	{
		if (!isset($oEvent->ORGANIZER)) {
			return '';
		}
		$sAddr = \trim(\preg_replace('#^mailto:#i', '', (string) $oEvent->ORGANIZER));
		if (!\strlen($sAddr)) {
			return '';
		}
		$sName = \trim((string) ($oEvent->ORGANIZER['CN'] ?? ''));
		return (\strlen($sName) && 0 !== \strcasecmp($sName, $sAddr))
			? $sName . ' <' . $sAddr . '>'
			: $sAddr;
	}

	/**
	 * Whether this account owns the meeting, which is what decides if it may
	 * be cancelled. An event with no ORGANIZER was never scheduled with
	 * anyone, so it belongs to whoever holds it.
	 */
	private function isOrganizer($oEvent, string $sSelf) : bool
	{
		if (!isset($oEvent->ORGANIZER)) {
			return true;
		}
		if (!\strlen($sSelf)) {
			return false;
		}
		$sAddr = \trim(\preg_replace('#^mailto:#i', '', (string) $oEvent->ORGANIZER));
		return 0 === \strcasecmp($sAddr, $sSelf);
	}

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
	/**
	 * The VEVENT carrying the series: the one without a RECURRENCE-ID. The
	 * others are overrides, each standing for a single occurrence of it.
	 *
	 * @return \Sabre\VObject\Component\VEvent|null
	 */
	private function seriesMaster(\Sabre\VObject\Component\VCalendar $oVCal)
	{
		foreach ($oVCal->VEVENT as $oCandidate) {
			if (!isset($oCandidate->{'RECURRENCE-ID'})) {
				return $oCandidate;
			}
		}
		return null;
	}

	/**
	 * Keep the EXDATEs on one side of an instant and drop the rest, which is
	 * what splitting a series has to do with them: a date somebody deleted
	 * belongs to whichever half now contains it.
	 */
	private function keepExdates($oEvent, int $iWhen, bool $bAfter) : void
	{
		$aKept = array();
		foreach ($oEvent->select('EXDATE') as $oExdate) {
			foreach ($oExdate->getDateTimes() as $oDate) {
				if (($oDate->getTimestamp() >= $iWhen) === $bAfter) {
					$aKept[] = $oDate;
				}
			}
		}
		$oEvent->remove('EXDATE');
		if ($aKept) {
			$bTimed = !isset($oEvent->DTSTART) || $oEvent->DTSTART->hasTime();
			$oExdate = $oEvent->add('EXDATE', '19700101', $bTimed ? array() : array('VALUE' => 'DATE'));
			$oExdate->setDateTimes($aKept);
		}
	}

	/**
	 * How many occurrences a rule produces before an instant. Needed because a
	 * series counted in occurrences cannot simply be cut in two: both halves
	 * would carry the same COUNT and together run twice as long as the series
	 * ever did.
	 */
	private function countBefore(string $sRule, \DateTimeInterface $oStart, int $iWhen) : int
	{
		$iCount = 0;
		try {
			foreach (new \Sabre\VObject\Recur\RRuleIterator($sRule, $oStart) as $oDate) {
				if (!$oDate || $oDate->getTimestamp() >= $iWhen) {
					break;
				}
				if (10000 < ++$iCount) {
					break;
				}
			}
		} catch (\Throwable $oException) {
			// An unreadable rule counts as nothing before the cut, which leaves
			// the tail its full COUNT - too many, but never too few.
		}
		return $iCount;
	}

	/**
	 * End a series just before one of its occurrences, taking everything at or
	 * after that instant out of it. Returns false when there would be nothing
	 * left - the cut is at or before the first occurrence - so the caller can
	 * decide what "the rest of it" means when the rest is all of it.
	 */
	private function truncateSeriesAt(\Sabre\VObject\Component\VCalendar $oVCal, $oMaster, int $iWhen) : bool
	{
		if (!isset($oMaster->RRULE) || !isset($oMaster->DTSTART)
		 || $oMaster->DTSTART->getDateTime()->getTimestamp() >= $iWhen) {
			return false;
		}

		// UNTIL is inclusive and, for a timed series, always UTC (RFC 5545
		// 3.3.10) whatever zone DTSTART is written in. COUNT has to go with it:
		// the two cannot appear in one rule, and the earlier of them is the one
		// that would have applied anyway.
		$bTimed = $oMaster->DTSTART->hasTime();
		$aParts = $oMaster->RRULE->getParts();
		unset($aParts['COUNT']);
		$aParts['UNTIL'] = $bTimed
			? \gmdate('Ymd\THis\Z', $iWhen - 1)
			: \gmdate('Ymd', $iWhen - 86400);
		$oMaster->RRULE->setParts($aParts);

		// Overrides and exclusions past the cut describe dates this half no
		// longer has.
		$aStale = array();
		foreach ($oVCal->VEVENT as $oCandidate) {
			if (isset($oCandidate->{'RECURRENCE-ID'})
			 && $oCandidate->{'RECURRENCE-ID'}->getDateTime()->getTimestamp() >= $iWhen) {
				$aStale[] = $oCandidate;
			}
		}
		foreach ($aStale as $oCandidate) {
			$oVCal->remove($oCandidate);
		}
		$this->keepExdates($oMaster, $iWhen, false);

		// The guests' clients need to be told the series now stops earlier.
		$oMaster->SEQUENCE = ((int) ((string) ($oMaster->SEQUENCE ?? '0'))) + 1;
		$oMaster->DTSTAMP = new \DateTime('now', new \DateTimeZone('UTC'));
		return true;
	}

	/**
	 * Cut a series in two at one of its occurrences: the stored object keeps
	 * everything before the cut, and a second one - new UID, everything else
	 * inherited - starts at that occurrence and carries the rest of the rule.
	 * Returns the new object, or null when there is nothing to cut off: not a
	 * series, or a cut at its first occurrence, where the rest *is* all of it.
	 *
	 * This is what "this and all following" has to be in iCalendar. A series is
	 * one rule from one start, with no way to say "different from here on"
	 * inside it, so every calendar client splits instead. The overrides after
	 * the cut are not carried over: they are tied by RECURRENCE-ID to instants
	 * of the old rule, and the whole point of the split is that the new half
	 * need not keep them.
	 *
	 * @return \Sabre\VObject\Component\VCalendar|null
	 */
	private function splitSeries(\Sabre\VObject\Component\VCalendar $oVCal, $oMaster, string $sRecurrenceId)
	{
		try {
			$iWhen = (new \DateTime($sRecurrenceId, new \DateTimeZone('UTC')))->getTimestamp();
		} catch (\Throwable $oException) {
			return null;
		}
		if (!isset($oMaster->RRULE) || !isset($oMaster->DTSTART)) {
			return null;
		}
		$oStart = $oMaster->DTSTART->getDateTime();
		if ($oStart->getTimestamp() >= $iWhen) {
			return null;
		}

		$aParts = $oMaster->RRULE->getParts();
		if (isset($aParts['COUNT'])) {
			$aParts['COUNT'] = \max(1, ((int) $aParts['COUNT'])
				- $this->countBefore((string) $oMaster->RRULE, $oStart, $iWhen));
		}

		// Cloning the whole object rather than building one keeps the calendar
		// around the event - VTIMEZONE above all, without which a TZID on the
		// new half names a zone nothing defines.
		$oTailCal = clone $oVCal;
		$oTail = $this->seriesMaster($oTailCal);
		if (!$oTail) {
			return null;
		}
		$aDrop = array();
		foreach ($oTailCal->VEVENT as $oCandidate) {
			if (isset($oCandidate->{'RECURRENCE-ID'})) {
				$aDrop[] = $oCandidate;
			}
		}
		foreach ($aDrop as $oCandidate) {
			$oTailCal->remove($oCandidate);
		}

		// The new half begins at the occurrence that was cut on, written the
		// way the old one wrote its start - same zone, same value type - and
		// keeping the length it had.
		$oZone   = $oStart->getTimezone() ?: new \DateTimeZone('UTC');
		$iLength = isset($oTail->DTEND)
			? $oTail->DTEND->getDateTime()->getTimestamp() - $oStart->getTimestamp()
			: 0;
		$oTail->DTSTART->setDateTime((new \DateTime('@' . $iWhen))->setTimezone($oZone));
		if (isset($oTail->DTEND)) {
			$oTail->DTEND->setDateTime((new \DateTime('@' . ($iWhen + $iLength)))->setTimezone($oZone));
		}

		$oTail->RRULE->setParts($aParts);
		$this->keepExdates($oTail, $iWhen, true);

		// A new resource, so a new identity: reusing the UID would make the two
		// halves the same event, and the server would store only one of them.
		$sSuffix = \strstr((string) $oMaster->UID, '@');
		$oTail->UID = \uniqid('event-') . '-' . \bin2hex(\random_bytes(4)) . ($sSuffix ?: '');
		$oTail->SEQUENCE = 0;
		$oTail->DTSTAMP = new \DateTime('now', new \DateTimeZone('UTC'));

		if (!$this->truncateSeriesAt($oVCal, $oMaster, $iWhen)) {
			return null;
		}
		return $oTailCal;
	}

	/**
	 * The stored series with everything from one occurrence onwards removed.
	 * Returns the rewritten object, an empty string when the cut would leave
	 * nothing and the resource should simply go, or null if it cannot be read.
	 */
	private function truncateSeriesFrom(string $sExisting, string $sRecurrenceId) : ?string
	{
		try {
			$oVCal = \Sabre\VObject\Reader::read($sExisting, \Sabre\VObject\Reader::OPTION_FORGIVING);
			if (!($oVCal instanceof \Sabre\VObject\Component\VCalendar) || !isset($oVCal->VEVENT)) {
				return null;
			}
			$oMaster = $this->seriesMaster($oVCal);
			if (!$oMaster) {
				return null;
			}
			$iWhen = (new \DateTime($sRecurrenceId, new \DateTimeZone('UTC')))->getTimestamp();

			// Nothing would be left: "this and all following" starting at the
			// first occurrence is the whole event.
			return $this->truncateSeriesAt($oVCal, $oMaster, $iWhen) ? $oVCal->serialize() : '';
		} catch (\Throwable $oException) {
			\SnappyMail\Log::notice('CalDAV', 'truncate failed: ' . $oException->getMessage());
			return null;
		}
	}

	private function applyEventEdit(string $sExisting, \RainLoop\Model\Account $oAccount,
		string $sTitle, string $sStart, string $sEnd, bool $bAllDay,
		?string &$sTailIcs = null, ?string &$sTailUid = null) : ?string
	{
		try {
			$oVCal = \Sabre\VObject\Reader::read($sExisting, \Sabre\VObject\Reader::OPTION_FORGIVING);
			if (!($oVCal instanceof \Sabre\VObject\Component\VCalendar) || !isset($oVCal->VEVENT)) {
				return null;
			}

			$oMaster = $this->seriesMaster($oVCal) ?: $oVCal->VEVENT;
			$oEvent = $oMaster;

			// "This occurrence" edits the override for that one date, splitting
			// a fresh one off the series if there is not one yet. "This and all
			// following" cuts the series in two and edits the second half, a
			// new object of its own. "The whole series" - the default, and all
			// there used to be - edits the master.
			$sScope = \strtolower((string) $this->jsonParam('Scope', 'series'));
			$sRecurrenceId = \trim((string) $this->jsonParam('RecurrenceId', ''));
			$bSeries = \strlen($sRecurrenceId) && isset($oMaster->RRULE);
			$bOccurrence = $bSeries && 'occurrence' === $sScope;
			$oTailCal = null;
			if ($bOccurrence) {
				$oEvent = $this->occurrenceOverride($oVCal, $oMaster, $sRecurrenceId);
				if (null === $oEvent) {
					return null;
				}
			} elseif ($bSeries && 'following' === $sScope) {
				// A cut at the first occurrence splits nothing off, and falling
				// through to the master is the right answer there: everything
				// from the first occurrence on is the whole series.
				$oTailCal = $this->splitSeries($oVCal, $oMaster, $sRecurrenceId);
				if ($oTailCal) {
					$oEvent = $this->seriesMaster($oTailCal);
				}
			}

			$sOldStart = (string) ($oEvent->DTSTART ?? '');
			$sOldEnd   = (string) ($oEvent->DTEND ?? '');
			$sOldWhere = (string) ($oEvent->LOCATION ?? '') . "\0" . $this->conferenceUri($oEvent);
			$sOldRule  = (string) ($oEvent->RRULE ?? '');

			$oEvent->SUMMARY = $sTitle;

			// A repeating event is shown one occurrence at a time, but its times
			// live on the master. Writing the occurrence's own times there
			// would drag the whole series onto that date, so move the master by
			// however far this occurrence moved instead, and give it the new
			// length. RecurrenceId is the occurrence's original start; the grid
			// sends it whenever it has one.
			//
			// The times are edited in place rather than replaced, so a series
			// another client wrote in its own timezone keeps its TZID - retyping
			// it as UTC would freeze it against the next daylight-saving change.
			//
			// None of this applies to an override: it stands for one date and
			// takes the times it is given.
			$bShifted = false;
			if (!$bOccurrence && \strlen($sRecurrenceId) && isset($oEvent->RRULE) && isset($oEvent->DTSTART)) {
				try {
					$oUtc    = new \DateTimeZone('UTC');
					$iWas    = (new \DateTime($sRecurrenceId, $oUtc))->getTimestamp();
					$iNow    = (new \DateTime($sStart, $oUtc))->getTimestamp();
					$iLength = (new \DateTime($sEnd, $oUtc))->getTimestamp() - $iNow;
					$oWhen   = $oEvent->DTSTART->getDateTime();
					$oZone   = $oWhen->getTimezone() ?: $oUtc;
					$iMaster = $oWhen->getTimestamp() + ($iNow - $iWas);

					$oEvent->DTSTART->setDateTime(
						(new \DateTime('@' . $iMaster))->setTimezone($oZone));
					if (isset($oEvent->DTEND)) {
						$oEvent->DTEND->setDateTime(
							(new \DateTime('@' . ($iMaster + $iLength)))->setTimezone($oZone));
					}
					// No DTEND means the length is a DURATION, which the shift
					// leaves correct on its own.

					// Exceptions and extra dates are stated as instants of this
					// same series, so a series that moves takes them with it.
					// Left behind, they would strike out dates the series no
					// longer falls on and let the ones somebody deleted return.
					foreach (array('EXDATE', 'RDATE') as $sDates) {
						foreach ($oEvent->select($sDates) as $oProperty) {
							$aMoved = array();
							foreach ($oProperty->getDateTimes() as $oDate) {
								$aMoved[] = (new \DateTime('@' . ($oDate->getTimestamp() + ($iNow - $iWas))))
									->setTimezone($oDate->getTimezone() ?: $oZone);
							}
							if ($aMoved) {
								$oProperty->setDateTimes($aMoved);
							}
						}
					}
					$bShifted = true;
				} catch (\Throwable $oIgnored) {
					// Unreadable occurrence: fall through and take the times as
					// given, which is what happened before any of this existed.
				}
			}

			if (!$bShifted) {
				$aDateParams = $bAllDay ? array('VALUE' => 'DATE') : array();
				$oEvent->remove('DTSTART');
				$oEvent->remove('DTEND');
				$oEvent->add('DTSTART', $sStart, $aDateParams);
				$oEvent->add('DTEND', $sEnd, $aDateParams);
			}

			// How it repeats, under the same rule as the fields below: only
			// rewritten when the dialog actually sent it, so dragging an
			// occurrence in the grid cannot quietly flatten the series.
			// An override stands for a single date and cannot carry the series
			// rule, so the dialog's repeat fields are ignored on that path.
			$mRepeat = $bOccurrence ? null : $this->jsonParam('Repeat', null);
			if (null !== $mRepeat) {
				$sRRule = $this->buildRecurrenceRule((bool) $bAllDay);
				$oEvent->remove('RRULE');
				if (\strlen($sRRule)) {
					$oEvent->add('RRULE', $sRRule);
				}
			}

			// Where it is, and where the call is. Same rule as the guest list
			// below: only touched when the dialog actually sent the field, so an
			// edit that never saw it cannot blank it. This is also why editing
			// the location used to have no effect - the dialog set it locally
			// and nothing ever sent it here.
			$mConference = $this->jsonParam('Conference', null);
			if (null !== $mConference) {
				$sConference = $this->sanitizeConferenceUrl((string) $mConference);
				$oEvent->remove('CONFERENCE');
				if (\strlen($sConference)) {
					$oEvent->add('CONFERENCE', $sConference, array(
						'VALUE'   => 'URI',
						'FEATURE' => array('VIDEO', 'AUDIO'),
						'LABEL'   => 'Video call'
					));
				}
			} else {
				$sConference = $this->conferenceUri($oEvent);
			}

			$mLocation = $this->jsonParam('Location', null);
			if (null !== $mLocation) {
				$sLocation = \trim((string) $mLocation);
				$oEvent->remove('LOCATION');
				if (\strlen($sLocation)) {
					$oEvent->add('LOCATION', $sLocation);
				} elseif (\strlen($sConference)) {
					// Online-only, and for the clients that only render LOCATION.
					$oEvent->add('LOCATION', $sConference);
				}
			}

			$mGeo = $this->jsonParam('Geo', null);
			if (null !== $mGeo) {
				$sGeo = $this->sanitizeGeo((string) $mGeo);
				$oEvent->remove('GEO');
				if (\strlen($sGeo)) {
					$oEvent->add('GEO', $sGeo);
				}
			}

			$mDescription = $this->jsonParam('Description', null);
			if (null !== $mDescription) {
				$sDescription = (string) $mDescription;
				$oEvent->remove('DESCRIPTION');
				if (\strlen(\trim($sDescription))) {
					$oEvent->add('DESCRIPTION', $sDescription);
				}
			}

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
			// Moving a meeting to a different room, on to a different call, or
			// on to a different schedule is exactly such a change.
			$sNewWhere = (string) ($oEvent->LOCATION ?? '') . "\0" . $this->conferenceUri($oEvent);
			if ($bGuestsChanged || $sOldStart !== (string) $oEvent->DTSTART
			 || $sOldEnd !== (string) $oEvent->DTEND || $sOldWhere !== $sNewWhere
			 || $sOldRule !== (string) ($oEvent->RRULE ?? '')) {
				$oEvent->SEQUENCE = ((int) ((string) ($oEvent->SEQUENCE ?? '0'))) + 1;
			}
			$oEvent->DTSTAMP = new \DateTime('now', new \DateTimeZone('UTC'));

			if ($oTailCal) {
				$sTailIcs = $oTailCal->serialize();
				$sTailUid = (string) $oEvent->UID;
			}
			return $oVCal->serialize();
		} catch (\Throwable $oException) {
			\SnappyMail\Log::notice('CalDAV', 'update parse failed: ' . $oException->getMessage());
			return null;
		}
	}

	/**
	 * The VEVENT standing for one occurrence of a series, created if need be.
	 *
	 * A series is one iCalendar object: a master carrying the RRULE, plus an
	 * override VEVENT per occurrence that differs from it, each tied to the
	 * occurrence it replaces by RECURRENCE-ID. A new override starts as a copy
	 * of the master so it keeps everything the occurrence already had -
	 * organiser, guests, alarms, description - minus the recurrence itself,
	 * which belongs to the series and not to one date of it.
	 *
	 * @return \Sabre\VObject\Component\VEvent|null
	 */
	private function occurrenceOverride(\Sabre\VObject\Component\VCalendar $oVCal,
		$oMaster, string $sRecurrenceId)
	{
		try {
			$iWhen = (new \DateTime($sRecurrenceId, new \DateTimeZone('UTC')))->getTimestamp();
		} catch (\Throwable $oException) {
			return null;
		}

		foreach ($oVCal->VEVENT as $oCandidate) {
			if (isset($oCandidate->{'RECURRENCE-ID'})
			 && $oCandidate->{'RECURRENCE-ID'}->getDateTime()->getTimestamp() === $iWhen) {
				return $oCandidate;
			}
		}

		if (!isset($oMaster->DTSTART)) {
			return null;
		}
		$oNew = clone $oMaster;
		foreach (array('RRULE', 'RDATE', 'EXDATE', 'RECURRENCE-ID') as $sProperty) {
			$oNew->remove($sProperty);
		}

		// The id has to be written the way the master writes DTSTART - same
		// value type, same zone - or the server cannot tell which occurrence
		// this replaces, and stores it as an unrelated second event.
		$bTimed = $oMaster->DTSTART->hasTime();
		$oZone  = $oMaster->DTSTART->getDateTime()->getTimezone() ?: new \DateTimeZone('UTC');
		$oId    = $oNew->add('RECURRENCE-ID', '19700101', $bTimed ? array() : array('VALUE' => 'DATE'));
		$oId->setDateTime((new \DateTime('@' . $iWhen))->setTimezone($oZone));

		$oVCal->add($oNew);
		return $oNew;
	}

	/**
	 * Drop one occurrence out of a series by adding it to EXDATE, and remove
	 * any override that stood for it. Returns the rewritten object, or null if
	 * this is not a series to take a date out of.
	 *
	 * Deleting an occurrence is not deleting a resource: the series lives in a
	 * single iCalendar object, so what goes to the server is a PUT of the
	 * object with that date excluded, never a DELETE.
	 */
	private function excludeOccurrence(string $sExisting, string $sRecurrenceId) : ?string
	{
		try {
			$oVCal = \Sabre\VObject\Reader::read($sExisting, \Sabre\VObject\Reader::OPTION_FORGIVING);
			if (!($oVCal instanceof \Sabre\VObject\Component\VCalendar) || !isset($oVCal->VEVENT)) {
				return null;
			}

			$oMaster = $this->seriesMaster($oVCal);
			if (!$oMaster || !isset($oMaster->RRULE) || !isset($oMaster->DTSTART)) {
				return null;
			}

			$iWhen = (new \DateTime($sRecurrenceId, new \DateTimeZone('UTC')))->getTimestamp();
			$bTimed = $oMaster->DTSTART->hasTime();
			$oZone  = $oMaster->DTSTART->getDateTime()->getTimezone() ?: new \DateTimeZone('UTC');

			// An override for this date is now moot: the date is gone.
			foreach ($oVCal->VEVENT as $oCandidate) {
				if (isset($oCandidate->{'RECURRENCE-ID'})
				 && $oCandidate->{'RECURRENCE-ID'}->getDateTime()->getTimestamp() === $iWhen) {
					$oVCal->remove($oCandidate);
				}
			}

			// Already excluded - by another client, or by a second click.
			foreach ($oMaster->select('EXDATE') as $oExdate) {
				foreach ($oExdate->getDateTimes() as $oExisting) {
					if ($oExisting->getTimestamp() === $iWhen) {
						return $oVCal->serialize();
					}
				}
			}

			$oExdate = $oMaster->add('EXDATE', '19700101', $bTimed ? array() : array('VALUE' => 'DATE'));
			$oExdate->setDateTimes(array((new \DateTime('@' . $iWhen))->setTimezone($oZone)));

			// The guests' clients need to be told an occurrence went away.
			$oMaster->SEQUENCE = ((int) ((string) ($oMaster->SEQUENCE ?? '0'))) + 1;
			$oMaster->DTSTAMP = new \DateTime('now', new \DateTimeZone('UTC'));

			return $oVCal->serialize();
		} catch (\Throwable $oException) {
			\SnappyMail\Log::notice('CalDAV', 'exclude failed: ' . $oException->getMessage());
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

	/* ------------------------------------------------------------------ *
	 * Video conferencing
	 *
	 * A meeting has two places: where the room is, and where the call is.
	 * They are kept as separate fields rather than one overloaded LOCATION,
	 * because a hybrid meeting genuinely has both and squashing them loses
	 * one of them. LOCATION stays the physical place; the call goes in
	 * CONFERENCE (RFC 7986 5.11), which is what a conforming client reads to
	 * offer a Join button.
	 * ------------------------------------------------------------------ */

	/**
	 * The configured meeting server, or '' when the feature is off.
	 */
	private function conferenceBaseUrl() : string
	{
		$sUrl = \trim((string) $this->Config()->Get('plugin', 'jitsi_url', ''));
		return \preg_match('#^https?://#i', $sUrl) ? \rtrim($sUrl, '/') : '';
	}

	/**
	 * A room nobody can guess.
	 *
	 * On a public Jitsi deployment the room name IS the access control: anyone
	 * who can guess it is in the meeting. So this is 80 bits from the CSPRNG,
	 * not a slug of the event title - a title-derived room would let anyone
	 * who knows what you call your meetings walk into them. Grouped into
	 * fours only so it can be read out over the phone; the ambiguous
	 * characters are left out of the alphabet for the same reason.
	 */
	private function generateRoomName() : string
	{
		$sAlphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
		$iMax = \strlen($sAlphabet) - 1;
		$aGroups = array();
		for ($iGroup = 0; $iGroup < 4; ++$iGroup) {
			$sGroup = '';
			for ($iChar = 0; $iChar < 4; ++$iChar) {
				$sGroup .= $sAlphabet[\random_int(0, $iMax)];
			}
			$aGroups[] = $sGroup;
		}
		return \implode('-', $aGroups);
	}

	/**
	 * Mint a fresh room URL for the event dialog.
	 *
	 * Done here rather than in the browser so the room name comes from a real
	 * CSPRNG - Math.random() is not one - and so the server URL stays a
	 * deployment setting instead of being published to every page.
	 */
	public function DoNewConferenceUrl() : array
	{
		$oAccount = $this->Manager()->Actions()->getAccountFromToken();
		if (!$oAccount) {
			return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Not logged in']);
		}

		$sBase = $this->conferenceBaseUrl();
		if (!\strlen($sBase)) {
			return $this->jsonResponse(__FUNCTION__, ['success' => false,
				'error' => 'No video meeting server is configured for this installation.']);
		}

		return $this->jsonResponse(__FUNCTION__, [
			'success' => true,
			'url' => $sBase . '/' . $this->generateRoomName()
		]);
	}

	/**
	 * Accept a conference link only if it is one. Anything else - a javascript:
	 * URI, a stray line break that would forge an iCalendar property - is not
	 * something to write into an event other people's clients will open.
	 */
	private function sanitizeConferenceUrl(string $sUrl) : string
	{
		// Note the anchors and \s: a value carrying a line break is rejected
		// outright rather than having the break stripped, which would silently
		// weld a forged iCalendar property onto the end of the URL.
		$sUrl = \trim($sUrl);
		return \preg_match('#^https?://[^\s<>"]+$#i', $sUrl) ? $sUrl : '';
	}

	/**
	 * Fold a property to the 75-octet lines RFC 5545 3.1 asks for. A generated
	 * room URL plus a long server name clears that on its own, and an unfolded
	 * line is the kind of thing a strict parser on the guest's side rejects.
	 */
	private function foldICSLine(string $sLine) : string
	{
		if (75 >= \strlen($sLine)) {
			return $sLine;
		}

		// The limit is counted in octets, but a fold may not cut a UTF-8
		// character in half, so the line is walked character by character.
		$aChars = \preg_split('//u', $sLine, -1, PREG_SPLIT_NO_EMPTY);
		if (!\is_array($aChars)) {
			return $sLine;   // not valid UTF-8: leave it rather than corrupt it
		}

		$sOut = '';
		$iOctets = 0;
		foreach ($aChars as $sChar) {
			$iWidth = \strlen($sChar);
			if (75 < $iOctets + $iWidth) {
				$sOut .= "\r\n ";
				$iOctets = 1;   // the leading space of a continuation line counts
			}
			$sOut .= $sChar;
			$iOctets += $iWidth;
		}
		return $sOut;
	}

	/* ------------------------------------------------------------------ *
	 * Picking a physical place
	 *
	 * The map lives behind a search box rather than an embedded map widget.
	 * SnappyMail ships a Content-Security-Policy of roughly script-src 'self',
	 * so neither an OpenStreetMap/Google iframe nor a CDN-loaded Leaflet will
	 * run in this page, and a real popup window on openstreetmap.org cannot
	 * hand its selection back across origins. What does work is asking a
	 * geocoder ourselves and letting the organiser pick from the answers.
	 *
	 * The lookup is proxied through PHP for three reasons: connect-src would
	 * block the browser making it, Nominatim's usage policy wants a
	 * identifying User-Agent that a browser will not let us set, and it keeps
	 * the user's IP out of a third party's logs.
	 * ------------------------------------------------------------------ */

	private function geocoderUrl() : string
	{
		$sUrl = \trim((string) $this->Config()->Get('plugin', 'geocoder_url', ''));
		return \preg_match('#^https?://#i', $sUrl) ? \rtrim($sUrl, '/') : '';
	}

	/**
	 * Where to look when the geocoder above has never heard of the place.
	 */
	private function geocoderFallbackUrl() : string
	{
		$sUrl = \trim((string) $this->Config()->Get('plugin', 'geocoder_fallback_url', ''));
		return \preg_match('#^https?://#i', $sUrl) ? \rtrim($sUrl, '/') : '';
	}

	/**
	 * Look a place up. Returns at most a handful of candidates, each with a
	 * label to show and coordinates to store.
	 */
	public function DoSearchPlaces() : array
	{
		$oAccount = $this->Manager()->Actions()->getAccountFromToken();
		if (!$oAccount) {
			return $this->jsonResponse(__FUNCTION__, ['places' => [], 'error' => 'Not logged in']);
		}

		$sBase = $this->geocoderUrl();
		if (!\strlen($sBase)) {
			return $this->jsonResponse(__FUNCTION__, ['places' => [],
				'error' => 'No geocoder is configured for this installation.']);
		}

		$sQuery = \trim((string) $this->jsonParam('Query', ''));
		if (2 > \strlen($sQuery)) {
			return $this->jsonResponse(__FUNCTION__, ['places' => []]);
		}

		$sLanguages = $this->requestLanguages();
		$aPlaces = $this->queryGeocoder($sBase, $sQuery, $sLanguages);

		// A local geocoder is usually a country extract, so a meeting abroad
		// finds nothing at all - searching Paris against a Tunisia import
		// returns a street in Fouchana, or nothing. Falling back keeps the
		// common case local and fast while still answering the rare one.
		$bFellBack = false;
		$sFallback = $this->geocoderFallbackUrl();
		if (!$aPlaces && \strlen($sFallback) && 0 !== \strcasecmp($sFallback, $sBase)) {
			$aFallbackPlaces = $this->queryGeocoder($sFallback, $sQuery, $sLanguages);
			if ($aFallbackPlaces) {
				$aPlaces = $aFallbackPlaces;
				$bFellBack = true;
			} elseif (null === $aPlaces && null !== $aFallbackPlaces) {
				$aPlaces = $aFallbackPlaces;   // primary broke, fallback merely empty
			}
		}

		if (null === $aPlaces) {
			return $this->jsonResponse(__FUNCTION__, ['places' => [],
				'error' => 'The geocoder did not answer.']);
		}

		return $this->jsonResponse(__FUNCTION__, ['places' => $aPlaces, 'fallback' => $bFellBack]);
	}

	/**
	 * One geocoder, one query. Returns the candidates, or null when the
	 * geocoder could not be reached or made no sense - which the caller has to
	 * tell apart from an honest "no such place".
	 */
	private function queryGeocoder(string $sBase, string $sQuery, string $sLanguages) : ?array
	{
		$sUrl = $sBase . '/search?format=jsonv2&addressdetails=0&limit=8&q=' . \rawurlencode($sQuery);
		if (\strlen($sLanguages)) {
			$sUrl .= '&accept-language=' . \rawurlencode($sLanguages);
		}

		$oCurl = \curl_init($sUrl);
		\curl_setopt($oCurl, CURLOPT_RETURNTRANSFER, true);
		\curl_setopt($oCurl, CURLOPT_SSL_VERIFYPEER, true);
		\curl_setopt($oCurl, CURLOPT_TIMEOUT, 10);
		\curl_setopt($oCurl, CURLOPT_FOLLOWLOCATION, false);
		// Nominatim's policy requires an identifying User-Agent and will hand
		// out 403s without one. A browser cannot set this header itself, which
		// is the other half of why the call is made here.
		\curl_setopt($oCurl, CURLOPT_USERAGENT,
			'SnappyMail-CalDAV-Plugin/' . self::VERSION . ' (calendar location picker)');
		\curl_setopt($oCurl, CURLOPT_HTTPHEADER, ['Accept: application/json']);
		$sBody = \curl_exec($oCurl);
		$iCode = (int) \curl_getinfo($oCurl, CURLINFO_HTTP_CODE);
		\curl_close($oCurl);

		if (200 !== $iCode || !\is_string($sBody)) {
			\SnappyMail\Log::notice('CalDAV', 'geocoder ' . $sBase . ' answered HTTP ' . $iCode);
			return null;
		}

		$aRaw = \json_decode($sBody, true);
		if (!\is_array($aRaw)) {
			\SnappyMail\Log::notice('CalDAV', 'geocoder ' . $sBase . ' returned unreadable JSON');
			return null;
		}

		$aPlaces = array();
		foreach ($aRaw as $aItem) {
			if (!\is_array($aItem) || !isset($aItem['display_name'])) {
				continue;
			}
			$aPlaces[] = array(
				'label' => (string) $aItem['display_name'],
				'lat'   => isset($aItem['lat']) ? (float) $aItem['lat'] : null,
				'lon'   => isset($aItem['lon']) ? (float) $aItem['lon'] : null
			);
		}

		return $aPlaces;
	}

	/**
	 * The languages this user reads, for the geocoder to name places in.
	 *
	 * Without it Nominatim answers in whatever the locals call the place -
	 * "شارع الحبيب بورقيبة" rather than "Avenue Habib Bourguiba" - which is
	 * correct and frequently not what the organiser typed or wants to read.
	 * The browser already states the preference, so it is passed on rather
	 * than guessed at or made another setting.
	 *
	 * It leaves this server in a request to whichever geocoder is configured,
	 * which is harmless pointed at your own and one more thing told about your
	 * users pointed at somebody else's - so it is off until an admin turns it
	 * on. When on, only the shape RFC 9110 5.3.5 describes is forwarded, and
	 * only the first 200 bytes of it.
	 */
	private function requestLanguages() : string
	{
		if (!$this->Config()->Get('plugin', 'geocoder_send_language', false)) {
			return '';
		}
		$sLanguages = \trim(\substr((string) ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''), 0, 200));
		return \preg_match('#^[A-Za-z0-9,;=.*\-\x20]+$#', $sLanguages) ? $sLanguages : '';
	}

	/**
	 * "lat;lon" as iCalendar wants it in GEO, or '' if it is not a coordinate.
	 */
	private function sanitizeGeo(string $sGeo) : string
	{
		if (!\preg_match('#^(-?\d{1,3}(?:\.\d+)?)[;,](-?\d{1,3}(?:\.\d+)?)$#', \trim($sGeo), $aMatch)) {
			return '';
		}
		$fLat = (float) $aMatch[1];
		$fLon = (float) $aMatch[2];
		if (-90 > $fLat || 90 < $fLat || -180 > $fLon || 180 < $fLon) {
			return '';
		}
		return $aMatch[1] . ';' . $aMatch[2];
	}

	/**
	 * The dialog's repeat fields as an RRULE value, or '' for a one-off.
	 *
	 * The rule is assembled here from named fields rather than accepted as a
	 * ready-made string: an RRULE is written straight into the ICS body, so a
	 * client-supplied one would be a line to inject arbitrary properties on.
	 * Everything below is either a fixed keyword or a bounded integer.
	 *
	 * BYDAY is not derived from the picked weekdays here because DTSTART is
	 * stored in UTC - see repeatDaysForServer() in calendar.js, which does the
	 * translation while it still knows the organiser's timezone.
	 */
	private function buildRecurrenceRule(bool $bAllDay) : string
	{
		$sFreq = \strtoupper(\trim((string) $this->jsonParam('Repeat', '')));
		if (!\in_array($sFreq, array('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'), true)) {
			return '';
		}
		$aParts = array('FREQ=' . $sFreq);

		$iInterval = (int) $this->jsonParam('RepeatInterval', 1);
		if (1 < $iInterval) {
			$aParts[] = 'INTERVAL=' . \min($iInterval, 365);
		}

		if ('WEEKLY' === $sFreq) {
			$aDays = array();
			foreach (\preg_split('/[,\s]+/', (string) $this->jsonParam('RepeatDays', '')) as $sDay) {
				$sDay = \strtoupper(\trim($sDay));
				if (\in_array($sDay, self::RRULE_DAYS, true) && !\in_array($sDay, $aDays, true)) {
					$aDays[] = $sDay;
				}
			}
			if ($aDays) {
				$aParts[] = 'BYDAY=' . \implode(',', $aDays);
			}
		}

		$sEnd = \strtolower(\trim((string) $this->jsonParam('RepeatEnd', '')));
		if ('count' === $sEnd) {
			$iCount = (int) $this->jsonParam('RepeatCount', 0);
			if (0 < $iCount) {
				$aParts[] = 'COUNT=' . \min($iCount, 1000);
			}
		} elseif ('until' === $sEnd) {
			$sUntil = \trim((string) $this->jsonParam('RepeatUntil', ''));
			if (\preg_match('/^\d{4}-\d{2}-\d{2}$/', $sUntil)) {
				// RFC 5545 3.3.10: UNTIL has to match DTSTART's value type, and
				// a UTC DTSTART needs a UTC UNTIL. A whole-day series ends on
				// the day itself; a timed one runs to the end of it, so the
				// last day is included either way.
				$sUntil = \str_replace('-', '', $sUntil);
				$aParts[] = 'UNTIL=' . ($bAllDay ? $sUntil : $sUntil . 'T235959Z');
			}
		}

		return \implode(';', $aParts);
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
			\RainLoop\Plugins\Property::NewInstance('jitsi_url')
				->SetLabel('Video meeting server URL')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::STRING)
				->SetDescription('Base URL of a Jitsi Meet (or compatible) server, e.g.'
					. ' https://meet.jit.si or https://meet.example.com. The event dialog'
					. ' then offers a video-call field with a button that mints a random,'
					. ' unguessable room under this URL. Leave empty to hide that button;'
					. ' an organiser can still paste a link from any other tool by hand.')
				->SetDefaultValue(''),
			\RainLoop\Plugins\Property::NewInstance('geocoder_url')
				->SetLabel('Geocoder URL (location picker)')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::STRING)
				->SetDescription('Base URL of a Nominatim-compatible geocoder, e.g.'
					. ' https://nominatim.openstreetmap.org. Enables the globe button beside'
					. ' the location field, which searches for a place and fills in its address'
					. ' and coordinates. Lookups are made by this server, not the browser.'
					. ' Before pointing this at the public OpenStreetMap instance, read its'
					. ' usage policy - a busy installation should run its own. Leave empty to'
					. ' hide the button; the location field stays free text either way.')
				->SetDefaultValue(''),
			\RainLoop\Plugins\Property::NewInstance('geocoder_fallback_url')
				->SetLabel('Geocoder fallback URL')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::STRING)
				->SetPlaceholder('https://nominatim.openstreetmap.org')
				->SetDescription('Consulted only when the geocoder above finds nothing.'
					. ' A self-hosted geocoder is usually'
					. ' a single-country extract, so a meeting abroad finds nothing at all;'
					. ' this keeps the common case local while still answering the rare one.'
					. ' Leave empty for no fallback. Off unless filled in: a fallback sends'
					. ' searches your own geocoder could not answer to somebody else\'s'
					. ' server, which is a decision for whoever runs this installation.')
				->SetDefaultValue(''),
			\RainLoop\Plugins\Property::NewInstance('geocoder_send_language')
				->SetLabel('Tell the geocoder which language to answer in')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::BOOL)
				->SetDescription('Off (default): the geocoder answers in whatever the locals'
					. ' call a place, so an organiser searching Avenue Habib Bourguiba gets'
					. ' back شارع الحبيب بورقيبة.'
					. ' On: the browser\'s Accept-Language is passed through, and places are'
					. ' named in a language the user reads where OpenStreetMap has one.'
					. ' It is off by default because that header goes out to whichever'
					. ' geocoder is configured - harmless pointed at your own, one more'
					. ' thing told about your users when pointed at somebody else\'s.')
				->SetDefaultValue(false),
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
	 * Ask the server which resource a UID actually lives at.
	 *
	 * Only events this plugin created sit at <UID>.ics. Thunderbird, Evolution
	 * and Cyrus' own importer name the resource however they like, so guessing
	 * that path 404s - and a PUT to the guessed path then forks the event into
	 * a second, stripped-down copy instead of editing the real one. RFC 4791
	 * 7.8.6 has the server hand us the href instead of us inventing it.
	 *
	 * Returns null when the UID is not in the collection, or when the server
	 * will not answer the query - callers decide what to do with that.
	 */
	private function resolveEventHref(array $aConfig, string $sPassword, string $sUid) : ?string
	{
		if (!\strlen($sUid)) {
			return null;
		}

		$sCollectionUrl = \rtrim($aConfig['CalDAVUrl'], '/') . '/'
			. ($aConfig['Collection'] ?? 'Default') . '/';

		$sBody = '<?xml version="1.0" encoding="utf-8" ?>' . "\n"
			. '<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">'
			. '<D:prop><D:getetag /></D:prop>'
			. '<C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">'
			. '<C:prop-filter name="UID">'
			. '<C:text-match collation="i;octet">'
			. \htmlspecialchars($sUid, ENT_XML1 | ENT_QUOTES, 'UTF-8')
			. '</C:text-match></C:prop-filter>'
			. '</C:comp-filter></C:comp-filter></C:filter></C:calendar-query>';

		$aResult = $this->makeCalDAVRequest($sCollectionUrl, 'REPORT', $aConfig['User'], $sPassword,
			$sBody, ['Content-Type: application/xml; charset=utf-8', 'Depth: 1']);
		if (207 !== (int) $aResult['code']) {
			return null;
		}

		try {
			$oDoc = new \DOMDocument();
			if (!$oDoc->loadXML((string) $aResult['body'])) {
				return null;
			}
			$oXPath = new \DOMXPath($oDoc);
			$oXPath->registerNamespace('D', 'DAV:');
			foreach ($oXPath->query('//D:response/D:href') as $oHref) {
				$sHref = \trim((string) $oHref->nodeValue);
				// Some servers echo the collection itself in the multistatus.
				// That is not the event, and PUTting over it would be a mess.
				if (\strlen($sHref) && '/' !== \substr($sHref, -1)) {
					return $this->absoluteDavUrl($aConfig['CalDAVUrl'], $sHref);
				}
			}
		} catch (\Throwable $oException) {
			\SnappyMail\Log::notice('CalDAV', 'href lookup failed: ' . $oException->getMessage());
		}

		return null;
	}

	/**
	 * A DAV href is usually a path, occasionally a full URL. Either way it has
	 * to end up absolute against the server we are already talking to. The
	 * server percent-encodes it for us, so it is passed through untouched.
	 */
	private function absoluteDavUrl(string $sBaseUrl, string $sHref) : string
	{
		if (\preg_match('#^https?://#i', $sHref)) {
			return $sHref;
		}

		$aBase = \parse_url($sBaseUrl);
		if (empty($aBase['scheme']) || empty($aBase['host'])) {
			return $sHref;
		}

		return $aBase['scheme'] . '://' . $aBase['host']
			. (isset($aBase['port']) ? ':' . $aBase['port'] : '')
			. '/' . \ltrim($sHref, '/');
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
	/**
	 * The video call attached to an event, if any: the first CONFERENCE that
	 * is actually a usable link.
	 */
	private function conferenceUri($oEvent) : string
	{
		if (isset($oEvent->CONFERENCE)) {
			foreach ($oEvent->CONFERENCE as $oConference) {
				$sUrl = $this->sanitizeConferenceUrl((string) $oConference);
				if (\strlen($sUrl)) {
					return $sUrl;
				}
			}
		}
		return '';
	}

	private function parseICalendarVObject($icalData, string $sSelf = '')
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
			// The rule itself is worth keeping hold of: expand() hands back
			// plain instances with no RRULE on them, so without this the dialog
			// could never show - let alone edit - how an event repeats.
			$bRecurring = false;
			$aRules = array();
			foreach ($oVCal->VEVENT as $oEvent) {
				if (isset($oEvent->RRULE) || isset($oEvent->RDATE)) {
					$bRecurring = true;
					if (isset($oEvent->RRULE) && !isset($oEvent->{'RECURRENCE-ID'})) {
						$aRules[(string) ($oEvent->UID ?? '')] = (string) $oEvent->RRULE;
					}
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

				// Where the call is, and where the room is. Clients that have
				// only one field for both put the link in LOCATION, so that is
				// read as a conference rather than shown as a place to walk to.
				$sConference = $this->conferenceUri($oEvent);
				$sLocation = \trim((string) ($oEvent->LOCATION ?? ''));
				if (!\strlen($sConference) && \preg_match('#^https?://\S+$#i', $sLocation)) {
					$sConference = $sLocation;
				}
				if (\strlen($sConference) && 0 === \strcasecmp($sLocation, $sConference)) {
					$sLocation = '';
				}

				// Which occurrence of the series this is. expand() puts a
				// RECURRENCE-ID on every instance, and keeps the original one
				// on an occurrence that was moved - so this stays the date the
				// series says it is, not the date it was dragged to, which is
				// what an edit or an exclusion has to name.
				$sRecurrenceId = '';
				if (isset($oEvent->{'RECURRENCE-ID'})) {
					$sRecurrenceId = $oEvent->{'RECURRENCE-ID'}->getDateTime()->format($sFmt);
				}

				$sUid = (string) ($oEvent->UID ?? '');
				$aResult[] = [
					'uid'         => $sUid,
					'rrule'       => $aRules[$sUid] ?? '',
					'recurrenceId' => $sRecurrenceId,
					'summary'     => (string) ($oEvent->SUMMARY ?? 'Untitled'),
					'dtstart'     => $oDtStart->getDateTime()->format($sFmt),
					'dtend'       => $oEndDt->format($sFmt),
					'description' => (string) ($oEvent->DESCRIPTION ?? ''),
					'location'    => $sLocation,
					'conference'  => $sConference,
					'geo'         => $this->sanitizeGeo((string) ($oEvent->GEO ?? '')),
					'allDay'      => $bAllDay,
					'attendees'   => $this->listAttendees($oEvent),
					'organizer'   => $this->organizerLabel($oEvent),
					'isOrganizer' => $this->isOrganizer($oEvent, $sSelf),
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
	private function parseICalendar($icalData, string $sSelf = '')
	{
		// SnappyMail bundles Sabre VObject 4.5.2; use it in preference to the
		// hand-rolled reader below. It unfolds continuation lines (65 of the
		// 109 stored events use them), resolves VTIMEZONE, and expands RRULE.
		// Without expansion a yearly event created in 2022 is only ever
		// returned for 2022, which is why most of the calendar looked empty.
		$aEvents = $this->parseICalendarVObject($icalData, $sSelf);
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
					'conference' => $this->sanitizeConferenceUrl($currentEvent['conference'] ?? ''),
					'allDay' => !isset($currentEvent['dtstart']) || strpos($currentEvent['dtstart'], 'T') === false,
					'organizer' => \preg_replace('#^mailto:#i', '', $currentEvent['organizer'] ?? ''),
					'isOrganizer' => \strlen($sSelf) && 0 === \strcasecmp(
						\preg_replace('#^mailto:#i', '', $currentEvent['organizer'] ?? ''), $sSelf)
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
				$aEvents = $this->parseCalDAVResponse($result['body'], $oAccount->Email());
			} else {
			}
			
			return $this->jsonResponse(__FUNCTION__, [
				'events' => $aEvents,
				// Whether the dialog should offer to mint a room, and to look a
				// place up, at all.
				'conferenceEnabled' => \strlen($this->conferenceBaseUrl()) > 0,
				'placesEnabled' => \strlen($this->geocoderUrl()) > 0,
				'message' => 'Loaded ' . count($aEvents) . ' events'
			]);
			
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

			// One VEVENT for the whole series: the times above are the first
			// occurrence and the rule below generates the rest, which is what
			// every other client expects to find.
			$sRRule = $this->buildRecurrenceRule((bool) $bAllDay);
			if (\strlen($sRRule)) {
				$sICS .= "RRULE:" . $sRRule . "\r\n";
			}

			$sICS .= "SUMMARY:" . $this->escapeICS($sTitle) . "\r\n";
			
			if (!empty($sDescription)) {
				$sICS .= $this->foldICSLine("DESCRIPTION:" . $this->escapeICS($sDescription)) . "\r\n";
			}

			// A meeting can be in a room, in a call, or both. The physical place
			// stays in LOCATION; the call goes in CONFERENCE, where a client
			// knows to offer it as a Join button rather than as an address.
			$sConference = $this->sanitizeConferenceUrl((string) $this->jsonParam('Conference', ''));
			if (!empty($sLocation)) {
				$sICS .= $this->foldICSLine("LOCATION:" . $this->escapeICS($sLocation)) . "\r\n";
			} elseif (\strlen($sConference)) {
				// Online-only: plenty of clients still show nothing but LOCATION,
				// so the link goes there too rather than being invisible to them.
				// parseICalendarVObject() folds it back out again on the way in.
				$sICS .= $this->foldICSLine("LOCATION:" . $this->escapeICS($sConference)) . "\r\n";
			}
			if (\strlen($sConference)) {
				$sICS .= $this->foldICSLine('CONFERENCE;VALUE=URI;FEATURE=VIDEO,AUDIO;'
					. 'LABEL="Video call":' . $sConference) . "\r\n";
			}

			// Coordinates from the place picker, so every other client can put
			// the meeting on a map without re-guessing the address.
			$sGeo = $this->sanitizeGeo((string) $this->jsonParam('Geo', ''));
			if (\strlen($sGeo)) {
				$sICS .= "GEO:" . $sGeo . "\r\n";
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
			
			// Ask the server where the event lives instead of assuming
			// <UID>.ics, which only holds for events this plugin created.
			$sEventUrl = $this->resolveEventHref($aConfig, $sPassword, $sEventId);
			if (null === $sEventUrl) {
				// The lookup may simply be unsupported, so still try the name we
				// would have given it ourselves before giving up.
				$sEventUrl = \rtrim($aConfig['CalDAVUrl'], '/') . '/'
					. ($aConfig['Collection'] ?? 'Default') . '/' . \rawurlencode($sEventId) . '.ics';
			}

			// Edit the stored event rather than replacing it. Rebuilding the
			// object from the handful of fields the dialog knows about silently
			// dropped everything else it carried - description, location,
			// VALARM, ORGANIZER and ATTENDEE, and any RRULE - so dragging a
			// recurring event in the grid flattened it to a single occurrence.
			$sICS = null;
			$sTailIcs = null;
			$sTailUid = null;
			$aFetch = $this->makeCalDAVRequest($sEventUrl, 'GET', $aConfig['User'], $sPassword);
			if (200 === (int) $aFetch['code'] && \strlen((string) $aFetch['body'])) {
				$sICS = $this->applyEventEdit(
					(string) $aFetch['body'], $oAccount, $sTitle, $sStartFormatted,
					$sEndFormatted, $bAllDay, $sTailIcs, $sTailUid
				);
			}
			if (null === $sICS) {
				// Nothing readable to edit. Writing a fresh object here is what
				// used to fork the event into a second, stripped-down copy, so
				// refuse instead: an edit that cannot find its event has failed,
				// and the untouched original is still on the server.
				return $this->jsonResponse(__FUNCTION__, ['success' => false,
					'error' => 'Could not read this event from the server, so it was left unchanged.']);
			}

			// "This and all following" splits the series, so what comes after
			// the cut is a second resource. Write it first: if that fails the
			// stored series is still whole and nothing has been lost. If
			// truncating the original then fails, take it away again rather
			// than leave the same occurrences standing in two places.
			$sTailUrl = '';
			if (\strlen((string) $sTailIcs) && \strlen((string) $sTailUid)) {
				$sTailUrl = \rtrim($aConfig['CalDAVUrl'], '/') . '/'
					. ($aConfig['Collection'] ?? 'Default') . '/' . \rawurlencode($sTailUid) . '.ics';
				$aTail = $this->makeCalDAVRequest($sTailUrl, 'PUT', $aConfig['User'], $sPassword,
					$sTailIcs, ['Content-Type: text/calendar; charset=utf-8']);
				if (!\in_array((int) $aTail['code'], array(200, 201, 204), true)) {
					return $this->jsonResponse(__FUNCTION__, ['success' => false,
						'error' => 'Could not store the rest of the series (' . $aTail['code']
							. '), so the event was left unchanged.']);
				}
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
				if (\strlen($sTailUrl)) {
					$this->makeCalDAVRequest($sTailUrl, 'DELETE', $aConfig['User'], $sPassword);
				}
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'CalDAV error: ' . $result['code']]);
			}
			
		} catch (\Exception $e) {
			return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => $e->getMessage()]);
		}
	}
	
	/**
	 * Cancel a meeting: tell the guests it is off, then remove it.
	 *
	 * Deleting the resource alone already makes an RFC 6638 server send a
	 * CANCEL, but it says nothing about *what* was cancelled. RFC 5546 has the
	 * organiser publish STATUS:CANCELLED with a raised SEQUENCE first, so the
	 * guest's client can match the cancellation to the invitation it already
	 * holds and supersede it, instead of deciding for itself what a vanished
	 * event means.
	 *
	 * So: PUT the cancelled form - which is what the server turns into the
	 * CANCEL it mails - and only then DELETE, so the organiser is not left
	 * with a cancelled ghost in their own calendar.
	 *
	 * Only the organiser may do this. A guest wanting out is declining, not
	 * cancelling, and saying otherwise would misinform everyone else invited.
	 */
	public function DoCancelCalendarEvent() : array
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

			$oMainAccount = $this->Manager()->Actions()->GetMainAccountFromToken();
			if (!$oMainAccount || !\method_exists($oMainAccount, 'CryptKey')) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Cannot access encryption key']);
			}
			$sCryptKey = $oMainAccount->CryptKey();
			$sPassword = \SnappyMail\Crypt::DecryptFromJSON($aConfig['Password'], $sCryptKey);
			if (\is_object($sPassword) && \method_exists($sPassword, '__toString')) {
				$sPassword = (string) $sPassword;
			}

			$sEventUrl = $this->resolveEventHref($aConfig, $sPassword, $sEventId)
				?: \rtrim($aConfig['CalDAVUrl'], '/') . '/' . ($aConfig['Collection'] ?? 'Default')
					. '/' . \rawurlencode($sEventId) . '.ics';

			$aFetch = $this->makeCalDAVRequest($sEventUrl, 'GET', $aConfig['User'], $sPassword);
			if (200 !== (int) $aFetch['code'] || !\strlen((string) $aFetch['body'])) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Event not found on the server']);
			}

			$oVCal = \Sabre\VObject\Reader::read($aFetch['body'], \Sabre\VObject\Reader::OPTION_FORGIVING);
			if (!isset($oVCal->VEVENT)) {
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'error' => 'Not an event']);
			}

			// Why it is off. Guests get told the meeting is cancelled either
			// way; without this they are not told why.
			$sReason = \trim((string) $this->jsonParam('Reason', ''));
			if (1000 < \strlen($sReason)) {
				$sReason = \substr($sReason, 0, 1000);
			}

			$sSelf = $oAccount->Email();
			$bGuests = false;
			foreach ($oVCal->VEVENT as $oEvent) {
				if (!$this->isOrganizer($oEvent, $sSelf)) {
					return $this->jsonResponse(__FUNCTION__, ['success' => false,
						'error' => 'Only the organiser can cancel this meeting. Delete it to remove it from your own calendar.']);
				}
				if (isset($oEvent->ATTENDEE)) {
					$bGuests = true;
				}

				$oEvent->STATUS = 'CANCELLED';

				if (\strlen($sReason)) {
					// COMMENT is what RFC 5546 reserves for exactly this, and
					// is what a conforming client reads off a CANCEL. Plenty of
					// clients only ever render DESCRIPTION though, so the
					// reason goes there too rather than being technically
					// correct and invisible.
					$oEvent->remove('COMMENT');
					$oEvent->add('COMMENT', $sReason);
					$sOldDescription = \trim((string) ($oEvent->DESCRIPTION ?? ''));
					$oEvent->DESCRIPTION = \strlen($sOldDescription)
						? 'Cancelled: ' . $sReason . "\n\n" . $sOldDescription
						: 'Cancelled: ' . $sReason;
				}
				// A cancellation that does not outrank the invitation the guest
				// already holds may legitimately be ignored by their client.
				$iSequence = isset($oEvent->SEQUENCE) ? (int) $oEvent->SEQUENCE->getValue() : 0;
				$oEvent->SEQUENCE = $iSequence + 1;
				$oEvent->DTSTAMP = new \DateTime('now', new \DateTimeZone('UTC'));
			}

			// Publishing the cancelled form is what the server turns into the
			// CANCEL mail. A server without scheduling merely stores it, and
			// the DELETE below still cleans up, so this is safe either way.
			$aPut = $this->makeCalDAVRequest($sEventUrl, 'PUT', $aConfig['User'], $sPassword,
				$oVCal->serialize(), ['Content-Type: text/calendar; charset=utf-8']);
			$bNotified = \in_array((int) $aPut['code'], [200, 201, 204], true);

			$aDel = $this->makeCalDAVRequest($sEventUrl, 'DELETE', $aConfig['User'], $sPassword);
			if (!\in_array((int) $aDel['code'], [200, 204, 404], true)) {
				// The guests have already been told, so say so: a blind retry
				// would notify them a second time.
				return $this->jsonResponse(__FUNCTION__, ['success' => false, 'notified' => $bNotified,
					'error' => 'The guests were notified, but the event could not be removed (CalDAV error: ' . $aDel['code'] . ')']);
			}

			return $this->jsonResponse(__FUNCTION__, ['success' => true, 'notified' => $bNotified && $bGuests]);
		} catch (\Throwable $e) {
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
			
			// DELETE event from CalDAV server, at the resource the server says
			// holds this UID. <UID>.ics is only where *this* plugin puts them,
			// so it stays as the fallback for a server that will not answer the
			// lookup - and the URL-encoding there handles @ in the UID.
			$sEventUrl = $this->resolveEventHref($aConfig, $sPassword, $sEventId)
				?: \rtrim($aConfig['CalDAVUrl'], '/') . '/' . ($aConfig['Collection'] ?? 'Default')
					. '/' . \rawurlencode($sEventId) . '.ics';

			// Removing one occurrence of a series means editing the object, not
			// deleting it: the whole series lives in this one resource, so a
			// DELETE here would take every other occurrence with it.
			// "This and all following" is the same kind of edit: the series
			// is ended just before that occurrence rather than removed.
			$sScope = \strtolower((string) $this->jsonParam('Scope', 'series'));
			$sRecurrenceId = \trim((string) $this->jsonParam('RecurrenceId', ''));
			if (\strlen($sRecurrenceId) && ('occurrence' === $sScope || 'following' === $sScope)) {
				$aFetch = $this->makeCalDAVRequest($sEventUrl, 'GET', $aConfig['User'], $sPassword);
				$sBody = (200 === (int) $aFetch['code']) ? (string) $aFetch['body'] : '';
				$sICS = \strlen($sBody)
					? ('occurrence' === $sScope
						? $this->excludeOccurrence($sBody, $sRecurrenceId)
						: $this->truncateSeriesFrom($sBody, $sRecurrenceId))
					: null;
				if (null === $sICS) {
					// Falling back to a whole-resource DELETE here would answer
					// "remove one day" by removing the lot.
					return $this->jsonResponse(__FUNCTION__, ['success' => false,
						'error' => 'Could not read this series from the server, so nothing was removed.']);
				}

				// An empty result means the cut lands on the first occurrence,
				// so there is no series left to keep - the DELETE below is what
				// "everything from here on" actually means in that case.
				if (\strlen($sICS)) {
					$result = $this->makeCalDAVRequest($sEventUrl, 'PUT', $aConfig['User'], $sPassword,
						$sICS, ['Content-Type: text/calendar; charset=utf-8']);
					return $this->jsonResponse(__FUNCTION__,
						(201 === $result['code'] || 204 === $result['code'] || 200 === $result['code'])
							? ['success' => true]
							: ['success' => false, 'error' => 'CalDAV error: ' . $result['code']]);
				}
			}

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
	private function parseCalDAVResponse($xml, string $sSelf = '')
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
					$parsedEvents = $this->parseICalendar($icalData, $sSelf);
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
