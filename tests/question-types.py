"""Run only on a disposable installation: QUIZ_TEST_URL + QUIZ_TEST_PASSWORD_FILE."""
import os,json,urllib.request,urllib.error,http.cookiejar,csv,io,concurrent.futures,statistics,time
URL=os.environ['QUIZ_TEST_URL'];PASSWORD=open(os.environ['QUIZ_TEST_PASSWORD_FILE']).read().strip()
class Client:
 def __init__(self):
  self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf='';self.token='';self.csrf=self.call('bootstrap')['csrf']
 def call(self,action,data=None,status=200):
  req=urllib.request.Request(URL+'/api.php?action='+action,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.csrf,'X-Team-Token':self.token})
  try:
   with self.opener.open(req,timeout=30) as r:code=r.status;raw=r.read().decode('utf-8-sig')
  except urllib.error.HTTPError as e:code=e.code;raw=e.read().decode()
  assert code==status,(action,code,raw)
  try:return json.loads(raw)
  except json.JSONDecodeError:return raw
h=Client();h.call('login',{'password':PASSWORD});g=Client()
q={'id':'words','type':'fields','text':'Назовите имя и отчество няни Пушкина','points':99,'fields':[{'id':'name','label':'Имя','accepted':['Арина'],'points':1},{'id':'patronymic','label':'Отчество','accepted':['Родионовна'],'points':2}],'resourceUrl':'https://example.org/reference?part=1&source=quiz','resourceLabel':'Открыть материал'}
link={'id':'link','type':'link','text':'Материал для чтения','resourceUrl':'http://example.org/article','resourceLabel':'Читать статью','points':99}
c={'title':'Поля и ссылки','questions':[q,link],'resultsMode':'show'}
qid=h.call('save_quiz',{'content':c})['id'];saved=next(x for x in h.call('quizzes')['quizzes'] if x['id']==qid)['content'];assert [x['points'] for x in saved['questions']]==[3,0]
# Errors locate an individual field. A failed save leaves the old content intact.
bad=json.loads(json.dumps(c));bad['questions'][0]['fields'][1]['accepted']=[];bad['questions'][0]['fields'][0]['label']='';bad['questions'][1]['resourceUrl']='javascript:alert(1)'
issues=h.call('save_quiz',{'id':qid,'content':bad},400)['issues'];assert {(x['index'],x['field']) for x in issues}=={(0,'fields.0.label'),(0,'fields.1.accepted'),(1,'resourceUrl')}
assert next(x for x in h.call('quizzes')['quizzes'] if x['id']==qid)['content']==saved
for url in ['javascript:alert(1)','data:text/html,hello','file:///etc/passwd','//example.org','https://user:password@example.org','']:
 bad=json.loads(json.dumps(c));bad['questions'][1]['resourceUrl']=url;h.call('save_quiz',{'content':bad},400)
for fields in [[],q['fields'][:1],q['fields']*7,[q['fields'][0],q['fields'][0]]]:
 bad=json.loads(json.dumps(c));bad['questions'][0]['fields']=fields;h.call('save_quiz',{'content':bad},400)
for points in [0,-1,101,0.5,'nan']:
 bad=json.loads(json.dumps(c));bad['questions'][0]['fields'][0]['points']=points;h.call('save_quiz',{'content':bad},400)
