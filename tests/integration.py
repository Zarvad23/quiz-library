"""Integration and concurrency checks. Run ONLY against a disposable copy/database.
QUIZ_TEST_URL=http://127.0.0.1:8093 python3 tests/integration.py
Password is read from QUIZ_TEST_PASSWORD_FILE, never embedded in the repository.
"""
import os,json,urllib.request,urllib.error,http.cookiejar,concurrent.futures,time,statistics,base64
URL=os.getenv('QUIZ_TEST_URL','http://127.0.0.1:8093')
PASSWORD=open(os.environ['QUIZ_TEST_PASSWORD_FILE']).read().strip()
class Client:
 def __init__(self):
  self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
  self.csrf='';self.token=''
  self.csrf=self.call('bootstrap')['csrf']
 def call(self,action,data=None,status=200,csrf=None):
  req=urllib.request.Request(URL+'/api.php?action='+action,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.csrf if csrf is None else csrf,'X-Team-Token':self.token})
  try:
   with self.opener.open(req,timeout=30) as r: code=r.status;body=r.read().decode('utf-8-sig')
  except urllib.error.HTTPError as e:code=e.code;body=e.read().decode()
  assert code==status,(action,code,body)
  try:return json.loads(body)
  except json.JSONDecodeError:return body
def upload(client,filename,content,status=200):
 boundary='----pereplet-test-upload'
 body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode()+content+f'\r\n--{boundary}--\r\n'.encode()
 req=urllib.request.Request(URL+'/api.php?action=upload',data=body,headers={'Content-Type':'multipart/form-data; boundary='+boundary,'X-CSRF-Token':client.csrf})
 try:
  with client.opener.open(req) as r:code=r.status;payload=r.read()
 except urllib.error.HTTPError as e:code=e.code;payload=e.read()
 assert code==status,(code,payload)
 return json.loads(payload)
host=Client();guest=Client()
assert guest.call('quizzes',status=401)
guest.call('save_quiz',{'content':{}},status=403,csrf='forged')
guest.call('activate',{},status=401)
guest.call('login',{'password':'wrong'},status=401)
host.call('login',{'password':PASSWORD})
assert host.call('bootstrap')['host']
gif=base64.b64decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==')
asset=upload(host,'pixel.gif',gif);assert asset['type']=='image' and asset['url'].endswith('.gif')
upload(host,'disguised.jpg',b'<?php echo "should never execute";',status=400)
upload(guest,'pixel.gif',gif,status=401)
q=next(q for q in host.call('quizzes')['quizzes'] if q['title']=='Между строк')
# Extend demo to cover numeric tolerance and information slides.
c=q['content'];c['title']='Интеграционная проверка';c['questions'][3]['number']=33;c['questions'][3]['tolerance']=0.5
c['questions'].append({'id':'info','type':'info','text':'Финальная страница','points':0})
unsafe=json.loads(json.dumps(c));unsafe['questions'][0]['media']='javascript:alert(1)'
host.call('save_quiz',{'content':unsafe},status=400)
qid=host.call('save_quiz',{'content':c})['id'];run=host.call('activate',{'id':qid})['id']
name='Тестовая команда'
joined=guest.call('join',{'name':name});guest.token=joined['token']
p=guest.call('play');assert p['run']==run
for question in p['quiz']['questions']:
 assert not any(k in question for k in ['correct','accepted','number','tolerance','explanation'])
Client().call('join',{'name':name.upper()},status=400)
# Skipping a question is prohibited.
guest.call('answer',{'run':run,'question':'q2','value':[0,2],'final':True},status=409)
guest.call('answer',{'run':run,'question':'q1','value':[1],'final':False})
monitor=host.call('monitor');a=monitor['teams'][0]['answers'][0];assert not a['final'] and a['correct']
# A new browser session restores server-side draft using the recovery code.
restored=Client();restored.token=guest.token;assert restored.call('play')['answers'][0]['value']==[1]
for question,value in [('q1',[1]),('q2',[2,0]),('q3',' АРИНА,   РОДИОНОВНА! '),('q4','33,4'),('info','')]:
 guest.call('answer',{'run':run,'question':question,'value':value,'final':True})
# Duplicate requests cannot change committed answers.
guest.call('answer',{'run':run,'question':'q1','value':[0],'final':True})
p=restored.call('play');assert p['done'];assert sum(a['score'] for a in p['answers'])==6
assert all(a['correct'] for a in p['answers'] if a['question_id']!='info')
assert next(a for a in p['answers'] if a['question_id']=='q1')['value']==[1]
# Host correction, CSV export, hidden feedback, edits must not change run snapshots.
host.call('grade',{'run':run,'team':p['team']['id'],'question':'q3','score':1})
assert sum(a['score'] for a in restored.call('play')['answers'])==5
csv=host.call('export&run='+run);assert name in csv
c['title']='Изменённая викторина';host.call('save_quiz',{'id':qid,'content':c})
assert restored.call('play')['quiz']['title']=='Интеграционная проверка'
host.call('settings',{'venue':'Тест','maxTeams':100,'registration':True,'feedback':False})
p=restored.call('play');assert 'score' not in p['answers'][0];assert 'correct' not in p['quiz']['questions'][0]
host.call('settings',{'venue':'Тест','maxTeams':100,'registration':False,'feedback':True})
Client().call('join',{'name':'Закрытая регистрация'},status=400)
host.call('settings',{'venue':'Библиотека открытий','maxTeams':100,'registration':True,'feedback':True})
# Forty simultaneous teams: registration, drafts, final answers and polling.
newrun=host.call('activate',{'id':qid})['id'];assert restored.call('play')['newGame']
def play(i):
 start=time.monotonic();cl=Client();cl.token=cl.call('join',{'name':f'Нагрузочная {i:02}'})['token'];p=cl.call('play')
 cl.call('answer',{'run':newrun,'question':'q1','value':[0],'final':False})
 cl.call('answer',{'run':newrun,'question':'q1','value':[1],'final':True})
 for _ in range(3):assert len(cl.call('play')['answers'])==1
 return time.monotonic()-start
with concurrent.futures.ThreadPoolExecutor(max_workers=40) as pool:durations=list(pool.map(play,range(40)))
m=host.call('monitor');assert len(m['teams'])==40;assert all(t['score']==1 for t in m['teams'])
print(f'PASS: security, resume, drafts, grading, CSV, snapshots, settings, 40 concurrent teams. Full 8-request flow median {statistics.median(durations):.2f}s; max {max(durations):.2f}s.')
# Login rate limit and password invalidation.
otherhost=Client();otherhost.call('login',{'password':PASSWORD})
newpass=PASSWORD+'x';host.call('settings',{'venue':'Библиотека открытий','maxTeams':100,'registration':True,'feedback':True,'oldPassword':PASSWORD,'password':newpass})
otherhost.call('quizzes',status=401)
host.call('settings',{'venue':'Библиотека открытий','maxTeams':100,'registration':True,'feedback':True,'oldPassword':newpass,'password':PASSWORD})
for _ in range(8):guest.call('login',{'password':'wrong'},status=401)
guest.call('login',{'password':'wrong'},status=429)
host.call('stop',{});assert restored.call('play')['waiting'];assert len(host.call('monitor&run='+newrun)['teams'])==40
host.call('logout',{})
host.call('quizzes',status=401)
host.csrf=host.call('bootstrap')['csrf']
host.call('join',{'name':'После выхода'},status=400)
print('PASS: session invalidation, login throttling, archived run access, logout CSRF renewal.')
