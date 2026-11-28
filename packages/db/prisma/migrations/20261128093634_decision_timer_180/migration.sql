UPDATE "Setting" SET "value" = '180' WHERE "key" = 'DECIDE_WINDOW_S';
INSERT INTO "Setting" ("key", "value")
SELECT 'DECIDE_WINDOW_S', '180'
WHERE NOT EXISTS (SELECT 1 FROM "Setting" WHERE "key" = 'DECIDE_WINDOW_S');
