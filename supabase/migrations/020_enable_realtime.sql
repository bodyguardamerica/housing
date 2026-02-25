-- Enable Realtime for scrape_runs table
-- This allows the frontend to subscribe to changes and get instant updates

-- Add scrape_runs to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE scrape_runs;

-- Grant necessary permissions for realtime
GRANT SELECT ON scrape_runs TO anon;
GRANT SELECT ON scrape_runs TO authenticated;
