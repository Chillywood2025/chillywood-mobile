"""Exercise the exact helper without starting the database qualification."""
import ast
import http.client
import socket
import threading
import unittest
from pathlib import Path

tree=ast.parse(Path(__file__).with_name('run.py').read_text())
function=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='raw_put_response')
namespace={'http':__import__('http'),'socket':socket,'threading':threading}
exec(compile(ast.Module(body=[function],type_ignores=[]),'run.py','exec'),namespace)
raw_put_response=namespace['raw_put_response']

class RawPutTests(unittest.TestCase):
    def invoke(self,reply,consume=False):
        listener=socket.socket();listener.bind(('127.0.0.1',0));listener.listen(2);listener.settimeout(2)
        port=listener.getsockname()[1];seen=[];errors=[]
        raw=b'x'*(8*1024*1024)
        def serve():
            try:
                conn,_=listener.accept()
                with conn:
                    conn.settimeout(2);head=b''
                    while b'\r\n\r\n' not in head:head+=conn.recv(4096)
                    headers,body=head.split(b'\r\n\r\n',1);seen.append(headers)
                    if consume:
                        while len(body)<len(raw):body+=conn.recv(min(65536,len(raw)-len(body)))
                        seen.append(len(body))
                    if reply:conn.sendall(reply)
                    # Shutdown reads so the oversized original write sees a
                    # refusal while the already-sent response remains readable.
                    conn.shutdown(socket.SHUT_RD)
                    conn.shutdown(socket.SHUT_WR)
                    while conn.recv(65536):pass
            except OSError:pass
            except Exception as error:errors.append(error)
        worker=threading.Thread(target=serve);worker.start()
        try:
            return raw_put_response('/functions/v1/isolated-paid-video-upload-v2/id',
              {'content-type':'video/mp4','content-length':str(len(raw))},raw,port)
        finally:
            worker.join(3);self.assertFalse(worker.is_alive());self.assertFalse(errors)
            self.assertEqual(len([x for x in seen if isinstance(x,bytes)]),1)
            listener.settimeout(.05)
            with self.assertRaises(socket.timeout):listener.accept()
            listener.close()

    def test_early_rejection_retains_actual_response(self):
        payload=b'{"state":"unknown"}'
        status,body,_=self.invoke(b'HTTP/1.1 503 Service Unavailable\r\nContent-Length: '+str(len(payload)).encode()+b'\r\nConnection: close\r\n\r\n'+payload)
        self.assertEqual(status,503);self.assertEqual(body,payload)

    def test_no_response_is_not_a_synthetic_rejection(self):
        with self.assertRaises((http.client.HTTPException,OSError)):self.invoke(None)

    def test_success_reads_actual_body_once(self):
        status,body,_=self.invoke(b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}',True)
        self.assertEqual((status,body),(200,b'{}'))

    def test_truncated_response_fails(self):
        with self.assertRaises((http.client.HTTPException,OSError)):
            self.invoke(b'HTTP/1.1 503 Service Unavailable\r\nContent-Length: 99\r\nConnection: close\r\n\r\n{}',True)

    def test_oversized_response_fails(self):
        with self.assertRaises(AssertionError):
            self.invoke(b'HTTP/1.1 200 OK\r\nContent-Length: 1048577\r\nConnection: close\r\n\r\n'+b'x'*1048577,True)

if __name__=='__main__':unittest.main()
