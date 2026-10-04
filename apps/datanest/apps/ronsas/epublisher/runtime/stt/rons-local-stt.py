import hashlib, json, os, shutil, subprocess, sys, tempfile, threading, traceback
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MODEL_ID = os.environ.get('RONS_WHISPER_MODEL', r'C:\\Users\\Ashley\\Resonance\\OpenNova\\runtime\\models\\whisper-small')
PORT = int(os.environ.get('RONS_STT_PORT', '7864'))
FFMPEG = shutil.which('ffmpeg')
_PIPE = None
_LOCK = threading.Lock()
YOUTUBE_MAX_DURATION = int(os.environ.get('RONS_YOUTUBE_STT_MAX_SECONDS', '3600'))
MAX_ACTIVE_STT = max(1, int(os.environ.get('RONS_STT_MAX_ACTIVE', '1')))
_STT_GATE = threading.BoundedSemaphore(MAX_ACTIVE_STT)

class SourceAcquisitionError(RuntimeError):
    def __init__(self, status, code, reason, retryable):
        super().__init__(reason); self.status=status; self.code=code; self.reason=reason; self.retryable=retryable


def model_ready():
    mp = Path(MODEL_ID)
    weights = mp / 'model.safetensors'
    return mp.is_dir() and weights.is_file() and weights.stat().st_size > 900_000_000


def get_pipe():
    global _PIPE
    if _PIPE is not None:
        return _PIPE
    with _LOCK:
        if _PIPE is None:
            import torch
            from transformers import pipeline
            device = 0 if torch.cuda.is_available() else -1
            dtype = torch.float16 if device == 0 else torch.float32
            _PIPE = pipeline('automatic-speech-recognition', model=MODEL_ID,
                             device=device, torch_dtype=dtype)
    return _PIPE


