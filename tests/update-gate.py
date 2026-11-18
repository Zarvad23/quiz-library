"""Request locking/recovery gate on the disposable root created by run-all.py."""
import os,fcntl,urllib.request,urllib.error,time,concurrent.futures,json
from pathlib import Path
root=Path(os.environ['QUIZ_TEST_ROOT']).resolve();assert root!=Path(__file__).resolve().parents[1]
url=os.environ['QUIZ_TEST_URL']
lock=(root/'data/update.lock').open('a+')
fcntl.flock(lock,fcntl.LOCK_EX)
with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
 start=time.monotonic();future=pool.submit(urllib.request.urlopen,url+'/api.php?action=bootstrap')
 time.sleep(.3);assert not future.done(),'Request bypassed the exclusive updater lock'
 fcntl.flock(lock,fcntl.LOCK_UN);r=future.result(timeout=10);assert r.status==200;r.close();assert time.monotonic()-start>=.3
lock.close()
pending=root/'data/updater/pending.json';pending.parent.mkdir(exist_ok=True);pending.write_text('{}')
try:
 for path in ['/','/api.php?action=bootstrap']:
  try:urllib.request.urlopen(url+path,timeout=10);raise AssertionError('Interrupted update allowed normal request')
  except urllib.error.HTTPError as e:assert e.code==503 and b'recover-updates.cmd' in e.read()
finally:pending.unlink()
assert urllib.request.urlopen(url+'/api.php?action=bootstrap',timeout=10).status==200
print('PASS: in-flight request waits on exclusive lock, interrupted update blocks index/API before loading application, gate clears after recovery.')
