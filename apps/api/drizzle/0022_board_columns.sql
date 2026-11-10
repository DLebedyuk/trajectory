CREATE TABLE "board_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"direction_id" uuid NOT NULL,
	"title" varchar(40) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "board_column_id" uuid;--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_columns_direction_idx" ON "board_columns" USING btree ("direction_id","sort_order");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_column_id_board_columns_id_fk" FOREIGN KEY ("board_column_id") REFERENCES "public"."board_columns"("id") ON DELETE set null ON UPDATE no action;