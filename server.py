#!/usr/bin/env python3
"""Локальный сервер приложения «Мои финансы».

Слушает сразу несколько портов (на случай, если какой-то занят или
недоступен с телефона) и отдаёт файлы с запретом кэширования,
чтобы браузер всегда получал актуальную версию после правок.
"""
import functools
import http.server
import os
import threading

PORTS = [8934, 8080]
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def serve(port):
    handler = functools.partial(NoCacheHandler, directory=DIRECTORY)
    server = http.server.ThreadingHTTPServer(("", port), handler)
    server.serve_forever()


if __name__ == "__main__":
    threads = [threading.Thread(target=serve, args=(p,), daemon=True) for p in PORTS]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
