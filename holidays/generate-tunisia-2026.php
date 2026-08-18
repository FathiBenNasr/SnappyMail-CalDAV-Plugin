<?php
// Tunisian public holidays for 2026, as all-day events.
//
// The civil ones are fixed by law and certain. The religious ones follow the
// lunar calendar and are only settled by the sighting announced days before, so
// they are written here as the astronomical estimate and say so in their own
// description rather than being presented as decided.

$aFixed = array(
	array('20260101', 1, "Nouvel An", "New Year's Day", "رأس السنة الميلادية"),
	array('20260114', 1, "Fête de la Révolution et de la Jeunesse", "Revolution and Youth Day", "عيد الثورة والشباب"),
	array('20260320', 1, "Fête de l'Indépendance", "Independence Day", "عيد الاستقلال"),
	array('20260409', 1, "Journée des Martyrs", "Martyrs' Day", "عيد الشهداء"),
	array('20260501', 1, "Fête du Travail", "Labour Day", "عيد الشغل"),
	array('20260725', 1, "Fête de la République", "Republic Day", "عيد الجمهورية"),
	array('20260813', 1, "Fête de la Femme", "Women's Day", "عيد المرأة"),
	array('20261015', 1, "Fête de l'Évacuation", "Evacuation Day", "عيد الجلاء"),
);

$aLunar = array(
	array('20260320', 2, "Aïd el-Fitr", "Eid al-Fitr", "عيد الفطر", '1 Shawwal 1447'),
	array('20260527', 2, "Aïd el-Idha", "Eid al-Adha", "عيد الأضحى", '10 Dhu al-Hijja 1447'),
	array('20260616', 1, "Ras el-Am el-Hejri", "Islamic New Year", "رأس السنة الهجرية", '1 Muharram 1448'),
	array('20260825', 1, "El Mouled", "Mawlid an-Nabi", "المولد النبوي", '12 Rabi al-Awwal 1448'),
);

function esc($s) { return \str_replace(array('\\', ';', ',', "\n"), array('\\\\', '\;', '\,', '\n'), $s); }
function fold($s) {
	$out = ''; $line = '';
	foreach (\preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) as $ch) {
		if (73 < \strlen($line . $ch)) { $out .= $line . "\r\n "; $line = ''; }
		$line .= $ch;
	}
	return $out . $line;
}

$sStamp = \gmdate('Ymd\THis\Z');
$sIcs = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Mailbux//Tunisian holidays 2026//FR\r\n"
	. "CALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n"
	. "X-WR-CALNAME:Jours fériés en Tunisie 2026\r\n"
	. "X-WR-CALDESC:" . esc('Public holidays in Tunisia for 2026. Religious dates are astronomical estimates until the sighting is announced.') . "\r\n";

$iSeq = 0;
foreach (\array_merge($aFixed, $aLunar) as $aDay) {
	list($sStart, $iDays, $sFr, $sEn, $sAr) = $aDay;
	$sReckoned = $aDay[5] ?? '';
	// DTEND is exclusive on an all-day event, so a one-day holiday ends the
	// next morning. Reckoned in UTC: strtotime() would read the date in the
	// server's own zone and land a day early east of Greenwich.
	$sEnd = (new \DateTime($sStart, new \DateTimeZone('UTC')))
		->modify('+' . $iDays . ' day')->format('Ymd');

	$sBody = $sEn . ' - ' . $sAr;
	if (\strlen($sReckoned)) {
		$sBody .= "\n" . $sReckoned . '. Set by the lunar calendar: this is the astronomical'
			. ' estimate, and the date Tunisia observes is announced a day or two before, so it'
			. ' may move by a day.';
	}
	if ('20260320' === $sStart && \strlen($sReckoned)) {
		$sBody .= "\nFalls on Independence Day this year.";
	}

	$sIcs .= "BEGIN:VEVENT\r\n"
		. "UID:tn-holiday-2026-" . (++$iSeq) . "@mailbux\r\n"
		. "DTSTAMP:$sStamp\r\n"
		. "DTSTART;VALUE=DATE:$sStart\r\n"
		. "DTEND;VALUE=DATE:$sEnd\r\n"
		. fold("SUMMARY:" . esc($sFr)) . "\r\n"
		. fold("DESCRIPTION:" . esc($sBody)) . "\r\n"
		. "CATEGORIES:Jours fériés\r\n"
		. "TRANSP:TRANSPARENT\r\n"
		. "CLASS:PUBLIC\r\n"
		. "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE\r\n"
		. "END:VEVENT\r\n";
}
$sIcs .= "END:VCALENDAR\r\n";
\file_put_contents(__DIR__ . '/tunisia-2026.ics', $sIcs);
echo "written, $iSeq events\n";
