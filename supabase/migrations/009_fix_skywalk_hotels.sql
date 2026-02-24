-- Fix skywalk hotel markings based on official Gen Con 2025 hotel list
-- Be specific with naming to avoid matching non-skywalk hotels with similar names

-- First, reset all hotels to not skywalk
UPDATE hotels SET skywalk_manual = false;

-- Set skywalk_manual = true ONLY for the official 11 skywalk-connected hotels
-- Using specific patterns to avoid false matches (e.g., "at the Capitol" vs "Downtown")

-- Courtyard by Marriott Indianapolis Downtown (NOT "at the Capitol")
UPDATE hotels SET skywalk_manual = true
WHERE name ILIKE '%Courtyard%Marriott%Indianapolis%Downtown%';

-- Crowne Plaza Indianapolis Downtown - Union Station (NOT Airport)
UPDATE hotels SET skywalk_manual = true
WHERE name ILIKE '%Crowne Plaza%Indianapolis%Downtown%'
   OR name ILIKE '%Crowne Plaza%Union Station%';

-- Embassy Suites by Hilton Indianapolis Downtown
UPDATE hotels SET skywalk_manual = true
WHERE name ILIKE '%Embassy Suites%Indianapolis%Downtown%';

-- Fairfield Inn & Suites by Marriott Indianapolis Downtown
UPDATE hotels SET skywalk_manual = true
WHERE name ILIKE '%Fairfield Inn%Indianapolis%Downtown%';

-- Hyatt Regency Indianapolis
UPDATE hotels SET skywalk_manual = true
WHERE name ILIKE '%Hyatt Regency Indianapolis%';

-- Indianapolis Marriott Downtown
UPDATE hotels SET skywalk_manual = true
WHERE name ILIKE '%Indianapolis Marriott Downtown%';

-- JW Marriott Indianapolis
UPDATE hotels SET skywalk_manual = true
WHERE name ILIKE '%JW Marriott Indianapolis%';

-- Le Meridien Indianapolis
UPDATE hotels SET skywalk_manual = true
WHERE name ILIKE '%Le Meridien Indianapolis%';

-- Omni Severin Hotel
UPDATE hotels SET skywalk_manual = true
WHERE name ILIKE '%Omni Severin%';

-- SpringHill Suites by Marriott Indianapolis Downtown
UPDATE hotels SET skywalk_manual = true
WHERE name ILIKE '%SpringHill Suites%Indianapolis%Downtown%';

-- The Westin Indianapolis
UPDATE hotels SET skywalk_manual = true
WHERE name ILIKE '%Westin Indianapolis%';
