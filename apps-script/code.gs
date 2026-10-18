// Google Apps Script for the APPOINTMENT sheet (Extensions > Apps Script).
//
// 1. Saves each booking sent from the website (doPost).
// 2. Keeps Google Calendar "call these patients" reminders in sync with the sheet:
//    the day before each appointment date, at that clinic's closing time
//    (REMINDER_TIMES), one event per clinic pops up listing the name and phone
//    of everyone booked at that clinic for that date.
//    It re-syncs whenever the sheet changes - from the website, or when someone
//    adds, edits or deletes rows by hand - and once a day as a safety net.
//
// Sheet columns used (row 1 headers, any order): Date, Name, Phone, Clinic
// (add a "timestamp" column too if you want the booking time recorded)
// Optional: a "Status" column - rows containing "cancel" are left out.
// Dates can be typed as 25/10/2026 (day/month/year) or 2026-10-25.

var sheetName = 'Sheet1'
var scriptProp = PropertiesService.getScriptProperties()

// ---- Call reminder settings -------------------------------------------------
// Reminder time for each clinic on the day BEFORE the appointment (24-hour "HH:mm"),
// set to each clinic's closing time. The Clinic column only has to contain the
// name, so "Talodhi, Balapur" or "talodhi" both count as Talodhi.
var REMINDER_TIMES = {
  'Chimur': '14:00',   // Mon-Fri, 10:00 AM - 2:00 PM
  'Wadki': '17:00',    // Sat-Sun, 10:00 AM - 5:00 PM
  'Talodhi': '20:00'   // Mon-Fri, 4:00 PM - 8:00 PM
}
// For rows whose Clinic is empty or doesn't match a clinic above.
var DEFAULT_REMINDER_TIME = '20:00'
// Length of the calendar event, in minutes.
var REMINDER_MINUTES = 15
// Marks the calendar events this script manages (don't change after setup).
var REMINDER_TAG = 'shreeCallReminderFor'

function intialSetup () {
  var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  scriptProp.setProperty('key', activeSpreadsheet.getId())
}

// Run ONCE from the editor after pasting this script: it asks for Calendar
// permission, installs the triggers and creates reminders for existing bookings.
function setupReminders () {
  var ss = SpreadsheetApp.openById(scriptProp.getProperty('key'))
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction()
    if (fn === 'onSheetChange' || fn === 'dailyReminderSync') ScriptApp.deleteTrigger(t)
  })
  // Fires on manual edits, pasted rows and deleted rows (not on the script's own writes)
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss).onChange().create()
  ScriptApp.newTrigger('dailyReminderSync').timeBased().everyDays(1).atHour(6).create()
  syncReminders()
  console.log('Reminders set up. Check Google Calendar for upcoming "Call patients" events.')
}

function onSheetChange () {
  withLock(syncReminders)
}

function dailyReminderSync () {
  withLock(syncReminders)
}

function withLock (fn) {
  var lock = LockService.getScriptLock()
  if (!lock.tryLock(30000)) return
  try {
    fn()
  } finally {
    lock.releaseLock()
  }
}

function doPost (e) {
  var lock = LockService.getScriptLock()
  lock.tryLock(10000)

  try {
    var doc = SpreadsheetApp.openById(scriptProp.getProperty('key'))
    var sheet = doc.getSheetByName(sheetName)

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    var nextRow = sheet.getLastRow() + 1

    var newRow = headers.map(function(header) {
      return header === 'timestamp' ? new Date() : e.parameter[header]
    })

    sheet.getRange(nextRow, 1, 1, newRow.length).setValues([newRow])

    // A calendar problem must never lose the booking, so it is caught separately
    // and the website still gets "success".
    try {
      syncReminders()
    } catch (err) {
      console.error('Reminder sync failed: ' + err)
    }

    return ContentService
      .createTextOutput(JSON.stringify({ 'result': 'success', 'row': nextRow }))
      .setMimeType(ContentService.MimeType.JSON)
  }

  catch (e) {
    return ContentService
      .createTextOutput(JSON.stringify({ 'result': 'error', 'error': String(e) }))
      .setMimeType(ContentService.MimeType.JSON)
  }

  finally {
    lock.releaseLock()
  }
}

