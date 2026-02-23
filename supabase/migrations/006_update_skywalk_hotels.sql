-- Update hotels that have skywalk access to the Indiana Convention Center
-- Source: https://www.gencon.com/gen-con-indy/hotelmap
-- Using exact name matches from Passkey data

-- Reset all to false first to ensure clean state
UPDATE hotels SET has_skywalk = false WHERE has_skywalk = true;

-- Set confirmed skywalk hotels (exact name matches)
UPDATE hotels SET has_skywalk = true WHERE name = 'Courtyard by Marriott Downtown Indianapolis';
UPDATE hotels SET has_skywalk = true WHERE name = 'Crowne Plaza Indianapolis Downtown Union Station';
UPDATE hotels SET has_skywalk = true WHERE name = 'Embassy Suites Indianapolis Downtown';
UPDATE hotels SET has_skywalk = true WHERE name = 'Fairfield Inn & Suites Indianapolis Downtown';
UPDATE hotels SET has_skywalk = true WHERE name = 'Hyatt Regency Indianapolis';
UPDATE hotels SET has_skywalk = true WHERE name = 'Indianapolis Marriott Downtown';
UPDATE hotels SET has_skywalk = true WHERE name = 'JW Marriott Indianapolis';
UPDATE hotels SET has_skywalk = true WHERE name = 'Le Meridien Indianapolis';
UPDATE hotels SET has_skywalk = true WHERE name = 'Omni Severin Hotel';
UPDATE hotels SET has_skywalk = true WHERE name = 'SpringHill Suites Indianapolis Downtown';
UPDATE hotels SET has_skywalk = true WHERE name = 'The Westin Indianapolis';
