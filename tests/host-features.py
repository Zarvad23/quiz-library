"""Only run against a disposable copy. Requires QUIZ_TEST_URL and QUIZ_TEST_PASSWORD_FILE."""
import os,json,urllib.request,urllib.error,http.cookiejar,concurrent.futures,csv,io
URL=os.environ['QUIZ_TEST_URL'];PASSWORD=open(os.environ['QUIZ_TEST_PASSWORD_FILE']).read().strip()
class Client:
 def __init__(self):
  self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf='';self.token='';self.csrf=self.call('bootstrap')['csrf']
 def call(self,action,data=None,status=200):
  req=urllib.request.Request(URL+'/api.php?action='+action,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.csrf,'X-Team-Token':self.token})
  try:
   with self.opener.open(req,timeout=20) as r:code=r.status;raw=r.read().decode('utf-8-sig')
  except urllib.error.HTTPError as e:code=e.code;raw=e.read().decode()
  assert code==status,(action,code,raw)
  try:return json.loads(raw)
  except json.JSONDecodeError:return raw
h=Client();h.call('login',{'password':PASSWORD});g=Client()
info={'id':'intro','type':'info','text':'','points':0,'media':'uploads/aaaaaaaaaaaaaaaaaaaaaaaa.gif','mediaType':'image'}
choice={'id':'choice','type':'single','text':'Секретный будущий вопрос','options':['Нет','Да'],'correct':[1],'points':2}
text={'id':'text','type':'text','text':'Кто автор?','accepted':['Лев Толстой'],'points':3}
last={'id':'last','type':'single','text':'Последний вопрос','options':['Да','Нет'],'correct':[0],'points':1}
content={'title':'Ведущий управляет','description':'','questions':[info,choice,text,last],'resultsMode':'hide','paced':True}
qid=h.call('save_quiz',{'content':content})['id']
saved=next(q for q in h.call('quizzes')['quizzes'] if q['id']==qid)['content'];assert saved['questions'][0]['text']=='' and saved['questions'][0]['points']==0
invalid=json.loads(json.dumps(content));invalid['title']='';invalid['questions'][1]['text']='';invalid['questions'][1]['correct']=[];invalid['questions'][2]['accepted']=[]
error=h.call('save_quiz',{'id':qid,'content':invalid},400)
assert {(x['index'],x['field']) for x in error['issues']}=={(None,'title'),(1,'text'),(1,'correct'),(2,'accepted')}
assert next(q for q in h.call('quizzes')['quizzes'] if q['id']==qid)['content']==saved
run=h.call('activate',{'id':qid})['id'];g.token=g.call('join',{'name':'Команда ожидания'})['token']
p=g.call('play');assert p['released']==0 and p['waitingForHost'] and p['totalQuestions']==4 and not p['quiz']['questions']
assert choice['text'] not in json.dumps(p,ensure_ascii=False)
g.call('answer',{'run':run,'question':'intro','value':'','final':True},403)
g.call('release_next',{'run':run,'expected':0},401)
assert h.call('release_next',{'run':run,'expected':0})['released']==1
assert h.call('release_next',{'run':run,'expected':0})['released']==1
p=g.call('play');assert len(p['quiz']['questions'])==1 and not p['waitingForHost']
assert choice['text'] not in json.dumps(p,ensure_ascii=False)
g.call('answer',{'run':run,'question':'intro','value':'','final':True})
p=g.call('play');assert p['waitingForHost'] and not p['done']
g.call('answer',{'run':run,'question':'choice','value':[1],'final':False},403)
h.call('release_next',{'run':run,'expected':1})
g.call('answer',{'run':run,'question':'choice','value':[1],'final':True})
second=Client();second.call('login',{'password':PASSWORD})
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 results=list(pool.map(lambda client:client.call('release_next',{'run':run,'expected':2}),[h,second]))
assert [r['released'] for r in results]==[3,3]
p=g.call('play');assert len(p['quiz']['questions'])==3 and p['released']==3
assert last['text'] not in json.dumps(p,ensure_ascii=False)
g.call('answer',{'run':run,'question':'text','value':'ЛЕВ,   ТОЛСТОЙ!','final':True})
assert g.call('play')['waitingForHost']
h.call('release_next',{'run':run,'expected':3})
g.call('answer',{'run':run,'question':'last','value':[0],'final':True})
p=g.call('play');assert p['done'] and not p['feedback'];assert all('score' not in a and 'correct' not in a for a in p['answers']);assert all('correct' not in q and 'accepted' not in q for q in p['quiz']['questions'])
m=h.call('monitor');assert m['run']['released']==4 and m['run']['paced'];assert m['teams'][0]['score']==6
rows=list(csv.reader(io.StringIO(h.call('export&run='+run)),delimiter=';'));assert len(rows)==4
# Explicit per-quiz results override the global default; autonomous mode stays available.
h.call('settings',{'venue':'Тест','registration':True,'feedback':False,'maxTeams':100})
content['paced']=False;content['resultsMode']='show';qid2=h.call('save_quiz',{'content':content})['id'];run2=h.call('activate',{'id':qid2})['id']
g2=Client();g2.token=g2.call('join',{'name':'Самостоятельная команда'})['token'];p=g2.call('play');assert len(p['quiz']['questions'])==4 and not p['waitingForHost']
for qid,value in [('intro',''),('choice',[1]),('text','Лев Толстой'),('last',[0])]:g2.call('answer',{'run':run2,'question':qid,'value':value,'final':True})
p=g2.call('play');assert p['done'] and p['feedback'] and sum(a['score'] for a in p['answers'])==6
h.call('release_next',{'run':run2,'expected':0},409)
h.call('release_next',{'run':run,'expected':4},409)
print('PASS: image-only information slide, indexed validation, failed-save atomicity, hidden future questions, server-enforced gate, idempotent/concurrent release, persistent progress, per-quiz results, info-free CSV, autonomous compatibility.')