// Makes the calendar match the sheet for every upcoming appointment date.
function syncReminders () {
  var doc = SpreadsheetApp.openById(scriptProp.getProperty('key'))
  var sheet = doc.getSheetByName(sheetName)
  var sheetTz = doc.getSpreadsheetTimeZone()
  var values = sheet.getDataRange().getValues()

  var headers = values[0].map(function(h) { return String(h).trim().toLowerCase() })
  var cDate = headers.indexOf('date')
  var cStatus = headers.indexOf('status')
  var cClinic = headers.indexOf('clinic')
  var infoCols = ['name', 'phone'].map(function(h) { return headers.indexOf(h) })
  if (cDate < 0) return

  var now = new Date()
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Upcoming appointments in the sheet, grouped by date and clinic ("2026-10-24|Wadki")
  var byDate = {}
  for (var r = 1; r < values.length; r++) {
    var row = values[r]
    var day = parseSheetDate(row[cDate], sheetTz)
    if (!day || day <= today) continue
    if (cStatus >= 0 && /cancel/i.test(String(row[cStatus]))) continue
    var clinicCell = cClinic >= 0 ? String(row[cClinic]).trim() : ''
    var clinic = matchClinic(clinicCell)
    var info = infoCols.map(function(c) { return c >= 0 ? String(row[c]).trim() : '' })
    // Unrecognised clinic names are kept in the line so nothing is lost
    if (!clinic && clinicCell) info.push(clinicCell)
    var line = info.filter(Boolean).join(' - ')
    if (!line) continue
    var key = dateKey(day) + '|' + clinic
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(line)
  }

  // Reminder events this script created earlier, grouped the same way
  var calendar = CalendarApp.getDefaultCalendar()
  var managed = {}
  calendar.getEvents(new Date(today.getTime() - 86400000), new Date(today.getTime() + 400 * 86400000))
    .forEach(function(ev) {
      var k = ev.getTag(REMINDER_TAG)
      if (!k) return
      if (!managed[k]) managed[k] = []
      managed[k].push(ev)
    })

  var keys = Object.keys(byDate)
  Object.keys(managed).forEach(function(k) { if (keys.indexOf(k) < 0) keys.push(k) })

  keys.forEach(function(k) {
    var lines = byDate[k] || []
    var events = managed[k] || []
    var past = events.filter(function(ev) { return ev.getStartTime() <= now })
    var future = events.filter(function(ev) { return ev.getStartTime() > now })

    // Patients already shown in a reminder that has popped up don't need another one
    var notified = {}
    past.forEach(function(ev) { readLines(ev).forEach(function(l) { notified[l] = true }) })
    var pending = lines.filter(function(l) { return !notified[l] })

    // Nobody (left) to call for this date: remove reminders that haven't fired yet
    future.slice(pending.length ? 1 : 0).forEach(function(ev) { ev.deleteEvent() })
    if (!pending.length) return

    var clinic = k.split('|')[1] || ''
    var d = k.split('|')[0].split('-').map(Number)
    var appointmentDay = new Date(d[0], d[1] - 1, d[2])
    var t = (REMINDER_TIMES[clinic] || DEFAULT_REMINDER_TIME).split(':').map(Number)
    var start = new Date(d[0], d[1] - 1, d[2] - 1, t[0], t[1])
    var onTime = start > now

    var ev = future[0]
    if (!ev) {
      // Reminder time already passed (e.g. booked late for tomorrow): remind in 5 minutes
      if (!onTime) start = new Date(now.getTime() + 5 * 60000)
      ev = calendar.createEvent('Call patients', start, new Date(start.getTime() + REMINDER_MINUTES * 60000))
      ev.setTag(REMINDER_TAG, k)
      ev.removeAllReminders()
      ev.addPopupReminder(0)
    } else if (onTime && !past.length && ev.getStartTime().getTime() !== start.getTime()) {
      // Reminder time was changed (follow-up reminders keep their time)
      ev.setTime(start, new Date(start.getTime() + REMINDER_MINUTES * 60000))
    }
    fillReminder(ev, appointmentDay, clinic, pending, past.length > 0)
  })
}

// The clinic named in REMINDER_TIMES that the cell mentions, or '' if none
function matchClinic (cell) {
  var lower = cell.toLowerCase()
  var names = Object.keys(REMINDER_TIMES)
  for (var i = 0; i < names.length; i++) {
    if (lower.indexOf(names[i].toLowerCase()) >= 0) return names[i]
  }
  return ''
}

function fillReminder (ev, appointmentDay, clinic, lines, isFollowUp) {
  var tz = Session.getScriptTimeZone()
  var shortDay = Utilities.formatDate(appointmentDay, tz, 'EEE d MMM')
  var longDay = Utilities.formatDate(appointmentDay, tz, 'EEEE, d MMMM yyyy')
  var count = lines.length + (isFollowUp ? ' more' : '') + (clinic ? ' ' + clinic : '') +
    (lines.length === 1 ? ' patient' : ' patients')

  var title = '📞 Call ' + count + ' - appointments on ' + shortDay
  var description = 'Call to confirm ' + (clinic ? clinic + ' clinic ' : '') +
    'appointments on ' + longDay + ':\n\n' +
    lines.map(function(l, i) { return (i + 1) + '. ' + l }).join('\n')

  if (ev.getTitle() !== title) ev.setTitle(title)
  if (ev.getDescription() !== description) ev.setDescription(description)
}

// The patient lines listed in a reminder's description ("1. Name - Phone - Clinic")
function readLines (ev) {
  return String(ev.getDescription() || '').split('\n')
    .filter(function(l) { return /^\d+\.\s/.test(l) })
    .map(function(l) { return l.replace(/^\d+\.\s/, '').trim() })
}

// Accepts real date cells, "2026-10-25" (website) and "25/10/2026" (typed by hand)
function parseSheetDate (v, sheetTz) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    var p = Utilities.formatDate(v, sheetTz, 'yyyy-MM-dd').split('-').map(Number)
    return new Date(p[0], p[1] - 1, p[2])
  }
  var s = String(v).trim()
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return null
}

function dateKey (day) {
  return Utilities.formatDate(day, Session.getScriptTimeZone(), 'yyyy-MM-dd')
}
