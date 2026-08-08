"use client"

import { useState } from "react"
import { Play, Pause, Square, Mic, Car } from "lucide-react"

interface DrivingModeViewProps {
  phase: string
  formattedTime: string
  onStart: () => void
  onPause: () => void
  onStop: () => void
}

export function DrivingModeView({ phase, formattedTime, onStart, onPause, onStop }: DrivingModeViewProps) {
  const [recording, setRecording] = useState(false)

  const isRunning = phase === 'STUDYING'

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] w-full bg-slate-950 text-white p-8 rounded-xl relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10 pointer-events-none flex items-center justify-center">
        <Car className="w-96 h-96" />
      </div>

      <div className="z-10 flex flex-col items-center space-y-12 w-full max-w-md">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold tracking-wider text-slate-300 uppercase flex items-center justify-center gap-3">
            <Car className="w-6 h-6 text-blue-500" />
            Modo Dirigindo
          </h2>
          <p className="text-slate-400">Áudio / Podcast</p>
        </div>

        <div className="text-8xl font-mono font-bold tracking-tighter tabular-nums text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]">
          {formattedTime}
        </div>

        <div className="grid grid-cols-2 gap-4 w-full">
          {!isRunning ? (
            <button
              type="button"
              onClick={onStart}
              className="col-span-2 h-32 rounded-3xl bg-blue-600 hover:bg-blue-500 flex flex-col items-center justify-center gap-3 transition-colors active:scale-95"
            >
              <Play className="w-12 h-12 fill-white" />
              <span className="font-bold text-xl uppercase tracking-wider">Iniciar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              className="col-span-2 h-32 rounded-3xl bg-amber-500 hover:bg-amber-400 flex flex-col items-center justify-center gap-3 transition-colors active:scale-95 text-amber-950"
            >
              <Pause className="w-12 h-12 fill-current" />
              <span className="font-bold text-xl uppercase tracking-wider">Pausar</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setRecording(!recording)}
            className={`h-24 rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors active:scale-95 ${
              recording ? "bg-red-500 text-white animate-pulse" : "bg-slate-800 hover:bg-slate-700 text-slate-300"
            }`}
          >
            <Mic className="w-8 h-8" />
            <span className="font-bold">{recording ? "Gravando..." : "Nota de Voz"}</span>
          </button>

          <button
            type="button"
            onClick={onStop}
            className="h-24 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex flex-col items-center justify-center gap-2 transition-colors active:scale-95"
          >
            <Square className="w-8 h-8 fill-current" />
            <span className="font-bold">Finalizar</span>
          </button>
        </div>
      </div>
    </div>
  )
}
