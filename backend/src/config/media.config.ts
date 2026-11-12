import { BadRequestException } from "../utils/app-error";

export type MediaMessageType = "image" | "audio" | "video" | "file";

type MediaRule = {
  maxBytes: number;
  mimeTypes: readonly string[];
};

const MB = 1024 * 1024;

export const MEDIA_RULES: Record<MediaMessageType, MediaRule> = {
  image: {
    maxBytes: 4 * MB,
    mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  },
  audio: {
    maxBytes: 6 * MB,
    mimeTypes: [
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
      "audio/wav",
      "audio/webm",
    ],
  },
  video: {
    maxBytes: 6 * MB,
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
  },
  file: {
    maxBytes: 6 * MB,
    mimeTypes: [
      "application/pdf",
      "text/plain",
      "application/zip",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ],
  },
};

const DATA_URI_PATTERN = /^data:([a-zA-Z0-9.+/-]+);base64,([a-zA-Z0-9+/=\s]+)$/;

export const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const isMediaUrlShapeValid = (value: string): boolean => {
  return isHttpUrl(value) || DATA_URI_PATTERN.test(value);
};

export const validateMediaPayload = (
  messageType: MediaMessageType,
  mediaUrl: string,
): void => {
  const rule = MEDIA_RULES[messageType];

  if (isHttpUrl(mediaUrl)) {
    if (mediaUrl.length > 2048) {
      throw new BadRequestException("Media URL is too long");
    }
    return;
  }

  const match = mediaUrl.match(DATA_URI_PATTERN);
  if (!match) {
    throw new BadRequestException(
      "mediaUrl must be an http(s) URL or a base64 data URI",
    );
  }

  const [, mimeType, rawBase64] = match;
  if (!rule.mimeTypes.includes(mimeType.toLowerCase())) {
    throw new BadRequestException(
      `Unsupported ${messageType} type. Allowed: ${rule.mimeTypes.join(", ")}`,
    );
  }

  const base64 = rawBase64.replace(/\s/g, "");
  const estimatedBytes = Math.floor((base64.length * 3) / 4);

  if (estimatedBytes > rule.maxBytes) {
    throw new BadRequestException(
      `${messageType} exceeds the ${Math.floor(rule.maxBytes / MB)}MB limit`,
    );
  }

  const decoded = Buffer.from(base64, "base64");
  if (decoded.length === 0 || decoded.length > rule.maxBytes) {
    throw new BadRequestException(
      `${messageType} exceeds the ${Math.floor(rule.maxBytes / MB)}MB limit`,
    );
  }
};
