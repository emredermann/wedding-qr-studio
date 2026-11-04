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
  img.crossOrigin = "anonymous";
  img.decoding = "async";

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to decode image for face recognition."));
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

/**
 * Computes a 64-bit difference perceptual hash (`dHash`, 16 lowercase hex
 * characters) on the client from an image `Blob`. Always revokes the temporary
 * ObjectURL and frees the 9x8 canvas in `finally`.
 */
export async function computeClientDifferenceHash(file: Blob): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to decode image for perceptual hash."));
      img.src = objectUrl;
    });

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 9, 8);
    const { data } = ctx.getImageData(0, 0, 9, 8);

    const gray = new Float32Array(72);
    for (let i = 0; i < 72; i += 1) {
      const offset = i * 4;
      gray[i] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    }

    let hex = "";
    for (let row = 0; row < 8; row += 1) {
      let byte = 0;
      for (let col = 0; col < 8; col += 1) {
        const left = gray[row * 9 + col];
        const right = gray[row * 9 + col + 1];
        if (left > right) {
          byte |= 1 << (7 - col);
        }
      }
      hex += byte.toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    img.onload = null;
    img.onerror = null;
    img.src = "";
    URL.revokeObjectURL(objectUrl);
  }
}
