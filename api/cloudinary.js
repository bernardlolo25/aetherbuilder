/**
 * AETHERBUILDER - Cloudinary Integration Helper
 * =============================================
 * Handles direct browser-to-Cloudinary uploads for:
 *   - Transparent WebM mascot & tour guide videos
 *   - High-resolution banners, screenshots, and PNGs
 *   - SVGs, GIFs, and other rich media assets
 *
 * Avoids Vercel Serverless Function 4.5MB payload limits
 * and provides global high-speed CDN delivery.
 */

import crypto from 'crypto';
import db from './db.js';
import fs from 'fs';
import path from 'path';

export function getCloudinaryEnv() {
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'aether-assets'
  };
}

export const cloudinary = {
  /**
   * Returns safe public configuration for client-side upload handling.
   */
  getConfig() {
    const env = getCloudinaryEnv();
    const isConfigured = Boolean(env.cloudName && (env.apiSecret || env.uploadPreset));
    return {
      enabled: isConfigured,
      cloudName: env.cloudName,
      uploadPreset: env.uploadPreset,
      isSigned: Boolean(env.apiKey && env.apiSecret),
      apiKey: env.apiKey || '',
      folder: env.folder
    };
  },

  /**
   * Generates a signed upload ticket according to Cloudinary specification.
   */
  createSignature(customParams = {}) {
    const env = getCloudinaryEnv();
    if (!env.cloudName || !env.apiSecret) {
      throw new Error('Cloudinary API credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_SECRET) are not configured.');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = {
      folder: env.folder,
      timestamp,
      ...customParams
    };

    // Remove empty/undefined and sort alphabetically by key
    const sortedKeys = Object.keys(paramsToSign).filter(k => paramsToSign[k] !== undefined && paramsToSign[k] !== '').sort();
    const stringToSign = sortedKeys.map(k => `${k}=${paramsToSign[k]}`).join('&') + env.apiSecret;

    const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

    return {
      signature,
      timestamp,
      apiKey: env.apiKey,
      cloudName: env.cloudName,
      folder: env.folder
    };
  },

  /**
   * Registers an uploaded asset in the persistent database catalog.
   */
  async registerAsset(asset) {
    let assets = await db.get('aether:assets', []);
    if (!Array.isArray(assets)) assets = [];

    const nowSec = Math.floor(Date.now() / 1000);
    const cleanAsset = {
      name: asset.name || (asset.public_id ? asset.public_id.split('/').pop() : 'asset_' + nowSec),
      url: asset.secure_url || asset.url,
      size: asset.bytes || asset.size || 0,
      ext: asset.format || (asset.name ? asset.name.split('.').pop() : 'webp'),
      width: asset.width || null,
      height: asset.height || null,
      resource_type: asset.resource_type || 'image',
      public_id: asset.public_id || '',
      provider: 'cloudinary',
      modified: nowSec
    };

    // Deduplicate by URL or public_id
    assets = assets.filter(a => a.url !== cleanAsset.url && (cleanAsset.public_id ? a.public_id !== cleanAsset.public_id : true));
    assets.unshift(cleanAsset);

    // Keep up to 2000 recorded assets
    if (assets.length > 2000) assets = assets.slice(0, 2000);

    await db.set('aether:assets', assets);
    return cleanAsset;
  },

  /**
   * Returns merged assets from database + local assets/uploads directory.
   */
  async listAllAssets() {
    let dbAssets = await db.get('aether:assets', []);
    if (!Array.isArray(dbAssets)) dbAssets = [];

    // Local assets from disk if available
    const localAssets = [];
    const uploadsDir = path.join(process.cwd(), 'assets', 'uploads');
    const ALLOWED_EXT = new Set(['jpg','jpeg','png','gif','webp','svg','mp4','webm','pdf','json']);

    try {
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        for (const f of files) {
          const ext = path.extname(f).slice(1).toLowerCase();
          if (ALLOWED_EXT.has(ext)) {
            try {
              const stat = fs.statSync(path.join(uploadsDir, f));
              localAssets.push({
                name: f,
                url: 'assets/uploads/' + f,
                size: stat.size,
                ext,
                modified: Math.floor(stat.mtimeMs / 1000),
                provider: 'local'
              });
            } catch {}
          }
        }
      }
    } catch {}

    // Combine and sort by modified date descending
    const combined = [...dbAssets];
    for (const loc of localAssets) {
      if (!combined.some(a => a.name === loc.name || a.url === loc.url)) {
        combined.push(loc);
      }
    }

    return combined.sort((a, b) => (b.modified || 0) - (a.modified || 0));
  },

  /**
   * Deletes an asset from the asset registry.
   */
  async deleteAsset(nameOrUrl) {
    let assets = await db.get('aether:assets', []);
    if (Array.isArray(assets)) {
      assets = assets.filter(a => a.name !== nameOrUrl && a.url !== nameOrUrl && a.public_id !== nameOrUrl);
      await db.set('aether:assets', assets);
    }
    return true;
  }
};

export default cloudinary;
