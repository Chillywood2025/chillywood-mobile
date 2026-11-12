# Local-only browser proof: Python Playwright, Chromium, ffmpeg and openssl required.
# Uses an isolated profile, ephemeral TLS key, and synthetic MP4; no provider access.
import http.server,ssl,threading,json,os,subprocess,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
fixture=tempfile.TemporaryDirectory(prefix='stripe-playback-browser-');tmp=Path(fixture.name)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=320x240:rate=24','-t','3','-pix_fmt','yuv420p','-c:v','libx264','-movflags','+faststart','-y',str(tmp/'video.mp4')],check=True)
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(tmp/'key.pem'),'-out',str(tmp/'cert.pem'),'-days','1','-subj','/CN=localhost'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
video=(tmp/'video.mp4').read_bytes();calls=[];deny=False
ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003']
bridge=subprocess.check_output(['node','-e',"const ts=require('typescript'),fs=require('fs');console.log('var exports={};'+ts.transpileModule(fs.readFileSync('_lib/stripeSandboxPlaybackWorker.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)"],cwd=root)
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/stripe-sandbox-media-sw.js':
   data=(root/'public/stripe-sandbox-media-sw.js').read_bytes();self.send_response(200);self.send_header('Content-Type','application/javascript');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
  if self.path=='/bridge.js':self.send_response(200);self.send_header('Content-Type','application/javascript');self.end_headers();self.wfile.write(bridge);return
  if self.path.startswith('/functions/v1/stripe-sandbox-paid-video-playback/'):
   calls.append(dict(self.headers));r=self.headers.get('Range');assert self.headers.get('Authorization')=='Bearer SYNTHETIC_TEST_ONLY';assert self.headers.get('X-Chillywood-Auth-Session')==ids[2]
   if deny:self.send_response(403);self.end_headers();return
   a,b=map(int,r[6:].split('-'));assert b-a+1<=4*1024*1024;data=video[a:b+1]
   self.send_response(206)
   for k,v in {'Content-Type':'video/mp4','Content-Length':len(data),'Content-Range':f'bytes {a}-{b}/{len(video)}','Cache-Control':'no-store','X-Chillywood-Media-Protocol':'stripe-sandbox-range-v1','X-Chillywood-Video-Id':ids[0],'X-Chillywood-Grant-Id':ids[1],'X-Chillywood-Source-Version':ids[2],'X-Chillywood-Asset-Sha256':'a'*64,'X-Chillywood-Byte-Length':len(video)}.items():self.send_header(k,str(v))
   self.end_headers();self.wfile.write(data);return
  self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'<html><body><video muted controls></video><script src="/bridge.js"></script></body></html>')
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.load_cert_chain(tmp/'cert.pem',tmp/'key.pem');server.socket=ctx.wrap_socket(server.socket,server_side=True);threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'https://127.0.0.1:{server.server_port}'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--ignore-certificate-errors']);context=browser.new_context(ignore_https_errors=True);page=context.new_page();page.goto(origin)
 uri=page.evaluate('''async args=>{window.binding=await exports.bindStripeSandboxPlaybackWorker({endpoint:location.origin+'/functions/v1/stripe-sandbox-paid-video-playback/'+args.ids[0]+'/'+args.ids[1],headers:{Authorization:'Bearer SYNTHETIC_TEST_ONLY',apikey:'public','X-Chillywood-Auth-Session':args.ids[2]},descriptor:{videoId:args.ids[0],grantId:args.ids[1],sourceVersionId:args.ids[2],assetSha256:'a'.repeat(64),byteLength:args.length},signal:new AbortController().signal,onLost:()=>window.lost=true});return binding.uri}''',{'ids':ids,'length':len(video)})
 assert 'SYNTHETIC' not in uri
 page.evaluate('''uri=>{const v=document.querySelector('video');v.src=uri;v.play();}''',uri);page.wait_for_function("document.querySelector('video').currentTime>0.1",timeout=30000)
 other=context.new_page();other.goto(origin);assert other.evaluate('(uri)=>fetch(uri,{headers:{Range:"bytes=0-1"}}).then(r=>r.status)',uri)==403
 deny=True;assert page.evaluate('(uri)=>fetch(uri,{headers:{Range:"bytes=0-1"}}).then(r=>r.status)',uri)==403
 page.evaluate('binding.release()');assert page.evaluate('(uri)=>fetch(uri,{headers:{Range:"bytes=0-1"}}).then(r=>r.status)',uri)==403
 print(json.dumps({'actual_html_video_progress':True,'client_isolation':True,'revoked_backend_denied':True,'released_binding_denied':True,'provider_range_requests':len(calls),'synthetic_mp4_bytes':len(video)}));browser.close()
server.shutdown();fixture.cleanup()
