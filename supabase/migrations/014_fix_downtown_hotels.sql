-- Fix: Remove non-downtown hotels that were incorrectly marked
-- Home2 Airport and Sheraton Keystone Crossing are not downtown

UPDATE hotels SET area = NULL WHERE name ILIKE '%Airport%';
UPDATE hotels SET area = NULL WHERE name ILIKE '%Keystone Crossing%';
