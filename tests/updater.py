"""Disposable filesystem/DB tests for update protocol 1. Never uses the live database."""
from pathlib import Path
import tempfile,shutil,subprocess,zipfile,json,hashlib,sqlite3,os,urllib.request,urllib.error,http.cookiejar,time,concurrent.futures
SRC=Path(__file__).resolve().parents[1];WORK=Path(tempfile.mkdtemp(prefix='pereplet-updater-test-'));ROOT=WORK/'quiz-library';ROOT.mkdir()
subprocess.run(['python3',str(SRC/'tools/build-release.py'),str(WORK/'base.zip')],check=True,stdout=subprocess.DEVNULL)
with zipfile.ZipFile(WORK/'base.zip') as z:
 for n in z.namelist():
  if n!='quiz-library/update-manifest.json':z.extract(n,WORK)
# The fixture represents a previous compatible installation, independent of the release version.
(ROOT/'version.json').write_text(json.dumps({'version':'1.0.0','data_format':1,'updater_protocol':1,'min_php':'8.1.0'}))
(ROOT/'data').mkdir();(ROOT/'uploads').mkdir();(ROOT/'data/.htaccess').write_text('Require all denied\n')
password='test-'+os.urandom(16).hex();subprocess.run(['php',str(ROOT/'server/setup.php')],input=password+'\n',text=True,check=True,stdout=subprocess.DEVNULL)
(ROOT/'uploads/retained.png').write_bytes(b'unchanged-user-media')
(ROOT/'assets/removed.js').write_text('// old code only\n')
harness=WORK/'harness.php';harness.write_text('''<?php
require $argv[1].'/server/bootstrap.php';require $argv[1].'/server/updater.php';
try{switch($argv[2]){
case 'unpack':mkdir($argv[4]);up_unpack($argv[3],$argv[4],$argv[5]);break;
case 'apply':$manifest=up_unpack($argv[3],$argv[4],$argv[5]);up_apply($argv[4],$manifest['files'],$argv[5],'install');break;
case 'rollback':$record=up_json(up_dir().'/state.json')['rollback'];up_rollback(['id'=>$record['id']]);break;
case 'interrupt':up_lock_exclusive();$record=up_snapshot(gmdate('Ymd-His').'-'.bin2hex(random_bytes(6)),['assets/after-crash.js'],'1.0.9','install');up_write_json(up_dir().'/pending.json',$record);db_disconnect();file_put_contents(ROOT.'/api.php','<?php BROKEN SYNTAX');file_put_contents(ROOT.'/assets/after-crash.js','half update');break;
case 'release':try{up_release(json_decode(file_get_contents($argv[3]),true),'owner/repo');}catch(Throwable $e){throw $e;}break;
case 'urls':foreach(['http://github.com/x','https://127.0.0.1','https://github.com.evil.test/x','https://user@github.com/x','https://github.com:8443/x','file:///etc/passwd'] as $url){try{up_url($url);throw new Exception('ACCEPTED');}catch(RuntimeException $e){}}break;
}echo "OK";}catch(Throwable $e){fwrite(STDERR,$e->getMessage());exit(1);}
''')
def run(op,*args,ok=True):
 p=subprocess.run(['php',str(harness),str(ROOT),op,*map(str,args)],capture_output=True,text=True,timeout=120)
 assert (p.returncode==0)==ok,(op,p.returncode,p.stdout,p.stderr)
 return p
with zipfile.ZipFile(WORK/'base.zip') as z:base={n:z.read(n) for n in z.namelist() if n!='quiz-library/update-manifest.json'}
def package(name,version='1.0.1',extra=None,change=None,corrupt=False):
 files=dict(base);files['quiz-library/version.json']=json.dumps({'version':version,'data_format':1,'updater_protocol':1,'min_php':'8.1.0'}).encode();files['quiz-library/assets/new.js']=b'// New version\n'
 if change:files.update(change)
 m={'format':1,'version':version,'data_format':1,'updater_protocol':1,'min_php':'8.1.0','files':{n[13:]:hashlib.sha256(b).hexdigest() for n,b in files.items()}}
 if corrupt:files['quiz-library/assets/app.js']+=b'corruption'
 with zipfile.ZipFile(WORK/name,'w',zipfile.ZIP_DEFLATED) as z:
  for n,b in files.items():z.writestr(n,b)
  for n,b in (extra or {}).items():z.writestr(n,b)
  z.writestr('quiz-library/update-manifest.json',json.dumps(m))
 return WORK/name
