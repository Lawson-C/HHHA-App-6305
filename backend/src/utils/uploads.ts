import { promises as fs } from 'fs';
import path from 'path';
import { errors } from '@strapi/utils';

export type FileKind = 'jpeg' | 'png' | 'webp' | 'heic' | 'pdf';

export type UploadRule = {
  field: string;
  maxFiles: number;
  minFiles?: number;
  maxBytes: number;
  kinds: FileKind[];
  /** Re-encode images to drop EXIF (GPS) metadata. Kinds we can't re-encode are rejected. */
  stripMetadata: boolean;
};

const EXTENSIONS: Record<FileKind, string[]> = {
  jpeg: ['.jpg', '.jpeg'],
  png: ['.png'],
  webp: ['.webp'],
  heic: ['.heic', '.heif'],
  pdf: ['.pdf'],
};

const MIME: Record<FileKind, string[]> = {
  jpeg: ['image/jpeg', 'image/jpg', 'image/pjpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  heic: ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'],
  pdf: ['application/pdf'],
};

/** Magic-byte sniffing: the declared MIME type and extension alone are not trusted. */
export function sniffKind(head: Buffer): FileKind | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (
    head.length >= 12 &&
    head.toString('ascii', 0, 4) === 'RIFF' &&
    head.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  if (head.length >= 12 && head.toString('ascii', 4, 8) === 'ftyp') {
    const brand = head.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif'].includes(brand))
      return 'heic';
  }
  if (head.length >= 5 && head.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
  return null;
}

/** Files sent as multipart `files.<field>` (or `<field>`), always as an array. */
export function collectFiles(ctx: any, field: string): any[] {
  const files = ctx.request.files ?? {};
  const value = files[`files.${field}`] ?? files[field];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function readHead(filepath: string) {
  const handle = await fs.open(filepath, 'r');
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, 16, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

const reject = (field: string, message: string) => {
  throw new errors.ValidationError(message, {
    errors: [{ path: [field], message, name: 'ValidationError' }],
  });
};

async function strip(file: any, kind: FileKind, field: string) {
  if (kind === 'pdf') return;
  if (kind === 'heic') {
    reject(field, 'HEIC photos are not supported yet. Please send JPEG, PNG or WebP.');
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sharp = require('sharp');
  // .rotate() bakes in the EXIF orientation; sharp drops all metadata unless asked to keep it.
  const output: Buffer = await sharp(file.filepath).rotate().toBuffer();
  await fs.writeFile(file.filepath, output);
  file.size = output.length;
}

/**
 * Validates count, size, extension, declared MIME and magic bytes, then (optionally)
 * strips image metadata in place. Throws a 400 ValidationError on the first problem.
 */
export async function validateFiles(files: any[], rule: UploadRule) {
  const { field } = rule;
  if (files.length < (rule.minFiles ?? 0)) {
    reject(field, `Add at least ${rule.minFiles} file${rule.minFiles === 1 ? '' : 's'}`);
  }
  if (files.length > rule.maxFiles) {
    reject(field, `No more than ${rule.maxFiles} files`);
  }
  for (const file of files) {
    const name: string = file.originalFilename ?? file.name ?? '';
    if ((file.size ?? 0) > rule.maxBytes) {
      reject(
        field,
        `${name || 'A file'} is larger than ${Math.round(rule.maxBytes / 1024 / 1024)} MB`,
      );
    }
    const kind = sniffKind(await readHead(file.filepath));
    if (!kind || !rule.kinds.includes(kind)) {
      reject(field, `${name || 'A file'} is not an allowed file type`);
    }
    const ext = path.extname(name).toLowerCase();
    if (!EXTENSIONS[kind!].includes(ext)) {
      reject(field, `${name || 'A file'} has an extension that doesn't match its contents`);
    }
    const declared = String(file.mimetype ?? file.type ?? '').toLowerCase();
    if (declared && declared !== 'application/octet-stream' && !MIME[kind!].includes(declared)) {
      reject(field, `${name || 'A file'} has a content type that doesn't match its contents`);
    }
    file.mimetype = MIME[kind!][0];
    if (rule.stripMetadata) {
      try {
        await strip(file, kind!, field);
      } catch (error) {
        if (error instanceof errors.ValidationError) throw error;
        reject(field, `${name || 'A file'} could not be processed as an image`);
      }
    }
  }
}

/** Uploads already-validated files through Strapi's upload provider; returns file entities. */
export async function uploadFiles(files: any[]): Promise<any[]> {
  if (!files.length) return [];
  return strapi.plugin('upload').service('upload').upload({ data: {}, files });
}

export async function removeUploadedFiles(fileEntities: any[]) {
  const service = strapi.plugin('upload').service('upload');
  await Promise.all(fileEntities.map((file) => service.remove(file).catch(() => undefined)));
}

/** Public URL of a media file. Private providers get a short-lived signed URL. */
export async function fileUrl(file: any): Promise<string | null> {
  if (!file?.url) return null;
  const signed = await strapi.plugin('upload').service('file').signFileUrls(file);
  return signed.url ?? null;
}
