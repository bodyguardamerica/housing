"""Test script for multi-night scraping to find partial availability."""

import asyncio
import os
from datetime import date
from dotenv import load_dotenv

load_dotenv()

from passkey import PasskeyClient


async def test_multi_night():
    token_url = os.getenv("PASSKEY_TOKEN_URL")
    event_id = os.getenv("PASSKEY_EVENT_ID")
    owner_id = os.getenv("PASSKEY_OWNER_ID")

    if not all([token_url, event_id, owner_id]):
        print("Missing environment variables!")
        return

    client = PasskeyClient(
        token_url=token_url,
        event_id=event_id,
        owner_id=owner_id,
    )

    check_in = date(2026, 7, 29)
    check_out = date(2026, 8, 3)

    print(f"Testing multi-night scrape from {check_in} to {check_out}...")
    print("=" * 60)

    result = await client.scrape_individual_nights(check_in, check_out)

    if result is None:
        print("ERROR: No result returned")
        await client.close()
        return

    print(f"\nTotal hotels seen: {len(result.hotels)}")
    print(f"Total room-night records: {len(result.nights)}")

    if result.nights:
        # Group by hotel
        hotels_with_availability = {}
        for night in result.nights:
            key = (night.hotel_id, night.hotel_name)
            if key not in hotels_with_availability:
                hotels_with_availability[key] = {}
            if night.room_type not in hotels_with_availability[key]:
                hotels_with_availability[key][night.room_type] = []
            hotels_with_availability[key][night.room_type].append({
                "date": night.night_date,
                "available": night.available_count,
                "rate": night.nightly_rate,
            })

        print(f"\nHotels with availability: {len(hotels_with_availability)}")
        print("=" * 60)

        for (hotel_id, hotel_name), rooms in hotels_with_availability.items():
            print(f"\n{hotel_name} (ID: {hotel_id})")
            for room_type, nights in rooms.items():
                print(f"  Room: {room_type}")
                for night in sorted(nights, key=lambda x: x["date"]):
                    print(f"    {night['date']}: {night['available']} rooms @ ${night['rate']:.2f}")

                # Show availability summary
                available_nights = [n for n in nights if n["available"] > 0]
                total_nights = len(nights)
                print(f"    -> {len(available_nights)}/{total_nights} nights available")
    else:
        print("\nNo availability found for any night!")
        print("This could mean all hotels are fully booked for all nights.")

    await client.close()
    print("\n" + "=" * 60)
    print("Test complete!")


if __name__ == "__main__":
    asyncio.run(test_multi_night())
