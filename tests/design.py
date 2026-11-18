"""Appearance API checks against a disposable copy. Uses the same env vars as integration.py."""
import json,os,urllib.request,urllib.error,http.cookiejar
URL=os.environ['QUIZ_TEST_URL']; PASSWORD=open(os.environ['QUIZ_TEST_PASSWORD_FILE']).read().strip()
class Client:
 def __init__(self):
  self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.csrf='';self.csrf=self.call('bootstrap')['csrf']
 def call(self,action,data=None,status=200):
  req=urllib.request.Request(URL+'/api.php?action='+action,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.csrf,'X-Team-Token':self.token})
  try:
   with self.opener.open(req) as r:code=r.status;body=r.read()
  except urllib.error.HTTPError as e:code=e.code;body=e.read()
  assert code==status,(action,code,body)
  return json.loads(body)
h=Client();g=Client();g.call('save_design',{'pages':{}},401)
h.call('login',{'password':PASSWORD})
quiz=next(q for q in h.call('quizzes')['quizzes'] if q['title']=='Между строк')
run=h.call('activate',{'id':quiz['id']})['id'];g.token=g.call('join',{'name':'Команда проверки оформления'})['token']
g.call('answer',{'run':run,'question':'q1','value':[1],'final':True})
page={'mode':'page','background':'#e4efe3','fontSize':20,'regions':{'title':{'text':'Новый заголовок','dx':5,'size':48}},'elements':[{'id':'stable-element','type':'text','text':'Текст на странице','x':10,'y':65,'w':40,'size':30,'font':'serif','bold':True,'align':'center','color':'#193c32'}]}
for key in ['home','login','join','restore','waiting','waiting-slide','new-game','completed','start','question','finish']:
 h.call('save_design',{'pages':{key:page},'quizzes':[]})
 boot=g.call('bootstrap');assert boot['appearance'][key]['regions']['title']['text']=='Новый заголовок'
 assert boot['appearance'][key]['elements'][0]['id']=='stable-element'
layouts={'cover':page,'finishLayout':page,'completionLayout':page,'q1':page}
h.call('save_design',{'pages':{'home':page},'quizzes':[{'id':quiz['id'],'layouts':layouts}]})
p=g.call('play');assert p['quiz']['cover']['mode']=='page';assert p['quiz']['questions'][0]['layout']['regions']['title']['text']=='Новый заголовок'
assert p['answers'][0]['final'] and p['answers'][0]['value']==[1]
assert 'correct' not in p['quiz']['questions'][0]
m=h.call('monitor');assert m['teams'][0]['score']==1
assert m['quiz']['questions'][0]['correct']==[1]
assert m['quiz']['title']==quiz['title']
# Failed validation must leave the last saved appearance intact.
bad=json.loads(json.dumps(page));bad['backgroundImage']='javascript:alert(1)'
h.call('save_design',{'pages':{'home':bad}},400)
assert g.call('bootstrap')['appearance']['home']['background']=='#e4efe3'
# Malicious style values are constrained, never used as arbitrary CSS.
bad=json.loads(json.dumps(page));bad['regions']['title']['color']='red;background:url(x)';bad['regions']['title']['dx']=999;bad['elements'][0]['size']=999
h.call('save_design',{'pages':{'home':bad}})
a=g.call('bootstrap')['appearance']['home'];assert a['regions']['title']['dx']==95 and 'color' not in a['regions']['title'];assert a['elements'][0]['size']==100
h.call('save_design',{'pages':{'home':page},'quizzes':[{'id':'missing','layouts':{'cover':page}}]},409)
assert g.call('bootstrap')['appearance']['home']['regions']['title']['dx']==95
saved=next(q for q in h.call('quizzes')['quizzes'] if q['id']==quiz['id'])['content']
h.call('save_quiz',{'id':quiz['id'],'content':saved})
saved=next(q for q in h.call('quizzes')['quizzes'] if q['id']==quiz['id'])['content']
assert saved['cover']['mode']=='page' and saved['finishLayout']['elements'][0]['id']=='stable-element'
assert 'password' not in g.call('bootstrap')
print('PASS: all page types, protected save, persistent IDs, full-page styles, active design updates, unchanged answers and scoring, safe styles and media.')
# Reset payload removes only presentation, including the hidden completion screen.
existing=h.call('quizzes')['quizzes'];before=h.call('monitor')['teams']
def semantic(content):
 c=json.loads(json.dumps(content))
 for k in ['cover','finishLayout','completionLayout']:c.pop(k,None)
 for q in c['questions']:q.pop('layout',None)
 return c
original={q['id']:semantic(q['content']) for q in existing}
default={'mode':'page','inherit':False,'background':'#f6f5f0','fontSize':18,'textColor':'#193c32','font':'sans','backgroundImage':'','elements':[],'regions':{}}
keys=['home','login','join','restore','waiting','new-game','waiting-slide','start','question','finish','completed']
reset=[{'id':q['id'],'layouts':{'cover':default,'finishLayout':default,'completionLayout':default,**{x['id']:default for x in q['content']['questions']}}} for q in existing]
h.call('save_design',{'pages':{k:default for k in keys},'quizzes':reset})
assert h.call('monitor')['teams']==before
for q in h.call('quizzes')['quizzes']:
 assert semantic(q['content'])==original[q['id']]
 assert q['content']['completionLayout']['inherit'] is False
 assert all(x['layout']['elements']==[] and x['layout']['inherit'] is False for x in q['content']['questions'])
assert all(g.call('bootstrap')['appearance'][k]['elements']==[] for k in keys)
print('PASS: reset presentation across all quizzes/pages, persist inheritance switch, preserve questions/keys/answers and scores, hidden completion layout.')
