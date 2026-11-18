"""Run all server-side checks on disposable installations. No live data is opened."""
from pathlib import Path
import os,tempfile,subprocess,shutil,secrets,socket,time,urllib.request,signal
SRC=Path(__file__).resolve().parents[1];work=Path(tempfile.mkdtemp(prefix='pereplet-ci-'));root=work/'site'
shutil.copytree(SRC,root,ignore=shutil.ignore_patterns('data','uploads','.git','__pycache__'))
(root/'data').mkdir();(root/'uploads').mkdir();password=work/'password';password.write_text(secrets.token_urlsafe(24));password.chmod(0o600)
subprocess.run(['php',str(root/'server/setup.php')],stdin=password.open(),stdout=subprocess.DEVNULL,check=True)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
log=(work/'server.log').open('w');p=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','-t',str(root),str(root/'server/dev-router.php')],stdout=log,stderr=log,env={**os.environ,'PHP_CLI_SERVER_WORKERS':'6'},start_new_session=True)
env={**os.environ,'QUIZ_TEST_URL':f'http://127.0.0.1:{port}','QUIZ_TEST_PASSWORD_FILE':str(password),'QUIZ_TEST_ROOT':str(root)}
try:
 for _ in range(100):
  try:urllib.request.urlopen(env['QUIZ_TEST_URL'],timeout=1).close();break
  except OSError:time.sleep(.1)
 else:raise RuntimeError('Disposable server did not start')
 for name in ['updater-http.py','update-gate.py','design.py','host-features.py','question-types.py']:
  subprocess.run(['python3',str(SRC/'tests'/name)],env=env,check=True)
 subprocess.run(['php','-r','require $argv[1]; putcfg("feedback", true);',str(root/'server/bootstrap.php')],check=True)
 subprocess.run(['python3',str(SRC/'tests/integration.py')],env=env,check=True)
 for f in [*SRC.glob('*.php'),*(SRC/'server').glob('*.php')]:subprocess.run(['php','-l',str(f)],check=True,stdout=subprocess.DEVNULL)
 for f in (SRC/'assets').glob('*.js'):subprocess.run(['node','--check',str(f)],check=True)
 subprocess.run(['python3',str(SRC/'tests/updater.py')],check=True)
 subprocess.run(['python3',str(SRC/'tests/php-discovery.py')],check=True)
 subprocess.run(['python3',str(SRC/'tests/release-screenshots.py')],check=True)
 print('ALL CHECKS PASSED; disposable artifacts:',work)
finally:
 os.killpg(p.pid,signal.SIGTERM);p.wait(timeout=10);log.close()
