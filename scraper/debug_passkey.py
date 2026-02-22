"""Debug script to examine Passkey JSON structure."""

import asyncio
import json
import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import os

load_dotenv()

async def debug_fetch():
    token_url = os.getenv("PASSKEY_TOKEN_URL")
    event_id = os.getenv("PASSKEY_EVENT_ID")
    owner_id = os.getenv("PASSKEY_OWNER_ID")

    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        # Initialize session
        print("1. Fetching token URL...")
        response = await client.get(token_url)
        csrf_token = client.cookies.get("XSRF-TOKEN")
        print(f"   CSRF token: {bool(csrf_token)}")

        # Submit search
        print("2. Submitting search...")
        url = f"https://book.passkey.com/event/{event_id}/owner/{owner_id}/rooms/select"
        data = {
            "_csrf": csrf_token or "",
            "hotelId": "0",
            "blockMap.blocks[0].blockId": "0",
            "blockMap.blocks[0].checkIn": "2026-07-29",
            "blockMap.blocks[0].checkOut": "2026-08-03",
            "blockMap.blocks[0].numberOfGuests": "1",
            "blockMap.blocks[0].numberOfRooms": "1",
            "blockMap.blocks[0].numberOfChildren": "0",
        }
        response = await client.post(url, data=data)
        print(f"   Status: {response.status_code}")

        # Fetch results
        print("3. Fetching hotel list...")
        url = f"https://book.passkey.com/event/{event_id}/owner/{owner_id}/list/hotels"
        response = await client.get(url)

        soup = BeautifulSoup(response.text, "html.parser")
        script_tag = soup.find("script", {"id": "last-search-results"})

        if script_tag:
            data = json.loads(script_tag.string)
            print(f"\n4. Found {len(data)} hotels in last-search-results")

            if data:
                # Find hotels with availability (non-empty blocks)
                hotels_with_rooms = [h for h in data if h.get('blocks')]
                print(f"\n5. Hotels with rooms: {len(hotels_with_rooms)} out of {len(data)}")

                if hotels_with_rooms:
                    first = hotels_with_rooms[0]
                    print(f"\n6. First hotel with rooms: {first.get('name')}")
                    print(f"   blocks: {len(first.get('blocks', []))} room types")

                    if first.get('blocks'):
                        block = first['blocks'][0]
                        print(f"\n7. First room block keys: {list(block.keys())}")
                        print(f"\n8. First room block data:")
                        for key, value in block.items():
                            if isinstance(value, str) and len(value) > 100:
                                print(f"   {key}: {value[:100]}...")
                            elif isinstance(value, list):
                                print(f"   {key}: list with {len(value)} items")
                                if value and isinstance(value[0], dict):
                                    print(f"      First item keys: {list(value[0].keys())}")
                                    print(f"      First item: {value[0]}")
                            else:
                                print(f"   {key}: {value}")
                else:
                    print("\n   No hotels have availability in last-search-results!")
                    print("\n   Checking full page for other data sources...")

                    # Look for other script tags with room/inventory data
                    all_scripts = soup.find_all("script")
                    for i, script in enumerate(all_scripts):
                        content = str(script.string or "")[:2000]
                        if any(kw in content.lower() for kw in ['inventory', 'availability', 'block', 'rate']):
                            print(f"\n   Script {i}: {content[:500]}...")

                    # Also check the minAvgRate/maxAvgRate in the hotels
                    hotels_with_rates = [h for h in data if h.get('minAvgRate', 0) > 0]
                    print(f"\n   Hotels with minAvgRate > 0: {len(hotels_with_rates)}")
                    for h in hotels_with_rates[:5]:
                        print(f"      {h.get('name')}: ${h.get('minAvgRate')} - ${h.get('maxAvgRate')}")
        else:
            print("No last-search-results script tag found!")
            # Try to find other JSON
            print("\nSearching for other script tags with hotel data...")
            for script in soup.find_all("script"):
                if script.string and "hotelId" in str(script.string)[:1000]:
                    print(f"Found script with hotelId: {str(script.string)[:500]}...")

async def debug_hotel_detail():
    """Try to fetch room details for a specific hotel."""
    token_url = os.getenv("PASSKEY_TOKEN_URL")
    event_id = os.getenv("PASSKEY_EVENT_ID")
    owner_id = os.getenv("PASSKEY_OWNER_ID")

    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        # Initialize session
        print("1. Fetching token URL...")
        response = await client.get(token_url)
        csrf_token = client.cookies.get("XSRF-TOKEN")

        # Submit search first
        print("2. Submitting search...")
        url = f"https://book.passkey.com/event/{event_id}/owner/{owner_id}/rooms/select"
        data = {
            "_csrf": csrf_token or "",
            "hotelId": "0",
            "blockMap.blocks[0].blockId": "0",
            "blockMap.blocks[0].checkIn": "2026-07-29",
            "blockMap.blocks[0].checkOut": "2026-08-03",
            "blockMap.blocks[0].numberOfGuests": "1",
            "blockMap.blocks[0].numberOfRooms": "1",
            "blockMap.blocks[0].numberOfChildren": "0",
        }
        await client.post(url, data=data)

        # Try to fetch hotel rooms endpoint (guessing the URL)
        # Home2 Suites Indianapolis Downtown had availability in the screenshot
        hotel_ids_to_try = [50111225]  # Home2 Suites from our hotel list

        for hotel_id in hotel_ids_to_try:
            print(f"\n3. Trying to fetch rooms for hotel {hotel_id}...")

            # Try various endpoints
            endpoints = [
                f"https://book.passkey.com/event/{event_id}/owner/{owner_id}/hotel/{hotel_id}/rooms",
                f"https://book.passkey.com/event/{event_id}/owner/{owner_id}/hotel/{hotel_id}",
                f"https://book.passkey.com/event/{event_id}/owner/{owner_id}/rooms?hotelId={hotel_id}",
            ]

            for endpoint in endpoints:
                try:
                    response = await client.get(endpoint)
                    print(f"   {endpoint}")
                    print(f"   Status: {response.status_code}")
                    if response.status_code == 200:
                        # Try to find JSON data
                        soup = BeautifulSoup(response.text, "html.parser")
                        scripts = soup.find_all("script")
                        for script in scripts:
                            if script.string and "blocks" in str(script.string):
                                content = str(script.string)[:1000]
                                print(f"   Found blocks data: {content[:500]}...")
                                break
                except Exception as e:
                    print(f"   Error: {e}")

if __name__ == "__main__":
    asyncio.run(debug_fetch())
    print("\n" + "="*60 + "\n")
    asyncio.run(debug_hotel_detail())
