-- FIX: Skywalk-required watchers could never fire.
--
-- ROOT CAUSE: The 11 hotels with skywalk access to the Indiana Convention Center
-- (per https://www.gencon.com/gen-con-indy/hotelmap) had has_skywalk=true on
-- placeholder rows with negative passkey_hotel_id values (-3, -4, -10). Every
-- real Passkey row for the same property had has_skywalk=false. The scraper
-- writes room_snapshots only against the real (positive) passkey_hotel_id rows,
-- so no snapshot was ever attached to a skywalk-flagged hotel and
-- match_watchers_for_snapshot's `require_skywalk = FALSE OR has_skywalk = TRUE`
-- predicate excluded every snapshot for any watcher with require_skywalk=true.
--
-- FIX:
--   1. Set has_skywalk=true on the 11 real (positive-ID) rows that map to the
--      official skywalk hotels list.
--   2. Defensively unset has_skywalk on any negative-ID rows.
--   3. Delete orphan negative-ID rows (verified: zero room_snapshots and zero
--      watchers reference them as of 2026-04-23).

UPDATE hotels
SET has_skywalk = TRUE
WHERE passkey_hotel_id IN (
    1143321,   -- Courtyard by Marriott Downtown Indianapolis
    1647,      -- Crowne Plaza Indianapolis Downtown Union Station
    1655,      -- Embassy Suites Indianapolis Downtown
    1157280,   -- Fairfield Inn & Suites Indianapolis Downtown
    1663,      -- Hyatt Regency Indianapolis
    2211,      -- Indianapolis Marriott Downtown
    1487628,   -- JW Marriott Indianapolis
    11801355,  -- Le Meridien Indianapolis
    1666,      -- Omni Severin Hotel
    1143328,   -- SpringHill Suites Indianapolis Downtown
    1680       -- The Westin Indianapolis
);

UPDATE hotels
SET has_skywalk = FALSE
WHERE passkey_hotel_id < 0;

DELETE FROM hotels
WHERE passkey_hotel_id < 0;
