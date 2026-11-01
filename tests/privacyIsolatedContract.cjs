const { timingSafeEqual } = require('node:crypto');

const ISOLATED_ROUTES = Object.freeze({
  preflight: '/__privacy_test/preflight',
  fixture: '/__privacy_test/fixture',
  unchanged: '/__privacy_test/unchanged',
  outcome: '/__privacy_test/outcome'
});

const createControlAuthorizer = controlSecret => (req, res, next) => {
  const value = req.headers.authorization?.replace(/^Bearer /, '') || '';
  const supplied = Buffer.from(value);
  const expected = Buffer.from(controlSecret);
  const matches = supplied.length === expected.length && timingSafeEqual(supplied, expected);
  if (!matches) { res.status(404).json({ code: 'NOT_FOUND' }); return; }
  res.set('Cache-Control', 'no-store');
  next();
};

module.exports = { ISOLATED_ROUTES, createControlAuthorizer };