def transcribe(raw: bytes, mode: str):
    if not FFMPEG:
        raise RuntimeError('FFmpeg is not available')
    with tempfile.TemporaryDirectory(prefix='rons-stt-') as td:
        src = Path(td) / 'input.media'
        wav = Path(td) / 'audio.wav'
        src.write_bytes(raw)
        subprocess.run([FFMPEG, '-y', '-i', str(src), '-vn', '-af',
                        'highpass=f=80,lowpass=f=7600,loudnorm=I=-16:TP=-1.5:LRA=11',
                        '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', str(wav)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        pipe = get_pipe()
        kwargs = {'return_timestamps': True, 'chunk_length_s': 30, 'stride_length_s': 5}
        if mode == 'best':
            kwargs['generate_kwargs'] = {'num_beams': 5}
        elif mode == 'accurate':
            kwargs['generate_kwargs'] = {'num_beams': 3}
        result = pipe(str(wav), **kwargs)
        chunks = result.get('chunks') or []
        segments = []
        words = []
        for item in chunks:
            ts = item.get('timestamp') or (None, None)
            segment = (item.get('text') or '').strip()
            if not segment:
                continue
            parts = segment.split()
            start, end = ts[0], ts[1]
            segments.append({'start': start, 'end': end, 'text': segment})
            if start is not None and end is not None and end >= start and parts:
                step = (end - start) / len(parts) if len(parts) else 0
                for idx, token in enumerate(parts):
                    words.append({'word': token, 'start': round(start + idx * step, 3), 'end': round(start + (idx + 1) * step, 3)})
            else:
                for token in parts:
                    words.append({'word': token, 'start': None, 'end': None})
        text = (result.get('text') or '').strip()
        return {
            'text': text,
            'words': words,
            'segments': segments,
            'audio_events': [],
            'quality': {
                'provider': 'rons-local-whisper',
                'model': MODEL_ID,
                'mode': mode,
                'has_content': bool(text),
                'has_timestamps': bool(words),
                'normalization': 'highpass80+lowpass7600+loudnorm-16LUFS',
                'segment_count': len(segments),
                'word_count': len(words) if words else len(text.split()),
                'char_count': len(text),
                'final_status': 'local-verified' if text else 'empty',
            },
            'cached': False,
        }

def _validated_video_id(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    if len(value) != 11 or any(not (ch.isalnum() or ch in '_-') for ch in value):
        return None
    return value


def _youtube_video_id(url_text: str):
    parsed = urlparse(url_text)
    host = parsed.hostname.lower() if parsed.hostname else ''
    if host == 'youtu.be':
        return _validated_video_id(parsed.path.strip('/').split('/')[0])
    if host in ('youtube.com', 'www.youtube.com', 'm.youtube.com'):
        if parsed.path == '/watch':
            return _validated_video_id((parse_qs(parsed.query).get('v') or [None])[0])
        if parsed.path.startswith('/shorts/'):
            parts = parsed.path.split('/')
            return _validated_video_id(parts[2] if len(parts) > 2 else None)
    return None


def transcribe_youtube_url(url_text: str, mode: str):
    video_id = _youtube_video_id(url_text)
    if not video_id:
        raise ValueError('Only direct public YouTube video URLs are accepted')
    canonical_url = f'https://www.youtube.com/watch?v={video_id}'
    with tempfile.TemporaryDirectory(prefix='rons-youtube-stt-') as td:
        output = str(Path(td) / '%(id)s.%(ext)s')
        try:
            from yt_dlp import YoutubeDL
            from yt_dlp.utils import match_filter_func
            options = {
                'noplaylist': True,
                'socket_timeout': 15,
                'retries': 2,
                'fragment_retries': 2,
                'max_filesize': 220 * 1024 * 1024,
                'match_filter': match_filter_func(f'duration <= {YOUTUBE_MAX_DURATION}'),
                'format': 'bestaudio/best',
                'outtmpl': output,
                'quiet': True,
                'no_warnings': True,
            }
            with YoutubeDL(options) as downloader:
                downloader.download([canonical_url])
        except Exception as exc:
            detail = str(exc).strip().splitlines()[-1][:500] or 'yt-dlp failed'
            low = detail.lower()
            if any(x in low for x in ('video unavailable','private video','members-only','sign in to confirm','not available')):
                raise SourceAcquisitionError(422, 'source_unavailable', detail, False) from exc
            raise SourceAcquisitionError(502, 'upstream_acquisition_failed', detail, True) from exc
        candidates = [p for p in Path(td).iterdir() if p.is_file() and p.suffix not in ('.part', '.ytdl')]
        if not candidates:
            raise SourceAcquisitionError(502, 'upstream_empty_response', 'YouTube audio acquisition produced no media file', True)
        media = max(candidates, key=lambda p: p.stat().st_size)
        if media.stat().st_size > 220 * 1024 * 1024:
            raise SourceAcquisitionError(422, 'source_too_large', 'Recovered media exceeds the local STT size limit', False)
        result = transcribe(media.read_bytes(), mode)
        transcript = (result.get('text') or '').strip()
        result.update({'source_url': url_text, 'video_id': video_id, 'transcript_type': 'speech_to_text',
                       'acquisition': 'yt-dlp-public-audio', 'retrieved_at': datetime.now(timezone.utc).isoformat(),
                       'content_hash': hashlib.sha256(transcript.encode('utf-8')).hexdigest() if transcript else None})
        result['quality'].update({'source_kind': 'youtube-video', 'evidence_status': 'stt-extracted-not-fact-verified'})
        return result

class Handler(BaseHTTPRequestHandler):
    server_version = 'RONSLocalSTT/0.1'

    def _origin(self):
        return self.headers.get('Origin', '')

    def _cors(self):
        origin = self._origin()
        if origin in ('http://127.0.0.1:3301', 'http://localhost:3301', 'http://127.0.0.1:3101', 'http://localhost:3101'):
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type,X-Filename,X-Mode')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')

    def _json(self, status, payload, retry_after=None):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        if isinstance(retry_after, int) and 0 <= retry_after <= 3600:
            self.send_header('Retry-After', str(retry_after))
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            ready = model_ready()
            self._json(200, {'ok': True, 'model_ready': ready, 'model': MODEL_ID, 'port': PORT})
        else:
            self._json(404, {'error': 'not found'})

    def do_POST(self):
        if self.path not in ('/transcribe', '/transcribe-url'):
            self._json(404, {'error': 'not found'})
            return
        if self._origin() not in ('http://127.0.0.1:3301', 'http://localhost:3301', 'http://127.0.0.1:3101', 'http://localhost:3101', ''):
            self._json(403, {'error': 'origin denied'})
            return
        try:
            if not model_ready():
                self._json(503, {'error': 'Local Whisper model is not installed completely', 'model_ready': False})
                return
            size = int(self.headers.get('Content-Length', '0'))
            if self.path == '/transcribe-url':
                if size <= 0 or size > 65536:
                    raise ValueError('invalid URL request size')
                payload = json.loads(self.rfile.read(size).decode('utf-8'))
                url_text = str(payload.get('url') or '').strip()
                mode = str(payload.get('mode') or 'accurate').lower()
                if mode not in ('fast', 'accurate', 'best'):
                    mode = 'accurate'
                if not _STT_GATE.acquire(blocking=False):
                    self._json(503, {'error':'stt_service_busy','retryable':True,'max_active':MAX_ACTIVE_STT}, retry_after=2); return
                try:
                    self._json(200, transcribe_youtube_url(url_text, mode))
                finally:
                    _STT_GATE.release()
                return
            if size <= 0 or size > 220 * 1024 * 1024:
                raise ValueError('invalid audio payload size')
            raw = self.rfile.read(size)
            mode = self.headers.get('X-Mode', 'best').lower()
            if mode not in ('fast', 'accurate', 'best'):
                mode = 'best'
            if not _STT_GATE.acquire(blocking=False):
                self._json(503, {'error':'stt_service_busy','retryable':True,'max_active':MAX_ACTIVE_STT}, {'Retry-After':'2'}); return
            try:
                self._json(200, transcribe(raw, mode))
            finally:
                _STT_GATE.release()
        except SourceAcquisitionError as exc:
            self._json(exc.status, {'error':exc.code,'reason':exc.reason,'retryable':exc.retryable,'provider':'rons-local-whisper'})
        except ValueError as exc:
            self._json(422, {'error':'invalid_source_request','reason':str(exc),'retryable':False,'provider':'rons-local-whisper'})
        except Exception as exc:
            traceback.print_exc()
            self._json(500, {'error':'transcription_failed','reason':str(exc),'retryable':False,'provider':'rons-local-whisper'})

    def log_message(self, fmt, *args):
        print('[RONS-STT]', self.address_string(), fmt % args, flush=True)


class RonsThreadingHTTPServer(ThreadingHTTPServer):
    request_queue_size = int(os.environ.get('RONS_STT_LISTEN_BACKLOG', '128'))
    daemon_threads = True

if __name__ == '__main__':
    print(f'[RONS-STT] localhost:{PORT} model={MODEL_ID} ffmpeg={FFMPEG}', flush=True)
    RonsThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()

