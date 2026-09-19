#!/usr/bin/env python3
"""Dev static server: like `python3 -m http.server` but sends no-store cache headers,
so edits show up on reload (also on phones over the LAN, which cache aggressively)."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()
    def log_message(self, fmt, *args):
        if '" 200 ' not in (fmt % args): super().log_message(fmt, *args)

port = int(sys.argv[1]) if len(sys.argv) > 1 else 4187
print(f'serving on http://0.0.0.0:{port}/ (no-store)', flush=True)
ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
