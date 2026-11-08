"use client";

import type * as FaceApiNamespace from "@vladmandic/face-api";

type FaceApiModule = typeof FaceApiNamespace;

const MODEL_URL = "/models";
const FACE_VECTOR_LENGTH = 128;

let faceApiPromise: Promise<FaceApiModule> | null = null;
let modelsLoadedPromise: Promise<void> | null = null;

async function getFaceApi(): Promise<FaceApiModule> {
  if (typeof window === "undefined") {
    throw new Error("Face recognition can only run in the browser.");
  }
  if (!faceApiPromise) {
    faceApiPromise = import("@vladmandic/face-api");
  }
  return faceApiPromise;
}

/**
 * Singleton loader for `@vladmandic/face-api` weights from `/models`.
 * Loads `ssdMobilenetv1`, `faceLandmark68Net`, and `faceRecognitionNet` once
 * per browser session and reuses the loaded nets across calls.
 */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoadedPromise) {
    return modelsLoadedPromise;
  }

  modelsLoadedPromise = (async () => {
    try {
      const faceapi = await getFaceApi();
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.isLoaded
          ? Promise.resolve()
          : faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.isLoaded
          ? Promise.resolve()
          : faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.isLoaded
          ? Promise.resolve()
          : faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
    } catch (error) {
      modelsLoadedPromise = null;
      throw error;
    }
  })();

  return modelsLoadedPromise;
}

function descriptorToNumberArray(descriptor: Float32Array): number[] {
  if (descriptor.length !== FACE_VECTOR_LENGTH) {
    throw new Error(`Expected ${FACE_VECTOR_LENGTH}-d face descriptor, got ${descriptor.length}.`);
  }
  const out = new Array<number>(FACE_VECTOR_LENGTH);
  for (let i = 0; i < FACE_VECTOR_LENGTH; i += 1) {
    const val = descriptor[i];
    out[i] = Number.isFinite(val) ? Number(val.toFixed(6)) : 0;
  }
  return out;
}

/**
 * Downscales an excessively large image onto an offscreen canvas before
 * passing it to WebGL so mobile GPUs do not run out of texture memory on
 * 48 MP phone photos.
 */
function createBoundedCanvasFromImage(
  imgElement: HTMLImageElement,
  maxDimension = 1280,
): HTMLCanvasElement | HTMLImageElement {
  const width = imgElement.naturalWidth || imgElement.width;
  const height = imgElement.naturalHeight || imgElement.height;
  if (width <= 0 || height <= 0 || (width <= maxDimension && height <= maxDimension)) {
    return imgElement;
  }

  const scale = maxDimension / Math.max(width, height);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imgElement;
  ctx.drawImage(imgElement, 0, 0, targetWidth, targetHeight);
  return canvas;
}

/**
 * Detects all faces in a group photo `HTMLImageElement` and returns their
 * 128-d float descriptors.
 */
export async function extractAllFacesFromImage(
  imgElement: HTMLImageElement,
): Promise<number[][]> {
  await loadFaceModels();
  const faceapi = await getFaceApi();

  const input = createBoundedCanvasFromImage(imgElement, 1280);
  try {
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 25 });
    const detections = await faceapi
      .detectAllFaces(input, options)
      .withFaceLandmarks()
      .withFaceDescriptors();

    return detections.map((det) => descriptorToNumberArray(det.descriptor));
  } finally {
    if (input instanceof HTMLCanvasElement) {
      input.width = 0;
      input.height = 0;
    }
  }
}

/**
 * Loads a `File` or `Blob` into a temporary `HTMLImageElement`, extracts all
 * 128-d face embeddings, and guarantees `URL.revokeObjectURL` is called in
 * `finally` to prevent mobile Safari/Chrome memory leaks.
 */
export async function extractAllFacesFromFile(file: Blob): Promise<number[][]> {
  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Görsel yüz tanıma için açılamadı."));
      img.src = objectUrl;
    });
    return await extractAllFacesFromImage(img);
  } finally {
    img.onload = null;
    img.onerror = null;
    img.src = "";
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Extracts a single 128-d face embedding from a live `<video>` selfie stream.
 * Returns `null` if no face is currently aligned and visible in the frame.
 */
export async function extractSingleFaceFromSelfie(
  videoElement: HTMLVideoElement,
): Promise<number[] | null> {
  if (videoElement.readyState < 2 || videoElement.videoWidth === 0) {
    return null;
  }

  await loadFaceModels();
  const faceapi = await getFaceApi();

  const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.55 });
  const detection = await faceapi
    .detectSingleFace(videoElement, options)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    return null;
  }

  return descriptorToNumberArray(detection.descriptor);
}

const HEIC_UNSUPPORTED_MESSAGE =
  "Bu fotoğraf formatı (HEIC) tarayıcınızda açılamadı. Lütfen 'Selfie çek' seçeneğini kullanın veya JPEG/PNG seçin.";

/** True for HEIC/HEIF photos (by MIME type or, when the type is empty, by file name). */
function isHeicLike(file: Blob): boolean {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/heic") || type.startsWith("image/heif")) return true;
  const name = typeof File !== "undefined" && file instanceof File ? file.name.toLowerCase() : "";
  return /\.(heic|heif)$/.test(name);
}

async function decodeImage(file: Blob): Promise<{ img: HTMLImageElement; release: () => void }> {
  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () =>
      reject(new Error(isHeicLike(file) ? HEIC_UNSUPPORTED_MESSAGE : "Görsel bu tarayıcıda açılamadı. Lütfen JPEG veya PNG bir fotoğraf seçin."));
    img.src = objectUrl;
  }).catch((error: unknown) => {
    img.onload = null;
    img.onerror = null;
    URL.revokeObjectURL(objectUrl);
    throw error;
  });
  return {
    img,
    release: () => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
      URL.revokeObjectURL(objectUrl);
    },
  };
}

/**
 * Reads dimensions and (optionally) all face descriptors of a photo before
 * upload. Never throws: formats the browser cannot decode (e.g. HEIC outside
 * Safari) simply yield no faces.
 */
export async function analyzePhoto(
  file: Blob,
  withFaces: boolean,
): Promise<{ faces: number[][]; width?: number; height?: number }> {
  let decoded: Awaited<ReturnType<typeof decodeImage>> | null = null;
  try {
    decoded = await decodeImage(file);
    const width = decoded.img.naturalWidth || undefined;
    const height = decoded.img.naturalHeight || undefined;
    if (!withFaces) return { faces: [], width, height };
    const faces = await extractAllFacesFromImage(decoded.img);
    return { faces, width, height };
  } catch {
    return { faces: [] };
  } finally {
    decoded?.release();
  }
}

/** Largest face in an uploaded selfie photo, or null when none is found. */
export async function extractSelfieFromFile(file: Blob): Promise<number[] | null> {
  const decoded = await decodeImage(file);
  try {
    await loadFaceModels();
    const faceapi = await getFaceApi();
    const input = createBoundedCanvasFromImage(decoded.img, 1280);
    try {
      const detections = await faceapi
        .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
      if (detections.length === 0) return null;
      const largest = detections.reduce((best, det) =>
        det.detection.box.area > best.detection.box.area ? det : best,
      );
      return descriptorToNumberArray(largest.descriptor);
    } finally {
      // Release the scaled canvas' backing store right away (iOS Safari leaks otherwise).
      if (input instanceof HTMLCanvasElement) {
        input.width = 0;
        input.height = 0;
      }
    }
  } finally {
    decoded.release();
  }
}
