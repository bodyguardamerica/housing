"""Run the partial availability migration."""
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

sql = """
DROP VIEW IF EXISTS latest_room_availability;

CREATE OR REPLACE VIEW latest_room_availability AS
WITH latest_scrape AS (
    SELECT id FROM scrape_runs
    WHERE status = 'success'
    ORDER BY completed_at DESC
    LIMIT 1
)
SELECT
    rs.id AS snapshot_id,
    h.id AS hotel_id,
    h.name AS hotel_name,
    h.address,
    h.distance_from_icc,
    h.distance_unit,
    h.has_skywalk,
    h.latitude,
    h.longitude,
    rs.room_type,
    rs.room_description,
    rs.available_count,
    rs.nightly_rate,
    rs.total_price,
    rs.check_in,
    rs.check_out,
    rs.num_nights,
    rs.scraped_at,
    rs.raw_block_data,
    COALESCE((rs.raw_block_data->>'partial_availability')::boolean, FALSE) AS partial_availability,
    COALESCE((rs.raw_block_data->>'nights_available')::integer, rs.num_nights) AS nights_available,
    COALESCE((rs.raw_block_data->>'total_nights')::integer, rs.num_nights) AS total_nights,
    EXTRACT(EPOCH FROM (NOW() - rs.scraped_at))::INTEGER AS seconds_ago
FROM room_snapshots rs
JOIN hotels h ON rs.hotel_id = h.id
JOIN latest_scrape ls ON rs.scrape_run_id = ls.id
WHERE
    rs.available_count > 0
    OR (rs.raw_block_data->>'partial_availability')::boolean = TRUE
ORDER BY h.distance_from_icc ASC, rs.total_price ASC;
"""

# Extract project ref from URL
project_ref = url.split('//')[1].split('.')[0]
print(f"Project: {project_ref}")

# Supabase doesn't have a direct SQL execution endpoint via REST
# We need to use the Management API or direct postgres connection
# Let's try the database URL approach

# Check if there's a DATABASE_URL or try to construct one
db_url = os.getenv('DATABASE_URL')
if not db_url:
    # Try Supabase direct connection format
    # postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
    print("No DATABASE_URL found. Trying Supabase pooler connection...")

    # Try using psycopg2 if available
    try:
        import psycopg2
        # Supabase pooler connection (you need the database password)
        print("psycopg2 available, but need DATABASE_URL with password")
    except ImportError:
        print("psycopg2 not available")

# Alternative: Use supabase-py with raw SQL (not supported in REST API)
# We'll need to use the SQL Editor API which requires different auth

print("\n" + "="*60)
print("MIGRATION SQL (copy to Supabase SQL Editor):")
print("="*60)
print(sql)
print("="*60)

# Try to use the Supabase Management API if we have access
management_api = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
headers = {
    'Authorization': f'Bearer {key}',
    'Content-Type': 'application/json',
}

print(f"\nTrying Management API at: {management_api}")
try:
    response = httpx.post(
        management_api,
        headers=headers,
        json={'query': sql},
        timeout=30.0
    )
    print(f'Status: {response.status_code}')
    if response.status_code == 200:
        print("Migration successful!")
    else:
        print(f'Response: {response.text[:500] if response.text else "empty"}')
except Exception as e:
    print(f"Error: {e}")
