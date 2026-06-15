import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import log from '@kaetram/common/util/log';

import type { HttpRequest, HttpResponse } from 'uws';

const MIME_TYPES: { [key: string]: string } = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.xml': 'application/xml',
    '.txt': 'text/plain; charset=utf-8'
};

export default class StaticServer {
    private root: string;
    private enabled: boolean;

    public constructor(root = resolveClientDist()) {
        this.root = root;
        this.enabled = existsSync(this.root);

        if (this.enabled) log.notice(`Serving game client from ${this.root}`);
        else log.warning('Client build not found; HTTP requests will return a placeholder.');
    }

    public handle(response: HttpResponse, request: HttpRequest): void {
        if (!this.enabled) {
            response
                .writeStatus('200 OK')
                .writeHeader('Content-Type', 'text/plain')
                .end(this.placeholder());
            return;
        }

        let url = request.getUrl().split('?')[0] || '/',
            filePath = this.resolveFilePath(url);

        if (!filePath) {
            response
                .writeStatus('404 Not Found')
                .writeHeader('Content-Type', 'text/plain')
                .end('Not found');
            return;
        }

        let resolved = filePath;

        try {
            let data = readFileSync(resolved);

            response.cork(() => {
                response
                    .writeStatus('200 OK')
                    .writeHeader('Content-Type', this.getMimeType(resolved))
                    .writeHeader('Cache-Control', 'public, max-age=3600')
                    .end(data);
            });
        } catch {
            response
                .writeStatus('404 Not Found')
                .writeHeader('Content-Type', 'text/plain')
                .end('Not found');
        }
    }

    private resolveFilePath(url: string): string | undefined {
        let safePath = normalize(url).replace(/^(\.\.[/\\])+/, '');

        if (safePath.startsWith('/')) safePath = safePath.slice(1);
        if (!safePath || safePath.endsWith('/')) safePath = `${safePath}index.html`;

        let candidates = [
            join(this.root, safePath),
            join(this.root, safePath, 'index.html'),
            join(this.root, 'index.html')
        ];

        for (let candidate of candidates) if (this.isFile(candidate)) return candidate;

        return undefined;
    }

    private isFile(path: string): boolean {
        try {
            return statSync(path).isFile();
        } catch {
            return false;
        }
    }

    private getMimeType(path: string): string {
        return MIME_TYPES[extname(path).toLowerCase()] || 'application/octet-stream';
    }

    private placeholder(): string {
        return 'Chain Isles server is running. Build the client with `yarn build` to serve the game here.';
    }
}

function resolveClientDist(): string {
    if (process.env.CLIENT_DIST) return process.env.CLIENT_DIST;

    let serverDir = fileURLToPath(new URL('.', import.meta.url));

    return join(serverDir, '../../client/dist');
}
