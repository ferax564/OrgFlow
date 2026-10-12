'use strict';
/** Work-location, vacation and desk-reservation records. They live beside the workspace document,
 *  never inside it, so temporary bookings cannot overwrite permanent seating and workspace files
 *  and backups keep their existing format. */
function migrateWorkplace(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_identities (
      issuer_sub TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS offices (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, id)
    );
    CREATE TABLE IF NOT EXISTS office_rooms (
      tenant_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      office_id TEXT NOT NULL,
      PRIMARY KEY (tenant_id, room_id)
    );
    CREATE TABLE IF NOT EXISTS desk_sharing (
      tenant_id TEXT NOT NULL,
      desk_id TEXT NOT NULL,
      equipment TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, desk_id)
    );
    CREATE TABLE IF NOT EXISTS closures (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      office_id TEXT NOT NULL,
      room_id TEXT NOT NULL DEFAULT '',
      desk_id TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS work_patterns (
      tenant_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      location TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, employee_id, weekday)
    );
    CREATE TABLE IF NOT EXISTS work_days (
      tenant_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      location TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, employee_id, date)
    );
    CREATE INDEX IF NOT EXISTS work_days_date ON work_days(tenant_id, date);
    CREATE TABLE IF NOT EXISTS approver_overrides (
      tenant_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      approver_id TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, employee_id)
    );
    CREATE TABLE IF NOT EXISTS vacation_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      approver_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('new','change','cancel')),
      target_id TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','cancelled')),
      note TEXT NOT NULL DEFAULT '',
      submitted_at TEXT NOT NULL,
      submitted_by TEXT NOT NULL,
      decided_at TEXT NOT NULL DEFAULT '',
      decided_by TEXT NOT NULL DEFAULT '',
      decision_note TEXT NOT NULL DEFAULT '',
      superseded_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS vacation_employee ON vacation_requests(tenant_id, employee_id, status);
    CREATE INDEX IF NOT EXISTS vacation_approver ON vacation_requests(tenant_id, approver_id, status);
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      desk_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      office_id TEXT NOT NULL,
      date TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('confirmed','cancelled','displaced')),
      on_behalf INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      cancelled_by TEXT NOT NULL DEFAULT '',
      cancelled_at TEXT NOT NULL DEFAULT '',
      cancel_reason TEXT NOT NULL DEFAULT '',
      location_confirmed INTEGER NOT NULL DEFAULT 1
    );
    CREATE UNIQUE INDEX IF NOT EXISTS reservations_desk_day ON reservations(tenant_id, desk_id, date) WHERE status = 'confirmed';
    CREATE UNIQUE INDEX IF NOT EXISTS reservations_person_day ON reservations(tenant_id, employee_id, date) WHERE status = 'confirmed';
    CREATE INDEX IF NOT EXISTS reservations_date ON reservations(tenant_id, date);
    CREATE TABLE IF NOT EXISTS seat_conflicts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      reservation_id TEXT NOT NULL,
      desk_id TEXT NOT NULL,
      date TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open','resolved')),
      created_at TEXT NOT NULL,
      resolved_at TEXT NOT NULL DEFAULT '',
      resolved_by TEXT NOT NULL DEFAULT '',
      resolution TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS seat_conflicts_open ON seat_conflicts(tenant_id, reservation_id) WHERE status = 'open';
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      route TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT NOT NULL DEFAULT '',
      UNIQUE (tenant_id, dedupe_key)
    );
    CREATE INDEX IF NOT EXISTS notifications_user ON notifications(tenant_id, user_id, created_at);
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      notification_id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','sending','sent','retry','failed','skipped','uncertain')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      lease_until TEXT NOT NULL DEFAULT '',
      last_error TEXT NOT NULL DEFAULT '',
      sent_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS deliveries_due ON notification_deliveries(status, next_attempt_at);
    CREATE TABLE IF NOT EXISTS data_reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('approver','desk','identity','role')),
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('open','resolved','dismissed')),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_by TEXT NOT NULL DEFAULT '',
      resolved_at TEXT NOT NULL DEFAULT '',
      resolution TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS data_reports_status ON data_reports(tenant_id, status);
    CREATE TABLE IF NOT EXISTS teams_conversations (
      tenant_id TEXT NOT NULL,
      aad_object_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      service_url TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, aad_object_id)
    );
  `);
  // Approval routing: 'auto' follows Current and corrections, 'pinned' was assigned by an administrator
  // for this request, 'unassigned' waits for an administrator (no valid approver, or returned by a manager).
  const columns = new Set(db.prepare('PRAGMA table_info(vacation_requests)').all().map(c => c.name));
  if (!columns.has('routing')) db.exec("ALTER TABLE vacation_requests ADD COLUMN routing TEXT NOT NULL DEFAULT 'auto'");
  if (!columns.has('routing_note')) db.exec("ALTER TABLE vacation_requests ADD COLUMN routing_note TEXT NOT NULL DEFAULT ''");
  if (!columns.has('returned_by')) db.exec("ALTER TABLE vacation_requests ADD COLUMN returned_by TEXT NOT NULL DEFAULT ''");
}

module.exports = { migrateWorkplace };
