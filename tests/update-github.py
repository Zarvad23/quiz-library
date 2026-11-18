"""Optional online smoke test: real published GitHub package, disposable installation only."""
from pathlib import Path
import tempfile,shutil,subprocess,os,secrets,json,urllib.request,urllib.error,http.cookiejar,socket,time,signal,sqlite3,zipfile
SRC=Path(__file__).resolve().parents[1];work=Path(tempfile.mkdtemp(prefix='pereplet-github-test-'));root=work/'site'
bootstrap=os.environ.get('QUIZ_BOOTSTRAP_ARCHIVE')
if bootstrap:
 root.mkdir()
 with zipfile.ZipFile(bootstrap) as archive:
  for name in archive.namelist():
   if name.startswith('quiz-library/') and not name.endswith('/'):
    target=root/name[13:];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(name))
 shutil.copy2(SRC/'server/updater.php',root/'server/updater.php')
else:shutil.copytree(SRC,root,ignore=shutil.ignore_patterns('data','uploads','.git','__pycache__'))
(root/'data').mkdir();(root/'uploads').mkdir();(root/'uploads/retained.png').write_bytes(b'unchanged-media')
v=json.loads((root/'version.json').read_text());baseline=v['version'] if bootstrap else '0.9.0';v['version']=baseline;(root/'version.json').write_text(json.dumps(v))
(root/'assets/pre-online-update.js').write_text('// old fixture code\n')
password=secrets.token_urlsafe(24);subprocess.run(['php',str(root/'server/setup.php')],input=password+'\n',text=True,check=True,stdout=subprocess.DEVNULL)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
URL=f'http://127.0.0.1:{port}';log=(work/'server.log').open('w');p=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','-t',str(root),str(root/'server/dev-router.php')],env={**os.environ,'PHP_CLI_SERVER_WORKERS':'6'},stdout=log,stderr=log,start_new_session=True)
class Client:
 def __init__(self):
  self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf='';self.token='';self.csrf=self.call('bootstrap')['csrf']
 def call(self,action,data=None):
  req=urllib.request.Request(URL+'/api.php?action='+action,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.csrf,'X-Team-Token':self.token})
  try:
   with self.opener.open(req,timeout=240) as r:return json.load(r)
  except urllib.error.HTTPError as e:raise RuntimeError((action,e.code,e.read().decode()))
def rows():
 with sqlite3.connect(root/'data/library.sqlite') as db:return {t:sorted(db.execute('SELECT * FROM '+t).fetchall(),key=repr) for t, in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
try:
 for _ in range(100):
  try:urllib.request.urlopen(URL,timeout=1).close();break
  except OSError:time.sleep(.1)
 h=Client();h.call('login',{'password':password});q=h.call('quizzes')['quizzes'][0];run=h.call('activate',{'id':q['id']})['id'];g=Client();g.token=g.call('join',{'name':'До обновления'})['token'];g.call('answer',{'run':run,'question':'q1','value':[1],'final':True});h.call('stop',{})
 before=rows();check=h.call('update_check',{'force':True});assert check['check']['error'] is None,check
 target=check['check']['release']['version'];assert target==json.loads((SRC/'version.json').read_text())['version'],check
 result=h.call('update_install',{'version':target});assert result['version']==target,result
 assert h.call('update_status')['version']==target;assert before==rows();assert not (root/'assets/pre-online-update.js').exists();assert (root/'uploads/retained.png').read_bytes()==b'unchanged-media'
 assert h.call('monitor&run='+run)['teams'][0]['score']==1
 h.call('settings',{'venue':'После обновления','registration':True,'feedback':True,'maxTeams':100});after=rows();status=h.call('update_status');assert status['rollback']['version']==baseline
 h.call('update_rollback',{'id':status['rollback']['id']});assert h.call('update_status')['version']==baseline;assert after==rows();assert (root/'assets/pre-online-update.js').exists()
 print('PASS: '+('one-file bootstrap from '+baseline+'; ' if bootstrap else '')+'real GitHub release '+target+' downloaded, digest/manifest/lint verified, installed via host API, snapshot retained questions/password/answers/media, rollback retained post-install edits. Artifacts:',work)
finally:os.killpg(p.pid,signal.SIGTERM);p.wait(timeout=10);log.close()
