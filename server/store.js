import Database from 'better-sqlite3';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const KEY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(date, amount) {
  const parsed = new Date(date + 'T00:00:00Z');
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

export function mondayOf(date) {
  const day = new Date(date + 'T00:00:00Z').getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function todayInSeoul() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type).value;
  return part('year') + '-' + part('month') + '-' + part('day');
}

const hash = (text) => createHash('sha256').update(text).digest('hex');

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return timingSafeEqual(Buffer.from(hash(a), 'hex'), Buffer.from(hash(b), 'hex'));
}

export function createStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (filename !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL REFERENCES rooms(key) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE,
      token_hash TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      UNIQUE(room_key, name)
    );
    CREATE TABLE IF NOT EXISTS availability (
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 0 AND 47),
      PRIMARY KEY(member_id, date, slot_index)
    );
    CREATE INDEX IF NOT EXISTS availability_date_idx ON availability(date);
    CREATE INDEX IF NOT EXISTS members_room_idx ON members(room_key);
  `);

  const getRoomStmt = db.prepare('SELECT key, title, description, locked, created_at AS createdAt FROM rooms WHERE key = ?');
  const roomInfo = (room) => room ? { ...room, locked: Boolean(room.locked) } : null;
  const insertRoom = db.prepare('INSERT INTO rooms(key, title, description, created_at) VALUES (?, ?, ?, ?)');
  const insertMember = db.prepare('INSERT INTO members(id, room_key, name, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)');
  const deleteAvailability = db.prepare('DELETE FROM availability WHERE member_id = ? AND date >= ? AND date <= ?');
  const insertAvailability = db.prepare('INSERT OR IGNORE INTO availability(member_id, date, slot_index) VALUES (?, ?, ?)');

  const saveWeekTransaction = db.transaction((memberId, weekStart, slots) => {
    deleteAvailability.run(memberId, weekStart, addDays(weekStart, 6));
    for (const slot of slots) insertAvailability.run(memberId, slot.date, slot.slotIndex);
  });

  return {
    close: () => db.close(),
    room: (key) => roomInfo(getRoomStmt.get(key)),
    rooms: () => db.prepare('SELECT key, title, description, locked, created_at AS createdAt FROM rooms ORDER BY created_at DESC').all().map(roomInfo),
    createRoom: ({ key, title, description = '' }) => {
      insertRoom.run(key, title, description, new Date().toISOString());
      return roomInfo(getRoomStmt.get(key));
    },
    deleteRoom: (key) => db.prepare('DELETE FROM rooms WHERE key = ?').run(key).changes,
    setLocked: (key, locked) => db.prepare('UPDATE rooms SET locked = ? WHERE key = ?').run(locked ? 1 : 0, key).changes,
    members: (key) => db.prepare('SELECT id, name, joined_at AS joinedAt FROM members WHERE room_key = ? ORDER BY joined_at, id').all(key),
    member: (id, key) => db.prepare('SELECT id, room_key AS roomKey, name, token_hash AS tokenHash FROM members WHERE id = ? AND room_key = ?').get(id, key),
    createMember: (key, name) => {
      const memberId = randomUUID();
      const editToken = randomBytes(32).toString('hex');
      insertMember.run(memberId, key, name, hash(editToken), new Date().toISOString());
      return { memberId, editToken };
    },
    deleteMember: (key, id) => db.prepare('DELETE FROM members WHERE room_key = ? AND id = ?').run(key, id).changes,
    verifyMember: (key, id, token) => {
      const member = db.prepare('SELECT token_hash AS tokenHash FROM members WHERE id = ? AND room_key = ?').get(id, key);
      return Boolean(member && typeof token === 'string' && /^[0-9a-f]{64}$/.test(token) && safeEqual(member.tokenHash, hash(token)));
    },
    weekSlots: (key, weekStart) => db.prepare(`
      SELECT a.member_id AS memberId, a.date, a.slot_index AS slotIndex
      FROM availability a INNER JOIN members m ON m.id = a.member_id
      WHERE m.room_key = ? AND a.date >= ? AND a.date <= ?
      ORDER BY a.date, a.slot_index
    `).all(key, weekStart, addDays(weekStart, 6)),
    saveWeek: saveWeekTransaction
  };
}
