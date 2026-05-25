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
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "user_profiles_select_own" ON "user_profiles" FOR SELECT USING ("user_id" = auth.uid());
--> statement-breakpoint
CREATE POLICY "user_profiles_update_own" ON "user_profiles" FOR UPDATE USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint
CREATE POLICY "user_profiles_insert_own" ON "user_profiles" FOR INSERT WITH CHECK ("user_id" = auth.uid());
