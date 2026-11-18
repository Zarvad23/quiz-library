"""Build the exact code-only package used by manual updates and GitHub Releases."""
from pathlib import Path
import hashlib,json,sys,zipfile
ROOT=Path(__file__).resolve().parents[1]
ROOT_FILES={'.htaccess','api.php','index.php','version.json','README.md','START-HERE.txt','UPDATE-WINDOWS.txt','setup-windows.cmd','recover-updates.cmd'}
def deployable(p):
 r=p.relative_to(ROOT)
 return p.is_file() and not p.is_symlink() and (str(r) in ROOT_FILES or len(r.parts)==2 and (r.parts[0]=='assets' and p.suffix.lower() in {'.js','.css','.png','.svg','.woff','.woff2','.jpg','.webp'} or r.parts[0]=='server' and (p.suffix=='.php' or p.name=='.htaccess')))
def build(output):
 version=json.loads((ROOT/'version.json').read_text())
 files={p.relative_to(ROOT).as_posix():p.read_bytes() for p in sorted(ROOT.rglob('*')) if deployable(p)}
 manifest={'format':1,**version,'files':{n:hashlib.sha256(b).hexdigest() for n,b in files.items()}}
 assert all(x in files for x in ['api.php','index.php','version.json','server/bootstrap.php','server/updater.php','server/update-gate.php','server/update-health.php','server/recover-update.php','assets/app.js','assets/updates.js'])
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for n,b in files.items():z.writestr('quiz-library/'+n,b)
  z.writestr('quiz-library/update-manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2))
 print(f'{output}: v{version["version"]}, {len(files)} files, sha256 {hashlib.sha256(Path(output).read_bytes()).hexdigest()}')
if __name__=='__main__':build(sys.argv[1] if len(sys.argv)>1 else str(ROOT.parent/'quiz-library-update.zip'))
