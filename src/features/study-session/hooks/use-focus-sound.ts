"use client"

import { useRef, useState, useCallback, useEffect, useMemo } from "react"

export type FocusSoundId = "off" | "pink_noise" | "white_noise" | "brown_noise" | "rain" | "library" | "cafe"

export const FOCUS_SOUND_OPTIONS: { id: FocusSoundId; label: string; icon: string }[] = [
  { id: "off", label: "Desativado", icon: "" },
  { id: "pink_noise", label: "Pink Noise", icon: "" },
  { id: "white_noise", label: "White Noise", icon: "" },
  { id: "brown_noise", label: "Brown Noise", icon: "" },
  { id: "rain", label: "Chuva", icon: "" },
  { id: "library", label: "Biblioteca", icon: "" },
  { id: "cafe", label: "Cafeteria", icon: "" },
]

export const FOCUS_SOUND_LABELS: Record<FocusSoundId, string> = {
  off: "",
  pink_noise: "Pink Noise",
  white_noise: "White Noise",
  brown_noise: "Brown Noise",
  rain: "Chuva",
  library: "Biblioteca",
  cafe: "Cafeteria",
}

const PREF_KEY = "mentor-focus-sound-pref"
const DEFAULT_VOLUME = 30

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

interface NoiseNode {
  source: AudioBufferSourceNode
  gain: GainNode
  filter?: BiquadFilterNode
  lfo?: OscillatorNode
  lfoGain?: GainNode
}

