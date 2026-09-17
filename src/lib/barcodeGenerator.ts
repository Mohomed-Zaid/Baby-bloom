/**
 * Zero-dependency pure TypeScript Code 128-B / Auto Barcode SVG Generator
 * Generates vector SVG markup for high-precision thermal rolls and A4 label sheets.
 */

// Code 128 pattern table (107 patterns, each 11 modules wide, stop pattern is 13 modules)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112' // 100-106 (104: START B, 106: STOP)
]

const START_B = 104
const STOP = 106

export interface BarcodeRenderOptions {
  width?: number
  height?: number
  showText?: boolean
  fontSize?: number
  margin?: number
}

/**
 * Encodes ASCII string into Code 128-B bar pattern string ("101001...")
 */
export function encodeCode128B(text: string): { modules: string; checksum: number; valid: boolean } {
  if (!text || text.length === 0) {
    return { modules: '', checksum: 0, valid: false }
  }

  const values: number[] = [START_B]
  let sum = START_B

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 32 || code > 126) {
      // Out of ASCII printable range for Code 128-B, fallback to standard space
      values.push(0)
      sum += (i + 1) * 0
    } else {
      const val = code - 32
      values.push(val)
      sum += (i + 1) * val
    }
  }

  const checksum = sum % 103
  values.push(checksum)
  values.push(STOP)

  // Convert pattern digits (bar lengths, space lengths) into 1s and 0s
  let modules = ''
  for (const val of values) {
    const pattern = CODE128_PATTERNS[val]
    if (!pattern) continue
    let isBar = true
    for (let p = 0; p < pattern.length; p++) {
      const char = pattern[p]
      if (!char) continue
      const runLength = parseInt(char, 10)
      modules += (isBar ? '1' : '0').repeat(runLength)
      isBar = !isBar
    }
  }

  return { modules, checksum, valid: true }
}

/**
 * Returns SVG markup string for the given barcode value
 */
export function generateBarcodeSvg(value: string, options: BarcodeRenderOptions = {}): string {
  const {
    height = 50,
    showText = true,
    fontSize = 11,
    margin = 4,
  } = options

  const { modules, valid } = encodeCode128B(value)
  if (!valid || modules.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 ${height}" width="100%" height="${height}"><text x="100" y="${height / 2}" text-anchor="middle" font-size="12" fill="#999">Invalid Barcode</text></svg>`
  }

  const moduleWidth = 1.3
  const barcodeWidth = modules.length * moduleWidth
  const totalWidth = barcodeWidth + margin * 2
  const barHeight = showText ? height - fontSize - 6 : height

  let rects = ''
  let currentRun = 0
  let runStart = 0
  let isBar = false

  for (let i = 0; i < modules.length; i++) {
    const bit = modules[i] === '1'
    if (bit === isBar) {
      currentRun++
    } else {
      if (isBar && currentRun > 0) {
        rects += `<rect x="${margin + runStart * moduleWidth}" y="0" width="${currentRun * moduleWidth}" height="${barHeight}" fill="#000000" />`
      }
      isBar = bit
      runStart = i
      currentRun = 1
    }
  }
  if (isBar && currentRun > 0) {
    rects += `<rect x="${margin + runStart * moduleWidth}" y="0" width="${currentRun * moduleWidth}" height="${barHeight}" fill="#000000" />`
  }

  const textSvg = showText
    ? `<text x="${totalWidth / 2}" y="${height - 2}" text-anchor="middle" font-family="'Courier New', monospace" font-size="${fontSize}" font-weight="600" fill="#111827">${escapeXml(value)}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" width="100%" height="${height}" style="display:block;margin:0 auto;">${rects}${textSvg}</svg>`
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case '\'': return '&apos;'
      case '"': return '&quot;'
      default: return c
    }
  })
}
