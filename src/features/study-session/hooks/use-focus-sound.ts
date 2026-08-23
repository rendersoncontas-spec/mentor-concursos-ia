"use client"

import { useRef, useState, useCallback, useEffect, useMemo } from "react"

export type FocusSoundId =
  | "off"
  | "rain"
  | "library"
  | "cafe"
  | "waves"
  | "fireplace"
  | "brown_noise"
  | "pink_noise"
  | "white_noise"

export const FOCUS_SOUND_OPTIONS: { id: FocusSoundId; label: string; icon: string }[] = [
  { id: "off", label: "Desativado", icon: "🔇" },
  { id: "rain", label: "Chuva Suave 🌧️", icon: "🌧️" },
  { id: "library", label: "Biblioteca Silenciosa 📚", icon: "📚" },
  { id: "cafe", label: "Cafeteria Aconchegante ☕", icon: "☕" },
  { id: "waves", label: "Ondas do Mar 🌊", icon: "🌊" },
  { id: "fireplace", label: "Lareira / Fogueira 🔥", icon: "🔥" },
  { id: "brown_noise", label: "Brown Noise (Foco Profundo)", icon: "🎧" },
  { id: "pink_noise", label: "Pink Noise (Aveludado)", icon: "🌸" },
  { id: "white_noise", label: "White Noise Suave", icon: "⚪" },
]

export const FOCUS_SOUND_LABELS: Record<FocusSoundId, string> = {
  off: "",
  rain: "Chuva Suave",
  library: "Biblioteca",
  cafe: "Cafeteria",
  waves: "Ondas do Mar",
  fireplace: "Lareira",
  brown_noise: "Brown Noise",
  pink_noise: "Pink Noise",
  white_noise: "White Noise",
}

const PREF_KEY = "mentor-focus-sound-pref"
const DEFAULT_VOLUME = 35

interface FocusSoundPref {
  sound: FocusSoundId
  volume: number
}

function loadPref(): FocusSoundPref {
  if (typeof window === "undefined") return { sound: "off", volume: DEFAULT_VOLUME }
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (!raw) return { sound: "off", volume: DEFAULT_VOLUME }
    const parsed = JSON.parse(raw) as Partial<FocusSoundPref>
    return {
      sound: parsed.sound ?? "off",
      volume: typeof parsed.volume === "number" ? parsed.volume : DEFAULT_VOLUME,
    }
  } catch {
    return { sound: "off", volume: DEFAULT_VOLUME }
  }
}

function savePref(pref: FocusSoundPref) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(pref))
  } catch {
    // ignore
  }
}

interface AudioGraphNode {
  sources: (AudioBufferSourceNode | OscillatorNode)[]
  gains: GainNode[]
  intervals: number[]
}

