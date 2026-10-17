"""Serve the built game (dist/) to a phone on the same Wi-Fi.

    python serve.py          # port 5174
    python serve.py 5175

⚠ Port 5174 on purpose: Windows Firewall on this PC already lets 5173-5175 in on
every network profile (the "Vite Dev" rule). Any other port answers the PC and
silently times out on the phone, which looks exactly like a wrong address.

⚠ No caching: a phone that reloads must get the build you just made, not the
one before it. (Same reason as seatawayO/serve.py.)

⚠ It listens on every interface, so anything on the LAN can read dist/ while it
runs. Fine on a home network; do not run it on one you do not control.
"""
import http.server
import os
import socket
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5174
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")


class NoCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_header(self, key, value):
        if key.lower() in ("last-modified", "etag"):
            return
        if key.lower() == "content-type" and value.startswith(("text/", "application/javascript")) and "charset" not in value:
            value += "; charset=utf-8"
        super().send_header(key, value)

    def log_message(self, fmt, *a):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % a))


NoCache.extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map,
                              **{".js": "application/javascript", ".webmanifest": "application/manifest+json",
                                 ".woff2": "font/woff2"})


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def lan_ips():
    """Every IPv4 address of this PC, private Wi-Fi-style ones first.
    ⚠ Not "the one the default route uses": with a VPN up, that is the tunnel
    (192.168.167.x on ws1tun here), which a phone on the Wi-Fi cannot reach."""
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except Exception:
        pass
    ips = [i for i in ips if not i.startswith(("127.", "169.254."))]
    return sorted(ips, key=lambda i: (not i.startswith("192.168.0.") and not i.startswith("192.168.1."), i))


if not os.path.exists(os.path.join(ROOT, "index.html")):
    sys.exit("dist/ is empty - run: cd src && python build.py")
with Server(("", PORT), NoCache) as srv:
    print("http://127.0.0.1:%d/   on this PC" % PORT, flush=True)
    for ip in lan_ips():
        print("http://%s:%d/   from another device (use the one on your Wi-Fi)" % (ip, PORT), flush=True)
    srv.serve_forever()
