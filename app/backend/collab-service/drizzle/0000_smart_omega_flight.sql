CREATE TABLE "document_collab_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"snapshot_seq" bigint NOT NULL,
	"ydoc" "bytea" NOT NULL,
	"state_vector" "bytea" NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_collab_updates" (
	"document_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"update" "bytea" NOT NULL,
	"client_id" bigint,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_collab_updates_document_id_seq_pk" PRIMARY KEY("document_id","seq")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_document_collab_snapshots_doc_seq" ON "document_collab_snapshots" USING btree ("document_id","snapshot_seq");--> statement-breakpoint
CREATE INDEX "idx_document_collab_snapshots_doc_seq_desc" ON "document_collab_snapshots" USING btree ("document_id","snapshot_seq");--> statement-breakpoint
CREATE INDEX "idx_document_collab_updates_doc_created" ON "document_collab_updates" USING btree ("document_id","created_at");