for i,extra in enumerate([{'quiz-library/data/library.sqlite':b'no'},{'quiz-library/../outside.php':b'no'},{'/absolute.php':b'no'},{'quiz-library/uploads/x.php':b'no'}]):
 run('unpack',package(f'bad-{i}.zip',extra=extra),WORK/f'stage-{i}','1.0.1',ok=False)
run('unpack',package('bad-hash.zip',corrupt=True),WORK/'stage-hash','1.0.1',ok=False)
run('unpack',package('bad-php.zip',change={'quiz-library/server/update-health.php':b'<?php syntax error!'}),WORK/'stage-php','1.0.1',ok=False)
run('urls')
media=(ROOT/'uploads/retained.png').read_bytes()
def dbrows():
 with sqlite3.connect(ROOT/'data/library.sqlite') as db:
  return {n:sorted(db.execute('SELECT * FROM '+n).fetchall(),key=repr) for n, in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
before=dbrows();stage=WORK/'good-stage';stage.mkdir();run('apply',package('good.zip'),stage,'1.0.1')
assert json.loads((ROOT/'version.json').read_text())['version']=='1.0.1';assert (ROOT/'assets/new.js').exists() and not (ROOT/'assets/removed.js').exists();assert before==dbrows();assert media==(ROOT/'uploads/retained.png').read_bytes()
with sqlite3.connect(ROOT/'data/library.sqlite') as db:db.execute('INSERT INTO config VALUES(?,?)',('after_update','"retained"'))
post=dbrows();run('rollback');assert json.loads((ROOT/'version.json').read_text())['version']=='1.0.0';assert post==dbrows();assert not (ROOT/'assets/new.js').exists() and (ROOT/'assets/removed.js').exists()
# Runtime failure after a data write must restore the snapshot, not just the code.
health=b'''<?php require __DIR__.'/bootstrap.php';putcfg('venue','BAD CHANGE');db()->exec('CREATE TABLE bad_migration(id INTEGER)');exit(1);'''
stage=WORK/'fail-stage';stage.mkdir();p=run('apply',package('runtime-failure.zip',change={'quiz-library/server/update-health.php':health}),stage,'1.0.1',ok=False)
assert 'восстановлены' in p.stderr and post==dbrows();assert json.loads((ROOT/'version.json').read_text())['version']=='1.0.0';assert not (ROOT/'data/updater/pending.json').exists()
# Simulate process/power loss. The standalone CLI must work without loading broken api.php.
run('interrupt');assert (ROOT/'data/updater/pending.json').exists()
p=subprocess.run(['php',str(ROOT/'server/recover-update.php')],capture_output=True,text=True,timeout=30);assert p.returncode==0,p.stderr
assert post==dbrows() and not (ROOT/'assets/after-crash.js').exists() and not (ROOT/'data/updater/pending.json').exists()
subprocess.run(['php','-l',str(ROOT/'api.php')],check=True,stdout=subprocess.DEVNULL)
with sqlite3.connect(ROOT/'data/library.sqlite') as db:assert db.execute('PRAGMA integrity_check').fetchone()==('ok',);assert not db.execute('PRAGMA foreign_key_check').fetchall()
# A concurrent second installation must not downgrade/reinstall the same version.
stage=WORK/'duplicate-stage';stage.mkdir();run('apply',package('reinstall.zip',version='1.0.0'),stage,'1.0.0',ok=False)
assert json.loads((ROOT/'version.json').read_text())['version']=='1.0.0'
print('PASS: archive traversal/data/uploads/hash/syntax protection; stable install, old-file removal, code rollback preserving new data, failed-health rollback of code+DB, crash recovery, media/password preservation, SQLite integrity. Test root:',ROOT)
(WORK/'password.txt').write_text(password)
