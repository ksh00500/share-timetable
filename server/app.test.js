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

test('trusted team members can select an existing person and update weekly slots', async (t) => {
  const app = await setup();
  t.after(() => app.close());
  const admin = { 'x-admin-key': 'a-long-test-password-123' };
  await app.inject({ method: 'POST', url: '/api/admin/rooms', headers: admin, payload: { key: 'dev-team', title: '개발 회의' } });
  const memberA = (await app.inject({ method: 'POST', url: '/api/rooms/dev-team/join', payload: { name: '시호' } })).json();
  const memberB = (await app.inject({ method: 'POST', url: '/api/rooms/dev-team/join', payload: { name: '유진' } })).json();
  assert.ok(memberA.memberId && memberB.memberId);
  assert.ok(!('editToken' in memberA));

  const weekStart = '2026-11-02';
  const payload = { memberId: memberA.memberId, weekStart, slots: [{ date: '2026-11-03', slotIndex: 18 }] };
  const saved = await app.inject({ method: 'PUT', url: '/api/rooms/dev-team/availability', payload });
  assert.equal(saved.statusCode, 200);
  const week = (await app.inject({ method: 'GET', url: '/api/rooms/dev-team?week=2026-11-02' })).json();
  assert.deepEqual(week.members.map(m => m.name), ['시호', '유진']);
  assert.deepEqual(week.slots, [{ memberId: memberA.memberId, date: '2026-11-03', slotIndex: 18 }]);

  // No private recovery token needed. Clicking a participant selects their memberId.
  const switched = await app.inject({
    method: 'PUT', url: '/api/rooms/dev-team/availability',
    payload: { memberId: memberB.memberId, weekStart, slots: [{ date: '2026-11-03', slotIndex: 18 }] }
  });
  assert.equal(switched.statusCode, 200);
  const both = (await app.inject({ method: 'GET', url: '/api/rooms/dev-team?week=2026-11-02' })).json();
  assert.equal(both.slots.length, 2);

  const unknownMember = await app.inject({
    method: 'PUT', url: '/api/rooms/dev-team/availability',
    payload: { memberId: 'not-a-member', weekStart, slots: [] }
  });
  assert.equal(unknownMember.statusCode, 404);

  const invalid = await app.inject({
    method: 'PUT', url: '/api/rooms/dev-team/availability',
    payload: { ...payload, slots: [{ date: '2026-11-09', slotIndex: 5 }] }
  });
  assert.equal(invalid.statusCode, 400);
  const afterInvalid = (await app.inject({ method: 'GET', url: '/api/rooms/dev-team?week=2026-11-02' })).json();
  assert.equal(afterInvalid.slots.length, 2);

  const cleared = await app.inject({
    method: 'PUT', url: '/api/rooms/dev-team/availability',
    payload: { memberId: memberA.memberId, weekStart, slots: [] }
  });
  assert.equal(cleared.statusCode, 200);
  const afterClear = (await app.inject({ method: 'GET', url: '/api/rooms/dev-team?week=2026-11-02' })).json();
  assert.deepEqual(afterClear.slots, [{ memberId: memberB.memberId, date: '2026-11-03', slotIndex: 18 }]);
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
  const blockedUpdate = await app.inject({ method: 'PUT', url: '/api/rooms/locked-room/availability', payload: { memberId: joined.memberId, weekStart: '2026-11-02', slots: [] } });
  assert.equal(blockedUpdate.statusCode, 423);
  const deleted = await app.inject({ method: 'DELETE', url: '/api/admin/rooms/locked-room/members/' + joined.memberId, headers });
  assert.equal(deleted.statusCode, 200);
});
