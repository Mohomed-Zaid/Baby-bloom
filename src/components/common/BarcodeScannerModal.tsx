import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Camera,
  X,
  Volume2,
  VolumeX,
  Zap,
  ZapOff,
  RefreshCw,
  Barcode,
  CheckCircle,
  AlertCircle,
  Keyboard,
} from 'lucide-react'

export interface BarcodeScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScan: (barcode: string) => Promise<boolean | void> | boolean | void
  title?: string
}

// Crisp synthesized POS barcode scanner beep using Web Audio API
export function playBarcodeBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(1760, ctx.currentTime) // A6 clean supermarket beep
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.11)
  } catch {
    // Ignore audio autoplay restrictions
  }
}

interface ScannedHistoryItem {
  code: string
  time: string
  success: boolean
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Barcode Scanner',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')
  const [torchOn, setTorchOn] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [continuousMode, setContinuousMode] = useState(true)
  const [manualCode, setManualCode] = useState('')
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null)
  const [scanHistory, setScanHistory] = useState<ScannedHistoryItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const isScanningRef = useRef(false)
  const lastCodeTimeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 })

  // ── Stop Camera Stream ─────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop()
      })
      setStream(null)
    }
  }, [stream])

  // ── Start Camera Stream ────────────────────────────────────────────────────
  const startCamera = useCallback(
    async (deviceId?: string) => {
      stopCamera()
      setCameraError(null)

      try {
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
          audio: false,
        }

        const newStream = await navigator.mediaDevices.getUserMedia(constraints)
        setStream(newStream)

        if (videoRef.current) {
          videoRef.current.srcObject = newStream
          await videoRef.current.play()
        }

        // Check if torch / flashlight is supported
        const track = newStream.getVideoTracks()[0]
        if (track) {
          const capabilities = (track.getCapabilities?.() as { torch?: boolean }) || {}
          setHasTorch(Boolean(capabilities.torch))
        }

        // Enumerate video devices
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(d => d.kind === 'videoinput')
        setCameras(videoDevices)
        if (videoDevices.length > 0 && !deviceId) {
          setSelectedCameraId(videoDevices[0]?.deviceId || '')
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unable to access camera.'
        if (message.includes('Permission') || message.includes('denied')) {
          setCameraError('Camera permission denied. Please allow camera access in browser settings.')
        } else if (message.includes('not found') || message.includes('DevicesNotFoundError')) {
          setCameraError('No camera found on this device. You can type or use a USB barcode scanner below.')
        } else {
          setCameraError(`Camera error: ${message}`)
        }
      }
    },
    [stopCamera]
  )

  // ── Toggle Torch ───────────────────────────────────────────────────────────
  const toggleTorch = async () => {
    if (!stream) return
    const track = stream.getVideoTracks()[0]
    if (!track) return

    try {
      const next = !torchOn
      await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
        advanced: [{ torch: next }],
      })
      setTorchOn(next)
    } catch {
      // Torch failed
    }
  }

  // ── Handle Scanned Barcode ─────────────────────────────────────────────────
  const processDetectedBarcode = useCallback(
    async (rawCode: string) => {
      const clean = rawCode.trim()
      if (!clean) return

      // Debounce the exact same code within 1.5 seconds in continuous mode
      const now = Date.now()
      if (lastCodeTimeRef.current.code === clean && now - lastCodeTimeRef.current.time < 1500) {
        return
      }

      lastCodeTimeRef.current = { code: clean, time: now }
      setLastScannedCode(clean)

      if (soundEnabled) {
        playBarcodeBeep()
      }

      setIsProcessing(true)
      let isSuccess = true

      try {
        const res = await onScan(clean)
        if (res === false) {
          isSuccess = false
        }
      } catch {
        isSuccess = false
      } finally {
        setIsProcessing(false)
      }

      const timeStr = new Date().toLocaleTimeString('en-LK', { hour12: false })
      setScanHistory(prev => [{ code: clean, time: timeStr, success: isSuccess }, ...prev.slice(0, 7)])

      if (!continuousMode) {
        stopCamera()
        onClose()
      }
    },
    [continuousMode, onScan, onClose, soundEnabled, stopCamera]
  )

  // ── Barcode Detection Loop (Using Hardware BarcodeDetector if available) ───
  useEffect(() => {
    if (!isOpen || !stream || !videoRef.current) return

    isScanningRef.current = true
    let animationFrameId: number

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BarcodeDetectorClass = (window as any).BarcodeDetector

    if (BarcodeDetectorClass) {
      try {
        const detector = new BarcodeDetectorClass({
          formats: [
            'ean_13',
            'ean_8',
            'code_128',
            'code_39',
            'upc_a',
            'upc_e',
            'qr_code',
            'itf',
            'codabar',
          ],
        })

        const scanFrame = async () => {
          if (!isScanningRef.current || !videoRef.current) return

          if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            try {
              const barcodes = await detector.detect(videoRef.current)
              if (barcodes && barcodes.length > 0) {
                const detected = barcodes[0]?.rawValue
                if (detected) {
                  await processDetectedBarcode(detected)
                }
              }
            } catch {
              // Frame detection skipped
            }
          }

          if (isScanningRef.current) {
            // Scan every ~120ms to save CPU
            setTimeout(() => {
              animationFrameId = requestAnimationFrame(scanFrame)
            }, 120)
          }
        }

        animationFrameId = requestAnimationFrame(scanFrame)
      } catch {
        // Fallback
      }
    }

    return () => {
      isScanningRef.current = false
      cancelAnimationFrame(animationFrameId)
    }
  }, [isOpen, stream, processDetectedBarcode])

  // Lifecycle: Start camera when opened, stop when closed
  useEffect(() => {
    if (isOpen) {
      void startCamera()
    } else {
      stopCamera()
      setLastScannedCode(null)
      setScanHistory([])
    }
    return () => {
      stopCamera()
    }
  }, [isOpen, startCamera, stopCamera])

  // Handle Manual Submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualCode.trim()) return
    void processDetectedBarcode(manualCode.trim())
    setManualCode('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-xs">
      <div className="bg-[#031514] border border-[#144743] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-[#144743] bg-[#041c19]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-emerald-950/80 border border-emerald-600/60 flex items-center justify-center text-emerald-400">
              <Barcode size={18} />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">{title}</h3>
              <p className="text-[10px] text-teal-400/80">
                Point camera at barcode or enter manually
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSoundEnabled(prev => !prev)}
              className={`p-1.5 rounded transition ${
                soundEnabled ? 'text-teal-300 hover:text-white bg-[#082d29]' : 'text-gray-500 bg-[#082d29]'
              }`}
              title={soundEnabled ? 'Mute beep' : 'Enable beep'}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-1.5 rounded transition ${
                  torchOn ? 'text-amber-400 bg-amber-950/80 border border-amber-600' : 'text-teal-300 bg-[#082d29]'
                }`}
                title="Toggle Flashlight"
              >
                {torchOn ? <Zap size={16} /> : <ZapOff size={16} />}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                stopCamera()
                onClose()
              }}
              className="p-1.5 rounded text-teal-400 hover:text-white hover:bg-[#0c3632] transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Video Viewport with Scan Reticle */}
        <div className="relative bg-black aspect-video sm:aspect-4/3 flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Visual Scanner Overlay */}
          {!cameraError && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* Target Bounding Box */}
              <div className="relative w-64 h-36 border-2 border-dashed border-emerald-400/70 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                {/* Corner Accents */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-emerald-400" />

                {/* Animated Red Laser Scan Line */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-pulse" />
              </div>
            </div>
          )}

          {/* Camera Error Message */}
          {cameraError && (
            <div className="absolute inset-0 bg-[#031514]/95 p-6 flex flex-col items-center justify-center text-center">
              <AlertCircle size={36} className="text-amber-400 mb-2" />
              <p className="text-sm font-bold text-white mb-1">Camera Not Available</p>
              <p className="text-xs text-teal-300/80 mb-4 max-w-xs">{cameraError}</p>
              <button
                type="button"
                onClick={() => void startCamera(selectedCameraId)}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-bold flex items-center gap-1.5 transition"
              >
                <RefreshCw size={13} /> Retry Camera
              </button>
            </div>
          )}

          {/* Last Scanned Code Banner */}
          {lastScannedCode && (
            <div className="absolute top-2 left-2 right-2 bg-emerald-950/90 border border-emerald-500 text-white px-3 py-1.5 rounded flex items-center justify-between text-xs backdrop-blur-xs animate-in fade-in duration-150">
              <span className="flex items-center gap-1.5 text-emerald-300 font-bold font-mono">
                <CheckCircle size={14} className="text-emerald-400" />
                {lastScannedCode}
              </span>
              <span className="text-[10px] text-teal-200">
                {isProcessing ? 'Adding...' : 'Detected'}
              </span>
            </div>
          )}
        </div>

        {/* Controls & Camera Selector */}
        <div className="p-3 bg-[#041c19] border-t border-[#144743] space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            {/* Camera switch if multiple */}
            {cameras.length > 1 && (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <Camera size={14} className="text-teal-400 shrink-0" />
                <select
                  value={selectedCameraId}
                  onChange={e => {
                    setSelectedCameraId(e.target.value)
                    void startCamera(e.target.value)
                  }}
                  className="bg-[#082d29] border border-[#1d635c] rounded px-2 h-7 text-white text-[11px] truncate flex-1 focus:outline-none focus:border-[#00d2ff]"
                >
                  {cameras.map((c, idx) => (
                    <option key={c.deviceId} value={c.deviceId}>
                      {c.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Continuous Mode Toggle */}
            <label className="flex items-center gap-1.5 text-teal-200 font-semibold cursor-pointer shrink-0 ml-auto">
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={e => setContinuousMode(e.target.checked)}
                className="rounded border-[#1d635c] text-emerald-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="text-[11px]">Continuous Mode</span>
            </label>
          </div>

          {/* Manual Barcode Input Fallback */}
          <form onSubmit={handleManualSubmit} className="flex gap-1.5">
            <div className="relative flex-1">
              <Keyboard size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-teal-400" />
              <input
                type="text"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="Type or paste barcode..."
                className="w-full bg-[#082d29] border border-[#1d635c] rounded pl-8 pr-2 h-8 text-white text-xs font-mono placeholder:text-teal-500/70 focus:outline-none focus:border-[#00d2ff]"
              />
            </div>
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs h-8 px-3 rounded transition cursor-pointer"
            >
              Add
            </button>
          </form>

          {/* Recent Scans History (in Continuous Mode) */}
          {scanHistory.length > 0 && (
            <div className="pt-1 border-t border-[#092f2b]">
              <div className="text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">
                Recent Scans
              </div>
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {scanHistory.map((item, idx) => (
                  <span
                    key={`${item.code}-${idx}`}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 ${
                      item.success
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-red-950 text-red-300 border border-red-800'
                    }`}
                  >
                    {item.code} <span className="text-[9px] opacity-60">{item.time}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
