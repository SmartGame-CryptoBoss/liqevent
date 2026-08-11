/**
 * LIQ EVENT lead receiver for Google Apps Script.
 *
 * Script properties (Project Settings -> Script properties):
 * - SPREADSHEET_ID (required unless the script is bound to a spreadsheet)
 * - TELEGRAM_BOT_TOKEN (optional)
 * - TELEGRAM_CHAT_ID (optional)
 * - CRM_WEBHOOK_URL (optional; receives the same JSON payload)
 *
 * Deploy as a Web app, execute as yourself, access: Anyone.
 * Put the /exec URL into config.js and set leadRequestMode to "no-cors".
 */

const SHEET_NAME = 'Leads';
const HEADERS = [
  'submitted_at', 'name', 'company', 'contact', 'type', 'guests', 'date', 'budget',
  'message', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'page_url', 'referrer', 'source'
];

function doPost(event) {
  try {
    const lead = parseLead_(event);
    if (lead.website) return json_({ ok: true });
    if (!lead.name || !lead.contact || !lead.type) throw new Error('Missing required fields');

    appendToSheet_(lead);
    sendToTelegram_(lead);
    forwardToCrm_(lead);

    return json_({ ok: true });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: String(error.message || error) });
  }
}

function parseLead_(event) {
  const type = String(event && event.postData && event.postData.type || '');
  if (type.indexOf('application/json') > -1) return JSON.parse(event.postData.contents || '{}');
  return Object.assign({}, event && event.parameter || {});
}

function appendToSheet_(lead) {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
  const spreadsheet = spreadsheetId
    ? SpreadsheetApp.openById(spreadsheetId)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Spreadsheet is not configured');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    sheet.appendRow(HEADERS.map((key) => safeCell_(lead[key])));
  } finally {
    lock.releaseLock();
  }
}

function sendToTelegram_(lead) {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = properties.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return;

  const lines = [
    '<b>Нова заявка з liqevent.com</b>',
    '',
    '<b>Ім’я:</b> ' + escapeHtml_(lead.name),
    '<b>Компанія:</b> ' + escapeHtml_(lead.company || '—'),
    '<b>Контакт:</b> ' + escapeHtml_(lead.contact),
    '<b>Формат:</b> ' + escapeHtml_(lead.type),
    '<b>Гостей:</b> ' + escapeHtml_(lead.guests || '—'),
    '<b>Дата:</b> ' + escapeHtml_(lead.date || '—'),
    '<b>Бюджет:</b> ' + escapeHtml_(lead.budget || '—'),
    '<b>Задача:</b> ' + escapeHtml_(lead.message || '—'),
    '',
    '<b>UTM:</b> ' + escapeHtml_([lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / ') || '—')
  ];

  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML' }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 400) throw new Error('Telegram delivery failed');
}

function forwardToCrm_(lead) {
  const url = PropertiesService.getScriptProperties().getProperty('CRM_WEBHOOK_URL');
  if (!url) return;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(lead),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 400) throw new Error('CRM delivery failed');
}

function safeCell_(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
