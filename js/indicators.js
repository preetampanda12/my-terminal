// ============================================================
// indicators.js — Technical Indicator Calculations
// Pure math functions — no external dependencies
// ============================================================

/**
 * Simple Moving Average.
 * @param {Array<{time:number, close:number}>} candles
 * @param {number} period
 * @returns {Array<{time:number, value:number}>}
 */
export function calculateSMA(candles, period) {
  if (!candles || candles.length < period) return [];

  const result = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += candles[i - j].close;
    }
    result.push({ time: candles[i].time, value: sum / period });
  }
  return result;
}

/**
 * Exponential Moving Average.
 * First value is bootstrapped from the SMA, then the EMA formula is applied.
 * @param {Array<{time:number, close:number}>} candles
 * @param {number} period
 * @returns {Array<{time:number, value:number}>}
 */
export function calculateEMA(candles, period) {
  if (!candles || candles.length < period) return [];

  const result = [];
  const multiplier = 2 / (period + 1);

  // Seed with SMA of the first `period` candles
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let ema = sum / period;
  result.push({ time: candles[period - 1].time, value: ema });

  // Apply EMA formula for remaining candles
  for (let i = period; i < candles.length; i++) {
    ema = (candles[i].close - ema) * multiplier + ema;
    result.push({ time: candles[i].time, value: ema });
  }

  return result;
}

/**
 * Relative Strength Index (RSI).
 * @param {Array<{time:number, close:number}>} candles
 * @param {number} period — (default 14)
 * @returns {Array<{time:number, value:number}>}
 */
export function calculateRSI(candles, period = 14) {
  // We need at least period + 1 candles to get 'period' differences
  if (!candles || candles.length <= period) return [];
  const result = [];
  
  let gains = 0;
  let losses = 0;

  // Initial average gain/loss over the first 'period' differences
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period; i < candles.length; i++) {
    if (i > period) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff >= 0) {
        avgGain = (avgGain * (period - 1) + diff) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - diff) / period;
      }
    }
    
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    result.push({ time: candles[i].time, value: rsi });
  }
  return result;
}

/**
 * Moving Average Convergence Divergence (MACD).
 * @param {Array<{time:number, close:number}>} candles
 * @param {number} fastPeriod
 * @param {number} slowPeriod
 * @param {number} signalPeriod
 * @returns {{ macd: Array<{time:number, value:number}>, signal: Array<{time:number, value:number}>, hist: Array<{time:number, value:number}> }}
 */
export function calculateMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!candles || candles.length < slowPeriod) {
    return { macd: [], signal: [], hist: [] };
  }

  const fastEMA = calculateEMA(candles, fastPeriod);
  const slowEMA = calculateEMA(candles, slowPeriod);
  
  // Align fastEMA and slowEMA by time
  const macdSeriesRaw = [];
  let fastIdx = 0;
  let slowIdx = 0;
  
  while (fastIdx < fastEMA.length && slowIdx < slowEMA.length) {
    if (fastEMA[fastIdx].time < slowEMA[slowIdx].time) {
      fastIdx++;
    } else if (fastEMA[fastIdx].time > slowEMA[slowIdx].time) {
      slowIdx++;
    } else {
      macdSeriesRaw.push({
        time: fastEMA[fastIdx].time,
        close: fastEMA[fastIdx].value - slowEMA[slowIdx].value
      });
      fastIdx++;
      slowIdx++;
    }
  }

  // MACD Line
  const macdResult = macdSeriesRaw.map(d => ({ time: d.time, value: d.close }));
  
  // Signal Line (EMA of MACD)
  const signalEMA = calculateEMA(macdSeriesRaw, signalPeriod);
  const signalResult = [];
  const histResult = [];
  
  let mIdx = 0;
  let sIdx = 0;
  
  while (mIdx < macdResult.length && sIdx < signalEMA.length) {
    if (macdResult[mIdx].time < signalEMA[sIdx].time) {
      mIdx++;
    } else if (macdResult[mIdx].time > signalEMA[sIdx].time) {
      sIdx++;
    } else {
      const macdVal = macdResult[mIdx].value;
      const signalVal = signalEMA[sIdx].value;
      signalResult.push({ time: signalEMA[sIdx].time, value: signalVal });
      histResult.push({ time: signalEMA[sIdx].time, value: macdVal - signalVal });
      mIdx++;
      sIdx++;
    }
  }

  // Filter MACD line to match signal line length so they start exactly together
  const startTime = signalResult.length > 0 ? signalResult[0].time : 0;
  const filteredMacd = macdResult.filter(m => m.time >= startTime);

  return { macd: filteredMacd, signal: signalResult, hist: histResult };
}

export const VWAP_BAND_MULTIPLIERS = [1.28, 2.01, 2.51, 3.09, 4.01];

/**
 * Daily-session VWAP and volume-weighted standard-deviation bands using hl2.
 * The session resets at UTC midnight, matching 24-hour crypto market sessions.
 * @param {Array<{time:number, high:number, low:number, volume:number}>} candles
 * @param {number[]} multipliers
 * @returns {{vwap:Array, upper:Array<Array>, lower:Array<Array>, previousVWAP:Array}}
 */
export function calculateVWAPBands(candles, multipliers = VWAP_BAND_MULTIPLIERS) {
  if (!candles || candles.length === 0) {
    return {
      vwap: [],
      upper: multipliers.map(() => []),
      lower: multipliers.map(() => []),
      previousVWAP: [],
    };
  }

  const vwap = [];
  const upper = multipliers.map(() => []);
  const lower = multipliers.map(() => []);
  const previousVWAP = [];
  let sessionDay = null;
  let priorSessionVWAP = null;
  let cumulativeVolume = 0;
  let cumulativePV = 0;
  let cumulativePV2 = 0;

  for (const candle of candles) {
    const day = new Date(candle.time * 1000).toISOString().slice(0, 10);
    if (day !== sessionDay) {
      if (cumulativeVolume > 0) {
        priorSessionVWAP = cumulativePV / cumulativeVolume;
      }
      sessionDay = day;
      cumulativeVolume = 0;
      cumulativePV = 0;
      cumulativePV2 = 0;
    }

    const hl2 = (candle.high + candle.low) / 2;
    const volume = Math.max(0, candle.volume || 0);

    if (volume > 0) {
      cumulativeVolume += volume;
      cumulativePV += volume * hl2;
      cumulativePV2 += volume * hl2 * hl2;
    }

    if (priorSessionVWAP !== null) {
      previousVWAP.push({ time: candle.time, value: priorSessionVWAP });
    }
    if (cumulativeVolume <= 0) continue;

    const sessionVWAP = cumulativePV / cumulativeVolume;
    const variance = Math.max(
      0,
      cumulativePV2 / cumulativeVolume - sessionVWAP * sessionVWAP,
    );
    const standardDeviation = Math.sqrt(variance);

    vwap.push({ time: candle.time, value: sessionVWAP });
    for (let i = 0; i < multipliers.length; i++) {
      const multiplier = multipliers[i];
      upper[i].push({
        time: candle.time,
        value: sessionVWAP + standardDeviation * multiplier,
      });
      lower[i].push({
        time: candle.time,
        value: sessionVWAP - standardDeviation * multiplier,
      });
    }
  }

  return { vwap, upper, lower, previousVWAP };
}
