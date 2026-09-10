"use client";

import { MAX_INPUT_BYTES, formatMB } from "@/lib/limits";

type Budget = {
  maxSizeMB: number;
  maxWidthOrHeight: number;
  maxBytes: number;
};

/**
 * Shrinks a picked image to fit a bucket's size limit.
 *
 * Always emits JPEG: `canvas.toBlob("image/webp")` is silently ignored on
 * older iOS Safari, which would hand back a much larger PNG and blow the
 * budget on exactly the devices most likely to pick a huge photo.
 */
export async function compressImage(file: File, budget: Budget): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("ไฟล์ต้องเป็นรูปภาพ");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(`รูปใหญ่เกินไป (${formatMB(file.size)}) กรุณาเลือกรูปอื่น`);
  }

  const { default: imageCompression } = await import("browser-image-compression");

  const compressed = await imageCompression(file, {
    maxSizeMB: budget.maxSizeMB,
    maxWidthOrHeight: budget.maxWidthOrHeight,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: 0.8,
  });

  // The compressor targets a size but does not guarantee it — a noisy photo
  // can overshoot. Fail here with a readable message instead of at the API.
  if (compressed.size > budget.maxBytes) {
    throw new Error(`บีบอัดรูปแล้วยังใหญ่เกินไป (${formatMB(compressed.size)})`);
  }

  return new File([compressed], "photo.jpg", { type: "image/jpeg" });
}