run=h.call('activate',{'id':qid})['id'];g.token=g.call('join',{'name':'Два слова'})['token'];p=g.call('play');assert all('accepted' not in f for f in p['quiz']['questions'][0]['fields'])
for v in ['',[],{'other':'secret'},{'name':['a']},{'name':'x'*301},{}]:g.call('answer',{'run':run,'question':'words','value':v,'final':True},400)
g.call('answer',{'run':run,'question':'words','value':{'name':'АРИНА!','patronymic':'Родионовн'},'final':False});p=g.call('play');assert p['answers'][0]['value']['name']=='АРИНА!' and 'parts' not in p['answers'][0]
m=h.call('monitor');t=next(t for t in m['teams'] if t['id']==p['team']['id']);assert t['score']==0 and t['answers'][0]['parts'][0]['score']==1
h.call('grade',{'run':run,'team':t['id'],'question':'words','field':'patronymic','score':2},400)
g.call('answer',{'run':run,'question':'words','value':{'name':'АРИНА!','patronymic':'Родионовн'},'final':True})
# Retry must never overwrite a final answer or its parts.
g.call('answer',{'run':run,'question':'words','value':{'name':'wrong','patronymic':'wrong'},'final':False})
p=g.call('play');assert 'parts' not in p['answers'][0] and all('accepted' not in f for f in p['quiz']['questions'][0]['fields'])
m=h.call('monitor');t=next(t for t in m['teams'] if t['id']==p['team']['id']);a=t['answers'][0];assert t['score']==1 and len(a['parts'])==2 and a['parts'][1]['similarity']>80 and not a['correct']
g.call('grade',{'run':run,'team':t['id'],'question':'words','field':'patronymic','score':2},401)
h.call('grade',{'run':run,'team':t['id'],'question':'words','score':3},400)
h.call('grade',{'run':run,'team':t['id'],'question':'words','field':'patronymic','score':1.5})
m=h.call('monitor');t=next(t for t in m['teams'] if t['id']==p['team']['id']);assert t['score']==2.5 and not t['answers'][0]['correct']
h.call('grade',{'run':run,'team':t['id'],'question':'words','field':'patronymic','score':2})
g.call('answer',{'run':run,'question':'link','value':'','final':True});p=g.call('play');assert p['done'] and p['feedback'] and next(a for a in p['answers'] if a['question_id']=='words')['score']==3 and next(a for a in p['answers'] if a['question_id']=='words')['correct'] and len(next(a for a in p['answers'] if a['question_id']=='words')['parts'])==2 and 'accepted' in p['quiz']['questions'][0]['fields'][0]
rows=list(csv.reader(io.StringIO(h.call('export&run='+run)),delimiter=';'));assert len(rows)==3 and rows[0][-2:]==['Баллы за ответ','Максимум за ответ'] and rows[1][-2:]==['1','1'] and rows[2][-2:]==['2','2']
# Blank individual fields score zero; hidden results don't disclose nested answer keys or marks.
c['resultsMode']='hide';c['questions']=[q];qid=h.call('save_quiz',{'content':c})['id'];run=h.call('activate',{'id':qid})['id']
g=Client();g.token=g.call('join',{'name':'Одно слово'})['token'];g.call('answer',{'run':run,'question':'words','value':{'name':'арина'},'final':True});p=g.call('play');assert p['done'] and not p['feedback'] and 'parts' not in p['answers'][0] and 'score' not in p['answers'][0] and all('accepted' not in f for f in p['quiz']['questions'][0]['fields'])
assert h.call('monitor')['teams'][0]['score']==1
# New types obey the same host gate as other questions.
c['paced']=True;c['questions']=[link,q];qid=h.call('save_quiz',{'content':c})['id'];run=h.call('activate',{'id':qid})['id'];g=Client();g.token=g.call('join',{'name':'Ждём материал'})['token']
assert not g.call('play')['quiz']['questions'];g.call('answer',{'run':run,'question':'link','value':'','final':True},403)
h.call('release_next',{'run':run,'expected':0});g.call('answer',{'run':run,'question':'link','value':'','final':True});g.call('answer',{'run':run,'question':'words','value':{'name':'арина'},'final':True},403)
h.call('release_next',{'run':run,'expected':1});g.call('answer',{'run':run,'question':'words','value':{'name':'арина','patronymic':'родионовна'},'final':True})
# Forty concurrent teams on a slide with independent marks.
c['paced']=False;c['questions']=[q];qid=h.call('save_quiz',{'content':c})['id'];run=h.call('activate',{'id':qid})['id']
def participate(i):
 start=time.monotonic();g=Client();g.token=g.call('join',{'name':f'Поля {i}'})['token'];g.call('answer',{'run':run,'question':'words','value':{'name':'арина','patronymic':'родионовна'},'final':True});assert g.call('play')['done'];return time.monotonic()-start
with concurrent.futures.ThreadPoolExecutor(max_workers=40) as pool:timings=list(pool.map(participate,range(40)))
m=h.call('monitor');assert len(m['teams'])==40 and all(t['score']==3 and len(t['answers'][0]['parts'])==2 for t in m['teams'])
print(f'PASS: independent field grading, drafts/resume, partial/blank answers, exact normalization, similarity, manual per-field grades, secure hidden results, safe links, validation locations, CSV rows, paced gate, idempotency; 40 concurrent teams p95={sorted(timings)[37]:.3f}s')
