import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { createStore } from './store.js';

async function setup() {
  return createApp({ store: createStore(':memory:'), adminPassword: 'a-long-test-password-123', staticDir: '/nonexistent/build' });
}

test('admin required and room creation validates key', async (t) => {
  const app = await setup();
  t.after(() => app.close());
  const unauthorized = await app.inject({ method: 'GET', url: '/api/admin/rooms' });
  assert.equal(unauthorized.statusCode, 401);
  const headers = { 'x-admin-key': 'a-long-test-password-123' };
  const invalid = await app.inject({ method: 'POST', url: '/api/admin/rooms', headers, payload: { key: 'admin', title: '팀 회의' } });
  assert.equal(invalid.statusCode, 400);
  const created = await app.inject({ method: 'POST', url: '/api/admin/rooms', headers, payload: { key: 'my-team', title: '팀 회의' } });
  assert.equal(created.statusCode, 201);
  const authorizedList = await app.inject({ method: 'GET', url: '/api/admin/rooms', headers });
  assert.equal(authorizedList.statusCode, 200);
  assert.equal(authorizedList.json().rooms[0].key, 'my-team');
  const duplicate = await app.inject({ method: 'POST', url: '/api/admin/rooms', headers, payload: { key: 'my-team', title: '팀 회의' } });
  assert.equal(duplicate.statusCode, 409);
});

test('members may only edit their own weekly slots', async (t) => {
  const app = await setup();
  t.after(() => app.close());
  const admin = { 'x-admin-key': 'a-long-test-password-123' };
  await app.inject({ method: 'POST', url: '/api/admin/rooms', headers: admin, payload: { key: 'dev-team', title: '개발 회의' } });
  const memberA = (await app.inject({ method: 'POST', url: '/api/rooms/dev-team/join', payload: { name: '시호' } })).json();
  const memberB = (await app.inject({ method: 'POST', url: '/api/rooms/dev-team/join', payload: { name: '유진' } })).json();
  const weekStart = '2026-11-02';
  const authenticatedSession = await app.inject({
    method: 'GET',
    url: '/api/rooms/dev-team/session?memberId=' + encodeURIComponent(memberA.memberId),
    headers: { 'x-member-token': memberA.editToken }
  });
  assert.equal(authenticatedSession.statusCode, 200);
  assert.equal(authenticatedSession.json().name, '시호');
  const rejectedSession = await app.inject({
    method: 'GET',
    url: '/api/rooms/dev-team/session?memberId=' + encodeURIComponent(memberA.memberId),
    headers: { 'x-member-token': memberB.editToken }
  });
  assert.equal(rejectedSession.statusCode, 401);
  const payload = { memberId: memberA.memberId, weekStart, slots: [{ date: '2026-11-03', slotIndex: 18 }] };
  const stolen = await app.inject({ method: 'PUT', url: '/api/rooms/dev-team/availability', headers: { 'x-member-token': memberB.editToken }, payload });
  assert.equal(stolen.statusCode, 401);
  const saved = await app.inject({ method: 'PUT', url: '/api/rooms/dev-team/availability', headers: { 'x-member-token': memberA.editToken }, payload });
  assert.equal(saved.statusCode, 200);
  const week = (await app.inject({ method: 'GET', url: '/api/rooms/dev-team?week=2026-11-02' })).json();
  assert.equal(week.members.length, 2);
  assert.deepEqual(week.slots, [{ memberId: memberA.memberId, date: '2026-11-03', slotIndex: 18 }]);
  const invalid = await app.inject({ method: 'PUT', url: '/api/rooms/dev-team/availability', headers: { 'x-member-token': memberA.editToken }, payload: { ...payload, slots: [{ date: '2026-11-09', slotIndex: 5 }] } });
  assert.equal(invalid.statusCode, 400);
  const afterInvalid = (await app.inject({ method: 'GET', url: '/api/rooms/dev-team?week=2026-11-02' })).json();
  assert.equal(afterInvalid.slots.length, 1);
  const cleared = await app.inject({ method: 'PUT', url: '/api/rooms/dev-team/availability', headers: { 'x-member-token': memberA.editToken }, payload: { memberId: memberA.memberId, weekStart, slots: [] } });
  assert.equal(cleared.statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/rooms/dev-team?week=2026-11-02' })).json().slots.length, 0);
});

test('locked rooms reject mutations and admins can remove members', async (t) => {
  const app = await setup();
  t.after(() => app.close());
  const headers = { 'x-admin-key': 'a-long-test-password-123' };
  await app.inject({ method: 'POST', url: '/api/admin/rooms', headers, payload: { key: 'locked-room', title: '주간 회의' } });
  const joined = (await app.inject({ method: 'POST', url: '/api/rooms/locked-room/join', payload: { name: '수연' } })).json();
  const locked = await app.inject({ method: 'PATCH', url: '/api/admin/rooms/locked-room', headers, payload: { locked: true } });
  assert.equal(locked.statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/rooms/locked-room/join', payload: { name: '새 멤버' } })).statusCode, 423);
  const deleted = await app.inject({ method: 'DELETE', url: '/api/admin/rooms/locked-room/members/' + joined.memberId, headers });
  assert.equal(deleted.statusCode, 200);
});
