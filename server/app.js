import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createStore, validDate, mondayOf, todayInSeoul, addDays, KEY_PATTERN, safeEqual } from './store.js';

const MAX_SLOTS = 336;
const reserved = new Set(['admin', 'api', 'health', 'assets']);
const err = (reply, code, message) => reply.code(code).send({ error: message });
const validKey = (key) => typeof key === 'string' && KEY_PATTERN.test(key) && !reserved.has(key);
const normalizeName = (name) => typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
const isSqliteUnique = (error) => error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY';

export async function createApp({ store = createStore(':memory:'), adminPassword = process.env.ADMIN_PASSWORD, staticDir = resolve('dist') } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 96 * 1024 });
  app.addHook('onClose', async () => store.close());

  const adminOnly = async (request, reply) => {
    if (!adminPassword || adminPassword.length < 12) return err(reply, 503, '관리자 비밀번호를 서버 환경변수에 설정해주세요.');
    if (!safeEqual(request.headers['x-admin-key'], adminPassword)) return err(reply, 401, '관리자 비밀번호가 올바르지 않습니다.');
  };

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/admin/rooms', { preHandler: adminOnly }, async () => ({ rooms: store.rooms() }));

  app.post('/api/admin/rooms', { preHandler: adminOnly }, async (request, reply) => {
    const { key, title, description = '' } = request.body || {};
    if (!validKey(key)) return err(reply, 400, '주소 키는 3~48자의 영문 소문자, 숫자, 하이픈이어야 합니다.');
    if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 70) return err(reply, 400, '방 이름은 2~70자여야 합니다.');
    if (typeof description !== 'string' || description.length > 250) return err(reply, 400, '설명은 250자 이하로 입력해주세요.');
    try {
      const room = store.createRoom({ key, title: title.trim(), description: description.trim() });
      return reply.code(201).send({ room });
    } catch (error) {
      if (isSqliteUnique(error)) return err(reply, 409, '이미 사용 중인 주소 키입니다.');
      throw error;
    }
  });

  app.delete('/api/admin/rooms/:key', { preHandler: adminOnly }, async (request, reply) => {
    return store.deleteRoom(request.params.key) ? { ok: true } : err(reply, 404, '존재하지 않는 방입니다.');
  });
  app.patch('/api/admin/rooms/:key', { preHandler: adminOnly }, async (request, reply) => {
    if (typeof request.body?.locked !== 'boolean') return err(reply, 400, '잠금 값이 올바르지 않습니다.');
    return store.setLocked(request.params.key, request.body.locked) ? { ok: true } : err(reply, 404, '존재하지 않는 방입니다.');
  });
  app.delete('/api/admin/rooms/:key/members/:memberId', { preHandler: adminOnly }, async (request, reply) => {
    return store.deleteMember(request.params.key, request.params.memberId) ? { ok: true } : err(reply, 404, '존재하지 않는 참여자입니다.');
  });

  app.get('/api/rooms/:key', async (request, reply) => {
    const room = validKey(request.params.key) ? store.room(request.params.key) : null;
    if (!room) return err(reply, 404, '존재하지 않는 시간표입니다.');
    const weekStart = request.query?.week || mondayOf(todayInSeoul());
    if (!validDate(weekStart) || mondayOf(weekStart) !== weekStart) return err(reply, 400, 'week는 실제 날짜의 월요일(YYYY-MM-DD)이어야 합니다.');
    return { room, weekStart, members: store.members(room.key), slots: store.weekSlots(room.key, weekStart) };
  });

  app.post('/api/rooms/:key/join', async (request, reply) => {
    const room = store.room(request.params.key);
    if (!room) return err(reply, 404, '존재하지 않는 시간표입니다.');
    if (room.locked) return err(reply, 423, '관리자가 이 시간표를 잠갔습니다.');
    const name = normalizeName(request.body?.name);
    if (name.length < 1 || name.length > 24) return err(reply, 400, '이름은 1~24자로 입력해주세요.');
    try {
      return reply.code(201).send(store.createMember(room.key, name));
    } catch (error) {
      if (isSqliteUnique(error)) return err(reply, 409, '이미 등록된 이름입니다. 기존 브라우저에서 접속하거나 관리자에게 문의해주세요.');
      throw error;
    }
  });

  app.put('/api/rooms/:key/availability', async (request, reply) => {
    const room = store.room(request.params.key);
    if (!room) return err(reply, 404, '존재하지 않는 시간표입니다.');
    if (room.locked) return err(reply, 423, '관리자가 이 시간표를 잠갔습니다.');
    const { memberId, weekStart, slots } = request.body || {};
    if (typeof memberId !== 'string' || !store.verifyMember(room.key, memberId, request.headers['x-member-token'])) {
      return err(reply, 401, '본인 확인에 실패했습니다. 다시 입장해주세요.');
    }
    if (!validDate(weekStart) || mondayOf(weekStart) !== weekStart) return err(reply, 400, '시작 날짜가 올바르지 않습니다.');
    if (!Array.isArray(slots) || slots.length > MAX_SLOTS ||
      slots.some((slot) => !slot || !validDate(slot.date) || slot.date < weekStart ||
        slot.date > addDays(weekStart, 6) || !Number.isInteger(slot.slotIndex) ||
        slot.slotIndex < 0 || slot.slotIndex >= 48)) {
      return err(reply, 400, '30분 단위의 유효한 시간만 저장할 수 있습니다.');
    }
    store.saveWeek(memberId, weekStart, slots);
    return { ok: true, saved: slots.length };
  });

  if (existsSync(join(staticDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: staticDir, prefix: '/', wildcard: true });
    app.get('/', async (_request, reply) => reply.sendFile('index.html'));
    app.get('/admin', async (_request, reply) => reply.sendFile('index.html'));
    app.get('/:key', async (_request, reply) => reply.sendFile('index.html'));
  }

  app.setNotFoundHandler((request, reply) => err(reply, 404, request.url.startsWith('/api/') ? '요청한 API가 없습니다.' : '페이지를 찾을 수 없습니다.'));
  app.setErrorHandler((error, request, reply) => {
    if (error.statusCode && error.statusCode < 500) return err(reply, error.statusCode, error.message);
    request.log.error(error);
    return err(reply, 500, '요청 처리 중 문제가 발생했습니다.');
  });
  return app;
}
