// Database types for Supabase
export interface Database {
  public: {
    Tables: {
      hotels: {
        Row: Hotel
        Insert: Omit<Hotel, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Hotel, 'id'>>
      }
      scrape_runs: {
        Row: ScrapeRun
        Insert: Omit<ScrapeRun, 'id'>
        Update: Partial<Omit<ScrapeRun, 'id'>>
      }
      room_snapshots: {
        Row: RoomSnapshot
        Insert: Omit<RoomSnapshot, 'id' | 'scraped_at' | 'num_nights'>
        Update: Partial<Omit<RoomSnapshot, 'id'>>
      }
      watchers: {
        Row: Watcher
        Insert: Omit<Watcher, 'id' | 'created_at'>
        Update: Partial<Omit<Watcher, 'id'>>
      }
      app_config: {
        Row: AppConfig
        Insert: AppConfig
        Update: Partial<AppConfig>
      }
    }
    Views: {
      latest_room_availability: {
        Row: RoomAvailability
      }
    }
  }
}

export interface Hotel {
  id: string
  passkey_hotel_id: number
  name: string
  address: string | null
  city: string
  state: string
  latitude: number | null
  longitude: number | null
  distance_from_icc: number | null
  distance_unit: number
  has_skywalk: boolean
  skywalk_manual: boolean
  year: number
  amenities: Record<string, unknown>
  area: string | null // downtown, suburbs, airport, etc.
  created_at: string
  updated_at: string
}

export interface ScrapeRun {
  id: string
  started_at: string
  completed_at: string | null
  status: 'running' | 'success' | 'error'
  error_message: string | null
  hotels_found: number
  rooms_found: number
  check_in: string
  check_out: string
  duration_ms: number | null
  year: number
  no_changes: boolean
}

export interface RoomSnapshot {
  id: string
  scrape_run_id: string
  hotel_id: string
  room_type: string
  room_description: string | null
  available_count: number
  nightly_rate: number | null
  total_price: number | null
  check_in: string
  check_out: string
  num_nights: number
  scraped_at: string
  year: number
  raw_block_data: Record<string, unknown> | null
}

export interface RoomAvailability {
  snapshot_id: string
  hotel_id: string
  passkey_hotel_id: number
  hotel_name: string
  address: string | null
  distance_from_icc: number | null
  distance_unit: number
  has_skywalk: boolean
  latitude: number | null
  longitude: number | null
  area: string | null // downtown, suburbs, airport, etc.
  room_type: string
  room_description: string | null
  available_count: number
  nightly_rate: number | null
  total_price: number | null
  check_in: string
  check_out: string
  num_nights: number
  scraped_at: string
  seconds_ago: number
  // Partial availability fields
  partial_availability?: boolean
  nights_available?: number
  total_nights?: number
  raw_block_data?: {
    nights?: Array<{ date: string; available: number; rate: number }>
    partial_availability?: boolean
    nights_available?: number
    total_nights?: number
  }
}

export interface Watcher {
  id: string
  email: string | null
  discord_webhook_url: string | null
  phone_number: string | null
  push_subscription: Record<string, unknown> | null
  manage_token_hash: string
  hotel_id: string | null
  max_price: number | null
  max_distance: number | null
  require_skywalk: boolean
  room_type_pattern: string | null
  active: boolean
  cooldown_minutes: number
  last_notified_at: string | null
  created_at: string
  year: number
  notifications_sent_today: number
  max_notifications_per_day: number
}

export interface AppConfig {
  key: string
  value: unknown
  description: string | null
  updated_at: string
}

// API Response types
export interface RoomsResponse {
  data: RoomAvailability[]
  meta: {
    last_scrape_at: string | null
    last_scrape_status: string | null
    total_rooms_available: number
    total_hotels_with_availability: number
    scraper_active: boolean
  }
}

export interface StatusResponse {
  scraper_active: boolean
  last_scrape: ScrapeRun | null
  scrapes_last_hour: number
  error_rate_last_hour: number
  database_size_mb: number | null
  banner_message: string | null
}

export interface ConfigResponse {
  current_year: number
  convention_start_date: string
  convention_end_date: string
  default_check_in: string
  default_check_out: string
  housing_first_day: string
  housing_last_day: string
  scraper_active: boolean
  site_banner_message: string | null
}

// Filter types
export interface RoomFilters {
  maxDistance?: number
  maxPrice?: number
  skywalkOnly?: boolean
  downtownOnly?: boolean
  hotelName?: string
  roomType?: string
  checkIn?: string
  checkOut?: string
  showSoldOut?: boolean
  sortBy?: 'distance' | 'price' | 'hotel_name' | 'available'
  sortDir?: 'asc' | 'desc'
}

// Local alert types (stored in localStorage)
// Available hotel area options
export const HOTEL_AREAS = {
  downtown: 'Downtown',
  'west/airport': 'West Side / Airport',
  east: 'East Side',
  north: 'North Side',
  south: 'South Side',
} as const

export type HotelArea = keyof typeof HOTEL_AREAS

export interface LocalAlert {
  id: string
  name: string
  hotelName?: string // Partial match on hotel name
  maxPrice?: number
  maxDistance?: number
  requireSkywalk?: boolean
  includedAreas?: string[] // Only match hotels in these areas (empty = all areas)
  minNightsAvailable?: number // Minimum nights that must be available
  createdAt: string
  enabled: boolean
  soundEnabled: boolean
  fullScreenEnabled: boolean // Show full-screen popup when match found
  discordWatcherId?: string // Linked Discord watcher ID (if Discord was enabled)
}

export interface AlertMatch {
  alertId: string
  alertName: string
  room: RoomAvailability
  matchedAt: string
}

export interface AlertsState {
  alerts: LocalAlert[]
  matches: AlertMatch[]
  lastMatchCheck: string | null
  soundMuted: boolean
  alarmSound: 'chime' | 'alert' | 'bell' | 'urgent' | 'gentle'
  volume: number // 0-1
}
