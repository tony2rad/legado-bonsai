"""Sirve la carpeta de Estudio3D y guarda en export/ lo que la página envía por POST /guardar?nombre=..."""
import http.server, os, sys, urllib.parse

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "export")
os.makedirs(OUT, exist_ok=True)


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        name = os.path.basename(q.get("nombre", ["archivo.bin"])[0])
        data = self.rfile.read(int(self.headers["Content-Length"]))
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(f"{name} {len(data)}".encode())


http.server.ThreadingHTTPServer(("127.0.0.1", 8766), H).serve_forever()
