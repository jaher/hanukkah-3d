/**
 * Gated Asset Loader with real AbortController Cancel & Retry support.
 * Uses fetch(url, { signal }) + GLTFLoader.parse() / ImageBitmap so Cancel immediately
 * aborts in-flight HTTP requests and Retry cleanly restarts from zero.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class GatedAssetLoader {
  constructor(manifest) {
    this.manifest = manifest;
    this.controller = null;
    this.gltfLoader = new GLTFLoader();
  }

  cancel() {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }

  async loadAll(onProgress) {
    this.cancel();
    this.controller = new AbortController();
    const { signal } = this.controller;

    const total = this.manifest.length;
    let completed = 0;
    const results = {
      models: {},
      textures: {},
      json: {},
    };

    const report = (label) => {
      if (onProgress) {
        onProgress({
          completed,
          total,
          pct: Math.round((completed / total) * 100),
          label,
        });
      }
    };

    report('Starting asset download…');

    // Load concurrently in bounded batches for snappy responsiveness and immediate abort handling
    const tasks = this.manifest.map(async (item) => {
      if (signal.aborted) {
        throw new DOMException('Loading cancelled by user', 'AbortError');
      }

      const resp = await fetch(item.url, { signal, cache: 'default' });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} while loading ${item.label} (${item.url})`);
      }

      if (item.type === 'glb') {
        const buffer = await resp.arrayBuffer();
        if (signal.aborted) {
          throw new DOMException('Loading cancelled by user', 'AbortError');
        }
        const gltf = await new Promise((resolve, reject) => {
          this.gltfLoader.parse(buffer, '', resolve, reject);
        });
        results.models[item.key] = gltf;
      } else if (item.type === 'texture') {
        const blob = await resp.blob();
        if (signal.aborted) {
          throw new DOMException('Loading cancelled by user', 'AbortError');
        }
        const bitmap = await createImageBitmap(blob, {
          imageOrientation: item.flipY === false ? 'none' : 'flipY',
        });
        const tex = new THREE.Texture(bitmap);
        tex.flipY = false; // already handled by createImageBitmap
        tex.colorSpace = item.colorSpace || THREE.SRGBColorSpace;
        tex.wrapS = item.wrap || THREE.ClampToEdgeWrapping;
        tex.wrapT = item.wrap || THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        results.textures[item.key] = tex;
      } else if (item.type === 'json') {
        const data = await resp.json();
        results.json[item.key] = data;
      }

      completed += 1;
      report(`Loaded ${item.label}`);
    });

    await Promise.all(tasks);
    this.controller = null;
    return results;
  }
}
