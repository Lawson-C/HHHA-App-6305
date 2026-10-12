import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'text/plain',
  'text/csv',
];

const deniedTypes = [
  'image/svg+xml',
  'application/vnd.microsoft.portable-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'text/x-shellscript',
  'application/x-mach-binary',
];

/**
 * Supabase Storage through its S3-compatible endpoint. Only active when every SUPABASE_S3_*
 * variable below is set; otherwise Strapi keeps the local provider (backend/public/uploads).
 *
 * SUPABASE_S3_PRIVATE=true marks the bucket private: Strapi then serves short-lived signed
 * URLs (SUPABASE_S3_SIGNED_URL_EXPIRES seconds, default 900) instead of public ones.
 */
const s3UploadConfig = (env: Core.Config.Shared.ConfigParams['env']) => {
  const endpoint = env('SUPABASE_S3_ENDPOINT', '');
  const region = env('SUPABASE_S3_REGION', '');
  const bucket = env('SUPABASE_S3_BUCKET', '');
  const accessKeyId = env('SUPABASE_S3_ACCESS_KEY_ID', '');
  const secretAccessKey = env('SUPABASE_S3_SECRET_ACCESS_KEY', '');
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    return {};
  }
  const isPrivate = env.bool('SUPABASE_S3_PRIVATE', false);
  const supabaseUrl = String(env('SUPABASE_URL', '')).replace(/\/+$/, '');
  return {
    provider: 'aws-s3',
    providerOptions: {
      // Public buckets are served from Supabase's public object URL.
      baseUrl:
        !isPrivate && supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/${bucket}` : undefined,
      s3Options: {
        endpoint,
        region,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
        params: {
          Bucket: bucket,
          // Supabase Storage has no S3 ACLs. `private` only tells Strapi to sign URLs.
          ...(isPrivate
            ? { ACL: 'private', signedUrlExpires: env.int('SUPABASE_S3_SIGNED_URL_EXPIRES', 900) }
            : { ACL: undefined }),
        },
      },
    },
    actionOptions: { upload: {}, uploadStream: {}, delete: {} },
  };
};

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'users-permissions': {
    config: {
      jwtManagement: 'refresh',
      sessions: {
        httpOnly: true,
      },
    },
  },
  upload: {
    config: {
      ...s3UploadConfig(env),
      security: {
        allowedTypes: allowedMediaTypes,
        deniedTypes,
      },
    },
  },
});

export default config;
