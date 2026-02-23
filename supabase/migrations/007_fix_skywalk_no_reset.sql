-- Fix skywalk hotels WITHOUT resetting first
-- This handles both seed data names and Passkey API names

UPDATE hotels SET has_skywalk = true WHERE name ILIKE '%Courtyard%Marriott%Indianapolis%';
UPDATE hotels SET has_skywalk = true WHERE name ILIKE '%Crowne Plaza%Indianapolis%';
UPDATE hotels SET has_skywalk = true WHERE name ILIKE '%Embassy Suites%Indianapolis%';
UPDATE hotels SET has_skywalk = true WHERE name ILIKE '%Fairfield Inn%Indianapolis%';
UPDATE hotels SET has_skywalk = true WHERE name ILIKE '%Hyatt Regency Indianapolis%';
UPDATE hotels SET has_skywalk = true WHERE name ILIKE '%JW Marriott Indianapolis%';
UPDATE hotels SET has_skywalk = true WHERE name ILIKE '%Le Meridien Indianapolis%';
UPDATE hotels SET has_skywalk = true WHERE name ILIKE '%Omni Severin%';
UPDATE hotels SET has_skywalk = true WHERE name ILIKE '%SpringHill Suites%Indianapolis%';
UPDATE hotels SET has_skywalk = true WHERE name ILIKE '%Westin Indianapolis%';
UPDATE hotels SET has_skywalk = true WHERE name ILIKE '%Indianapolis Marriott Downtown%';
