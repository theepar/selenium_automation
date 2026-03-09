import _ffmpegPath from 'ffmpeg-static';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

const recordingsDir = path.join(process.cwd(), 'public', 'recordings');

if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
}

// Next.js on Windows mangles ffmpeg-static path to \ROOT\...
// Resolve it back to the actual absolute path under node_modules
function resolveFfmpegPath(p: string | null): string | null {
    if (!p) return null;
    if (p.startsWith('\\ROOT\\') || p.startsWith('/ROOT/')) {
        return path.join(process.cwd(), p.replace(/^[/\\]ROOT[/\\]/, ''));
    }
    return p;
}

const ffmpegPath = resolveFfmpegPath(_ffmpegPath);

export class ScreenRecorder {
    private process: ChildProcess | null = null;
    private outputFile: string = '';

    start(sessionId: number): string {
        const filename = `recording_${sessionId}.mp4`;
        this.outputFile = path.join(recordingsDir, filename);

        if (!ffmpegPath) throw new Error('ffmpeg binary tidak ditemukan.');

        const args = [
            '-y',
            '-f', 'gdigrab',
            '-framerate', '15',
            '-i', 'desktop',
            '-vf', 'scale=1280:720',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p',
            this.outputFile,
        ];

        this.process = spawn(ffmpegPath, args, {
            stdio: ['pipe', 'ignore', 'ignore'],
        });

        return filename;
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.process) { resolve(); return; }

            this.process.stdin?.write('q');
            this.process.on('close', () => { this.process = null; resolve(); });

            // Paksa kill setelah 10 detik jika ffmpeg stuck
            setTimeout(() => {
                if (this.process) { this.process.kill('SIGKILL'); this.process = null; resolve(); }
            }, 10000);
        });
    }
}
