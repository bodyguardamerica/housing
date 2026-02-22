'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface DataPoint {
  timestamp: string
  available_count: number
  total_price: number
  room_type: string
}

interface AvailabilityChartProps {
  data: DataPoint[]
  hotelName: string
}

export function AvailabilityChart({ data, hotelName }: AvailabilityChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
        <p>No historical data available for this hotel.</p>
      </div>
    )
  }

  // Format data for the chart
  const chartData = data.map((point) => ({
    ...point,
    time: new Date(point.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }))

  // Get unique room types for legend
  const roomTypes = [...new Set(data.map((d) => d.room_type))]
  const colors = [
    '#1e3a8a',
    '#fbbf24',
    '#10b981',
    '#ef4444',
    '#8b5cf6',
    '#f97316',
  ]

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Availability History: {hotelName}
      </h3>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 12 }}
              tickMargin={10}
            />
            <YAxis
              yAxisId="left"
              label={{
                value: 'Rooms Available',
                angle: -90,
                position: 'insideLeft',
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              label={{
                value: 'Total Price ($)',
                angle: 90,
                position: 'insideRight',
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
              }}
            />
            <Legend />
            {roomTypes.slice(0, 6).map((roomType, index) => (
              <Line
                key={roomType}
                yAxisId="left"
                type="stepAfter"
                dataKey="available_count"
                data={chartData.filter((d) => d.room_type === roomType)}
                name={roomType}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-gray-500 mt-4 text-center">
        Data points are recorded every time availability changes
      </p>
    </div>
  )
}
