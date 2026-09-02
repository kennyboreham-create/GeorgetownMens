const fs = require('fs');
const path = require('path');
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

let cachedClient = null;
let cachedClientKey = '';

function getR2Config() {
  const accountId = String(process.env.R2_ACCOUNT_ID || '').trim();
  const bucket = String(process.env.R2_BUCKET || '').trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const endpoint = String(process.env.R2_ENDPOINT || '').trim()
    || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

  return { accountId, bucket, accessKeyId, secretAccessKey, endpoint };
}

function isR2Configured() {
  const config = getR2Config();
  return Boolean(config.bucket && config.accessKeyId && config.secretAccessKey && config.endpoint);
}

function r2ObjectKey(teamId, videoId, ext) {
  const safeExt = String(ext || '.mp4');
  return `videos/${String(teamId)}/${String(videoId)}${safeExt}`;
}

function teamR2Prefix(teamId) {
  return `videos/${String(teamId)}/`;
}

function playbookR2Prefix(teamId) {
  return `playbook/${String(teamId)}/`;
}

function playbookObjectKey(teamId, blockId, ext) {
  const safeExt = String(ext || '');
  return `playbook/${String(teamId)}/${String(blockId)}${safeExt}`;
}

function subscriptionPlaybookObjectKey(playbookId, blockId, ext) {
  const safeExt = String(ext || '');
  return `subscription-playbook/${String(playbookId)}/${String(blockId)}${safeExt}`;
}

function mediaExtensionForUpload(file = {}) {
  const fromName = path.extname(file.originalname || file.filename || '').toLowerCase();
  const allowed = new Set([
    '.mp4', '.webm', '.mov', '.m4v', '.ogv', '.ogg',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'
  ]);
  if (allowed.has(fromName)) return fromName;
  const mime = String(file.mimetype || file.contentType || '');
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/svg+xml') return '.svg';
  if (mime === 'video/webm') return '.webm';
  if (mime === 'video/quicktime') return '.mov';
  if (mime === 'video/ogg') return '.ogv';
  if (mime.startsWith('image/')) return '.png';
  return '.mp4';
}

async function sumR2Prefixes(prefixes) {
  if (!isR2Configured()) {
    return { bytes: 0, objectCount: 0, configured: false };
  }

  const { bucket } = getR2Config();
  let bytes = 0;
  let objectCount = 0;

  for (const prefix of prefixes) {
    let continuationToken;
    do {
      const listed = await getR2Client().send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }));
      for (const object of listed.Contents || []) {
        bytes += Number(object.Size) || 0;
        objectCount += 1;
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  return { bytes, objectCount, configured: true };
}

async function sumTeamR2Usage(teamId) {
  return sumR2Prefixes([teamR2Prefix(teamId), playbookR2Prefix(teamId)]);
}

function getR2Client() {
  if (!isR2Configured()) {
    throw new Error('Cloudflare R2 is not configured.');
  }

  const { endpoint, accessKeyId, secretAccessKey } = getR2Config();
  const cacheKey = `${endpoint}|${accessKeyId}`;
  if (cachedClient && cachedClientKey === cacheKey) {
    return cachedClient;
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED'
  });
  cachedClientKey = cacheKey;
  return cachedClient;
}

function resetR2ClientCache() {
  cachedClient = null;
  cachedClientKey = '';
}

async function uploadLocalFileToR2({ key, filePath, contentType }) {
  const { bucket } = getR2Config();
  const upload = new Upload({
    client: getR2Client(),
    params: {
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: contentType || 'video/mp4',
      ContentLength: fs.statSync(filePath).size
    }
  });
  await upload.done();
}

async function uploadBufferToR2({ key, body, contentType }) {
  const { bucket } = getR2Config();
  const upload = new Upload({
    client: getR2Client(),
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream'
    }
  });
  await upload.done();
}

async function headR2Object(key) {
  const objectKey = String(key || '').trim();
  if (!objectKey) return null;
  const { bucket } = getR2Config();
  try {
    const out = await getR2Client().send(new HeadObjectCommand({
      Bucket: bucket,
      Key: objectKey
    }));
    return {
      contentLength: Number(out.ContentLength) || 0,
      contentType: out.ContentType || null
    };
  } catch (err) {
    const status = err.$metadata && err.$metadata.httpStatusCode;
    if (status === 404 || err.name === 'NotFound' || err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
      return null;
    }
    throw err;
  }
}

