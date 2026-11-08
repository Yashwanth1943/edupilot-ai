/* global fetch */
import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { authSchemas } from "../dist/controllers/auth.js";
import { clearSession, setSession, verifySessionToken } from "../dist/services/auth.js";
import { requireRole } from "../dist/middleware/auth.js";
import { requireInstitutionScope } from "../dist/middleware/auth.js";
import { csrfProtection } from "../dist/middleware/csrf.js";
import { createApp } from "../dist/app.js";

const env = { NODE_ENV: "test", PORT: 4000, MONGODB_URI: "mongodb://127.0.0.1:27017/edupilot-test", JWT_SECRET: "a".repeat(48), FRONTEND_ORIGIN: "http://localhost:3000", COOKIE_NAME: "edupilot_session" };

test("login validation requires a valid email and non-empty password", () => {
  assert.doesNotThrow(() => authSchemas.login.parse({ body: { email: "mentor@example.com", password: "secret" }, params: {}, query: {} }));
  assert.throws(() => authSchemas.login.parse({ body: { email: "invalid", password: "" }, params: {}, query: {} }));
});

test("session cookies contain verifiable signed claims and logout clears matching options", () => {
  let cookie;
  const response = { cookie: (...args) => { cookie = args; }, clearCookie: (...args) => { cookie = args; } };
  setSession(response, { sub: "507f1f77bcf86cd799439011", institutionId: "507f1f77bcf86cd799439012", role: "Mentor" }, env);
  assert.equal(cookie[0], "edupilot_session");
  assert.equal(cookie[2].httpOnly, true);
  assert.equal(cookie[2].secure, false);
  assert.deepEqual(verifySessionToken(cookie[1], env), { sub: "507f1f77bcf86cd799439011", institutionId: "507f1f77bcf86cd799439012", role: "Mentor" });
  clearSession(response, env);
  assert.equal(cookie[0], "edupilot_session");
  assert.equal(cookie[1].path, "/");
});

test("invalid and expired JWTs are rejected", () => {
  assert.throws(() => verifySessionToken("not-a-token", env));
  const expired = jwt.sign({ sub: "u", institutionId: "i", role: "Admin" }, env.JWT_SECRET, { expiresIn: -1 });
  assert.throws(() => verifySessionToken(expired, env));
});

test("role middleware permits matching roles and rejects others", () => {
  let error;
  requireRole("Admin")({ auth: { userId: "u", institutionId: "i", role: "Mentor" } }, {}, (value) => { error = value; });
  assert.equal(error.status, 403);
  error = undefined;
  let continued = false;
  requireRole("Mentor")({ auth: { userId: "u", institutionId: "i", role: "Mentor" } }, {}, (value) => { error = value; continued = !value; });
  assert.equal(error, undefined);
  assert.equal(continued, true);
});

test("institution scope middleware rejects a different tenant", () => {
  let error;
  requireInstitutionScope()({ auth: { userId: "u", institutionId: "institution-a", role: "Admin" }, params: { institutionId: "institution-b" }, body: {}, query: {} }, {}, (value) => { error = value; });
  assert.equal(error.status, 403);
});

test("CSRF middleware rejects cookie-authenticated mutations without the header", () => {
  const request = { method: "POST", path: "/api/protected", cookies: { edupilot_session: "session", edupilot_csrf: "csrf" }, get: () => undefined };
  const response = { cookie: () => undefined };
  let error;
  csrfProtection(env)(request, response, (value) => { error = value; });
  assert.equal(error.status, 403);
});

test("current-user endpoint rejects a missing authentication cookie", async () => {
  const server = createApp(env).listen(0);
  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
