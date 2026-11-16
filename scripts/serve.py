# Local preview: python3 scripts/serve.py  ->  http://localhost:8000
import http.server, os, socketserver
os.chdir(os.path.join(os.path.dirname(__file__), ".."))
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 8000), http.server.SimpleHTTPRequestHandler) as s:
    print("Serving on http://localhost:8000"); s.serve_forever()
