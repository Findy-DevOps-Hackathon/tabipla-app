ALTER TABLE "spots" ALTER COLUMN "category" TYPE text[] USING (
  CASE WHEN "category" IS NULL THEN NULL::text[] ELSE ARRAY["category"] END
);
