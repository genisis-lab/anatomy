import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const learnerState = sqliteTable("learner_state", {
  sessionHash: text("session_hash").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const analyticsEvents = sqliteTable("analytics_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionHash: text("session_hash").notNull(),
  event: text("event").notNull(),
  organId: text("organ_id"),
  metadata: text("metadata"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_analytics_events_event_created").on(table.event, table.createdAt),
  index("idx_analytics_events_organ_created").on(table.organId, table.createdAt),
]);