export function useFocusSound() {
  const [selectedSound, setSelectedSound] = useState<FocusSoundId>(() => loadPref().sound)
  const [volume, setVolume] = useState(() => loadPref().volume)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const activeGraphRef = useRef<AudioGraphNode | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const currentSoundRef = useRef<FocusSoundId>(selectedSound)

  const persistPref = useCallback((sound: FocusSoundId, vol: number) => {
    savePref({ sound, volume: vol })
  }, [])

  const cleanupNodes = useCallback(() => {
    if (activeGraphRef.current) {
      const { sources, gains, intervals } = activeGraphRef.current
      intervals.forEach((id) => clearInterval(id))
      sources.forEach((src) => {
        try {
          src.stop()
        } catch {
          /* already stopped */
        }
        try {
          src.disconnect()
        } catch {
          /* */
        }
      })
      gains.forEach((g) => {
        try {
          g.disconnect()
        } catch {
          /* */
        }
      })
      activeGraphRef.current = null
    }
  }, [])

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null
    if (!audioContextRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return null
      audioContextRef.current = new AudioCtx()
      masterGainRef.current = audioContextRef.current.createGain()
      masterGainRef.current.gain.value = 0
      masterGainRef.current.connect(audioContextRef.current.destination)
    }
    return audioContextRef.current
  }, [])

  // Gerador de buffer estéreo suave (livre de chiados secos)
  const createStereoPinkBuffer = useCallback((ctx: AudioContext, seconds = 6): AudioBuffer => {
    const bufferSize = ctx.sampleRate * seconds
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate)
    const left = buffer.getChannelData(0)
    const right = buffer.getChannelData(1)

    // Voss-McCartney com filtro quente para eliminar qualquer estática irritante
    let b0L = 0, b1L = 0, b2L = 0, b3L = 0, b4L = 0, b5L = 0
    let b0R = 0, b1R = 0, b2R = 0, b3R = 0, b4R = 0, b5R = 0

    for (let i = 0; i < bufferSize; i++) {
      const whiteL = Math.random() * 2 - 1
      b0L = 0.99886 * b0L + whiteL * 0.0555179
      b1L = 0.99332 * b1L + whiteL * 0.0750759
      b2L = 0.96900 * b2L + whiteL * 0.1538520
      b3L = 0.86650 * b3L + whiteL * 0.3104856
      b4L = 0.55000 * b4L + whiteL * 0.5329522
      b5L = -0.7616 * b5L - whiteL * 0.0168980
      left[i] = (b0L + b1L + b2L + b3L + b4L + b5L + whiteL * 0.25) * 0.12

      const whiteR = Math.random() * 2 - 1
      b0R = 0.99886 * b0R + whiteR * 0.0555179
      b1R = 0.99332 * b1R + whiteR * 0.0750759
      b2R = 0.96900 * b2R + whiteR * 0.1538520
      b3R = 0.86650 * b3R + whiteR * 0.3104856
      b4R = 0.55000 * b4R + whiteR * 0.5329522
      b5R = -0.7616 * b5R - whiteR * 0.0168980
      right[i] = (b0R + b1R + b2R + b3R + b4R + b5R + whiteR * 0.25) * 0.12
    }

    return buffer
  }, [])

  const createStereoBrownBuffer = useCallback((ctx: AudioContext, seconds = 6): AudioBuffer => {
    const bufferSize = ctx.sampleRate * seconds
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate)
    const left = buffer.getChannelData(0)
    const right = buffer.getChannelData(1)

    let lastOutL = 0
    let lastOutR = 0

    for (let i = 0; i < bufferSize; i++) {
      const whiteL = Math.random() * 2 - 1
      lastOutL = (lastOutL + 0.02 * whiteL) / 1.02
      left[i] = lastOutL * 2.8

      const whiteR = Math.random() * 2 - 1
      lastOutR = (lastOutR + 0.02 * whiteR) / 1.02
      right[i] = lastOutR * 2.8
    }

    return buffer
  }, [])

  // 1. CHUVA SUAVE (Som orgânico, aveludado e dinâmico com rajadas calmas)
  const buildRainGraph = useCallback(
    (ctx: AudioContext, master: GainNode): AudioGraphNode => {
      const sources: (AudioBufferSourceNode | OscillatorNode)[] = []
      const gains: GainNode[] = []
      const intervals: number[] = []

      const pinkBuf = createStereoPinkBuffer(ctx, 8)
      const brownBuf = createStereoBrownBuffer(ctx, 8)

      // Camada 1: Corpo da chuva (Pink Noise com corte passa-baixas quente)
      const rainBody = ctx.createBufferSource()
      rainBody.buffer = pinkBuf
      rainBody.loop = true
      const lpFilter = ctx.createBiquadFilter()
      lpFilter.type = "lowpass"
      lpFilter.frequency.value = 680
      lpFilter.Q.value = 0.7

      const rainGain = ctx.createGain()
      rainGain.gain.value = 0.45

      // LFO lento para oscilação natural da intensidade da chuva
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.12
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 160
      lfo.connect(lfoGain)
      lfoGain.connect(lpFilter.frequency)

      rainBody.connect(lpFilter)
      lpFilter.connect(rainGain)
      rainGain.connect(master)

      rainBody.start()
      lfo.start()
      sources.push(rainBody, lfo)
      gains.push(rainGain, lfoGain)

      // Camada 2: Grave da tempestade distante (Brown Noise aveludado)
      const deepThunder = ctx.createBufferSource()
      deepThunder.buffer = brownBuf
      deepThunder.loop = true
      const deepFilter = ctx.createBiquadFilter()
      deepFilter.type = "lowpass"
      deepFilter.frequency.value = 220
      const deepGain = ctx.createGain()
      deepGain.gain.value = 0.35

      deepThunder.connect(deepFilter)
      deepFilter.connect(deepGain)
      deepGain.connect(master)

      deepThunder.start()
      sources.push(deepThunder)
      gains.push(deepGain)

      // Camada 3: Gotas suaves aleatórias sintetizadas com ressonância limpa
      const dropInterval = window.setInterval(() => {
        if (!audioContextRef.current || audioContextRef.current.state !== "running") return
        try {
          const osc = ctx.createOscillator()
          const dropGain = ctx.createGain()
          const freq = 1200 + Math.random() * 800
          osc.type = "sine"
          osc.frequency.setValueAtTime(freq, ctx.currentTime)
          osc.frequency.exponentialRampToValueAtTime(freq * 0.6, ctx.currentTime + 0.08)

          dropGain.gain.setValueAtTime(0.02 + Math.random() * 0.02, ctx.currentTime)
          dropGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08)

          osc.connect(dropGain)
          dropGain.connect(master)
          osc.start()
          osc.stop(ctx.currentTime + 0.09)
        } catch {}
      }, 450)

      intervals.push(dropInterval)

      return { sources, gains, intervals }
    },
    [createStereoPinkBuffer, createStereoBrownBuffer]
  )

  // 2. BIBLIOTECA SILENCIOSA (Acústica acolhedora, ar-condicionado suave e paz profunda)
  const buildLibraryGraph = useCallback(
    (ctx: AudioContext, master: GainNode): AudioGraphNode => {
      const sources: (AudioBufferSourceNode | OscillatorNode)[] = []
      const gains: GainNode[] = []
      const intervals: number[] = []

      const brownBuf = createStereoBrownBuffer(ctx, 8)

      // Camada 1: Fundo acústico e ar-condicionado suave
      const hvacSource = ctx.createBufferSource()
      hvacSource.buffer = brownBuf
      hvacSource.loop = true

      const hvacFilter = ctx.createBiquadFilter()
      hvacFilter.type = "lowpass"
      hvacFilter.frequency.value = 190
      hvacFilter.Q.value = 1.0

      const hvacGain = ctx.createGain()
      hvacGain.gain.value = 0.4

      hvacSource.connect(hvacFilter)
      hvacFilter.connect(hvacGain)
      hvacGain.connect(master)

      hvacSource.start()
      sources.push(hvacSource)
      gains.push(hvacGain)

      // Camada 2: Ressonância ambiente aveludada
      const airOsc = ctx.createOscillator()
      airOsc.type = "sine"
      airOsc.frequency.value = 68
      const airGain = ctx.createGain()
      airGain.gain.value = 0.015

      airOsc.connect(airGain)
      airGain.connect(master)
      airOsc.start()
      sources.push(airOsc)
      gains.push(airGain)

      return { sources, gains, intervals }
    },
    [createStereoBrownBuffer]
  )

  // 3. CAFETERIA ACONCHEGANTE (Murmúrio distante e caloroso, xícaras sutis)
  const buildCafeGraph = useCallback(
    (ctx: AudioContext, master: GainNode): AudioGraphNode => {
      const sources: (AudioBufferSourceNode | OscillatorNode)[] = []
      const gains: GainNode[] = []
      const intervals: number[] = []

      const pinkBuf = createStereoPinkBuffer(ctx, 8)
      const brownBuf = createStereoBrownBuffer(ctx, 8)

      // Camada 1: Murmúrio distante suave (Formantes vocais quentes)
      const murmurSource = ctx.createBufferSource()
      murmurSource.buffer = pinkBuf
      murmurSource.loop = true

      const formant1 = ctx.createBiquadFilter()
      formant1.type = "bandpass"
      formant1.frequency.value = 480
      formant1.Q.value = 1.8

      const murmurGain = ctx.createGain()
      murmurGain.gain.value = 0.28

      murmurSource.connect(formant1)
      formant1.connect(murmurGain)
      murmurGain.connect(master)

      murmurSource.start()
      sources.push(murmurSource)
      gains.push(murmurGain)

      // Camada 2: Grave do ambiente da cafeteria
      const ambientBase = ctx.createBufferSource()
      ambientBase.buffer = brownBuf
      ambientBase.loop = true
      const baseFilter = ctx.createBiquadFilter()
      baseFilter.type = "lowpass"
      baseFilter.frequency.value = 260
      const baseGain = ctx.createGain()
      baseGain.gain.value = 0.35

      ambientBase.connect(baseFilter)
      baseFilter.connect(baseGain)
      baseGain.connect(master)

      ambientBase.start()
      sources.push(ambientBase)
      gains.push(baseGain)

      // Camada 3: Toque ocasional de louça/xícara de café
      const clinkInterval = window.setInterval(() => {
        if (!audioContextRef.current || audioContextRef.current.state !== "running") return
        if (Math.random() > 0.45) return
        try {
          const osc = ctx.createOscillator()
          const clinkGain = ctx.createGain()
          const freq = 2200 + Math.random() * 600
          osc.type = "sine"
          osc.frequency.setValueAtTime(freq, ctx.currentTime)

          clinkGain.gain.setValueAtTime(0.015, ctx.currentTime)
          clinkGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)

          osc.connect(clinkGain)
          clinkGain.connect(master)
          osc.start()
          osc.stop(ctx.currentTime + 0.14)
        } catch {}
      }, 3500)

      intervals.push(clinkInterval)

      return { sources, gains, intervals }
    },
    [createStereoPinkBuffer, createStereoBrownBuffer]
  )

  // 4. ONDAS DO MAR (Ritmo hipnótico e relaxante)
  const buildWavesGraph = useCallback(
    (ctx: AudioContext, master: GainNode): AudioGraphNode => {
      const sources: (AudioBufferSourceNode | OscillatorNode)[] = []
      const gains: GainNode[] = []
      const intervals: number[] = []

      const pinkBuf = createStereoPinkBuffer(ctx, 8)
      const brownBuf = createStereoBrownBuffer(ctx, 8)

      const waveSource = ctx.createBufferSource()
      waveSource.buffer = pinkBuf
      waveSource.loop = true

      const waveFilter = ctx.createBiquadFilter()
      waveFilter.type = "lowpass"
      waveFilter.frequency.value = 450
      waveFilter.Q.value = 1.2

      const waveGain = ctx.createGain()
      waveGain.gain.value = 0.3

      // LFO lento para o vai-e-vem das ondas (ciclo de ~12s)
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.08
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 350

      lfo.connect(lfoGain)
      lfoGain.connect(waveFilter.frequency)

      const lfoVol = ctx.createGain()
      lfoVol.gain.value = 0.22
      lfo.connect(lfoVol)
      lfoVol.connect(waveGain.gain)

      waveSource.connect(waveFilter)
      waveFilter.connect(waveGain)
      waveGain.connect(master)

      // Base profunda da onda
      const deepOcean = ctx.createBufferSource()
      deepOcean.buffer = brownBuf
      deepOcean.loop = true
      const deepFilter = ctx.createBiquadFilter()
      deepFilter.type = "lowpass"
      deepFilter.frequency.value = 160
      const deepGain = ctx.createGain()
      deepGain.gain.value = 0.3

      deepOcean.connect(deepFilter)
      deepFilter.connect(deepGain)
      deepGain.connect(master)

      waveSource.start()
      deepOcean.start()
      lfo.start()

      sources.push(waveSource, deepOcean, lfo)
      gains.push(waveGain, deepGain, lfoGain, lfoVol)

      return { sources, gains, intervals }
    },
    [createStereoPinkBuffer, createStereoBrownBuffer]
  )

  // 5. LAREIRA / FOGUEIRA (Calor acústico aconchegante)
  const buildFireplaceGraph = useCallback(
    (ctx: AudioContext, master: GainNode): AudioGraphNode => {
      const sources: (AudioBufferSourceNode | OscillatorNode)[] = []
      const gains: GainNode[] = []
      const intervals: number[] = []

      const brownBuf = createStereoBrownBuffer(ctx, 8)

      const fireBase = ctx.createBufferSource()
      fireBase.buffer = brownBuf
      fireBase.loop = true
      const fireFilter = ctx.createBiquadFilter()
      fireFilter.type = "lowpass"
      fireFilter.frequency.value = 240
      const fireGain = ctx.createGain()
      fireGain.gain.value = 0.4

      fireBase.connect(fireFilter)
      fireFilter.connect(fireGain)
      fireGain.connect(master)

      fireBase.start()
      sources.push(fireBase)
      gains.push(fireGain)

      // Estalidos suaves e acolhedores da lenha
      const crackleInterval = window.setInterval(() => {
        if (!audioContextRef.current || audioContextRef.current.state !== "running") return
        if (Math.random() > 0.6) return
        try {
          const osc = ctx.createOscillator()
          const crackleGain = ctx.createGain()
          osc.type = "sine"
          osc.frequency.setValueAtTime(600 + Math.random() * 800, ctx.currentTime)

          crackleGain.gain.setValueAtTime(0.018, ctx.currentTime)
          crackleGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04)

          osc.connect(crackleGain)
          crackleGain.connect(master)
          osc.start()
          osc.stop(ctx.currentTime + 0.05)
        } catch {}
      }, 180)

      intervals.push(crackleInterval)

      return { sources, gains, intervals }
    },
    [createStereoBrownBuffer]
  )

  // 6. BROWN NOISE (Foco profundo, aveludado, zero agudos)
  const buildBrownNoiseGraph = useCallback(
    (ctx: AudioContext, master: GainNode): AudioGraphNode => {
      const brownBuf = createStereoBrownBuffer(ctx, 8)
      const src = ctx.createBufferSource()
      src.buffer = brownBuf
      src.loop = true

      const filter = ctx.createBiquadFilter()
      filter.type = "lowpass"
      filter.frequency.value = 280
      filter.Q.value = 0.7

      const gain = ctx.createGain()
      gain.gain.value = 0.5

      src.connect(filter)
      filter.connect(gain)
      gain.connect(master)
      src.start()

      return { sources: [src], gains: [gain], intervals: [] }
    },
    [createStereoBrownBuffer]
  )

  // 7. PINK NOISE (Equilíbrio aveludado para foco)
  const buildPinkNoiseGraph = useCallback(
    (ctx: AudioContext, master: GainNode): AudioGraphNode => {
      const pinkBuf = createStereoPinkBuffer(ctx, 8)
      const src = ctx.createBufferSource()
      src.buffer = pinkBuf
      src.loop = true

      const filter = ctx.createBiquadFilter()
      filter.type = "lowpass"
      filter.frequency.value = 420
      filter.Q.value = 0.7

      const gain = ctx.createGain()
      gain.gain.value = 0.45

      src.connect(filter)
      filter.connect(gain)
      gain.connect(master)
      src.start()

      return { sources: [src], gains: [gain], intervals: [] }
    },
    [createStereoPinkBuffer]
  )

  // 8. WHITE NOISE SUAVE (Filtrado para eliminar estática áspera)
  const buildWhiteNoiseGraph = useCallback(
    (ctx: AudioContext, master: GainNode): AudioGraphNode => {
      const pinkBuf = createStereoPinkBuffer(ctx, 8)
      const src = ctx.createBufferSource()
      src.buffer = pinkBuf
      src.loop = true

      const filter = ctx.createBiquadFilter()
      filter.type = "lowpass"
      filter.frequency.value = 850
      filter.Q.value = 0.5

      const gain = ctx.createGain()
      gain.gain.value = 0.35

      src.connect(filter)
      filter.connect(gain)
      gain.connect(master)
      src.start()

      return { sources: [src], gains: [gain], intervals: [] }
    },
    [createStereoPinkBuffer]
  )

  const stopSound = useCallback(() => {
    const ctx = audioContextRef.current
    const master = masterGainRef.current
    if (ctx && master) {
      try {
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15)
      } catch {
        // context may be closed
      }
    }
    setTimeout(() => {
      cleanupNodes()
    }, 180)
    setIsPlaying(false)
  }, [cleanupNodes])

  const startSound = useCallback(
    async (sound: FocusSoundId) => {
      if (sound === "off") {
        stopSound()
        return
      }

      const ctx = ensureContext()
      if (!ctx || !masterGainRef.current) return

      try {
        if (ctx.state === "suspended") {
          await ctx.resume()
        }
      } catch {
        // Autoplay policy — will work after user interaction
      }

      cleanupNodes()

      let graph: AudioGraphNode | null = null
      if (sound === "rain") graph = buildRainGraph(ctx, masterGainRef.current)
      else if (sound === "library") graph = buildLibraryGraph(ctx, masterGainRef.current)
      else if (sound === "cafe") graph = buildCafeGraph(ctx, masterGainRef.current)
      else if (sound === "waves") graph = buildWavesGraph(ctx, masterGainRef.current)
      else if (sound === "fireplace") graph = buildFireplaceGraph(ctx, masterGainRef.current)
      else if (sound === "brown_noise") graph = buildBrownNoiseGraph(ctx, masterGainRef.current)
      else if (sound === "pink_noise") graph = buildPinkNoiseGraph(ctx, masterGainRef.current)
      else if (sound === "white_noise") graph = buildWhiteNoiseGraph(ctx, masterGainRef.current)

      activeGraphRef.current = graph

      const vol = volume / 100
      masterGainRef.current.gain.setValueAtTime(masterGainRef.current.gain.value, ctx.currentTime)
      masterGainRef.current.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.15)

      currentSoundRef.current = sound
      setIsPlaying(true)
      setIsInitialized(true)
    },
    [
      ensureContext,
      cleanupNodes,
      buildRainGraph,
      buildLibraryGraph,
      buildCafeGraph,
      buildWavesGraph,
      buildFireplaceGraph,
      buildBrownNoiseGraph,
      buildPinkNoiseGraph,
      buildWhiteNoiseGraph,
      volume,
      stopSound,
    ]
  )

  const pauseSound = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx) return
    try {
      ctx.suspend()
    } catch {
      /* */
    }
    setIsPlaying(false)
  }, [])

  const resumeSound = useCallback(async () => {
    const ctx = audioContextRef.current
    if (!ctx) return
    try {
      await ctx.resume()
    } catch {
      /* */
    }
    setIsPlaying(true)
  }, [])

  const selectSound = useCallback(
    (sound: FocusSoundId) => {
      setSelectedSound(sound)
      currentSoundRef.current = sound
      persistPref(sound, volume)

      if (sound === "off") {
        stopSound()
      } else {
        void startSound(sound)
      }
    },
    [persistPref, volume, stopSound, startSound]
  )

  const changeVolume = useCallback(
    (vol: number) => {
      setVolume(vol)
      persistPref(selectedSound, vol)
      const ctx = audioContextRef.current
      const master = masterGainRef.current
      if (ctx && master && isPlaying) {
        const normalized = vol / 100
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
        master.gain.linearRampToValueAtTime(normalized, ctx.currentTime + 0.05)
      }
    },
    [persistPref, selectedSound, isPlaying]
  )

  const stopAll = useCallback(() => {
    stopSound()
    setSelectedSound("off")
    currentSoundRef.current = "off"
    persistPref("off", volume)
  }, [stopSound, persistPref, volume])

  useEffect(() => {
    return () => {
      cleanupNodes()
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close()
        } catch {
          /* */
        }
        audioContextRef.current = null
      }
    }
  }, [cleanupNodes])

  const activeSoundLabel = useMemo(() => {
    if (selectedSound === "off" || !isPlaying) return null
    return FOCUS_SOUND_LABELS[selectedSound] ?? null
  }, [selectedSound, isPlaying])

  return {
    selectedSound,
    volume,
    isPlaying,
    isInitialized,
    selectSound,
    changeVolume,
    startSound,
    stopSound,
    pauseSound,
    resumeSound,
    stopAll,
    activeSoundLabel,
  }
}
