-- Protrack's brand colour is orange (#FE5102): its certificates, stamps and invoices use it.
-- Runs once; a colour chosen later in Settings → Brands is kept.
UPDATE "brands" SET "color" = '#FE5102' WHERE lower("name") IN ('protrack', 'protrack gps');
