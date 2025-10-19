import { cn } from "@/lib/utils"

interface HorizontalBarProps {
  label: string
  value: number
  color: string
  maxValue?: number
  className?: string
}

export const HorizontalBar = ({ 
  label, 
  value, 
  color, 
  maxValue = 100,
  className 
}: HorizontalBarProps) => {
  const percentage = Math.min((value / maxValue) * 100, 100)
  
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-6 bg-muted rounded overflow-hidden">
        <div 
          className="h-full rounded transition-all duration-700 ease-out"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: color,
            opacity: 0.9
          }}
        />
      </div>
    </div>
  )
}
