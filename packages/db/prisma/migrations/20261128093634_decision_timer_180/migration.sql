UPDATE "Setting" SET "value" = '180', "updatedAt" = NOW() WHERE "key" = 'DECIDE_WINDOW_S';
INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES ('DECIDE_WINDOW_S', '180', NOW())
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW();
