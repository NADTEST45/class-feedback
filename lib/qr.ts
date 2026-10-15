"use client";

import QRCode from "qrcode";
import { downloadBlob, slug } from "./client";

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't render image"))), "image/png"),
  );
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight = 600) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > 18);
  return s;
}

/** A plain QR code PNG, for printing or pasting anywhere. */
export async function downloadQrPng(url: string, name: string) {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, url, { width: 1024, margin: 2, errorCorrectionLevel: "M" });
  downloadBlob(await canvasToBlob(canvas), `${slug(name)}-feedback-qr.png`);
}

/** A ready-made 16:9 slide to drop at the end of any deck. Same QR all semester. */
export async function downloadSlidePng(opts: { url: string; code: string; name: string; host: string }) {
  const W = 1920;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, opts.url, { width: 760, margin: 0, errorCorrectionLevel: "M" });
  ctx.drawImage(qrCanvas, 140, (H - 760) / 2, 760, 760);

  const x = 1000;
  const maxW = W - x - 120;
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#52514e";
  fitText(ctx, opts.name, maxW, 44, 500);
  ctx.fillText(opts.name, x, 300);

  ctx.fillStyle = "#0b0b0b";
  fitText(ctx, "How did today's class go?", maxW, 76, 700);
  ctx.fillText("How did today's class go?", x, 400);

  ctx.fillStyle = "#52514e";
  ctx.font = `400 40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText("Scan to answer — anonymous, 20 seconds.", x, 480);

  ctx.fillStyle = "#6f6d68";
  ctx.font = `500 32px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText("No camera? Go to", x, 640);
  ctx.fillStyle = "#0b0b0b";
  fitText(ctx, opts.host, maxW, 40, 600);
  ctx.fillText(opts.host, x, 692);
  ctx.fillStyle = "#6f6d68";
  ctx.font = `500 32px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText("and enter code", x, 752);

  ctx.fillStyle = "#1c5cab";
  ctx.font = `700 120px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  ctx.fillText(opts.code, x, 880);

  downloadBlob(await canvasToBlob(canvas), `${slug(opts.name)}-feedback-slide.png`);
}
