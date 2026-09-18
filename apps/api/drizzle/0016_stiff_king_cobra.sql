CREATE TABLE "travel_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"category_id" uuid,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"always_include" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"travel_item_id" uuid,
	"title" varchar(200) NOT NULL,
	"category_id" uuid,
	"packed" boolean DEFAULT false NOT NULL,
	"need_to_buy" boolean DEFAULT false NOT NULL,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(200),
	"country" varchar(120) NOT NULL,
	"city" varchar(120),
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"purposes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transport" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '{"canLaundry":false,"needsLaptop":false,"seaOrPool":false,"activeOutdoor":false,"specialEvent":false,"comment":null}'::jsonb NOT NULL,
	"status" varchar(10) DEFAULT 'planning' NOT NULL,
	"checklist_generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "travel_categories" ADD CONSTRAINT "travel_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_items" ADD CONSTRAINT "travel_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_items" ADD CONSTRAINT "travel_items_category_id_travel_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."travel_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_checklist_items" ADD CONSTRAINT "trip_checklist_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_checklist_items" ADD CONSTRAINT "trip_checklist_items_travel_item_id_travel_items_id_fk" FOREIGN KEY ("travel_item_id") REFERENCES "public"."travel_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_checklist_items" ADD CONSTRAINT "trip_checklist_items_category_id_travel_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."travel_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "travel_categories_user_name_idx" ON "travel_categories" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "travel_items_user_idx" ON "travel_items" USING btree ("user_id","archived");--> statement-breakpoint
CREATE INDEX "trip_checklist_items_trip_idx" ON "trip_checklist_items" USING btree ("trip_id","sort_order");--> statement-breakpoint
CREATE INDEX "trips_user_idx" ON "trips" USING btree ("user_id","start_date");