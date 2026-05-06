import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { Candle, DeepReadAnalysis } from "@shared/schema";

type Props = {
  candles: Candle[];
  analysis: DeepReadAnalysis | null;
  height?: number;
};

const COLORS = {
  upCandle: "hsl(145, 28%, 50%)",
  downCandle: "hsl(350, 100%, 65%)",
  cream: "hsl(35, 18%, 92%)",
  border: "hsl(35, 8%, 18%)",
  gold: "hsl(38, 70%, 60%)",
  sage: "hsl(145, 28%, 50%)",
  neonDown: "hsl(350, 100%, 65%)",
};

export function DeepReadChart({ candles, analysis, height = 480 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const predictionSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLineRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(null);

  // --- Mount the chart once ----------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { color: "transparent" },
        textColor: COLORS.cream,
        fontFamily: "Inter, ui-sans-serif, system-ui",
      },
      grid: {
        vertLines: { color: "hsla(35, 8%, 60%, 0.06)" },
        horzLines: { color: "hsla(35, 8%, 60%, 0.06)" },
      },
      timeScale: {
        borderColor: COLORS.border,
        timeVisible: false,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: COLORS.border,
        scaleMargins: { top: 0.08, bottom: 0.28 },
      },
      crosshair: {
        mode: 1, // Magnet
        vertLine: {
          color: COLORS.gold,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: COLORS.gold,
        },
        horzLine: {
          color: COLORS.gold,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: COLORS.gold,
        },
      },
      autoSize: false,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.upCandle,
      downColor: COLORS.downCandle,
      borderUpColor: COLORS.upCandle,
      borderDownColor: COLORS.downCandle,
      wickUpColor: COLORS.upCandle,
      wickDownColor: COLORS.downCandle,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      color: "hsla(35, 8%, 60%, 0.4)",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Resize observer keeps chart in sync with container width
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      predictionSeriesRef.current = null;
      priceLineRef.current = null;
    };
  }, [height]);

  // --- Push candle / volume data when it changes -------------------------
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart) return;

    const ohlc = candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const vol = candles.map((c) => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? "hsla(145, 28%, 50%, 0.45)" : "hsla(350, 100%, 65%, 0.45)",
    }));

    candleSeries.setData(ohlc);
    volumeSeries.setData(vol);

    if (ohlc.length > 0) {
      chart.timeScale().fitContent();
    }
  }, [candles]);

  // --- Apply / remove the prediction overlay -----------------------------
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;

    // Tear down previous prediction layer.
    if (predictionSeriesRef.current) {
      try {
        chart.removeSeries(predictionSeriesRef.current);
      } catch {}
      predictionSeriesRef.current = null;
    }
    if (priceLineRef.current) {
      try {
        candleSeries.removePriceLine(priceLineRef.current);
      } catch {}
      priceLineRef.current = null;
    }

    if (!analysis || candles.length === 0) return;

    const lastCandle = candles[candles.length - 1];
    if (!lastCandle) return;

    const lineColor =
      analysis.direction === "up"
        ? "hsla(145, 28%, 50%, 0.7)"
        : analysis.direction === "down"
        ? "hsla(350, 100%, 65%, 0.7)"
        : "hsla(38, 70%, 60%, 0.7)";

    const series = chart.addSeries(LineSeries, {
      color: lineColor,
      lineWidth: 2,
      lineStyle: LineStyle.LargeDashed,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });

    const startDate = lastCandle.time;
    const endDate = addDays(lastCandle.time, analysis.timeframeDays);
    series.setData([
      { time: startDate as Time, value: lastCandle.close },
      { time: endDate as Time, value: analysis.targetPrice },
    ]);

    const priceLine = candleSeries.createPriceLine({
      price: analysis.targetPrice,
      color: lineColor,
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      axisLabelVisible: true,
      title: "TARGET",
    });

    predictionSeriesRef.current = series;
    priceLineRef.current = priceLine;

    // Make sure projection is in view
    chart.timeScale().fitContent();
  }, [analysis, candles]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}

function addDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
