-- Migration: Update hotel areas for West Side/Airport, East Side, North Side, and South Side hotels
-- Using exact name matching with ILIKE for case-insensitivity

-- West Side / Airport hotels
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Baymont Inn & Suites Indianapolis Airport';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Candlewood Suites Indianapolis Airport';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Comfort Inn Indianapolis Airport - Plainfield';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Country Inn & Suites - Indianapolis Airport South';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Courtyard by Marriott Indianapolis Airport';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Courtyard by Marriott Indianapolis Plainfield';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Courtyard by Marriott Indianapolis West Speedway';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Crowne Plaza Indianapolis Airport';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Delta Hotels Indianapolis Airport';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Embassy Suites by Hilton Airport-Plainfield';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Hampton Inn & Suites Indianapolis Airport';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Hampton Inn & Suites Indianapolis West Speedway';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Hilton Garden Inn Indianapolis Airport';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Holiday Inn Indianapolis Airport';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Home2 Suites by Hilton Indianapolis Airport';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Home2 Suites by Hilton Indianapolis Brownsburg';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Homewood Suites by Hilton Airport Plainfield';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Hyatt Place Indianapolis Airport';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'LaQuinta by Wyndham Indianapolis Airport - Executive Drive';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Residence Inn by Marriott Indianapolis Plainfield';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Wingate by Wyndham Airport Indianapolis Plainfield';
UPDATE hotels SET area = 'west/airport' WHERE name ILIKE 'Wyndham Indianapolis West';

-- East Side hotels
UPDATE hotels SET area = 'east' WHERE name ILIKE 'Baymont by Wyndham Indianapolis - Brookville Crossing';
UPDATE hotels SET area = 'east' WHERE name ILIKE 'Candlewood Suites Indianapolis East';
UPDATE hotels SET area = 'east' WHERE name ILIKE 'Comfort Inn East Indy';
UPDATE hotels SET area = 'east' WHERE name ILIKE 'Delta Hotels Indianapolis East';
UPDATE hotels SET area = 'east' WHERE name ILIKE 'Fairfield Inn & Suites by Marriott Indianapolis East';
UPDATE hotels SET area = 'east' WHERE name ILIKE 'Indianapolis Marriott East';

-- North Side hotels
UPDATE hotels SET area = 'north' WHERE name ILIKE 'Best Western Plus Indianapolis NW';
UPDATE hotels SET area = 'north' WHERE name ILIKE 'Clarion Inn & Suites Northwest';
UPDATE hotels SET area = 'north' WHERE name ILIKE 'Embassy Suites by Hilton Indianapolis North';
UPDATE hotels SET area = 'north' WHERE name ILIKE 'Hilton Garden Inn Indianapolis Northwest';
UPDATE hotels SET area = 'north' WHERE name ILIKE 'Homewood Suites Indianapolis Carmel';
UPDATE hotels SET area = 'north' WHERE name ILIKE 'Hyatt Place Indianapolis Carmel';
UPDATE hotels SET area = 'north' WHERE name ILIKE 'Marriott Indianapolis North';
UPDATE hotels SET area = 'north' WHERE name ILIKE 'Sheraton Indianapolis Hotel at Keystone Crossing';
UPDATE hotels SET area = 'north' WHERE name ILIKE 'SpringHill Suites by Marriott Indianapolis Carmel';

-- South Side hotels
UPDATE hotels SET area = 'south' WHERE name ILIKE 'Courtyard by Marriott Indianapolis South';
UPDATE hotels SET area = 'south' WHERE name ILIKE 'Hampton Inn Indianapolis South';
