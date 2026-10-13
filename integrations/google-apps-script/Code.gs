/** IbnuCreative account inventory bridge. Deploy as Me, access Anyone.
 * Set WEBSITE_SHARED_SECRET (32+ characters) and ALLOWED_SPREADSHEET_IDS
 * (comma-separated IDs) in Project Settings > Script Properties.
 */
function doGet() {
  return gasJson_({ ok: true, service: 'IbnuCreative account stock', message: 'Use authenticated POST.' });
}

function doPost(event) {
  try {
    const request = JSON.parse(event && event.postData ? event.postData.contents : '{}');
    return gasJson_({ ok: true, data: gasHandle_(request) });
  } catch (error) {
    // Never expose request data, credentials, shared secrets, or Google errors.
    return gasJson_({ ok: false, code: error.gasCode || 'REQUEST_FAILED' });
  }
}

function gasJson_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function gasFail_(code) {
  const error = new Error(code);
  error.gasCode = code;
  throw error;
}

function gasHandle_(request) {
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty('WEBSITE_SHARED_SECRET') || '';
  const allowed = (properties.getProperty('ALLOWED_SPREADSHEET_IDS') || '').split(',').map(id => id.trim()).filter(Boolean);
  if (secret.length < 32 || !allowed.length) gasFail_('CONFIG_MISSING');
  if (typeof request.secret !== 'string' || request.secret !== secret) gasFail_('UNAUTHORIZED');
  if (!allowed.includes(request.spreadsheetId)) gasFail_('SPREADSHEET_NOT_ALLOWED');
  if (!['tabs', 'rows', 'mark_sold', 'update_row'].includes(request.action)) gasFail_('INVALID_ACTION');
  let spreadsheet;
  try { spreadsheet = SpreadsheetApp.openById(request.spreadsheetId); }
  catch (error) { gasFail_('SPREADSHEET_UNAVAILABLE'); }
  if (request.action === 'tabs') {
    return { properties: { title: spreadsheet.getName() }, sheets: spreadsheet.getSheets()
      .filter(sheet => sheet.getType() === SpreadsheetApp.SheetType.GRID)
      .map(sheet => ({ properties: { sheetId: sheet.getSheetId(), title: sheet.getName(), sheetType: 'GRID' } })) };
  }
  const sheet = spreadsheet.getSheetByName(request.tab);
  if (!sheet) gasFail_('TAB_NOT_FOUND');
  if (request.action === 'rows') return { values: gasRows_(sheet) };
  if (request.action === 'update_row') return gasUpdateRow_(sheet, request);
  if (typeof request.accountId !== 'string' || typeof request.orderId !== 'string' || !request.orderId || request.orderId.length > 180 || typeof request.buyerEmail !== 'string' || !request.buyerEmail || request.buyerEmail.length > 180) gasFail_('INVALID_SALE');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) gasFail_('BUSY');
  try {
    const values = gasRows_(sheet);
    const matches = [];
    for (let index = 1; index < values.length; index++) {
      if (String(values[index][0]).trim() === request.accountId) matches.push(index);
    }
    if (matches.length !== 1) gasFail_('ACCOUNT_NOT_FOUND');
    const rowIndex = matches[0];
    const row = values[rowIndex];
    const status = String(row[3]).trim().toLowerCase();
    const oldOrder = String(row[4]).trim();
    const oldBuyer = String(row[5]).trim();
    if (['sold', 'terjual'].includes(status) && oldOrder === request.orderId && oldBuyer === request.buyerEmail) return { updated: true };
    if (!['', 'available', 'tersedia'].includes(status) || oldOrder || oldBuyer) gasFail_('SALE_CONFLICT');
    sheet.getRange(rowIndex + 1, 4, 1, 3).setNumberFormat('@').setValues([
      ['sold', gasSheetText_(request.orderId), gasSheetText_(request.buyerEmail)]
    ]);
    SpreadsheetApp.flush();
    return { updated: true };
  } finally { lock.releaseLock(); }
}

function gasUpdateRow_(sheet, request) {
  const original = request.original;
  const updated = request.updated;
  if (!Array.isArray(original) || !Array.isArray(updated) || original.length !== 6 || updated.length !== 6
    || !original.every(value => typeof value === 'string') || !updated.every(value => typeof value === 'string')
    || !updated[0].trim() || updated[0] !== original[0] || !updated[1].trim() || updated[1].length > 500
    || !updated[2] || updated[2].length > 4000 || !['available', 'disabled'].includes(updated[3])
    || updated[4] || updated[5]) gasFail_('INVALID_ROW');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) gasFail_('BUSY');
  try {
    const values = gasRows_(sheet);
    const matches = values.map((row, index) => index > 0 && row[0] === original[0] ? index : -1).filter(index => index >= 0);
    if (matches.length !== 1) gasFail_('ACCOUNT_NOT_FOUND');
    const index = matches[0];
    const current = values[index];
    if (JSON.stringify(current) !== JSON.stringify(original)) gasFail_('ROW_CHANGED');
    if (!['', 'available', 'tersedia', 'disabled', 'nonaktif'].includes(current[3].trim().toLowerCase()) || current[4] || current[5]) gasFail_('SALE_CONFLICT');
    if (values.some((row, rowIndex) => rowIndex > 0 && rowIndex !== index && row[1].trim().toLowerCase() === updated[1].trim().toLowerCase())) gasFail_('DUPLICATE_USERNAME');
    sheet.getRange(index + 1, 1, 1, 6).setNumberFormat('@').setValues([updated.map(gasSheetText_)]);
    SpreadsheetApp.flush();
    values[index] = updated;
    return { values };
  } finally { lock.releaseLock(); }
}

function gasRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 10001) gasFail_('TOO_MANY_ROWS');
  const values = sheet.getRange(1, 1, Math.max(lastRow, 1), 6).getDisplayValues();
  const expected = ['id', 'username', 'password', 'status', 'order_id', 'buyer_email'];
  if (values[0].map(value => value.trim().toLowerCase()).join('|') !== expected.join('|')) gasFail_('INVALID_HEADER');
  return values;
}

function gasSheetText_(value) {
  return /^[=+\-@']/.test(value) ? "'" + value : value;
}
