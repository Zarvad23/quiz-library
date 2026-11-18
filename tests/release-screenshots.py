"""Release metadata safety and backward compatibility; no remote requests or live DB."""
from pathlib import Path
import subprocess,json,tempfile
SRC=Path(__file__).resolve().parents[1];work=Path(tempfile.mkdtemp(prefix='pereplet-release-images-'))
def asset(name,url=None,size=2048,label=None,state='uploaded'):
 return {'name':name,'browser_download_url':url or 'https://github.com/owner/repo/releases/download/v1.0.3/'+name,'size':size,'label':label,'state':state}
raw={'id':123,'tag_name':'v1.0.3','body':'Описание <script>alert(1)</script>','assets':[dict(asset('quiz-library-update.zip'),digest='sha256:'+'a'*64,id=456)]}
php=work/'read.php';php.write_text('''<?php require $argv[1].'/server/bootstrap.php';require $argv[1].'/server/updater.php';echo json_encode(up_release(json_decode(file_get_contents($argv[2]),true),'owner/repo'));''')
def parse(v):
 f=work/'fixture.json';f.write_text(json.dumps(v));return json.loads(subprocess.check_output(['php',str(php),str(SRC),str(f)],text=True))
assert parse(raw)['screenshots']==[]
images=[asset('screenshot-02-view.png',label='Крупный просмотр'),asset('screenshot-01-gallery.jpg',label='<img src=x onerror=alert(1)>')]
r=parse({**raw,'assets':raw['assets']+images});assert [s['caption'] for s in r['screenshots']]==['<img src=x onerror=alert(1)>','Крупный просмотр'];assert r['version']=='1.0.3'
invalid=[asset('picture.png'),asset('screenshot-01-x.svg'),asset('screenshot-01-x.png',url='javascript:alert(1)'),asset('screenshot-02-x.png',url='https://evil.test/x.png'),asset('screenshot-03-x.png',url='https://github.com/other/repo/releases/download/x/shot.png'),asset('screenshot-04-x.png',url='https://user@github.com/owner/repo/releases/download/x/shot.png'),asset('screenshot-05-x.png',size=8388609),asset('screenshot-06-x.png',size=0),asset('screenshot-07-x.png',state='new')]
assert parse({**raw,'assets':raw['assets']+invalid})['screenshots']==[]
shots=[asset(f'screenshot-{i:02d}-test.webp') for i in range(15,0,-1)]
r=parse({**raw,'assets':raw['assets']+shots+[shots[0]]});assert len(r['screenshots'])==8 and r['screenshots'][0]['caption']=='Скриншот 1'
print('PASS: optional screenshot metadata, caption safety, allowed image formats/own-repo HTTPS URLs, bounded size/count, natural order, deduplication, legacy releases unaffected.')