async function getSignedGetUrl(key, { filename, contentType, download = false, expiresIn = 3600 } = {}) {
  const { bucket } = getR2Config();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: contentType || undefined,
    ResponseContentDisposition: download
      ? `attachment; filename="${String(filename || 'download').replace(/"/g, '')}"`
      : undefined
  });
  return getSignedUrl(getR2Client(), command, { expiresIn });
}

async function getSignedPutUrl(key, { contentType, expiresIn = 3600 } = {}) {
  const { bucket } = getR2Config();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || 'application/octet-stream'
  });
  return getSignedUrl(getR2Client(), command, { expiresIn });
}

async function redirectToSignedR2(key, req, res, { filename, contentType, download = false } = {}) {
  const url = await getSignedGetUrl(key, { filename, contentType, download });
  res.redirect(302, url);
}

function parseRangeHeader(rangeHeader, fileSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader || ''));
  if (!match) return null;

  let start = match[1] === '' ? 0 : Number(match[1]);
  let end = match[2] === '' ? fileSize - 1 : Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= fileSize) {
    return null;
  }
  end = Math.min(end, fileSize - 1);
  return { start, end };
}

async function deleteR2Object(key) {
  const objectKey = String(key || '').trim();
  if (!objectKey) return false;
  if (!isR2Configured()) {
    throw new Error('Cloudflare R2 is not configured.');
  }

  try {
    const { bucket } = getR2Config();
    await getR2Client().send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectKey
    }));
    return true;
  } catch (err) {
    const status = err.$metadata && err.$metadata.httpStatusCode;
    if (status === 404 || err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
      return false;
    }
    throw err;
  }
}

async function pipeR2Video(video, req, res, { download = false } = {}) {
  const key = String(video.r2ObjectKey || '').trim();
  if (!key) {
    throw new Error('Video is missing an R2 object key.');
  }

  const { bucket } = getR2Config();
  const commandInput = {
    Bucket: bucket,
    Key: key
  };
  if (req.headers.range) {
    commandInput.Range = req.headers.range;
  }

  let out;
  try {
    out = await getR2Client().send(new GetObjectCommand(commandInput));
  } catch (err) {
    const status = err.$metadata && err.$metadata.httpStatusCode;
    if (status === 404 || err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
      if (!res.headersSent) {
        res.status(404).json({ error: 'Video file not found in storage.' });
      }
      return;
    }
    if (status === 416) {
      if (!res.headersSent) {
        res.status(416);
        if (err.ContentRange) res.set('Content-Range', err.ContentRange);
        res.end();
      }
      return;
    }
    throw err;
  }

  res.set('Content-Type', out.ContentType || video.mimeType || 'video/mp4');
  res.set('Accept-Ranges', 'bytes');
  if (out.ContentLength != null) {
    res.set('Content-Length', String(out.ContentLength));
  }
  if (out.ContentRange) {
    res.set('Content-Range', out.ContentRange);
  }
  if (download) {
    const filename = video.originalFilename || `${video.title || 'video'}.mp4`;
    res.set('Content-Disposition', `attachment; filename="${String(filename).replace(/"/g, '')}"`);
  }

  const isPartial = Boolean(req.headers.range && out.ContentRange);
  res.status(isPartial ? 206 : 200);

  if (!out.Body) {
    return res.end();
  }

  out.Body.on('error', () => {
    if (!res.headersSent) {
      res.status(404).json({ error: 'Video file not found in storage.' });
    } else {
      res.destroy();
    }
  });
  out.Body.pipe(res);
}

module.exports = {
  getR2Config,
  isR2Configured,
  r2ObjectKey,
  teamR2Prefix,
  playbookR2Prefix,
  playbookObjectKey,
  subscriptionPlaybookObjectKey,
  mediaExtensionForUpload,
  sumR2Prefixes,
  sumTeamR2Usage,
  getR2Client,
  resetR2ClientCache,
  uploadLocalFileToR2,
  uploadBufferToR2,
  headR2Object,
  getSignedGetUrl,
  getSignedPutUrl,
  redirectToSignedR2,
  deleteR2Object,
  parseRangeHeader,
  pipeR2Video
};
