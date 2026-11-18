"""Updater API permissions against a disposable server; never downloads a release."""
import os,json,urllib.request,urllib.error,http.cookiejar
URL=os.environ['QUIZ_TEST_URL'];PASSWORD=open(os.environ['QUIZ_TEST_PASSWORD_FILE']).read().strip()
class Client:
 def __init__(self):
  self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf='';self.csrf=self.call('bootstrap')['csrf']
 def call(self,action,data=None,status=200,csrf=None):
  req=urllib.request.Request(URL+'/api.php?action='+action,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.csrf if csrf is None else csrf})
  try:
   with self.opener.open(req,timeout=30) as r:code=r.status;body=r.read()
  except urllib.error.HTTPError as e:code=e.code;body=e.read()
  assert code==status,(action,code,body)
  return json.loads(body)
h=Client();g=Client()
g.call('update_status',status=401)
for action in ['update_config','update_check','update_install','update_rollback']:
 g.call(action,{},status=401);g.call(action,{},status=403,csrf='forged');g.call(action,status=405)
h.call('login',{'password':PASSWORD});u=h.call('update_status');assert u['version']=='1.0.0' and not u['requirements']
h.call('update_config',{'repository':'https://github.com/owner/repo','automatic':False,'password':'wrong'},400)
u=h.call('update_config',{'repository':'https://github.com/owner/repo','automatic':False,'password':PASSWORD});assert u['settings']=={'repository':'owner/repo','automatic':False}
for repo in ['http://localhost/path','https://127.0.0.1','owner/repo/../../other','owner/repo?x=1','x\n/repo']:
 h.call('update_config',{'repository':repo,'automatic':True,'password':PASSWORD},400)
assert h.call('update_status')['settings']['repository']=='owner/repo'
q=h.call('quizzes')['quizzes'][0];h.call('activate',{'id':q['id']});assert h.call('update_status')['active']
h.call('update_install',{'version':'9.9.9'},400)
h.call('stop',{})
h.call('update_config',{'repository':'Zarvad23/quiz-library','automatic':True,'password':PASSWORD})
assert 'version' not in g.call('bootstrap') and 'updates' not in g.call('bootstrap')
print('PASS: host-only update APIs, POST/CSRF, password-protected source, repository validation, active-game installation block, no updater data in public bootstrap.')
