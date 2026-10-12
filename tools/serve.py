#!/usr/bin/env python3
"""Local development server for the Quranic Arabic site.

Like `python -m http.server` but:
  - sends Cache-Control: no-store, so the browser always reloads fresh files
  - picks the first free port starting at 8080 and prints the URL to use

Run it directly, or use the double-clickable `start-server.cmd` in the
project root (which also opens the browser for you).
"""
import contextlib
import os
import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoStoreHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()


def free_port(start=8080, tries=20):
    for port in range(start, start + tries):
        with contextlib.closing(socket.socket()) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    return None


def main():
    port = free_port()
    if port is None:
        print('No free port found (tried 8080-8099).')
        return 1
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(NoStoreHandler, directory=ROOT))
    print(f'Quranic Arabic local server running at http://localhost:{port}/')
    print('Close this window (or press Ctrl+C) to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == '__main__':
    sys.exit(main())
