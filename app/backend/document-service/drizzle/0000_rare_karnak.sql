CREATE TYPE "public"."document_member_role" AS ENUM('owner', 'editor', 'commenter', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."document_visibility" AS ENUM('private', 'workspace', 'link', 'public');--> statement-breakpoint
CREATE TYPE "public"."workspace_member_role" AS ENUM('owner', 'admin', 'member', 'guest');--> statement-breakpoint
CREATE TABLE "document_members" (
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "document_member_role" NOT NULL,
	"added_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp with time zone,
	CONSTRAINT "document_members_document_id_user_id_pk" PRIMARY KEY("document_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" bigint NOT NULL,
	"source" text NOT NULL,
	"content_json" jsonb NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"folder_id" uuid,
	"title" text NOT NULL,
	"status" "document_status" DEFAULT 'active' NOT NULL,
	"visibility" "document_visibility" DEFAULT 'private' NOT NULL,
	"workspace_default_role" "document_member_role",
	"owner_user_id" uuid,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"latest_version_id" uuid
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"parent_folder_id" uuid,
	"name" text NOT NULL,
	"sort_order" integer,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_member_role" NOT NULL,
	"invited_by_user_id" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"last_active_at" timestamp with time zone,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"created_by_user_id" uuid,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "document_members" ADD CONSTRAINT "document_members_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_folder_id_folders_id_fk" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_document_members_user_document" ON "document_members" USING btree ("user_id","document_id");--> statement-breakpoint
CREATE INDEX "idx_document_members_role" ON "document_members" USING btree ("document_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_document_versions_doc_version" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "idx_document_versions_doc_version_desc" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "idx_documents_workspace_folder_updated" ON "documents" USING btree ("workspace_id","folder_id","updated_at") WHERE "documents"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_documents_workspace_status_updated" ON "documents" USING btree ("workspace_id","status","updated_at") WHERE "documents"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_folders_workspace_parent" ON "folders" USING btree ("workspace_id","parent_folder_id");--> statement-breakpoint
CREATE INDEX "idx_folders_workspace_updated" ON "folders" USING btree ("workspace_id","updated_at") WHERE "folders"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_folders_name_per_parent" ON "folders" USING btree ("workspace_id","parent_folder_id","name") WHERE "folders"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_workspace_members_user_workspace" ON "workspace_members" USING btree ("user_id","workspace_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_members_active" ON "workspace_members" USING btree ("workspace_id") WHERE "workspace_members"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workspaces_slug_active" ON "workspaces" USING btree ("slug") WHERE "workspaces"."deleted_at" IS NULL AND "workspaces"."slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_workspaces_updated_at" ON "workspaces" USING btree ("updated_at");