export function useFocusSound() {
  const [selectedSound, setSelectedSound] = useState<FocusSoundId>(() => loadPref().sound)
  const [volume, setVolume] = useState(() => loadPref().volume)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const noiseNodesRef = useRef<NoiseNode[]>([])
  const masterGainRef = useRef<GainNode | null>(null)
  const currentSoundRef = useRef<FocusSoundId>(selectedSound)

  const persistPref = useCallback((sound: FocusSoundId, vol: number) => {
    savePref({ sound, volume: vol })
  }, [])

  const cleanupNodes = useCallback(() => {
    noiseNodesRef.current.forEach((node) => {
      try { node.source.stop() } catch { /* already stopped */ }
      try { node.source.disconnect() } catch { /* */ }
      try { node.gain.disconnect() } catch { /* */ }
      try { node.filter?.disconnect() } catch { /* */ }
      try { node.lfo?.stop() } catch { /* already stopped */ }
      try { node.lfo?.disconnect() } catch { /* */ }
      try { node.lfoGain?.disconnect() } catch { /* */ }
    })
    noiseNodesRef.current = []
  }, [])

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return null
      audioContextRef.current = new AudioCtx()
      masterGainRef.current = audioContextRef.current.createGain()
      masterGainRef.current.gain.value = 0
      masterGainRef.current.connect(audioContextRef.current.destination)
    }
    return audioContextRef.current
  }, [])

  const createNoiseBuffer = useCallback((ctx: AudioContext, type: FocusSoundId): AudioBuffer => {
    const bufferSize = ctx.sampleRate * 4
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)

    if (type === "white_noise") {
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }
    } else if (type === "pink_noise") {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.96900 * b2 + white * 0.1538520
        b3 = 0.86650 * b3 + white * 0.3104856
        b4 = 0.55000 * b4 + white * 0.5329522
        b5 = -0.7616 * b5 - white * 0.0168980
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.1
        b6 = white * 0.115926
      }
    } else if (type === "brown_noise") {
      let lastOut = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        lastOut = (lastOut + 0.02 * white) / 1.02
        data[i] = lastOut * 3.0
      }
    } else {
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }
    }

    return buffer
  }, [])

  const buildRainNodes = useCallback((ctx: AudioContext): NoiseNode[] => {
    const nodes: NoiseNode[] = []

    const bufferSize = ctx.sampleRate * 4
    const whiteBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const whiteData = whiteBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) whiteData[i] = Math.random() * 2 - 1

    const source = ctx.createBufferSource()
    source.buffer = whiteBuffer
    source.loop = true

    const gain = ctx.createGain()
    gain.gain.value = 0.5

    const lpFilter = ctx.createBiquadFilter()
    lpFilter.type = "lowpass"
    lpFilter.frequency.value = 1800
    lpFilter.Q.value = 0.5

    const hpFilter = ctx.createBiquadFilter()
    hpFilter.type = "highpass"
    hpFilter.frequency.value = 400

    source.connect(hpFilter)
    hpFilter.connect(lpFilter)
    lpFilter.connect(gain)

    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.3
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 200
    lfo.connect(lfoGain)
    lfoGain.connect(lpFilter.frequency)
    lfo.start()

    nodes.push({ source, gain, filter: lpFilter, lfo, lfoGain })
    return nodes
  }, [])

  const buildCafeNodes = useCallback((ctx: AudioContext): NoiseNode[] => {
    const nodes: NoiseNode[] = []

    const bufferSize = ctx.sampleRate * 4

    // Layer 1: Brown noise base (ambient hum)
    const brownBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const brownData = brownBuffer.getChannelData(0)
    let lastOut = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      lastOut = (lastOut + 0.02 * white) / 1.02
      brownData[i] = lastOut * 2.5
    }
    const brownSource = ctx.createBufferSource()
    brownSource.buffer = brownBuffer
    brownSource.loop = true
    const brownGain = ctx.createGain()
    brownGain.gain.value = 0.15
    const brownFilter = ctx.createBiquadFilter()
    brownFilter.type = "lowpass"
    brownFilter.frequency.value = 500
    brownSource.connect(brownFilter)
    brownFilter.connect(brownGain)
    nodes.push({ source: brownSource, gain: brownGain, filter: brownFilter })

    // Layer 2: Occasional clinks (high-freq bursts)
    const whiteBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const whiteData = whiteBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) whiteData[i] = Math.random() * 2 - 1
    const whiteSource = ctx.createBufferSource()
    whiteSource.buffer = whiteBuffer
    whiteSource.loop = true
    const whiteGain = ctx.createGain()
    whiteGain.gain.value = 0.08
    const whiteFilter = ctx.createBiquadFilter()
    whiteFilter.type = "bandpass"
    whiteFilter.frequency.value = 3000
    whiteFilter.Q.value = 2
    whiteSource.connect(whiteFilter)
    whiteFilter.connect(whiteGain)
    nodes.push({ source: whiteSource, gain: whiteGain, filter: whiteFilter })

    return nodes
  }, [])

  const buildLibraryNodes = useCallback((ctx: AudioContext): NoiseNode[] => {
    const nodes: NoiseNode[] = []

    const bufferSize = ctx.sampleRate * 4

    // Very soft brown noise — like HVAC / air conditioning
    const brownBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const brownData = brownBuffer.getChannelData(0)
    let lastOut = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      lastOut = (lastOut + 0.01 * white) / 1.01
      brownData[i] = lastOut * 1.5
    }
    const brownSource = ctx.createBufferSource()
    brownSource.buffer = brownBuffer
    brownSource.loop = true
    const brownGain = ctx.createGain()
    brownGain.gain.value = 0.1
    const brownFilter = ctx.createBiquadFilter()
    brownFilter.type = "lowpass"
    brownFilter.frequency.value = 300
    brownSource.connect(brownFilter)
    brownFilter.connect(brownGain)
    nodes.push({ source: brownSource, gain: brownGain, filter: brownFilter })

    // Occasional page-turn-like rustle
    const pinkBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const pinkData = pinkBuffer.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.96900 * b2 + white * 0.1538520
      b3 = 0.86650 * b3 + white * 0.3104856
      b4 = 0.55000 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.0168980
      pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.05
      b6 = white * 0.115926
    }
    const pinkSource = ctx.createBufferSource()
    pinkSource.buffer = pinkBuffer
    pinkSource.loop = true
    const pinkGain = ctx.createGain()
    pinkGain.gain.value = 0.04
    const pinkFilter = ctx.createBiquadFilter()
    pinkFilter.type = "bandpass"
    pinkFilter.frequency.value = 2000
    pinkFilter.Q.value = 0.7
    pinkSource.connect(pinkFilter)
    pinkFilter.connect(pinkGain)
    nodes.push({ source: pinkSource, gain: pinkGain, filter: pinkFilter })

    return nodes
  }, [])

  const buildNodes = useCallback((ctx: AudioContext, sound: FocusSoundId): NoiseNode[] => {
    if (sound === "pink_noise" || sound === "white_noise" || sound === "brown_noise") {
      const buffer = createNoiseBuffer(ctx, sound)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      const gain = ctx.createGain()
      gain.gain.value = 0.5
      source.connect(gain)
      return [{ source, gain }]
    }
    if (sound === "rain") return buildRainNodes(ctx)
    if (sound === "library") return buildLibraryNodes(ctx)
    if (sound === "cafe") return buildCafeNodes(ctx)
    return []
  }, [createNoiseBuffer, buildRainNodes, buildLibraryNodes, buildCafeNodes])

  const stopSound = useCallback(() => {
    const ctx = audioContextRef.current
    const master = masterGainRef.current
    if (ctx && master) {
      try {
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1)
      } catch {
        // context may be closed
      }
    }
    setTimeout(() => {
      cleanupNodes()
    }, 150)
    setIsPlaying(false)
  }, [cleanupNodes])

  const startSound = useCallback(async (sound: FocusSoundId) => {
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

    const newNodes = buildNodes(ctx, sound)
    const master = masterGainRef.current
    newNodes.forEach((node) => {
      node.gain.connect(master)
      try { node.source.start() } catch { /* already started */ }
    })
    noiseNodesRef.current = newNodes

    const vol = volume / 100
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
    master.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.1)

    currentSoundRef.current = sound
    setIsPlaying(true)
    setIsInitialized(true)
  }, [ensureContext, cleanupNodes, buildNodes, volume, stopSound])

  const pauseSound = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx) return
    try { ctx.suspend() } catch { /* */ }
    setIsPlaying(false)
  }, [])

  const resumeSound = useCallback(async () => {
    const ctx = audioContextRef.current
    if (!ctx) return
    try { await ctx.resume() } catch { /* */ }
    setIsPlaying(true)
  }, [])

  const selectSound = useCallback((sound: FocusSoundId) => {
    setSelectedSound(sound)
    currentSoundRef.current = sound
    persistPref(sound, volume)

    if (sound === "off") {
      stopSound()
    } else {
      void startSound(sound)
    }
  }, [persistPref, volume, stopSound, startSound])

  const changeVolume = useCallback((vol: number) => {
    setVolume(vol)
    persistPref(selectedSound, vol)
    const ctx = audioContextRef.current
    const master = masterGainRef.current
    if (ctx && master && isPlaying) {
      const normalized = vol / 100
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
      master.gain.linearRampToValueAtTime(normalized, ctx.currentTime + 0.05)
    }
  }, [persistPref, selectedSound, isPlaying])

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
        try { audioContextRef.current.close() } catch { /* */ }
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
