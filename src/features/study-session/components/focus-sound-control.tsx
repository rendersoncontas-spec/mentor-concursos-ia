"use client"

import { useState } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  FOCUS_SOUND_OPTIONS,
  type FocusSoundId,
} from "../hooks/use-focus-sound"

interface FocusSoundControlProps {
  selectedSound: FocusSoundId
  volume: number
  isPlaying: boolean
  onSelectSound: (sound: FocusSoundId) => void
  onVolumeChange: (vol: number) => void
}

export function FocusSoundControl({
  selectedSound,
  volume,
  isPlaying,
  onSelectSound,
  onVolumeChange,
}: FocusSoundControlProps) {
  const [showVolume, setShowVolume] = useState(false)

  const isActive = selectedSound !== "off" && isPlaying

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-base shrink-0" aria-hidden>
          {isActive ? "🔊" : "🔇"}
        </span>
        <Select
          value={selectedSound}
          onValueChange={(val) => onSelectSound(val as FocusSoundId)}
        >
          <SelectTrigger
            className="h-7 text-[11px] flex-1 min-w-0"
            aria-label="Som de foco"
          >
            <SelectValue placeholder="Som de foco" />
          </SelectTrigger>
          <SelectContent className="z-[200]">
            {FOCUS_SOUND_OPTIONS.map((opt) => (
              <SelectItem key={opt.id} value={opt.id} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isActive && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="w-7 h-7 shrink-0"
            onClick={() => setShowVolume((s) => !s)}
            aria-label="Ajustar volume"
            title="Volume"
          >
            {volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>

      {isActive && showVolume && (
        <div className="flex items-center gap-2 px-1 py-1 rounded-md bg-muted/30 border border-border/40">
          <span className="text-[9px] font-bold text-muted-foreground uppercase shrink-0">
            Vol
          </span>
          <Slider
            value={[volume]}
            max={100}
            step={1}
            onValueChange={(vals) => {
              const v = vals[0]
              if (typeof v === "number") onVolumeChange(v)
            }}
            className="flex-1"
            aria-label="Volume do som de foco"
          />
          <span className="text-[10px] font-mono font-bold w-7 text-right shrink-0">
            {volume}%
          </span>
        </div>
      )}
    </div>
  )
}
