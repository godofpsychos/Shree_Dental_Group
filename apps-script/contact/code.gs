// Google Apps Script for the CONTACT sheet (Extensions > Apps Script).
//
// Saves each message sent from the website's contact form (doPost) and emails
// it to the clinic.
//
// Sheet columns (row 1 headers, spelled exactly): Name, Email, Phone, Feedback
// (add a "timestamp" column too if you want the time recorded)

var sheetName = 'Sheet1'
var scriptProp = PropertiesService.getScriptProperties()

// Where new website messages are emailed (sent from the Google account that owns
// this script). Leave empty ('') to turn the emails off.
var NOTIFY_EMAIL = 'shreedentalclinicchimur@gmail.com'

function intialSetup () {
  var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  scriptProp.setProperty('key', activeSpreadsheet.getId())
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

    // An email problem must never lose the message, so it is caught separately
    // and the website still gets "success".
    try {
      notifyClinic(e.parameter, doc.getUrl())
    } catch (err) {
      console.error('Notification email failed: ' + err)
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

// Emails the clinic a new message from the website.
function notifyClinic (p, sheetUrl) {
  if (!NOTIFY_EMAIL) return
  var fields = [
    ['Name', p.Name], ['Phone', p.Phone], ['Email', p.Email], ['Message', p.Feedback]
  ].filter(function(f) { return f[1] })

  var subject = oneLine('New website message from ' + (p.Name || 'Unknown'))
  var text = 'New message from the website contact form:\n\n' +
    fields.map(function(f) { return f[0] + ': ' + f[1] }).join('\n') +
    '\n\nContact sheet: ' + sheetUrl
  var html = '<p>New message from the website contact form:</p>' + fieldsTable(fields) +
    '<p><a href="' + sheetUrl + '">Open the contact sheet</a></p>'

  var options = { name: 'Shree Dental Website', htmlBody: html }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.Email || '')) options.replyTo = p.Email
  MailApp.sendEmail(NOTIFY_EMAIL, subject, text, options)
}

// Run from the editor to check the email arrives (also asks for email permission).
function testNotificationEmail () {
  notifyClinic({ Name: 'TEST person', Phone: '9876543210', Feedback: 'This is a test message.' },
    SpreadsheetApp.openById(scriptProp.getProperty('key')).getUrl())
  console.log('Test email sent to ' + NOTIFY_EMAIL)
}

function fieldsTable (fields) {
  return '<table cellpadding="6" style="border-collapse:collapse">' + fields.map(function(f) {
    var value = escapeHtml(f[1]).replace(/\n/g, '<br>')
    if (f[0] === 'Phone') value = '<a href="tel:' + escapeHtml(String(f[1]).replace(/[^\d+]/g, '')) + '">' + value + '</a>'
    return '<tr><td style="color:#64748b;vertical-align:top">' + f[0] + '</td><td><b>' + value + '</b></td></tr>'
  }).join('') + '</table>'
}

function escapeHtml (value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function oneLine (value) {
  return String(value).replace(/\s+/g, ' ').trim()
}
