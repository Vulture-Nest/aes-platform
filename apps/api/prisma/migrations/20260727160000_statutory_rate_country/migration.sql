-- Statutory-rate country scoping (multinational readiness, gap G4).
-- Additive only: a nullable country column so a second entity in a different country can
-- carry its OWN effective-dated statutory rates. Existing rows stay country = NULL, meaning
-- "applies to any country" — the Zimbabwe default resolves exactly as before via the NULL
-- fallback in the resolver. No new GRANTs: statutory_rates is unrestricted config.

ALTER TABLE "statutory_rates" ADD COLUMN "country" TEXT;

-- Supporting index for the country-scoped effective-dated lookup.
CREATE INDEX "statutory_rates_key_country_currency_date_effective_idx"
  ON "statutory_rates" ("key", "country", "currency", "date_effective");
