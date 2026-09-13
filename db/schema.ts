import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(), email: text("email").notNull(), displayName: text("display_name").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("idx_profiles_email").on(t.email)]);
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(), name: text("name").notNull(), artist: text("artist").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(),
});
export const projectMembers = sqliteTable("project_members", {
  projectId: text("project_id").notNull(), userId: text("user_id").notNull(), role: text("role").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("idx_project_members_user").on(t.userId)]);
export const projectInvites = sqliteTable("project_invites", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull(), email: text("email").notNull(), role: text("role").notNull(), invitedBy: text("invited_by").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("idx_project_invites_project_email").on(t.projectId, t.email), index("idx_project_invites_email").on(t.email)]);

export const projectShareLinks = sqliteTable("project_share_links", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull(), token: text("token").notNull(), role: text("role").notNull().default("reviewer"), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("idx_project_share_links_token").on(t.token), index("idx_project_share_links_project").on(t.projectId)]);
export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull(), parentId: text("parent_id"), name: text("name").notNull(), position: integer("position").notNull().default(0), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [index("idx_folders_project_parent").on(t.projectId, t.parentId)]);
export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull(), folderId: text("folder_id").notNull(), title: text("title").notNull(), status: text("status").notNull().default("In review"), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [index("idx_assets_folder").on(t.folderId)]);
export const assetVersions = sqliteTable("asset_versions", {
  id: text("id").primaryKey(), assetId: text("asset_id").notNull(), versionNo: integer("version_no").notNull(), fileName: text("file_name").notNull(), storageKey: text("storage_key").notNull(), sizeBytes: integer("size_bytes").notNull(), contentType: text("content_type").notNull(), durationSeconds: integer("duration_seconds"), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("idx_versions_asset_number").on(t.assetId, t.versionNo), index("idx_versions_asset").on(t.assetId)]);
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(), versionId: text("version_id").notNull(), timeMs: integer("time_ms").notNull(), body: text("body").notNull(), authorId: text("author_id").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [index("idx_comments_version").on(t.versionId)]);
