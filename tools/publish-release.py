"""Publish the checked package and optional screenshots as labeled GitHub release assets."""
from pathlib import Path
import json,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
def screenshot_assets():
 folder=ROOT/'docs/release-screenshots';meta=folder/'screenshots.json'
 if not meta.exists():return []
 shots=json.loads(meta.read_text());assert isinstance(shots,list) and len(shots)<=8,'Maximum 8 screenshots'
 out=[];seen=set()
 for s in shots:
  name=s['file'];caption=s['caption']
  assert re.fullmatch(r'screenshot-\d{2}(?:-[a-zA-Z0-9_-]+)?\.(?:png|jpe?g|webp|gif)',name,re.I),name
  assert name not in seen,'Duplicate screenshot';seen.add(name)
  p=folder/name;assert not p.is_symlink() and p.is_file() and p.resolve().parent==folder.resolve(),name
  assert 0<p.stat().st_size<=8388608,'Screenshot is too large'
  assert isinstance(caption,str) and 0<len(caption)<=160 and not any(c in caption for c in '\x00\r\n#'),'Invalid caption'
  out.append(str(p)+'#'+caption)
 return out
def main():
 tag,package=sys.argv[1:3];assert tag=='v'+json.loads((ROOT/'version.json').read_text())['version'],'Tag/version mismatch'
 assert Path(package).is_file(),'Missing package'
 commands=[['gh','release','create',tag,package,*screenshot_assets(),'--draft','--verify-tag','--title','Переплёт '+tag,'--notes-file',str(ROOT/'docs/RELEASE-NOTES.md')],['gh','release','edit',tag,'--draft=false','--latest']]
 if '--dry-run' in sys.argv:print(json.dumps(commands,ensure_ascii=False))
 else:
  for command in commands:subprocess.run(command,check=True,cwd=ROOT)
if __name__=='__main__':main()
