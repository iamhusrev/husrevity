import GRDB

/// Versioned schema. Append new migrations; never edit a shipped one.
enum Schema {
    static func migrator() -> DatabaseMigrator {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1-initial") { db in
            // Reference columns (project_id, goal_id, item_id, ...) hold a server id or a
            // `local:<uuid>` placeholder, so they are plain text and carry no foreign key.
            // `deleted_locally` marks rows with a pending delete: hidden from reads, kept until the
            // delete is pushed so a pull cannot resurrect them.
            try db.execute(sql: """
                CREATE TABLE item (
                  local_id TEXT PRIMARY KEY NOT NULL,
                  server_id TEXT UNIQUE,
                  kind TEXT NOT NULL,
                  title TEXT NOT NULL,
                  notes TEXT,
                  context TEXT,
                  project_id TEXT,
                  goal_id TEXT,
                  block_id TEXT,
                  scheduled_at INTEGER,
                  duration_min INTEGER,
                  due_at INTEGER,
                  notify_minutes_before INTEGER,
                  rrule TEXT,
                  status TEXT NOT NULL,
                  completed_at INTEGER,
                  payload TEXT NOT NULL,
                  source TEXT NOT NULL,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL,
                  deleted_locally INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX item_status ON item(status);
                CREATE INDEX item_scheduled_at ON item(scheduled_at);
                CREATE INDEX item_due_at ON item(due_at);

                CREATE TABLE item_occurrence (
                  local_id TEXT PRIMARY KEY NOT NULL,
                  server_id TEXT UNIQUE,
                  item_id TEXT NOT NULL,
                  occurs_on TEXT NOT NULL,
                  status TEXT NOT NULL,
                  completed_at INTEGER,
                  updated_at INTEGER NOT NULL,
                  deleted_locally INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX item_occurrence_occurs_on ON item_occurrence(occurs_on);
                CREATE INDEX item_occurrence_item ON item_occurrence(item_id);

                CREATE TABLE note (
                  local_id TEXT PRIMARY KEY NOT NULL,
                  server_id TEXT UNIQUE,
                  title TEXT NOT NULL,
                  body_markdown TEXT,
                  pinned INTEGER NOT NULL,
                  archived INTEGER NOT NULL,
                  position INTEGER NOT NULL,
                  color_hex TEXT,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL,
                  deleted_locally INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE note_tag (
                  local_id TEXT PRIMARY KEY NOT NULL,
                  server_id TEXT UNIQUE,
                  name TEXT NOT NULL,
                  color TEXT,
                  updated_at INTEGER NOT NULL,
                  deleted_locally INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE note_tag_assignment (
                  note_local_id TEXT NOT NULL REFERENCES note(local_id) ON DELETE CASCADE,
                  tag_local_id TEXT NOT NULL REFERENCES note_tag(local_id) ON DELETE CASCADE,
                  PRIMARY KEY (note_local_id, tag_local_id)
                );
                CREATE INDEX note_tag_assignment_tag ON note_tag_assignment(tag_local_id);

                CREATE TABLE project (
                  local_id TEXT PRIMARY KEY NOT NULL,
                  server_id TEXT UNIQUE,
                  code TEXT NOT NULL,
                  name TEXT NOT NULL,
                  description TEXT,
                  status TEXT NOT NULL,
                  start_date TEXT,
                  end_date TEXT,
                  goal_id TEXT,
                  pinned INTEGER NOT NULL,
                  archived INTEGER NOT NULL,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL,
                  owner_id TEXT NOT NULL,
                  owner_name TEXT,
                  role TEXT NOT NULL,
                  shared INTEGER NOT NULL,
                  member_count INTEGER NOT NULL,
                  deleted_locally INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE goal (
                  local_id TEXT PRIMARY KEY NOT NULL,
                  server_id TEXT UNIQUE,
                  title TEXT NOT NULL,
                  notes TEXT,
                  horizon TEXT NOT NULL,
                  period_start TEXT NOT NULL,
                  period_end TEXT NOT NULL,
                  parent_goal_id TEXT,
                  status TEXT NOT NULL,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL,
                  deleted_locally INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE outbox (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  entity TEXT NOT NULL,
                  op TEXT NOT NULL CHECK (op IN ('create','update','delete','complete')),
                  local_id TEXT NOT NULL,
                  payload TEXT NOT NULL,
                  idempotency_key TEXT NOT NULL UNIQUE,
                  base_updated_at_ms INTEGER,
                  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','inflight','failed')),
                  attempts INTEGER NOT NULL DEFAULT 0,
                  last_error TEXT,
                  created_at INTEGER NOT NULL
                );
                CREATE INDEX outbox_target ON outbox(entity, local_id);
                CREATE INDEX outbox_state ON outbox(state, id);

                CREATE TABLE sync_state (
                  key TEXT PRIMARY KEY NOT NULL,
                  value TEXT NOT NULL
                );

                CREATE TABLE conflicts (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  entity TEXT NOT NULL,
                  local_id TEXT NOT NULL,
                  op TEXT NOT NULL DEFAULT 'update',
                  local_payload TEXT NOT NULL,
                  server_payload TEXT NOT NULL,
                  created_at INTEGER NOT NULL,
                  resolved_at INTEGER
                );
                CREATE INDEX conflicts_open ON conflicts(resolved_at);
                """)
        }

        // A server tombstone that arrived while the row had an unsent local change is remembered
        // here instead of being lost; see `LocalStore.deferredTombstones()`.
        migrator.registerMigration("v2-pending-tombstone") { db in
            for table in ["item", "item_occurrence", "note", "note_tag", "project", "goal"] {
                try db.execute(sql: "ALTER TABLE \(table) ADD COLUMN pending_tombstone INTEGER NOT NULL DEFAULT 0")
            }
        }

        return migrator
    }
}
